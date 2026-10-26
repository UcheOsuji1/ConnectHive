/**
 * Pre-beta QA helper (Prompt 74 Step 2) — resolves a qa- fixture user's
 * user_id by email, so tests can build /profile/:id, /hive/:id style URLs
 * and API calls without the client having a DB driver of its own.
 *
 * Usage: node src/db/qaGetUserId.js <email>
 */
import './../env.js';
import { pool } from './index.js';

const [, , email] = process.argv;

if (!email || !email.endsWith('@qa.truehive.test')) {
  console.error('Refusing — only qa.truehive.test fixture emails are allowed.');
  process.exit(1);
}

async function main() {
  const { rows: [user] } = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
  if (!user) { console.error('No such user:', email); process.exit(1); }
  console.log(JSON.stringify({ id: user.user_id }));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
