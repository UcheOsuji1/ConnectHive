/**
 * Pre-beta QA helper (Prompt 74 Flow 12) — mints the exact one-click
 * unsubscribe URL a real E2 (joins) email would carry, so the logged-out
 * unsubscribe link can be tested without a working RESEND_API_KEY in dev.
 * Refuses any email not under qa.truehive.test.
 *
 * Usage: node src/db/qaUnsubscribeToken.js <email> <category>
 * category: joins | digest | news
 */
import './../env.js';
import { pool } from './index.js';
import { unsubscribeUrl } from '../lib/emailPrefs.js';

const [, , email, category] = process.argv;
const CATEGORIES = ['joins', 'digest', 'news'];

if (!email || !email.endsWith('@qa.truehive.test')) {
  console.error('Refusing — only qa.truehive.test fixture emails are allowed.');
  process.exit(1);
}
if (!CATEGORIES.includes(category)) {
  console.error('category must be one of:', CATEGORIES.join(', '));
  process.exit(1);
}

async function main() {
  const { rows: [user] } = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
  if (!user) { console.error('No such user:', email); process.exit(1); }
  const url = unsubscribeUrl(user.user_id, category);
  console.log(JSON.stringify({ userId: user.user_id, category, url }));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
