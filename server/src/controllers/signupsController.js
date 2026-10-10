// Sign-up lists (Prompt 62 Part 2, tool_key = 'signups') — "who's bringing
// what" / "who's doing what", with slots people claim.
import { query, getClient } from '../db/index.js';
import { getMembership, requireMembership, requireCanPost } from '../lib/hiveMembership.js';
import { createNotification } from './notificationsController.js';
import { getIO } from '../realtime/socket.js';

function broadcastSignup(hiveId, listId, payload) {
  try { getIO()?.to(`hive:${hiveId}`).emit('signup_updated', { hive_id: hiveId, list_id: listId, ...payload }); }
  catch { /* no socket in tests */ }
}

async function loadList(hiveId, listId) {
  const { rows: [l] } = await query(`SELECT * FROM hive_signup_lists WHERE list_id = $1`, [listId]);
  if (!l || l.hive_id !== hiveId) { const err = new Error('List not found.'); err.status = 404; throw err; }
  return l;
}

function validateItem(raw) {
  const label = String(raw?.label ?? '').trim();
  if (!label) return { error: 'An item label is required.' };
  if (label.length > 80) return { error: 'Item label must be 80 characters or fewer.' };
  const slots = raw?.slots == null ? 1 : Number(raw.slots);
  if (!Number.isInteger(slots) || slots < 1 || slots > 50) return { error: 'Slots must be a whole number between 1 and 50.' };
  const note = raw?.note ? String(raw.note).trim().slice(0, 200) : null;
  return { label, slots, note };
}

// ── GET /api/hives/:id/tools/signups/lists ───────────────────────────────────
// ?planPostId=... narrows to one plan's lists — used by the plan page.
export const listSignupLists = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const params = [hiveId];
    let where = `l.hive_id = $1`;
    if (req.query.planPostId) { params.push(req.query.planPostId); where += ` AND l.plan_post_id = $2`; }

    const { rows: lists } = await query(
      `SELECT l.*, hp.headline AS plan_headline
         FROM hive_signup_lists l
         LEFT JOIN hive_posts hp ON hp.post_id = l.plan_post_id
        WHERE ${where}
        ORDER BY l.created_at DESC`,
      params,
    );

    const shaped = await Promise.all(lists.map(async l => {
      const { rows: [agg] } = await query(
        `SELECT COALESCE(SUM(si.slots),0)::int AS total_slots,
                COUNT(si.item_id)::int AS item_count,
                COALESCE((SELECT SUM(c.quantity) FROM hive_signup_claims c
                           JOIN hive_signup_items ii ON ii.item_id = c.item_id
                          WHERE ii.list_id = $1), 0)::int AS claimed_slots
           FROM hive_signup_items si WHERE si.list_id = $1`,
        [l.list_id],
      );
      return {
        list_id: l.list_id, hive_id: l.hive_id, title: l.title, plan_post_id: l.plan_post_id,
        plan_headline: l.plan_headline ?? null, members_can_add: l.members_can_add, closes_at: l.closes_at,
        created_at: l.created_at,
        total_slots: agg.total_slots, claimed_slots: agg.claimed_slots, item_count: agg.item_count,
      };
    }));
    res.json({ lists: shaped });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[signups/listSignupLists]', err);
    res.status(500).json({ error: 'Failed to load sign-up lists.' });
  }
};

