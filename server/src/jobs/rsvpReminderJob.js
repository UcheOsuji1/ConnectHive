import { query } from '../db/index.js';
import { createNotification } from '../controllers/notificationsController.js';

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// 30-minute catch window, wider than the 15-minute cadence, so a run that's a
// few minutes late (slow query, brief outage) never lets a plan slip between
// two windows and go unreminded.
const WINDOW_SQL = `p.event_at BETWEEN NOW() + INTERVAL '23 hours 45 minutes'
                                   AND NOW() + INTERVAL '24 hours 15 minutes'`;

// Exported separately from the interval wrapper so checks can call one pass
// directly and assert on its return value instead of waiting on a timer.
export async function runRsvpReminderJob() {
  const { rows: candidates } = await query(
    `SELECT p.post_id, p.headline, p.hive_id, p.event_location, h.hive_name,
            r.user_id
       FROM hive_posts p
       JOIN hives h ON h.hive_id = p.hive_id
       JOIN event_rsvps r ON r.post_id = p.post_id AND r.rsvp_status IN ('going', 'maybe')
      WHERE p.post_type = 'event' AND p.event_at IS NOT NULL AND ${WINDOW_SQL}`,
  );

  let sent = 0;
  for (const c of candidates) {
    // The PRIMARY KEY on (post_id, user_id) is the actual safety mechanism:
    // only one INSERT across any number of concurrent instances/runs can
    // succeed for a given pair. Only the instance that wins creates the
    // notification, so this is safe with more than one process running —
    // Render runs a single instance of this service today, but the guard
    // doesn't depend on that staying true.
    const { rowCount } = await query(
      `INSERT INTO plan_reminders_sent (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [c.post_id, c.user_id],
    );
    if (rowCount === 0) continue; // already sent for this plan/user

    await createNotification({
      userId: c.user_id, type: 'rsvp_reminder', category: 'rsvp_reminders',
      title: `Reminder: ${c.headline} is tomorrow`,
      body: c.event_location || null,
      hiveId: c.hive_id, link: `/hive/${c.hive_id}/events`,
    });
    sent++;
  }

  return { checked: candidates.length, sent };
}

let started = false;
export function startRsvpReminderJob() {
  if (started) return; // guard against being called twice in one process
  started = true;
  runRsvpReminderJob().catch(e => console.error('[rsvpReminderJob] initial run failed:', e));
  setInterval(() => {
    runRsvpReminderJob().catch(e => console.error('[rsvpReminderJob] run failed:', e));
  }, INTERVAL_MS);
}
