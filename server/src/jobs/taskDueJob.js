// Task board due-tomorrow reminders (Prompt 65 Part 2). Same pattern as the
// other background jobs: an idempotent-ledger guard, an exported run
// function the checks call directly, and an interval wrapper.
import { query } from '../db/index.js';
import { createNotification } from '../controllers/notificationsController.js';
import { reportJobError } from '../lib/jobTick.js';

const INTERVAL_MS = 60 * 60 * 1000; // hourly

export async function runTaskDueJob() {
  const { rows } = await query(
    `SELECT t.task_id, t.title, t.hive_id, ta.user_id
       FROM hive_tasks t
       JOIN hive_task_assignees ta ON ta.task_id = t.task_id
      WHERE t.deleted_at IS NULL AND t.status != 'done'
        AND t.due_on = (CURRENT_DATE + INTERVAL '1 day')::date`,
  );

  let sent = 0;
  for (const r of rows) {
    const { rowCount } = await query(
      `INSERT INTO hive_task_due_notified (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [r.task_id, r.user_id],
    );
    if (rowCount === 0) continue;
    await createNotification({
      userId: r.user_id, type: 'task_due_soon', category: 'tasks',
      title: `"${r.title}" is due tomorrow`,
      hiveId: r.hive_id, link: `/hive/${r.hive_id}/tools/tasks?task=${r.task_id}`,
    }).catch(e => console.error('[taskDueJob] notify failed', e));
    sent++;
  }

  return { checked: rows.length, sent };
}

let started = false;
export function startTaskDueJob() {
  if (started) return;
  started = true;
  runTaskDueJob().catch(e => reportJobError('taskDueJob', 'initial run', e));
  setInterval(() => {
    runTaskDueJob().catch(e => reportJobError('taskDueJob', 'run', e));
  }, INTERVAL_MS);
}
