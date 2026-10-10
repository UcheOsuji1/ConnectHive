// Split costs (Prompt 62 Part 1, tool_key = 'split_costs'). TrueHive never
// moves money — this is a ledger plus deep links to each person's own
// payment app. All amounts are integer cents throughout.
import { query, getClient } from '../db/index.js';
import { getMembership, requireMembership, requireCanPost } from '../lib/hiveMembership.js';
import { createNotification } from './notificationsController.js';

const METHODS = ['venmo', 'cashapp', 'paypal', 'cash', 'other'];

// ── Equal-split distribution ─────────────────────────────────────────────────
// Deterministic: sorted by user id, leftover cents go one each to the first
// participants in that order. Always sums exactly to amountCents.
export function equalSplit(amountCents, userIds) {
  const sorted = [...new Set(userIds)].sort();
  const n = sorted.length;
  const base = Math.floor(amountCents / n);
  const remainder = amountCents - base * n;
  return sorted.map((userId, i) => ({ user_id: userId, share_cents: base + (i < remainder ? 1 : 0) }));
}

// ── Settle-up — greedy debt simplification ───────────────────────────────────
// Biggest debtor pays biggest creditor, repeat. At most (debtors + creditors
// - 1) transfers, which is at most N-1 for N people with a nonzero balance.
export function settleUp(balances) {
  const debtors = balances.filter(b => b.balance_cents < 0)
    .map(b => ({ user_id: b.user_id, remaining: -b.balance_cents }))
    .sort((a, b) => b.remaining - a.remaining);
  const creditors = balances.filter(b => b.balance_cents > 0)
    .map(b => ({ user_id: b.user_id, remaining: b.balance_cents }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].remaining, creditors[j].remaining);
    if (amt > 0) {
      transfers.push({ from_user: debtors[i].user_id, to_user: creditors[j].user_id, amount_cents: amt });
    }
    debtors[i].remaining -= amt;
    creditors[j].remaining -= amt;
    if (debtors[i].remaining === 0) i++;
    if (creditors[j].remaining === 0) j++;
  }
  return transfers;
}

// ── Balances for a group ──────────────────────────────────────────────────────
// Exported for the weekly nudge job — one source of truth for the formula.
export async function computeBalances(groupId) {
  const [{ rows: paid }, { rows: shares }, { rows: received }, { rows: sent }] = await Promise.all([
    query(`SELECT paid_by AS user_id, SUM(amount_cents)::int AS total
             FROM hive_expenses WHERE group_id = $1 AND deleted_at IS NULL GROUP BY paid_by`, [groupId]),
    query(`SELECT es.user_id, SUM(es.share_cents)::int AS total
             FROM hive_expense_shares es JOIN hive_expenses e ON e.expense_id = es.expense_id
            WHERE e.group_id = $1 AND e.deleted_at IS NULL GROUP BY es.user_id`, [groupId]),
    query(`SELECT to_user AS user_id, SUM(amount_cents)::int AS total
             FROM hive_settlements WHERE group_id = $1 AND deleted_at IS NULL GROUP BY to_user`, [groupId]),
    query(`SELECT from_user AS user_id, SUM(amount_cents)::int AS total
             FROM hive_settlements WHERE group_id = $1 AND deleted_at IS NULL GROUP BY from_user`, [groupId]),
  ]);
  const map = {};
  const add = (rows, key) => { for (const r of rows) { (map[r.user_id] ??= { paid: 0, share: 0, received: 0, sent: 0 })[key] = r.total; } };
  add(paid, 'paid'); add(shares, 'share'); add(received, 'received'); add(sent, 'sent');

  return Object.entries(map).map(([user_id, v]) => ({
    user_id,
    balance_cents: v.paid - v.share - v.received + v.sent,
  }));
}

async function loadGroup(groupId) {
  const { rows: [g] } = await query(`SELECT * FROM hive_cost_groups WHERE group_id = $1`, [groupId]);
  return g ?? null;
}

