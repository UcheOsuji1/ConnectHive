// Meet someone new (Prompt 64 Part 2, tool_key = 'coffee_chats') — settings,
// opt-in/opt-out, pause, and the "Did you meet?" follow-up.
import { query } from '../db/index.js';
import { requireMembership } from '../lib/hiveMembership.js';

const SKIP_BUFFER_DAYS = { weekly: 8, biweekly: 15, monthly: 28 };

async function requireOwnerAdmin(hiveId, userId) {
  const member = await requireMembership(hiveId, userId);
  if (member.role !== 'owner' && member.role !== 'admin') {
    const err = new Error('Only an owner or admin can manage Meet someone new.');
    err.status = 403;
    throw err;
  }
  return member;
}

// ── GET /api/hives/:id/tools/coffee_chats/settings ───────────────────────────
export const getCoffeeSettings = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const { rows: [s] } = await query(`SELECT cadence, pairing_day, allow_groups_of_3 FROM hive_coffee_settings WHERE hive_id = $1`, [hiveId]);
    res.json({
      settings: s ?? { cadence: 'biweekly', pairing_day: 1, allow_groups_of_3: true },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[coffeeChats/getSettings]', err);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
};

// ── PUT /api/hives/:id/tools/coffee_chats/settings ────────────────────────────
export const updateCoffeeSettings = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireOwnerAdmin(hiveId, req.userId);

    const { cadence, pairingDay, allowGroupsOf3 } = req.body ?? {};
    if (!['weekly', 'biweekly', 'monthly'].includes(cadence)) {
      return res.status(400).json({ error: 'cadence must be weekly, biweekly or monthly.' });
    }
    const day = Number(pairingDay);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      return res.status(400).json({ error: 'pairingDay must be 0-6 (Sunday-Saturday).' });
    }

    const { rows: [s] } = await query(
      `INSERT INTO hive_coffee_settings (hive_id, cadence, pairing_day, allow_groups_of_3, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (hive_id) DO UPDATE SET
         cadence = EXCLUDED.cadence, pairing_day = EXCLUDED.pairing_day,
         allow_groups_of_3 = EXCLUDED.allow_groups_of_3, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING cadence, pairing_day, allow_groups_of_3`,
      [hiveId, cadence, day, allowGroupsOf3 !== false, req.userId],
    );
    res.json({ settings: s });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[coffeeChats/updateSettings]', err);
    res.status(500).json({ error: 'Failed to save settings.' });
  }
};

// ── GET /api/hives/:id/tools/coffee_chats/status ──────────────────────────────
export const getCoffeeStatus = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const { rows: [optin] } = await query(
      `SELECT opted_in_at, paused_until FROM hive_coffee_optins WHERE hive_id = $1 AND user_id = $2`,
      [hiveId, req.userId],
    );
    res.json({
      optedIn: !!optin,
      pausedUntil: optin?.paused_until ?? null,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[coffeeChats/getStatus]', err);
    res.status(500).json({ error: 'Failed to load your status.' });
  }
};

// ── POST /api/hives/:id/tools/coffee_chats/optin ──────────────────────────────
export const optIn = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    await query(
      `INSERT INTO hive_coffee_optins (hive_id, user_id) VALUES ($1,$2)
       ON CONFLICT (hive_id, user_id) DO UPDATE SET paused_until = NULL`,
      [hiveId, req.userId],
    );
    res.json({ optedIn: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[coffeeChats/optIn]', err);
    res.status(500).json({ error: 'Failed to opt in.' });
  }
};

// ── DELETE /api/hives/:id/tools/coffee_chats/optin ────────────────────────────
export const optOut = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    await query(`DELETE FROM hive_coffee_optins WHERE hive_id = $1 AND user_id = $2`, [hiveId, req.userId]);
    res.json({ optedIn: false });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[coffeeChats/optOut]', err);
    res.status(500).json({ error: 'Failed to opt out.' });
  }
};

// ── POST /api/hives/:id/tools/coffee_chats/skip-next ──────────────────────────
// Pauses just long enough to miss the next round at this Hive's cadence, then
// resumes automatically — no separate "resume" step needed.
export const skipNextRound = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const { rows: [optin] } = await query(
      `SELECT user_id FROM hive_coffee_optins WHERE hive_id = $1 AND user_id = $2`,
      [hiveId, req.userId],
    );
    if (!optin) return res.status(400).json({ error: 'You are not opted in yet.' });

    const { rows: [s] } = await query(`SELECT cadence FROM hive_coffee_settings WHERE hive_id = $1`, [hiveId]);
    const bufferDays = SKIP_BUFFER_DAYS[s?.cadence ?? 'biweekly'];
    const pausedUntil = new Date(Date.now() + bufferDays * 86400000).toISOString().slice(0, 10);

    await query(`UPDATE hive_coffee_optins SET paused_until = $1 WHERE hive_id = $2 AND user_id = $3`, [pausedUntil, hiveId, req.userId]);
    res.json({ pausedUntil });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[coffeeChats/skipNextRound]', err);
    res.status(500).json({ error: 'Failed to pause.' });
  }
};

// ── POST /api/hives/:id/tools/coffee_chats/pairs/:pairId/met ─────────────────
// response: 'yes' | 'not_yet' | 'skip'. 'not_yet' makes no change — the
// prompt can resurface later rather than forcing an answer.
export const recordMet = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const { rows: [pair] } = await query(
      `SELECT cp.pair_id, cp.user_ids, cp.met
         FROM hive_coffee_pairs cp
         JOIN hive_coffee_rounds cr ON cr.round_id = cp.round_id
        WHERE cp.pair_id = $1 AND cr.hive_id = $2`,
      [req.params.pairId, hiveId],
    );
    if (!pair) return res.status(404).json({ error: 'Pairing not found.' });
    if (!pair.user_ids.includes(req.userId)) {
      return res.status(403).json({ error: 'Only someone in this pairing can answer.' });
    }

    const response = req.body?.response;
    if (!['yes', 'not_yet', 'skip'].includes(response)) {
      return res.status(400).json({ error: 'response must be yes, not_yet or skip.' });
    }
    if (response === 'not_yet') return res.json({ met: pair.met });

    const met = response === 'yes';
    const { rows: [updated] } = await query(
      `UPDATE hive_coffee_pairs SET met = $1 WHERE pair_id = $2 RETURNING met`,
      [met, pair.pair_id],
    );
    res.json({ met: updated.met });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[coffeeChats/recordMet]', err);
    res.status(500).json({ error: 'Failed to save your answer.' });
  }
};
