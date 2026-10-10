// Goals (Prompt 63 Part 2, tool_key = 'goals') — real progress bars computed
// live from real tables, never a stored/cached number. pinned_goal on hives
// (the old free-text field) is left completely alone here: hive_goals is
// additive, offered only once as a replace prompt on a Hive's first goal,
// never auto-migrated.
import { query } from '../db/index.js';
import { requireMembership } from '../lib/hiveMembership.js';
import { PLAN_END } from './eventsController.js';

export const METRIC_DEFS = {
  plans_held:      { label: 'Plans held', explain: 'Counts plans in this Hive that have already happened during the goal period.' },
  attendance:       { label: 'Check-ins', explain: 'Counts member check-ins at plans during the goal period.' },
  members:          { label: 'Active members', explain: 'The Hive’s current active member count.' },
  new_members:      { label: 'New members', explain: 'Counts members who joined during the goal period.' },
  messages:         { label: 'Messages sent', explain: 'Counts chat messages sent in this Hive during the goal period.' },
  photos:           { label: 'Photos shared', explain: 'Counts image attachments and uploads shared during the goal period.' },
  milestones_done:  { label: 'Milestones completed', explain: 'Counts completed tasks — not available until the Task board tool exists.', unavailable: true },
  manual:           { label: 'Manual', explain: 'An owner or admin updates this number by hand.' },
};

export function publicMetricDefs() {
  return Object.fromEntries(
    Object.entries(METRIC_DEFS).filter(([, d]) => !d.unavailable).map(([k, d]) => [k, { label: d.label, explain: d.explain }]),
  );
}

// end-of-day boundary so period_end's whole day counts.
function periodEndExclusive(periodEnd) {
  return `(${periodEnd}::date + INTERVAL '1 day')`;
}

async function computeMetricValue(hiveId, goal) {
  const { metric, period_start: start, period_end: end, manual_value: manualValue } = goal;
  switch (metric) {
    case 'manual':
      return manualValue ?? 0;

    case 'members': {
      const { rows: [r] } = await query(
        `SELECT COUNT(*)::int AS n FROM hive_members WHERE hive_id = $1 AND membership_status = 'active'`,
        [hiveId],
      );
      return r.n;
    }

    case 'new_members': {
      const { rows: [r] } = await query(
        `SELECT COUNT(*)::int AS n FROM hive_members
          WHERE hive_id = $1 AND membership_status = 'active'
            AND joined_at >= $2::date AND joined_at < ${periodEndExclusive('$3')}`,
        [hiveId, start, end],
      );
      return r.n;
    }

    case 'plans_held': {
      const { rows: [r] } = await query(
        `SELECT COUNT(*)::int AS n FROM hive_posts p
          WHERE p.hive_id = $1 AND p.post_type = 'event' AND p.cancelled_at IS NULL
            AND p.event_at >= $2::date AND p.event_at < ${periodEndExclusive('$3')}
            AND ${PLAN_END} < NOW()`,
        [hiveId, start, end],
      );
      return r.n;
    }

    case 'attendance': {
      const { rows: [r] } = await query(
        `SELECT COUNT(*)::int AS n FROM plan_checkins c
           JOIN hive_posts p ON p.post_id = c.post_id
          WHERE p.hive_id = $1 AND p.event_at >= $2::date AND p.event_at < ${periodEndExclusive('$3')}`,
        [hiveId, start, end],
      );
      return r.n;
    }

    case 'messages': {
      const { rows: [r] } = await query(
        `SELECT COUNT(*)::int AS n FROM messages m
          WHERE m.hive_id = $1 AND m.deleted_at IS NULL
            AND m.sent_at >= $2::date AND m.sent_at < ${periodEndExclusive('$3')}`,
        [hiveId, start, end],
      );
      return r.n;
    }

    case 'photos': {
      const { rows: [r] } = await query(
        `SELECT (
           (SELECT COUNT(*)::int FROM message_attachments a
              JOIN messages m ON m.message_id = a.message_id
             WHERE m.hive_id = $1 AND m.deleted_at IS NULL AND a.resource_type = 'image'
               AND a.created_at >= $2::date AND a.created_at < ${periodEndExclusive('$3')})
           +
           (SELECT COUNT(*)::int FROM hive_uploads u
             WHERE u.hive_id = $1 AND u.deleted_at IS NULL AND u.resource_type = 'image'
               AND u.created_at >= $2::date AND u.created_at < ${periodEndExclusive('$3')})
         ) AS n`,
        [hiveId, start, end],
      );
      return r.n;
    }

    default:
      return 0;
  }
}

