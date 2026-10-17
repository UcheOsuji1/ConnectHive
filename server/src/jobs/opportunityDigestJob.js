// Opportunities board notifications (Prompt 65 Part 1) — a daily digest of
// new posts, and a "closing in 2 days" nudge for members who saved a post.
// Same pattern as rsvpReminderJob/costNudgeJob: an idempotent-ledger guard
// per notification type, an exported run function the checks call directly,
// and an interval wrapper with a started-once guard.
import { query } from '../db/index.js';
import { getHivesWithToolOn } from '../lib/hiveTools.js';
import { createNotification } from '../controllers/notificationsController.js';
import { reportJobError } from '../lib/jobTick.js';

const INTERVAL_MS = 60 * 60 * 1000; // hourly — fine-grained enough to catch a digest/deadline window without spamming

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function runOpportunityDigestJob() {
  const hiveIds = await getHivesWithToolOn('opportunities');
  const today = todayStr();
  let digestsSent = 0, deadlineNudgesSent = 0;

  for (const hiveId of hiveIds) {
    // ── Daily digest of new posts ──────────────────────────────────────────
    const { rows: [newToday] } = await query(
      `SELECT COUNT(*)::int AS n FROM hive_opportunities
        WHERE hive_id = $1 AND deleted_at IS NULL AND created_at::date = $2`,
      [hiveId, today],
    );
    if (newToday.n > 0) {
      const { rows: members } = await query(
        `SELECT user_id FROM hive_members WHERE hive_id = $1 AND membership_status = 'active'`,
        [hiveId],
      );
      for (const m of members) {
        const { rowCount } = await query(
          `INSERT INTO hive_opportunity_digests_sent (hive_id, user_id, digest_date) VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [hiveId, m.user_id, today],
        );
        if (rowCount === 0) continue; // already digested today for this member
        await createNotification({
          userId: m.user_id, type: 'opportunity_digest', category: 'opportunities',
          title: `${newToday.n} new opportunit${newToday.n === 1 ? 'y' : 'ies'} posted today`,
          hiveId, link: `/hive/${hiveId}/tools/opportunities`,
        }).catch(e => console.error('[opportunityDigestJob] digest notify failed', e));
        digestsSent++;
      }
    }

    // ── Saved post closing in 2 days ────────────────────────────────────────
    const { rows: closingSoon } = await query(
      `SELECT o.opp_id, o.title, s.user_id
         FROM hive_opportunities o
         JOIN hive_opportunity_saves s ON s.opp_id = o.opp_id
        WHERE o.hive_id = $1 AND o.deleted_at IS NULL AND o.closed_at IS NULL
          AND o.deadline = ($2::date + INTERVAL '2 days')::date`,
      [hiveId, today],
    );
    for (const row of closingSoon) {
      const { rowCount } = await query(
        `INSERT INTO hive_opportunity_deadline_notified (opp_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [row.opp_id, row.user_id],
      );
      if (rowCount === 0) continue;
      await createNotification({
        userId: row.user_id, type: 'opportunity_deadline', category: 'opportunities',
        title: `"${row.title}" closes in 2 days`,
        hiveId, link: `/hive/${hiveId}/tools/opportunities?tab=saved`,
      }).catch(e => console.error('[opportunityDigestJob] deadline notify failed', e));
      deadlineNudgesSent++;
    }
  }

  return { digestsSent, deadlineNudgesSent };
}

let started = false;
export function startOpportunityDigestJob() {
  if (started) return;
  started = true;
  runOpportunityDigestJob().catch(e => reportJobError('opportunityDigestJob', 'initial run', e));
  setInterval(() => {
    runOpportunityDigestJob().catch(e => reportJobError('opportunityDigestJob', 'run', e));
  }, INTERVAL_MS);
}
