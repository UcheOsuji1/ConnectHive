/**
 * Pre-beta QA helper (Prompt 74 Flow 12) — backdates a qa- fixture user's
 * last_active_at so the hourly digest job's inactivity window
 * (last_active_at < NOW() - 6h) can be tested without waiting 6 real hours.
 * Refuses any email not under qa.truehive.test.
 *
 * Usage: node src/db/qaSetLastActive.js <email> <hoursAgo>
 */
import './../env.js';
import { pool } from './index.js';

const [, , email, hoursAgoRaw] = process.argv;
const hoursAgo = Number(hoursAgoRaw);

if (!email || !email.endsWith('@qa.truehive.test')) {
  console.error('Refusing — only qa.truehive.test fixture emails are allowed.');
  process.exit(1);
}
if (!Number.isFinite(hoursAgo)) {
  console.error('hoursAgo must be a number.');
  process.exit(1);
}

async function main() {
  const { rowCount } = await pool.query(
    `UPDATE users SET last_active_at = NOW() - ($1 || ' hours')::interval WHERE email = $2`,
    [String(hoursAgo), email],
  );
  if (!rowCount) { console.error('No such user:', email); process.exit(1); }
  console.log(JSON.stringify({ email, hoursAgo, updated: rowCount }));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
