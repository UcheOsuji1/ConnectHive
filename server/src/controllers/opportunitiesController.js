// Opportunities board (Prompt 65 Part 1, tool_key = 'opportunities') — jobs,
// gigs, internships, intros and events members share with each other.
import { query } from '../db/index.js';
import { requireMembership, requireCanPost } from '../lib/hiveMembership.js';
import { getToolSettings } from '../lib/hiveTools.js';
import { createNotification } from './notificationsController.js';
import { getIO } from '../realtime/socket.js';

const KINDS = ['job', 'internship', 'gig', 'intro', 'event', 'other'];

function broadcast(hiveId, payload) {
  try { getIO()?.to(`hive:${hiveId}`).emit('opportunity_updated', { hive_id: hiveId, ...payload }); }
  catch { /* no socket in tests */ }
}

async function getPosters(hiveId) {
  const settings = await getToolSettings(hiveId, 'opportunities');
  return settings?.posters === 'owners' ? 'owners' : 'members';
}

async function requireCanPostOpportunity(hiveId, userId) {
  const member = await requireCanPost(hiveId, userId);
  const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
  if (isOwnerOrAdmin) return member;
  const posters = await getPosters(hiveId);
  if (posters === 'owners') {
    const err = new Error('Only owners and admins can post opportunities in this Hive.');
    err.status = 403;
    throw err;
  }
  return member;
}

async function requireOwnerAdmin(hiveId, userId) {
  const member = await requireMembership(hiveId, userId);
  if (member.role !== 'owner' && member.role !== 'admin') {
    const err = new Error('Only an owner or admin can do that.');
    err.status = 403;
    throw err;
  }
  return member;
}

function validateUrl(raw) {
  if (raw == null || raw === '') return { url: null };
  const str = String(raw).trim();
  if (str.length > 2000) return { error: 'Link must be 2000 characters or fewer.' };
  let u;
  try { u = new URL(str); } catch { return { error: 'Link must be a valid URL.' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { error: 'Link must start with http:// or https://.' };
  }
  return { url: str };
}

function validateBody(raw, { partial = false } = {}) {
  const out = {};

  if (!partial || raw.kind !== undefined) {
    if (!KINDS.includes(raw.kind)) return { error: `kind must be one of: ${KINDS.join(', ')}.` };
    out.kind = raw.kind;
  }
  if (!partial || raw.title !== undefined) {
    const title = String(raw.title ?? '').trim();
    if (title.length < 1 || title.length > 120) return { error: 'Title must be 1-120 characters.' };
    out.title = title;
  }
  if (raw.organization !== undefined) {
    const org = raw.organization == null ? null : String(raw.organization).trim();
    if (org && (org.length < 1 || org.length > 80)) return { error: 'Organization must be 1-80 characters.' };
    out.organization = org || null;
  }
  if (raw.url !== undefined) {
    const v = validateUrl(raw.url);
    if (v.error) return { error: v.error };
    out.url = v.url;
  }
  if (raw.location !== undefined) {
    out.location = raw.location == null ? null : String(raw.location).trim().slice(0, 120) || null;
  }
  if (raw.remote !== undefined) out.remote = !!raw.remote;
  if (raw.description !== undefined) {
    const desc = String(raw.description ?? '');
    if (desc.length > 2000) return { error: 'Description must be 2000 characters or fewer.' };
    out.description = desc;
  }
  if (raw.deadline !== undefined) {
    if (raw.deadline == null || raw.deadline === '') {
      out.deadline = null;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.deadline)) {
      return { error: 'Deadline must be a valid date.' };
    } else {
      out.deadline = raw.deadline;
    }
  }
  if (raw.tags !== undefined) {
    const tags = (Array.isArray(raw.tags) ? raw.tags : []).map(t => String(t ?? '').trim()).filter(Boolean);
    if (tags.length > 6) return { error: 'At most 6 tags.' };
    if (tags.some(t => t.length > 30)) return { error: 'Each tag must be 30 characters or fewer.' };
    out.tags = tags;
  }

  return out;
}

