/**
 * Pre-beta QA helper (Prompt 74 Step 2) — sets a qa- fixture user's
 * account_status for login-flow test setup/teardown (suspended,
 * pending_deletion). Refuses any email not under qa.truehive.test.
 *
 * Usage: node src/db/qaSetUserStatus.js <email> <status>
 */
import './../env.js';
import { pool } from './index.js';

const [, , email, status] = process.argv;
const ALLOWED = ['active', 'suspended', 'pending_deletion'];

if (!email || !email.endsWith('@qa.truehive.test')) {
  console.error('Refusing — only qa.truehive.test fixture emails are allowed.');
  process.exit(1);
}
if (!ALLOWED.includes(status)) {
  console.error('status must be one of:', ALLOWED.join(', '));
  process.exit(1);
}

async function main() {
  const extra = status === 'pending_deletion'
    ? `, deletion_requested_at = NOW(), deletion_scheduled_for = NOW() + INTERVAL '30 days'`
    : `, deletion_requested_at = NULL, deletion_scheduled_for = NULL`;
  const { rowCount } = await pool.query(
    `UPDATE users SET account_status = $1 ${extra} WHERE email = $2`,
    [status, email],
  );
  if (!rowCount) { console.error('No such user:', email); process.exit(1); }
  console.log(JSON.stringify({ email, status, updated: rowCount }));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