// ── POST /api/hives/:id/tools/signups/lists ──────────────────────────────────
// items: optional array to seed the list atomically (template prefill lands
// here — the client fills in a template's labels and submits them as items,
// no separate template endpoint needed).
export const createSignupList = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanPost(hiveId, req.userId);

    const { title, planPostId, membersCanAdd, closesAt, items } = req.body ?? {};
    const t = String(title ?? '').trim();
    if (!t) return res.status(400).json({ error: 'A title is required.' });
    if (t.length > 80) return res.status(400).json({ error: 'Title must be 80 characters or fewer.' });

    let planId = null;
    if (planPostId) {
      const { rows: [p] } = await query(
        `SELECT post_id FROM hive_posts WHERE post_id = $1 AND hive_id = $2 AND post_type = 'event'`,
        [planPostId, hiveId],
      );
      if (!p) return res.status(400).json({ error: 'That plan does not belong to this Hive.' });
      planId = p.post_id;
    }

    let closes = null;
    if (closesAt) {
      closes = new Date(closesAt);
      if (isNaN(closes.getTime())) return res.status(400).json({ error: 'Closing time is not a valid date.' });
    }

    const itemRows = [];
    for (const raw of (Array.isArray(items) ? items : [])) {
      const v = validateItem(raw);
      if (v.error) return res.status(400).json({ error: v.error });
      itemRows.push(v);
    }

    const client = await getClient();
    let listId;
    try {
      await client.query('BEGIN');
      const { rows: [l] } = await client.query(
        `INSERT INTO hive_signup_lists (hive_id, created_by, title, plan_post_id, members_can_add, closes_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING list_id`,
        [hiveId, req.userId, t, planId, membersCanAdd !== false, closes ? closes.toISOString() : null],
      );
      listId = l.list_id;
      for (const [i, item] of itemRows.entries()) {
        await client.query(
          `INSERT INTO hive_signup_items (list_id, label, slots, note, position, created_by)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [listId, item.label, item.slots, item.note, i, req.userId],
        );
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    const { rows: [list] } = await query(`SELECT * FROM hive_signup_lists WHERE list_id = $1`, [listId]);
    res.status(201).json({ list });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[signups/createSignupList]', err);
    res.status(500).json({ error: 'Failed to create the sign-up list.' });
  }
};

// ── GET /api/hives/:id/tools/signups/lists/:listId ───────────────────────────
export const getSignupList = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const list = await loadList(hiveId, req.params.listId);

    const { rows: items } = await query(
      `SELECT item_id, label, slots, note, position, created_by
         FROM hive_signup_items WHERE list_id = $1 ORDER BY position ASC`,
      [list.list_id],
    );
    const itemIds = items.map(i => i.item_id);
    const { rows: claims } = itemIds.length
      ? await query(
          `SELECT c.item_id, c.user_id, c.quantity, c.note, c.claimed_at,
                  pr.full_name, pr.profile_photo_url
             FROM hive_signup_claims c
             LEFT JOIN profiles pr ON pr.user_id = c.user_id
            WHERE c.item_id = ANY($1)
            ORDER BY c.claimed_at ASC`,
          [itemIds],
        )
      : { rows: [] };

    const claimsByItem = {};
    for (const c of claims) (claimsByItem[c.item_id] ??= []).push(c);

    const shapedItems = items.map(i => {
      const its = claimsByItem[i.item_id] ?? [];
      const claimed = its.reduce((n, c) => n + c.quantity, 0);
      return {
        item_id: i.item_id, label: i.label, slots: i.slots, note: i.note, position: i.position,
        created_by: i.created_by, claimed_slots: claimed, remaining_slots: Math.max(0, i.slots - claimed),
        claims: its.map(c => ({ user_id: c.user_id, quantity: c.quantity, note: c.note, full_name: c.full_name, profile_photo_url: c.profile_photo_url })),
        my_claim: its.find(c => c.user_id === req.userId) ?? null,
      };
    });

    res.json({ list, items: shapedItems });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[signups/getSignupList]', err);
    res.status(500).json({ error: 'Failed to load this sign-up list.' });
  }
};

// ── POST /api/hives/:id/tools/signups/lists/:listId/items ───────────────────
export const addSignupItem = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await requireMembership(hiveId, req.userId);
    const list = await loadList(hiveId, req.params.listId);
    const isOwnerOrAdmin = ['owner', 'admin'].includes(mem.role);
    const canAdd = isOwnerOrAdmin || list.created_by === req.userId || list.members_can_add;
    if (!canAdd) return res.status(403).json({ error: 'Members can’t add items to this list.' });
    await requireCanPost(hiveId, req.userId);

    const v = validateItem(req.body);
    if (v.error) return res.status(400).json({ error: v.error });

    const { rows: [pos] } = await query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM hive_signup_items WHERE list_id = $1`, [list.list_id]);
    const { rows: [item] } = await query(
      `INSERT INTO hive_signup_items (list_id, label, slots, note, position, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [list.list_id, v.label, v.slots, v.note, pos.next, req.userId],
    );
    broadcastSignup(hiveId, list.list_id, { kind: 'item_added' });
    res.status(201).json({ item });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[signups/addSignupItem]', err);
    res.status(500).json({ error: 'Failed to add the item.' });
  }
};

async function loadItemWithList(hiveId, itemId) {
  const { rows: [row] } = await query(
    `SELECT si.*, sl.hive_id, sl.closes_at, sl.created_by AS list_created_by, sl.list_id AS list_id
       FROM hive_signup_items si
       JOIN hive_signup_lists sl ON sl.list_id = si.list_id
      WHERE si.item_id = $1`,
    [itemId],
  );
  if (!row || row.hive_id !== hiveId) { const err = new Error('Item not found.'); err.status = 404; throw err; }
  return row;
}

// ── PATCH /api/hives/:id/tools/signups/items/:itemId ─────────────────────────
// Edit permission: the list creator or an owner/admin only.
export const editSignupItem = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await requireMembership(hiveId, req.userId);
    const item = await loadItemWithList(hiveId, req.params.itemId);
    const canManage = item.list_created_by === req.userId || ['owner', 'admin'].includes(mem.role);
    if (!canManage) return res.status(403).json({ error: 'Only the list creator or an owner/admin can edit items.' });

    const v = validateItem(req.body);
    if (v.error) return res.status(400).json({ error: v.error });

    const { rows: [updated] } = await query(
      `UPDATE hive_signup_items SET label = $1, slots = $2, note = $3 WHERE item_id = $4 RETURNING *`,
      [v.label, v.slots, v.note, item.item_id],
    );
    broadcastSignup(hiveId, item.list_id, { kind: 'item_edited' });
    res.json({ item: updated });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[signups/editSignupItem]', err);
    res.status(500).json({ error: 'Failed to update the item.' });
  }
};

// ── DELETE /api/hives/:id/tools/signups/items/:itemId ────────────────────────
export const deleteSignupItem = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await requireMembership(hiveId, req.userId);
    const item = await loadItemWithList(hiveId, req.params.itemId);
    const canManage = item.list_created_by === req.userId || ['owner', 'admin'].includes(mem.role);
    if (!canManage) return res.status(403).json({ error: 'Only the list creator or an owner/admin can remove items.' });

    await query(`DELETE FROM hive_signup_items WHERE item_id = $1`, [item.item_id]);
    broadcastSignup(hiveId, item.list_id, { kind: 'item_deleted' });
    res.json({ deleted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[signups/deleteSignupItem]', err);
    res.status(500).json({ error: 'Failed to remove the item.' });
  }
};

// ── POST /api/hives/:id/tools/signups/items/:itemId/claim ────────────────────
// Concurrency-safe: the item row is locked for the duration of the
// transaction, so two requests racing for the last slot serialize — the
// second sees the first's committed claim and is correctly rejected.
export const claimSignupItem = async (req, res) => {
  const client = await getClient();
  try {
    const hiveId = req.params.id;
    await requireCanPost(hiveId, req.userId);
    const item = await loadItemWithList(hiveId, req.params.itemId);
    if (item.closes_at && new Date(item.closes_at) <= new Date()) {
      return res.status(400).json({ error: 'This sign-up list is closed.' });
    }

    const quantity = Math.max(1, Math.min(50, Number(req.body?.quantity) || 1));
    const note = req.body?.note ? String(req.body.note).trim().slice(0, 200) : null;

    let remaining;
    try {
      await client.query('BEGIN');
      await client.query(`SELECT item_id FROM hive_signup_items WHERE item_id = $1 FOR UPDATE`, [item.item_id]);
      const { rows: [sum] } = await client.query(
        `SELECT COALESCE(SUM(quantity),0)::int AS claimed FROM hive_signup_claims WHERE item_id = $1 AND user_id != $2`,
        [item.item_id, req.userId],
      );
      remaining = item.slots - sum.claimed;
      if (quantity > remaining) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Only ${remaining} slot${remaining === 1 ? '' : 's'} left.` });
      }
      await client.query(
        `INSERT INTO hive_signup_claims (item_id, user_id, quantity, note)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (item_id, user_id) DO UPDATE SET quantity = EXCLUDED.quantity, note = EXCLUDED.note, claimed_at = NOW()`,
        [item.item_id, req.userId, quantity, note],
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    broadcastSignup(hiveId, item.list_id, { kind: 'claimed', item_id: item.item_id });
    res.json({ claimed: true, quantity });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[signups/claimSignupItem]', err);
    res.status(500).json({ error: 'Failed to claim this item.' });
  }
};