const LIST_SELECT = `
  SELECT o.*, pr.full_name AS poster_name, pr.profile_photo_url AS poster_photo,
         (o.closed_at IS NOT NULL OR (o.deadline IS NOT NULL AND o.deadline < CURRENT_DATE)) AS is_closed,
         EXISTS(SELECT 1 FROM hive_opportunity_saves s WHERE s.opp_id = o.opp_id AND s.user_id = $__viewer) AS saved,
         EXISTS(SELECT 1 FROM hive_opportunity_interest i WHERE i.opp_id = o.opp_id AND i.user_id = $__viewer) AS interested,
         (SELECT COUNT(*)::int FROM hive_opportunity_interest i WHERE i.opp_id = o.opp_id) AS interest_count
    FROM hive_opportunities o
    LEFT JOIN profiles pr ON pr.user_id = o.posted_by
`;

function shapeRow(r) {
  return {
    opp_id: r.opp_id, kind: r.kind, title: r.title, organization: r.organization,
    url: r.url, location: r.location, remote: r.remote, description: r.description,
    deadline: r.deadline, tags: r.tags, created_at: r.created_at, updated_at: r.updated_at,
    closed_at: r.closed_at, is_closed: r.is_closed,
    posted_by: { user_id: r.posted_by, full_name: r.poster_name, profile_photo_url: r.poster_photo },
    saved: r.saved, interested: r.interested, interest_count: r.interest_count,
  };
}

// ── GET /api/hives/:id/tools/opportunities/opportunities ─────────────────────
export const listOpportunities = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const params = [hiveId, req.userId];
    let where = `o.hive_id = $1 AND o.deleted_at IS NULL`;
    const sql = LIST_SELECT.replace(/\$__viewer/g, '$2');

    if (req.query.kind && KINDS.includes(req.query.kind)) {
      params.push(req.query.kind);
      where += ` AND o.kind = $${params.length}`;
    }
    if (req.query.remote === 'true') where += ` AND o.remote = TRUE`;
    if (req.query.hasDeadline === 'true') where += ` AND o.deadline IS NOT NULL`;
    if (req.query.search) {
      params.push(`%${req.query.search.trim()}%`);
      where += ` AND (o.title ILIKE $${params.length} OR o.organization ILIKE $${params.length})`;
    }
    if (req.query.status === 'open') {
      where += ` AND o.closed_at IS NULL AND (o.deadline IS NULL OR o.deadline >= CURRENT_DATE)`;
    }

    const { rows } = await query(
      `${sql} WHERE ${where} ORDER BY o.created_at DESC`,
      params,
    );
    res.json({ opportunities: rows.map(shapeRow) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[opportunities/listOpportunities]', err);
    res.status(500).json({ error: 'Failed to load opportunities.' });
  }
};

// ── GET /api/hives/:id/tools/opportunities/saved ──────────────────────────────
export const listSaved = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const sql = LIST_SELECT.replace(/\$__viewer/g, '$2');
    const { rows } = await query(
      `${sql}
        JOIN hive_opportunity_saves sv ON sv.opp_id = o.opp_id AND sv.user_id = $2
       WHERE o.hive_id = $1 AND o.deleted_at IS NULL
       ORDER BY sv.saved_at DESC`,
      [hiveId, req.userId],
    );
    res.json({ opportunities: rows.map(shapeRow) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[opportunities/listSaved]', err);
    res.status(500).json({ error: 'Failed to load saved opportunities.' });
  }
};

