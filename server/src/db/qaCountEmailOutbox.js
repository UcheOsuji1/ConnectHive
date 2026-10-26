/**
 * Pre-beta QA helper (Prompt 74 Step 2) — counts queued email_outbox rows
 * for a qa- fixture recipient, optionally filtered by kind. Used to confirm
 * a join/request flow actually queued the email it's supposed to, without
 * needing a real inbox.
 *
 * Usage: node src/db/qaCountEmailOutbox.js <email> [kind]
 */
import './../env.js';
import { pool } from './index.js';

const [, , email, kind] = process.argv;

if (!email || !email.endsWith('@qa.truehive.test')) {
  console.error('Refusing — only qa.truehive.test fixture emails are allowed.');
  process.exit(1);
}

async function main() {
  const { rows: [user] } = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
  if (!user) { console.error('No such user:', email); process.exit(1); }

  const { rows: [{ n }] } = kind
    ? await pool.query(`SELECT COUNT(*)::int AS n FROM email_outbox WHERE recipient_id = $1 AND kind = $2`, [user.user_id, kind])
    : await pool.query(`SELECT COUNT(*)::int AS n FROM email_outbox WHERE recipient_id = $1`, [user.user_id]);
  console.log(JSON.stringify({ count: n }));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