// Completes a goal exactly once: the WHERE completed_at IS NULL guard means
// only the first caller to observe value >= target flips it — same
// idempotent-ledger shape as cost_nudges_sent. A completed goal's "goal
// completed" activity on Hive Home is derived from completed_at itself
// (hiveHomeController's acts CTE), not a separately-inserted event.
async function maybeComplete(goal, value) {
  if (goal.completed_at || goal.archived_at) return goal.completed_at;
  if (value < goal.target) return null;
  const { rows: [r] } = await query(
    `UPDATE hive_goals SET completed_at = NOW() WHERE goal_id = $1 AND completed_at IS NULL RETURNING completed_at`,
    [goal.goal_id],
  );
  return r?.completed_at ?? null;
}

async function shapeGoalWithProgress(hiveId, goal) {
  const value = await computeMetricValue(hiveId, goal);
  const completedAt = await maybeComplete(goal, value) ?? goal.completed_at;
  return {
    goal_id: goal.goal_id, hive_id: goal.hive_id, title: goal.title, description: goal.description,
    metric: goal.metric, metric_label: METRIC_DEFS[goal.metric]?.label ?? goal.metric,
    target: goal.target, period_start: goal.period_start, period_end: goal.period_end,
    manual_value: goal.manual_value, featured: goal.featured, created_by: goal.created_by,
    created_at: goal.created_at, completed_at: completedAt, archived_at: goal.archived_at,
    value, progress_pct: Math.min(100, Math.round((value / goal.target) * 100)),
  };
}

// Used by hiveHomeController/HiveAboutPage — the one Hive-wide featured
// goal, with live progress, or null if there isn't one.
export async function getFeaturedGoalWithProgress(hiveId) {
  const { rows: [g] } = await query(
    `SELECT * FROM hive_goals WHERE hive_id = $1 AND featured = TRUE AND archived_at IS NULL LIMIT 1`,
    [hiveId],
  );
  if (!g) return null;
  return shapeGoalWithProgress(hiveId, g);
}

function validateGoalBody(raw) {
  const title = String(raw?.title ?? '').trim();
  if (!title) return { error: 'A title is required.' };
  if (title.length > 120) return { error: 'Title must be 120 characters or fewer.' };
  const description = raw?.description ? String(raw.description).trim().slice(0, 1000) : null;
  const metric = String(raw?.metric ?? '');
  const def = METRIC_DEFS[metric];
  if (!def || def.unavailable) return { error: 'That metric isn’t available yet.' };
  const target = Number(raw?.target);
  if (!Number.isInteger(target) || target < 1 || target > 100000) return { error: 'Target must be a whole number between 1 and 100,000.' };
  const periodStart = String(raw?.periodStart ?? '');
  const periodEnd = String(raw?.periodEnd ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return { error: 'Period start and end must be valid dates.' };
  }
  if (periodEnd < periodStart) return { error: 'Period end can’t be before period start.' };
  let manualValue = null;
  if (metric === 'manual') {
    manualValue = raw?.manualValue == null ? 0 : Number(raw.manualValue);
    if (!Number.isInteger(manualValue) || manualValue < 0) return { error: 'Manual value must be zero or a positive whole number.' };
  }
  return { title, description, metric, target, periodStart, periodEnd, manualValue, featured: !!raw?.featured };
}

async function requireOwnerAdmin(hiveId, userId) {
  const member = await requireMembership(hiveId, userId);
  if (member.role !== 'owner' && member.role !== 'admin') {
    const err = new Error('Only an owner or admin can manage Goals.');
    err.status = 403;
    throw err;
  }
  return member;
}

async function loadGoal(hiveId, goalId) {
  const { rows: [g] } = await query(`SELECT * FROM hive_goals WHERE goal_id = $1`, [goalId]);
  if (!g || g.hive_id !== hiveId) { const err = new Error('Goal not found.'); err.status = 404; throw err; }
  return g;
}

// ── GET /api/hives/:id/tools/goals/goals ─────────────────────────────────────
export const listGoals = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const { rows } = await query(
      `SELECT * FROM hive_goals WHERE hive_id = $1
        ORDER BY (completed_at IS NOT NULL OR archived_at IS NOT NULL) ASC, featured DESC, period_end ASC`,
      [hiveId],
    );
    const shaped = await Promise.all(rows.map(g => shapeGoalWithProgress(hiveId, g)));
    res.json({
      goals: shaped,
      metrics: publicMetricDefs(),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[goals/listGoals]', err);
    res.status(500).json({ error: 'Failed to load Goals.' });
  }
};