// ── GET /api/hives/:id/tools/opportunities/mine ───────────────────────────────
// A poster also sees who's interested in each of their own posts.
export const listMine = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const sql = LIST_SELECT.replace(/\$__viewer/g, '$2');
    const { rows } = await query(
      `${sql} WHERE o.hive_id = $1 AND o.posted_by = $2 AND o.deleted_at IS NULL ORDER BY o.created_at DESC`,
      [hiveId, req.userId],
    );
    const oppIds = rows.map(r => r.opp_id);
    const { rows: interestRows } = oppIds.length
      ? await query(
          `SELECT i.opp_id, i.note, i.at, pr.user_id, pr.full_name, pr.profile_photo_url
             FROM hive_opportunity_interest i
             LEFT JOIN profiles pr ON pr.user_id = i.user_id
            WHERE i.opp_id = ANY($1) ORDER BY i.at ASC`,
          [oppIds],
        )
      : { rows: [] };
    const interestByOpp = {};
    for (const i of interestRows) {
      (interestByOpp[i.opp_id] ??= []).push({
        user_id: i.user_id, full_name: i.full_name, profile_photo_url: i.profile_photo_url,
        note: i.note, at: i.at,
      });
    }
    res.json({
      opportunities: rows.map(r => ({ ...shapeRow(r), interested_members: interestByOpp[r.opp_id] ?? [] })),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[opportunities/listMine]', err);
    res.status(500).json({ error: 'Failed to load your posts.' });
  }
};

async function loadOpportunity(hiveId, oppId) {
  // is_closed computed in SQL, not JS — node-pg returns a DATE column as a
  // JS Date object, and comparing that against an ISO string with `<` does
  // a string-coerced comparison that is NOT the same as a date comparison
  // (caught by testing: a post past its deadline was still accepting
  // interest). CURRENT_DATE keeps this the single authoritative definition,
  // same as the LIST_SELECT view every list endpoint already uses.
  const { rows: [o] } = await query(
    `SELECT *, (closed_at IS NOT NULL OR (deadline IS NOT NULL AND deadline < CURRENT_DATE)) AS is_closed
       FROM hive_opportunities WHERE opp_id = $1 AND hive_id = $2 AND deleted_at IS NULL`,
    [oppId, hiveId],
  );
  if (!o) { const err = new Error('Opportunity not found.'); err.status = 404; throw err; }
  return o;
}

// ── POST /api/hives/:id/tools/opportunities/opportunities ────────────────────
export const createOpportunity = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanPostOpportunity(hiveId, req.userId);
    const v = validateBody(req.body ?? {});
    if (v.error) return res.status(400).json({ error: v.error });

    const { rows: [o] } = await query(
      `INSERT INTO hive_opportunities
         (hive_id, posted_by, kind, title, organization, url, location, remote, description, deadline, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING opp_id`,
      [hiveId, req.userId, v.kind, v.title, v.organization ?? null, v.url ?? null, v.location ?? null,
       v.remote ?? false, v.description ?? '', v.deadline ?? null, v.tags ?? []],
    );
    broadcast(hiveId, { kind: 'created', opp_id: o.opp_id });
    const sql = LIST_SELECT.replace(/\$__viewer/g, '$2');
    const { rows: [full] } = await query(`${sql} WHERE o.opp_id = $1`, [o.opp_id, req.userId]);
    res.status(201).json({ opportunity: shapeRow(full) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[opportunities/createOpportunity]', err);
    res.status(500).json({ error: 'Failed to post this opportunity.' });
  }
};

