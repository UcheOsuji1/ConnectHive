// Weekly "you owe money" nudge (Prompt 62 Part 1) — same pattern as
// rsvpReminderJob.js. Runs every few hours (the nudge itself is weekly; this
// just checks often enough that the actual send lands close to a week
// boundary) and reuses costsController's own balance formula so the nudge can
// never disagree with what the group page shows.
import { query } from '../db/index.js';
import { computeBalances } from '../controllers/costsController.js';
import { createNotification } from '../controllers/notificationsController.js';

const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function runCostNudgeJob() {
  const { rows: groups } = await query(
    `SELECT group_id, hive_id, title FROM hive_cost_groups WHERE archived_at IS NULL`,
  );

  let sent = 0;
  for (const g of groups) {
    const balances = await computeBalances(g.group_id);
    for (const b of balances) {
      if (b.balance_cents >= 0) continue; // only nudge people who owe money

      // The PRIMARY KEY on (user_id, group_id, week_of) is the actual safety
      // mechanism, same as plan_reminders_sent — only one INSERT per ISO
      // week can succeed per (user, group), so this is safe even if two job
      // ticks overlap.
      const { rowCount } = await query(
        `INSERT INTO cost_nudges_sent (user_id, group_id, week_of)
         VALUES ($1, $2, date_trunc('week', NOW())::date)
         ON CONFLICT DO NOTHING`,
        [b.user_id, g.group_id],
      );
      if (rowCount === 0) continue; // already nudged this week

      await createNotification({
        userId: b.user_id, type: 'cost_nudge', category: 'costs',
        title: `You owe $${(-b.balance_cents / 100).toFixed(2)} in ${g.title}`,
        body: 'Settle up when you get a chance.',
        hiveId: g.hive_id, link: `/hive/${g.hive_id}/tools/split_costs/${g.group_id}`,
      });
      sent++;
    }
  }

  return { groupsChecked: groups.length, sent };
}

let started = false;
export function startCostNudgeJob() {
  if (started) return;
  started = true;
  runCostNudgeJob().catch(e => console.error('[costNudgeJob] initial run failed:', e));
  setInterval(() => {
    runCostNudgeJob().catch(e => console.error('[costNudgeJob] run failed:', e));
  }, INTERVAL_MS);
}
