/**
 * Pre-beta QA helper (Prompt 74 Step 2) — reads back a qa- fixture user's
 * account_status for test assertions. Refuses any email not under
 * qa.truehive.test.
 *
 * Usage: node src/db/qaCheckUserStatus.js <email>
 */
import './../env.js';
import { pool } from './index.js';

const [, , email] = process.argv;

if (!email || !email.endsWith('@qa.truehive.test')) {
  console.error('Refusing — only qa.truehive.test fixture emails are allowed.');
  process.exit(1);
}

async function main() {
  const { rows: [user] } = await pool.query(
    'SELECT account_status, email_verified FROM users WHERE email = $1',
    [email],
  );
  if (!user) { console.error('No such user:', email); process.exit(1); }
  console.log(JSON.stringify(user));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