// ── PATCH /api/hives/:id/tools/opportunities/opportunities/:oppId ────────────
export const updateOpportunity = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadOpportunity(hiveId, req.params.oppId);
    if (existing.posted_by !== req.userId) {
      return res.status(403).json({ error: 'Only the poster can edit this opportunity.' });
    }
    const v = validateBody(req.body ?? {}, { partial: true });
    if (v.error) return res.status(400).json({ error: v.error });
    if (Object.keys(v).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

    const fields = Object.keys(v);
    const setSql = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    await query(
      `UPDATE hive_opportunities SET ${setSql}, updated_at = NOW() WHERE opp_id = $1`,
      [existing.opp_id, ...fields.map(f => v[f])],
    );
    broadcast(hiveId, { kind: 'updated', opp_id: existing.opp_id });
    const sql = LIST_SELECT.replace(/\$__viewer/g, '$2');
    const { rows: [full] } = await query(`${sql} WHERE o.opp_id = $1`, [existing.opp_id, req.userId]);
    res.json({ opportunity: shapeRow(full) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[opportunities/updateOpportunity]', err);
    res.status(500).json({ error: 'Failed to update this opportunity.' });
  }
};

// ── POST /api/hives/:id/tools/opportunities/opportunities/:oppId/close ───────
export const closeOpportunity = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await requireMembership(hiveId, req.userId);
    const existing = await loadOpportunity(hiveId, req.params.oppId);
    const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
    if (existing.posted_by !== req.userId && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the poster or an owner/admin can close this.' });
    }
    await query(`UPDATE hive_opportunities SET closed_at = NOW() WHERE opp_id = $1`, [existing.opp_id]);
    broadcast(hiveId, { kind: 'closed', opp_id: existing.opp_id });
    res.json({ closed: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[opportunities/closeOpportunity]', err);
    res.status(500).json({ error: 'Failed to close this opportunity.' });
  }
};

// ── DELETE /api/hives/:id/tools/opportunities/opportunities/:oppId ───────────
export const deleteOpportunity = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await requireMembership(hiveId, req.userId);
    const existing = await loadOpportunity(hiveId, req.params.oppId);
    const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
    if (existing.posted_by !== req.userId && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the poster or an owner/admin can delete this.' });
    }
    await query(`UPDATE hive_opportunities SET deleted_at = NOW() WHERE opp_id = $1`, [existing.opp_id]);
    broadcast(hiveId, { kind: 'deleted', opp_id: existing.opp_id });
    res.json({ deleted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[opportunities/deleteOpportunity]', err);
    res.status(500).json({ error: 'Failed to delete this opportunity.' });
  }
};

// ── POST /api/hives/:id/tools/opportunities/opportunities/:oppId/save ────────
// ── DELETE /api/hives/:id/tools/opportunities/opportunities/:oppId/save ──────
export const setSaved = (saved) => async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadOpportunity(hiveId, req.params.oppId);
    if (saved) {
      await query(
        `INSERT INTO hive_opportunity_saves (opp_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [existing.opp_id, req.userId],
      );
    } else {
      await query(`DELETE FROM hive_opportunity_saves WHERE opp_id = $1 AND user_id = $2`, [existing.opp_id, req.userId]);
    }
    res.json({ saved });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[opportunities/setSaved]', err);
    res.status(500).json({ error: 'Failed to update your saved list.' });
  }
};

// ── POST /api/hives/:id/tools/opportunities/opportunities/:oppId/interest ────
export const expressInterest = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadOpportunity(hiveId, req.params.oppId);
    if (existing.is_closed) return res.status(400).json({ error: 'This opportunity is closed.' });

    const note = String(req.body?.note ?? '').trim().slice(0, 280);
    const { rows: [already] } = await query(
      `SELECT 1 FROM hive_opportunity_interest WHERE opp_id = $1 AND user_id = $2`, [existing.opp_id, req.userId]);
    await query(
      `INSERT INTO hive_opportunity_interest (opp_id, user_id, note) VALUES ($1,$2,$3)
       ON CONFLICT (opp_id, user_id) DO UPDATE SET note = EXCLUDED.note, at = NOW()`,
      [existing.opp_id, req.userId, note],
    );

    if (!already && existing.posted_by !== req.userId) {
      const { rows: [me] } = await query(`SELECT full_name FROM profiles WHERE user_id = $1`, [req.userId]);
      await createNotification({
        userId: existing.posted_by, type: 'opportunity_interest', category: 'opportunities',
        title: `${me?.full_name ?? 'Someone'} is interested in "${existing.title}"`,
        body: note || null,
        hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/tools/opportunities?tab=mine`,
      }).catch(e => console.error('[opportunities/expressInterest] notify failed', e));
    }
    res.json({ interested: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[opportunities/expressInterest]', err);
    res.status(500).json({ error: 'Failed to record your interest.' });
  }
};

