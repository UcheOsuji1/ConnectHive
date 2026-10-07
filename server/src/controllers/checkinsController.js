// Check-in (Prompt 61 Part 5, tool_key = 'checkins').
import { query } from '../db/index.js';
import { getMembership } from '../lib/hiveMembership.js';
import { PLAN_END } from './eventsController.js';

async function loadPlan(hiveId, postId) {
  const { rows: [plan] } = await query(
    `SELECT post_id, hive_id, author_user_id, post_type, event_at, cancelled_at,
            ${PLAN_END} AS effective_end
       FROM hive_posts p WHERE post_id = $1`,
    [postId],
  );
  if (!plan || plan.hive_id !== hiveId || plan.post_type !== 'event') return null;
  return plan;
}

// ── POST /api/hives/:id/plans/:postId/checkin — self check-in ───────────────
// 30 minutes before the start through 2 hours after the effective end.
export const selfCheckIn = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem) return res.status(403).json({ error: 'You must be a member of this Hive.' });

    const plan = await loadPlan(hiveId, req.params.postId);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    if (plan.cancelled_at) return res.status(400).json({ error: 'This plan was cancelled.' });

    const now = Date.now();
    const windowStart = new Date(plan.event_at).getTime() - 30 * 60000;
    const windowEnd = new Date(plan.effective_end).getTime() + 2 * 3600e3;
    if (now < windowStart || now > windowEnd) {
      return res.status(400).json({ error: 'Check-in is only open from 30 minutes before the plan starts until 2 hours after it ends.' });
    }

    await query(
      `INSERT INTO plan_checkins (post_id, user_id, method, checked_in_by)
       VALUES ($1,$2,'self',$2)
       ON CONFLICT (post_id, user_id) DO NOTHING`,
      [plan.post_id, req.userId],
    );
    res.json({ checked_in: true });
  } catch (err) {
    console.error('[checkins/selfCheckIn]', err);
    res.status(500).json({ error: 'Failed to check in.' });
  }
};

// ── POST /api/hives/:id/plans/:postId/checkin/:userId — host roll call ──────
// Host, owners and admins — from the day of the plan until 7 days after it ends.
export const hostCheckIn = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem) return res.status(403).json({ error: 'You must be a member of this Hive.' });

    const plan = await loadPlan(hiveId, req.params.postId);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    const canMark = plan.author_user_id === req.userId || ['owner', 'admin'].includes(mem.role);
    if (!canMark) {
      return res.status(403).json({ error: 'Only the host, owners or admins can mark attendance for someone else.' });
    }

    const now = Date.now();
    const dayStart = new Date(new Date(plan.event_at).toDateString()).getTime();
    const windowEnd = new Date(plan.effective_end).getTime() + 7 * 86400e3;
    if (now < dayStart || now > windowEnd) {
      return res.status(400).json({ error: 'Attendance can only be marked from the day of the plan until 7 days after it ends.' });
    }

    const targetId = req.params.userId;
    const targetMem = await getMembership(hiveId, targetId);
    if (!targetMem) {
      return res.status(400).json({ error: 'That person is not an active member of this Hive.' });
    }

    await query(
      `INSERT INTO plan_checkins (post_id, user_id, method, checked_in_by)
       VALUES ($1,$2,'host',$3)
       ON CONFLICT (post_id, user_id) DO UPDATE SET method = 'host', checked_in_by = $3, checked_in_at = NOW()`,
      [plan.post_id, targetId, req.userId],
    );
    res.json({ checked_in: true, user_id: targetId });
  } catch (err) {
    console.error('[checkins/hostCheckIn]', err);
    res.status(500).json({ error: 'Failed to mark attendance.' });
  }
};

// ── Attendance rate — Manage > Analytics and About's Hive at a Glance ───────
// Only counts past plans that have at least one check-in row (a plan nobody
// checked into tells us nothing — it isn't "0% attendance", it's unmeasured).
// Needs 3+ such plans before showing anything, so a Hive's very first
// check-in-enabled plan can't produce a misleadingly precise rate.
export async function getAttendanceRate(hiveId) {
  const { rows } = await query(
    `SELECT p.post_id,
            (SELECT COUNT(DISTINCT c.user_id)::int FROM plan_checkins c WHERE c.post_id = p.post_id) AS attended,
            (SELECT COUNT(*)::int FROM event_rsvps r WHERE r.post_id = p.post_id AND r.rsvp_status = 'going') AS going
       FROM hive_posts p
      WHERE p.hive_id = $1 AND p.post_type = 'event' AND p.cancelled_at IS NULL
        AND ${PLAN_END} < NOW()
        AND EXISTS (SELECT 1 FROM plan_checkins c WHERE c.post_id = p.post_id)`,
    [hiveId],
  );
  if (rows.length < 3) return null;

  const totalGoing = rows.reduce((sum, r) => sum + r.going, 0);
  const totalAttended = rows.reduce((sum, r) => sum + r.attended, 0);
  if (totalGoing === 0) return null;

  return { rate: Math.round((totalAttended / totalGoing) * 100), planCount: rows.length };
}

// ── GET /api/hives/:id/plans/:postId/checkins ────────────────────────────────
export const getPlanCheckins = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem) return res.status(403).json({ error: 'You must be a member of this Hive.' });

    const plan = await loadPlan(hiveId, req.params.postId);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    const { rows } = await query(
      `SELECT c.user_id, c.method, c.checked_in_at, pr.full_name, pr.profile_photo_url
         FROM plan_checkins c
         JOIN hive_members m ON m.hive_id = $2 AND m.user_id = c.user_id AND m.membership_status = 'active'
         LEFT JOIN profiles pr ON pr.user_id = c.user_id
        WHERE c.post_id = $1
        ORDER BY c.checked_in_at ASC`,
      [plan.post_id, hiveId],
    );
    res.json({
      checkins: rows,
      viewer_checked_in: rows.some(r => r.user_id === req.userId),
    });
  } catch (err) {
    console.error('[checkins/getPlanCheckins]', err);
    res.status(500).json({ error: 'Failed to load check-ins.' });
  }
};