// ── GET /api/hives/:id/tools/split_costs/groups ──────────────────────────────
// ?planPostId=... narrows to the group(s) linked to one plan — used by the
// plan page's Tools stack instead of a second endpoint.
export const listCostGroups = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const params = [hiveId];
    let where = `g.hive_id = $1 AND g.archived_at IS NULL`;
    if (req.query.planPostId) {
      params.push(req.query.planPostId);
      where += ` AND g.plan_post_id = $2`;
    }
    const { rows } = await query(
      `SELECT g.*, hp.headline AS plan_headline
         FROM hive_cost_groups g
         LEFT JOIN hive_posts hp ON hp.post_id = g.plan_post_id
        WHERE ${where}
        ORDER BY g.created_at DESC`,
      params,
    );

    const groups = await Promise.all(rows.map(async g => {
      const balances = await computeBalances(g.group_id);
      const mine = balances.find(b => b.user_id === req.userId)?.balance_cents ?? 0;
      return {
        group_id: g.group_id, hive_id: g.hive_id, title: g.title, currency: g.currency,
        plan_post_id: g.plan_post_id, plan_headline: g.plan_headline ?? null, created_at: g.created_at,
        your_balance_cents: mine,
      };
    }));
    res.json({ groups });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[costs/listCostGroups]', err);
    res.status(500).json({ error: 'Failed to load cost groups.' });
  }
};