// ── DELETE /api/hives/:id/tools/opportunities/opportunities/:oppId/interest ──
export const withdrawInterest = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadOpportunity(hiveId, req.params.oppId);
    await query(`DELETE FROM hive_opportunity_interest WHERE opp_id = $1 AND user_id = $2`, [existing.opp_id, req.userId]);
    res.json({ interested: false });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[opportunities/withdrawInterest]', err);
    res.status(500).json({ error: 'Failed to withdraw your interest.' });
  }
};

// ── GET /api/hives/:id/tools/opportunities/opportunities/:oppId/interested ───
// Visible only to the poster and to owners/admins.
export const listInterested = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await requireMembership(hiveId, req.userId);
    const existing = await loadOpportunity(hiveId, req.params.oppId);
    const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
    if (existing.posted_by !== req.userId && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the poster or an owner/admin can see who’s interested.' });
    }
    const { rows } = await query(
      `SELECT i.note, i.at, pr.user_id, pr.full_name, pr.profile_photo_url
         FROM hive_opportunity_interest i
         LEFT JOIN profiles pr ON pr.user_id = i.user_id
        WHERE i.opp_id = $1 ORDER BY i.at ASC`,
      [existing.opp_id],
    );
    res.json({ interested: rows });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[opportunities/listInterested]', err);
    res.status(500).json({ error: 'Failed to load interested members.' });
  }
};

// ── POST /api/hives/:id/tools/opportunities/opportunities/:oppId/report ──────
export const reportOpportunity = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadOpportunity(hiveId, req.params.oppId);
    const reason = String(req.body?.reason ?? '').trim();
    if (reason.length < 1 || reason.length > 500) {
      return res.status(400).json({ error: 'Reason must be 1-500 characters.' });
    }
    await query(
      `INSERT INTO hive_opportunity_reports (opp_id, user_id, reason) VALUES ($1,$2,$3)
       ON CONFLICT (opp_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, at = NOW()`,
      [existing.opp_id, req.userId, reason],
    );
    res.json({ reported: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[opportunities/reportOpportunity]', err);
    res.status(500).json({ error: 'Failed to report this opportunity.' });
  }
};

// ── GET /api/hives/:id/tools/opportunities/reports ────────────────────────────
// Manage -> Overview, owner/admin only.
export const listReports = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireOwnerAdmin(hiveId, req.userId);
    const { rows } = await query(
      `SELECT r.opp_id, r.reason, r.at, o.title, pr.user_id, pr.full_name
         FROM hive_opportunity_reports r
         JOIN hive_opportunities o ON o.opp_id = r.opp_id
         LEFT JOIN profiles pr ON pr.user_id = r.user_id
        WHERE o.hive_id = $1
        ORDER BY r.at DESC`,
      [hiveId],
    );
    res.json({ reports: rows });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[opportunities/listReports]', err);
    res.status(500).json({ error: 'Failed to load reports.' });
  }
};

// Used by hiveHomeController / chatRailController to source the featured
// module from this board instead of #opportunities messages, once the tool
// is on.
export async function getFeaturedOpportunities(hiveId, limit = 3) {
  const { rows } = await query(
    `SELECT o.opp_id, o.kind, o.title, o.organization, o.remote, o.location, o.created_at,
            pr.user_id, pr.full_name, pr.profile_photo_url
       FROM hive_opportunities o
       LEFT JOIN profiles pr ON pr.user_id = o.posted_by
      WHERE o.hive_id = $1 AND o.deleted_at IS NULL AND o.closed_at IS NULL
        AND (o.deadline IS NULL OR o.deadline >= CURRENT_DATE)
      ORDER BY o.created_at DESC
      LIMIT ${limit}`,
    [hiveId],
  );
  return rows.map(r => ({
    opp_id: r.opp_id, kind: r.kind, title: r.title, organization: r.organization,
    remote: r.remote, location: r.location, created_at: r.created_at,
    sender: { user_id: r.user_id, full_name: r.full_name, profile_photo_url: r.profile_photo_url },
  }));
}
