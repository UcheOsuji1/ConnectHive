/**
 * Pre-beta QA helper (Prompt 74 Flow 12) — runs the hourly activity digest
 * job by hand against whatever qa- fixture state is currently seeded, and
 * prints the real eligible/sent/skipped counts plus which qa- users were
 * actually eligible, so a test can assert only backdated-inactive users
 * were picked up.
 *
 * Usage: node src/db/qaRunDigestJob.js
 */
import './../env.js';
import { pool } from './index.js';
import { runDigestJob } from '../jobs/digestJob.js';

async function main() {
  const { rows: before } = await pool.query(
    `SELECT email, last_active_at, last_digest_sent_at FROM users WHERE email LIKE '%@qa.truehive.test'
       AND email_digest = true AND account_status = 'active' AND email_verified = true
       AND last_active_at < NOW() - INTERVAL '6 hours'`,
  );
  const result = await runDigestJob();
  console.log(JSON.stringify({ ...result, eligibleQaUsers: before.map(r => r.email) }));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