// ── POST /api/hives/:id/tools/split_costs/groups ─────────────────────────────
export const createCostGroup = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanPost(hiveId, req.userId);

    const { title, currency, planPostId } = req.body ?? {};
    const t = String(title ?? '').trim();
    if (!t) return res.status(400).json({ error: 'A title is required.' });
    if (t.length > 80) return res.status(400).json({ error: 'Title must be 80 characters or fewer.' });

    const cur = /^[A-Za-z]{3}$/.test(currency ?? '') ? currency.toUpperCase() : 'USD';

    let planId = null;
    if (planPostId) {
      const { rows: [p] } = await query(
        `SELECT post_id FROM hive_posts WHERE post_id = $1 AND hive_id = $2 AND post_type = 'event'`,
        [planPostId, hiveId],
      );
      if (!p) return res.status(400).json({ error: 'That plan does not belong to this Hive.' });
      planId = p.post_id;
    }

    const { rows: [g] } = await query(
      `INSERT INTO hive_cost_groups (hive_id, created_by, title, plan_post_id, currency)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [hiveId, req.userId, t, planId, cur],
    );
    res.status(201).json({ group: g });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[costs/createCostGroup]', err);
    res.status(500).json({ error: 'Failed to create the group.' });
  }
};

// ── GET /api/hives/:id/tools/split_costs/groups/:groupId ─────────────────────
export const getCostGroup = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const g = await loadGroup(req.params.groupId);
    if (!g || g.hive_id !== hiveId) return res.status(404).json({ error: 'Group not found.' });

    const { rows: expenses } = await query(
      `SELECT e.expense_id, e.amount_cents, e.description, e.spent_on, e.split_mode,
              e.paid_by, e.created_by, e.created_at, e.deleted_at,
              pr.full_name AS paid_by_name, pr.profile_photo_url AS paid_by_photo,
              (SELECT COUNT(*)::int FROM hive_expense_shares s WHERE s.expense_id = e.expense_id) AS participant_count,
              (SELECT MAX(at) FROM hive_expense_events ev WHERE ev.expense_id = e.expense_id AND ev.action = 'edited') AS last_edited_at
         FROM hive_expenses e
         LEFT JOIN profiles pr ON pr.user_id = e.paid_by
        WHERE e.group_id = $1 AND e.deleted_at IS NULL
        ORDER BY e.created_at DESC`,
      [req.params.groupId],
    );

    const balanceRows = await computeBalances(req.params.groupId);

    // Payment handles only ever surface inside Split costs, scoped to a
    // Hive the viewer shares with the member (this endpoint is Hive-scoped
    // and tool-gated) — never through the general profile endpoints.
    const { rows: members } = await query(
      `SELECT u.user_id, pr.full_name, pr.profile_photo_url,
              pr.venmo_handle, pr.cashapp_handle, pr.paypal_handle
         FROM hive_members hm
         JOIN users u ON u.user_id = hm.user_id
         LEFT JOIN profiles pr ON pr.user_id = u.user_id
        WHERE hm.hive_id = $1 AND hm.membership_status = 'active'`,
      [hiveId],
    );
    const memberById = Object.fromEntries(members.map(m => [m.user_id, m]));

    const balances = balanceRows.map(b => ({
      user_id: b.user_id,
      full_name: memberById[b.user_id]?.full_name ?? null,
      profile_photo_url: memberById[b.user_id]?.profile_photo_url ?? null,
      balance_cents: b.balance_cents,
    }));

    const transfers = settleUp(balanceRows).map(t => ({
      ...t,
      to: { user_id: t.to_user, full_name: memberById[t.to_user]?.full_name ?? null,
            venmo_handle: memberById[t.to_user]?.venmo_handle ?? null,
            cashapp_handle: memberById[t.to_user]?.cashapp_handle ?? null,
            paypal_handle: memberById[t.to_user]?.paypal_handle ?? null },
      from: { user_id: t.from_user, full_name: memberById[t.from_user]?.full_name ?? null },
    }));

    res.json({
      group: g,
      expenses,
      balances,
      transfers,
      your_balance_cents: balanceRows.find(b => b.user_id === req.userId)?.balance_cents ?? 0,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[costs/getCostGroup]', err);
    res.status(500).json({ error: 'Failed to load this group.' });
  }
};

// ── POST /api/hives/:id/tools/split_costs/groups/:groupId/expenses ──────────
export const createExpense = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanPost(hiveId, req.userId);
    const g = await loadGroup(req.params.groupId);
    if (!g || g.hive_id !== hiveId) return res.status(404).json({ error: 'Group not found.' });

    const { amountCents, description, paidBy, spentOn, splitMode, participantUserIds, shares } = req.body ?? {};

    const amount = Number(amountCents);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 10000000) {
      return res.status(400).json({ error: 'Amount must be a whole number of cents between 1 and 10,000,000.' });
    }
    const desc = String(description ?? '').trim();
    if (!desc) return res.status(400).json({ error: 'A description is required.' });
    if (desc.length > 120) return res.status(400).json({ error: 'Description must be 120 characters or fewer.' });

    const payerId = paidBy || req.userId;
    const payerMember = await getMembership(hiveId, payerId);
    if (!payerMember) return res.status(400).json({ error: 'The payer must be an active member of this Hive.' });

    let spent = null;
    if (spentOn) {
      spent = new Date(spentOn);
      if (isNaN(spent.getTime())) return res.status(400).json({ error: 'Date spent is not a valid date.' });
    }

    const mode = splitMode === 'custom' ? 'custom' : 'equal';
    let shareRows;
    if (mode === 'equal') {
      const ids = Array.isArray(participantUserIds) && participantUserIds.length ? participantUserIds : [req.userId];
      for (const uid of ids) {
        if (!await getMembership(hiveId, uid)) {
          return res.status(400).json({ error: 'Every participant must be an active member of this Hive.' });
        }
      }
      shareRows = equalSplit(amount, ids);
    } else {
      const entries = Object.entries(shares ?? {});
      if (entries.length === 0) return res.status(400).json({ error: 'A custom split needs at least one share.' });
      let sum = 0;
      shareRows = [];
      for (const [uid, cents] of entries) {
        const c = Number(cents);
        if (!Number.isInteger(c) || c < 0) return res.status(400).json({ error: 'Each share must be a whole, non-negative number of cents.' });
        if (!await getMembership(hiveId, uid)) {
          return res.status(400).json({ error: 'Every participant must be an active member of this Hive.' });
        }
        sum += c;
        shareRows.push({ user_id: uid, share_cents: c });
      }
      if (sum !== amount) {
        return res.status(400).json({ error: `Shares must sum exactly to the amount (got ${sum}, expected ${amount}).` });
      }
    }

    const client = await getClient();
    let expenseId;
    try {
      await client.query('BEGIN');
      const { rows: [e] } = await client.query(
        `INSERT INTO hive_expenses (group_id, paid_by, amount_cents, description, spent_on, split_mode, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING expense_id`,
        [g.group_id, payerId, amount, desc, spent ? spent.toISOString().slice(0, 10) : null, mode, req.userId],
      );
      expenseId = e.expense_id;
      for (const s of shareRows) {
        await client.query(
          `INSERT INTO hive_expense_shares (expense_id, user_id, share_cents) VALUES ($1,$2,$3)`,
          [expenseId, s.user_id, s.share_cents],
        );
      }
      await client.query(
        `INSERT INTO hive_expense_events (expense_id, actor, action, after)
         VALUES ($1,$2,'created',$3)`,
        [expenseId, req.userId, JSON.stringify({ amount_cents: amount, description: desc, paid_by: payerId, split_mode: mode, shares: shareRows })],
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.status(201).json({ expense_id: expenseId });

    // Notify everyone whose share isn't zero, except the person who added it.
    try {
      const { rows: hiveRow } = await query(`SELECT hive_name FROM hives WHERE hive_id = $1`, [hiveId]);
      for (const s of shareRows) {
        if (s.user_id === req.userId || s.share_cents === 0) continue;
        await createNotification({
          userId: s.user_id, type: 'expense_added', category: 'costs',
          title: `Added to an expense in ${hiveRow[0]?.hive_name ?? 'your Hive'}: ${desc}`,
          body: `Your share: $${(s.share_cents / 100).toFixed(2)}`,
          hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/tools/split_costs/${g.group_id}`,
        });
      }
    } catch (notifErr) {
      console.error('[costs/createExpense] notify failed (non-fatal):', notifErr);
    }
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[costs/createExpense]', err);
    res.status(500).json({ error: 'Failed to add the expense.' });
  }
};

