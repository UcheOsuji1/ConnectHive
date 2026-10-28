/**
 * Pre-beta QA helper (Prompt 74 Flow 13) — schedules a qa- fixture user's
 * deletion in the PAST, so the hourly purge job's eligibility window
 * (deletion_scheduled_for <= NOW()) can be tested without waiting 30 real
 * days. qaSetUserStatus.js intentionally always schedules 30 days out (it
 * backs the real pending_deletion-login-cancels-it flow) — this is a
 * separate, purge-specific helper rather than a change to that one.
 * Refuses any email not under qa.truehive.test.
 *
 * Usage: node src/db/qaScheduleDeletionPast.js <email>
 */
import './../env.js';
import { pool } from './index.js';

const [, , email] = process.argv;

if (!email || !email.endsWith('@qa.truehive.test')) {
  console.error('Refusing — only qa.truehive.test fixture emails are allowed.');
  process.exit(1);
}

async function main() {
  const { rowCount } = await pool.query(
    `UPDATE users SET account_status = 'pending_deletion',
            deletion_requested_at = NOW() - INTERVAL '31 days',
            deletion_scheduled_for = NOW() - INTERVAL '1 day'
      WHERE email = $1`,
    [email],
  );
  if (!rowCount) { console.error('No such user:', email); process.exit(1); }
  console.log(JSON.stringify({ email, scheduled: 'past', updated: rowCount }));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
