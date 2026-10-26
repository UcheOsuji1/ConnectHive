/**
 * Pre-beta QA helper (Prompt 74 Step 2) — mints a real session JWT for a
 * qa- fixture user, identical to what authController.js's signToken()
 * produces on a real login. Used so flows that aren't testing the login
 * mechanism itself (everything except 02-signup-signin.spec.js) don't have
 * to drive the real login form and burn into its per-IP rate limit
 * (10 attempts/15min) just to get into an authenticated state.
 *
 * Usage: node src/db/qaIssueSessionToken.js <email>
 * Prints {"token":"...","tokenVersion":N} to stdout.
 */
import './../env.js';
import jwt from 'jsonwebtoken';
import { pool } from './index.js';

const [, , email] = process.argv;

if (!email || !email.endsWith('@qa.truehive.test')) {
  console.error('Refusing — only qa.truehive.test fixture emails are allowed.');
  process.exit(1);
}

async function main() {
  const { rows: [user] } = await pool.query(
    'SELECT user_id, token_version FROM users WHERE email = $1',
    [email],
  );
  if (!user) { console.error('No such user:', email); process.exit(1); }

  const token = jwt.sign(
    { userId: user.user_id, tokenVersion: user.token_version },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  );
  console.log(JSON.stringify({ token, tokenVersion: user.token_version }));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