async function loadExpenseForManage(hiveId, expenseId, userId) {
  const { rows: [e] } = await query(
    `SELECT e.*, g.hive_id FROM hive_expenses e
       JOIN hive_cost_groups g ON g.group_id = e.group_id
      WHERE e.expense_id = $1`,
    [expenseId],
  );
  if (!e || e.hive_id !== hiveId) { const err = new Error('Expense not found.'); err.status = 404; throw err; }
  if (e.deleted_at) { const err = new Error('This expense was already deleted.'); err.status = 400; throw err; }
  const mem = await requireMembership(hiveId, userId);
  const canManage = e.created_by === userId || e.paid_by === userId || ['owner', 'admin'].includes(mem.role);
  if (!canManage) {
    const err = new Error('Only who added it, who paid, or an owner/admin can change this expense.');
    err.status = 403; throw err;
  }
  return e;
}

// ── PATCH /api/hives/:id/tools/split_costs/expenses/:expenseId ──────────────
export const editExpense = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const e = await loadExpenseForManage(hiveId, req.params.expenseId, req.userId);

    const { amountCents, description, spentOn, splitMode, participantUserIds, shares } = req.body ?? {};
    const amount = Number(amountCents);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 10000000) {
      return res.status(400).json({ error: 'Amount must be a whole number of cents between 1 and 10,000,000.' });
    }
    const desc = String(description ?? '').trim();
    if (!desc) return res.status(400).json({ error: 'A description is required.' });
    if (desc.length > 120) return res.status(400).json({ error: 'Description must be 120 characters or fewer.' });

    let spent = null;
    if (spentOn) {
      spent = new Date(spentOn);
      if (isNaN(spent.getTime())) return res.status(400).json({ error: 'Date spent is not a valid date.' });
    }

    const mode = splitMode === 'custom' ? 'custom' : 'equal';
    let shareRows;
    if (mode === 'equal') {
      const ids = Array.isArray(participantUserIds) && participantUserIds.length ? participantUserIds : [e.paid_by];
      for (const uid of ids) {
        if (!await getMembership(hiveId, uid)) return res.status(400).json({ error: 'Every participant must be an active member of this Hive.' });
      }
      shareRows = equalSplit(amount, ids);
    } else {
      const entries = Object.entries(shares ?? {});
      if (entries.length === 0) return res.status(400).json({ error: 'A custom split needs at least one share.' });
      let sum = 0; shareRows = [];
      for (const [uid, cents] of entries) {
        const c = Number(cents);
        if (!Number.isInteger(c) || c < 0) return res.status(400).json({ error: 'Each share must be a whole, non-negative number of cents.' });
        if (!await getMembership(hiveId, uid)) return res.status(400).json({ error: 'Every participant must be an active member of this Hive.' });
        sum += c; shareRows.push({ user_id: uid, share_cents: c });
      }
      if (sum !== amount) return res.status(400).json({ error: `Shares must sum exactly to the amount (got ${sum}, expected ${amount}).` });
    }

    const before = { amount_cents: e.amount_cents, description: e.description, spent_on: e.spent_on, split_mode: e.split_mode };

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE hive_expenses SET amount_cents=$1, description=$2, spent_on=$3, split_mode=$4 WHERE expense_id=$5`,
        [amount, desc, spent ? spent.toISOString().slice(0, 10) : null, mode, e.expense_id],
      );
      await client.query(`DELETE FROM hive_expense_shares WHERE expense_id = $1`, [e.expense_id]);
      for (const s of shareRows) {
        await client.query(`INSERT INTO hive_expense_shares (expense_id, user_id, share_cents) VALUES ($1,$2,$3)`,
          [e.expense_id, s.user_id, s.share_cents]);
      }
      await client.query(
        `INSERT INTO hive_expense_events (expense_id, actor, action, before, after)
         VALUES ($1,$2,'edited',$3,$4)`,
        [e.expense_id, req.userId, JSON.stringify(before),
         JSON.stringify({ amount_cents: amount, description: desc, split_mode: mode, shares: shareRows })],
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ expense_id: e.expense_id });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[costs/editExpense]', err);
    res.status(500).json({ error: 'Failed to update the expense.' });
  }
};

// ── DELETE /api/hives/:id/tools/split_costs/expenses/:expenseId ─────────────
export const deleteExpense = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const e = await loadExpenseForManage(hiveId, req.params.expenseId, req.userId);

    await query(`UPDATE hive_expenses SET deleted_at = NOW() WHERE expense_id = $1`, [e.expense_id]);
    await query(
      `INSERT INTO hive_expense_events (expense_id, actor, action, before)
       VALUES ($1,$2,'deleted',$3)`,
      [e.expense_id, req.userId, JSON.stringify({ amount_cents: e.amount_cents, description: e.description })],
    );
    res.json({ deleted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[costs/deleteExpense]', err);
    res.status(500).json({ error: 'Failed to delete the expense.' });
  }
};

// ── GET /api/hives/:id/tools/split_costs/expenses/:expenseId/events ─────────
export const getExpenseEvents = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const { rows: [e] } = await query(
      `SELECT e.expense_id, g.hive_id FROM hive_expenses e
         JOIN hive_cost_groups g ON g.group_id = e.group_id WHERE e.expense_id = $1`,
      [req.params.expenseId],
    );
    if (!e || e.hive_id !== hiveId) return res.status(404).json({ error: 'Expense not found.' });

    const { rows } = await query(
      `SELECT ev.action, ev.before, ev.after, ev.at, pr.full_name AS actor_name
         FROM hive_expense_events ev
         LEFT JOIN profiles pr ON pr.user_id = ev.actor
        WHERE ev.expense_id = $1 ORDER BY ev.at ASC`,
      [req.params.expenseId],
    );
    res.json({ events: rows });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[costs/getExpenseEvents]', err);
    res.status(500).json({ error: 'Failed to load this expense’s history.' });
  }
};

// ── POST /api/hives/:id/tools/split_costs/groups/:groupId/settlements ───────
export const createSettlement = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await requireMembership(hiveId, req.userId);
    const g = await loadGroup(req.params.groupId);
    if (!g || g.hive_id !== hiveId) return res.status(404).json({ error: 'Group not found.' });

    const { fromUser, toUser, amountCents, method, note } = req.body ?? {};
    const from = fromUser || req.userId;
    const to = toUser;
    if (!to) return res.status(400).json({ error: 'A recipient is required.' });
    if (from === to) return res.status(400).json({ error: 'A settlement needs two different people.' });

    const isParty = req.userId === from || req.userId === to;
    const isOwnerOrAdmin = ['owner', 'admin'].includes(mem.role);
    if (!isParty && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the two people in a settlement, or an owner/admin, can record it.' });
    }
    if (!await getMembership(hiveId, from) || !await getMembership(hiveId, to)) {
      return res.status(400).json({ error: 'Both people must be active members of this Hive.' });
    }

    const amount = Number(amountCents);
    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive whole number of cents.' });
    }
    if (!METHODS.includes(method)) {
      return res.status(400).json({ error: `method must be one of: ${METHODS.join(', ')}.` });
    }

    const { rows: [s] } = await query(
      `INSERT INTO hive_settlements (group_id, from_user, to_user, amount_cents, method, note, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [g.group_id, from, to, amount, method, note ? String(note).trim().slice(0, 200) : null, req.userId],
    );
    res.status(201).json({ settlement: s });

    try {
      const other = req.userId === from ? to : from;
      const { rows: hiveRow } = await query(`SELECT hive_name FROM hives WHERE hive_id = $1`, [hiveId]);
      await createNotification({
        userId: other, type: 'settlement_recorded', category: 'costs',
        title: `A settlement was recorded with you in ${hiveRow[0]?.hive_name ?? 'your Hive'}`,
        body: `$${(amount / 100).toFixed(2)} via ${method}`,
        hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/tools/split_costs/${g.group_id}`,
      });
    } catch (notifErr) {
      console.error('[costs/createSettlement] notify failed (non-fatal):', notifErr);
    }
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[costs/createSettlement]', err);
    res.status(500).json({ error: 'Failed to record the settlement.' });
  }
};

// ── DELETE /api/hives/:id/tools/split_costs/settlements/:settlementId ───────
export const deleteSettlement = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await requireMembership(hiveId, req.userId);
    const { rows: [s] } = await query(
      `SELECT st.*, g.hive_id FROM hive_settlements st
         JOIN hive_cost_groups g ON g.group_id = st.group_id WHERE st.settlement_id = $1`,
      [req.params.settlementId],
    );
    if (!s || s.hive_id !== hiveId) return res.status(404).json({ error: 'Settlement not found.' });
    if (s.deleted_at) return res.status(400).json({ error: 'This settlement was already deleted.' });

    const canManage = s.recorded_by === req.userId || ['owner', 'admin'].includes(mem.role);
    if (!canManage) return res.status(403).json({ error: 'Only whoever recorded it, or an owner/admin, can delete it.' });

    await query(`UPDATE hive_settlements SET deleted_at = NOW() WHERE settlement_id = $1`, [s.settlement_id]);
    res.json({ deleted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[costs/deleteSettlement]', err);
    res.status(500).json({ error: 'Failed to delete the settlement.' });
  }
};