// ── DELETE /api/hives/:id/tools/signups/items/:itemId/claim ──────────────────
// Unclaim your own.
export const unclaimSignupItem = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const item = await loadItemWithList(hiveId, req.params.itemId);
    if (item.closes_at && new Date(item.closes_at) <= new Date()) {
      return res.status(400).json({ error: 'This sign-up list is closed.' });
    }
    await query(`DELETE FROM hive_signup_claims WHERE item_id = $1 AND user_id = $2`, [item.item_id, req.userId]);
    broadcastSignup(hiveId, item.list_id, { kind: 'unclaimed', item_id: item.item_id });
    res.json({ unclaimed: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[signups/unclaimSignupItem]', err);
    res.status(500).json({ error: 'Failed to unclaim this item.' });
  }
};

// ── DELETE /api/hives/:id/tools/signups/items/:itemId/claims/:userId ─────────
// The list creator or an owner/admin removing anyone's claim — not subject
// to the closes_at freeze, which is a member-self-service guard only.
export const removeClaim = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await requireMembership(hiveId, req.userId);
    const item = await loadItemWithList(hiveId, req.params.itemId);
    const canManage = item.list_created_by === req.userId || ['owner', 'admin'].includes(mem.role);
    if (!canManage) return res.status(403).json({ error: 'Only the list creator or an owner/admin can remove someone else’s claim.' });

    await query(`DELETE FROM hive_signup_claims WHERE item_id = $1 AND user_id = $2`, [item.item_id, req.params.userId]);
    broadcastSignup(hiveId, item.list_id, { kind: 'unclaimed', item_id: item.item_id });
    res.json({ removed: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[signups/removeClaim]', err);
    res.status(500).json({ error: 'Failed to remove this claim.' });
  }
};