// ── POST /api/hives/:id/tools/goals/goals ────────────────────────────────────
export const createGoal = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireOwnerAdmin(hiveId, req.userId);
    const v = validateGoalBody(req.body);
    if (v.error) return res.status(400).json({ error: v.error });

    const { rows: [existingCount] } = await query(`SELECT COUNT(*)::int AS n FROM hive_goals WHERE hive_id = $1`, [hiveId]);
    const isFirstGoal = existingCount.n === 0;

    if (v.featured) {
      await query(`UPDATE hive_goals SET featured = FALSE WHERE hive_id = $1 AND featured = TRUE`, [hiveId]);
    }

    const { rows: [g] } = await query(
      `INSERT INTO hive_goals (hive_id, title, description, metric, target, period_start, period_end, manual_value, featured, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [hiveId, v.title, v.description, v.metric, v.target, v.periodStart, v.periodEnd, v.manualValue, v.featured, req.userId],
    );

    let pinnedGoalText = null;
    if (isFirstGoal) {
      const { rows: [h] } = await query(`SELECT pinned_goal FROM hives WHERE hive_id = $1`, [hiveId]);
      pinnedGoalText = h?.pinned_goal ?? null;
    }

    const goal = await shapeGoalWithProgress(hiveId, g);
    res.status(201).json({ goal, offerReplacePinnedGoal: isFirstGoal && !!pinnedGoalText, pinnedGoalText });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[goals/createGoal]', err);
    res.status(500).json({ error: 'Failed to create this Goal.' });
  }
};

// ── PATCH /api/hives/:id/tools/goals/goals/:goalId ───────────────────────────
export const updateGoal = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireOwnerAdmin(hiveId, req.userId);
    const existing = await loadGoal(hiveId, req.params.goalId);
    if (existing.completed_at || existing.archived_at) {
      return res.status(400).json({ error: 'This Goal is already completed or archived.' });
    }

    const v = validateGoalBody({ ...existing, ...req.body,
      periodStart: req.body?.periodStart ?? existing.period_start,
      periodEnd: req.body?.periodEnd ?? existing.period_end,
      manualValue: req.body?.manualValue ?? existing.manual_value,
      featured: req.body?.featured ?? existing.featured,
    });
    if (v.error) return res.status(400).json({ error: v.error });

    if (v.featured && !existing.featured) {
      await query(`UPDATE hive_goals SET featured = FALSE WHERE hive_id = $1 AND featured = TRUE AND goal_id != $2`, [hiveId, existing.goal_id]);
    }

    const { rows: [g] } = await query(
      `UPDATE hive_goals SET title=$1, description=$2, metric=$3, target=$4, period_start=$5, period_end=$6, manual_value=$7, featured=$8
        WHERE goal_id = $9 RETURNING *`,
      [v.title, v.description, v.metric, v.target, v.periodStart, v.periodEnd, v.manualValue, v.featured, existing.goal_id],
    );
    const goal = await shapeGoalWithProgress(hiveId, g);
    res.json({ goal });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[goals/updateGoal]', err);
    res.status(500).json({ error: 'Failed to update this Goal.' });
  }
};

// ── PATCH /api/hives/:id/tools/goals/goals/:goalId/progress ──────────────────
// Manual-metric goals only — an owner/admin typing in the current count.
export const updateManualProgress = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireOwnerAdmin(hiveId, req.userId);
    const existing = await loadGoal(hiveId, req.params.goalId);
    if (existing.metric !== 'manual') return res.status(400).json({ error: 'This Goal isn’t tracked manually.' });
    if (existing.completed_at || existing.archived_at) return res.status(400).json({ error: 'This Goal is already completed or archived.' });

    const value = Number(req.body?.value);
    if (!Number.isInteger(value) || value < 0) return res.status(400).json({ error: 'Value must be zero or a positive whole number.' });

    const { rows: [g] } = await query(`UPDATE hive_goals SET manual_value = $1 WHERE goal_id = $2 RETURNING *`, [value, existing.goal_id]);
    const goal = await shapeGoalWithProgress(hiveId, g);
    res.json({ goal });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[goals/updateManualProgress]', err);
    res.status(500).json({ error: 'Failed to update progress.' });
  }
};

// ── POST /api/hives/:id/tools/goals/goals/:goalId/archive ────────────────────
export const archiveGoal = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireOwnerAdmin(hiveId, req.userId);
    const existing = await loadGoal(hiveId, req.params.goalId);
    await query(`UPDATE hive_goals SET archived_at = NOW(), featured = FALSE WHERE goal_id = $1`, [existing.goal_id]);
    const g = await loadGoal(hiveId, existing.goal_id);
    const goal = await shapeGoalWithProgress(hiveId, g);
    res.json({ goal });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[goals/archiveGoal]', err);
    res.status(500).json({ error: 'Failed to archive this Goal.' });
  }
};
