/**
 * Pre-beta QA helper (Prompt 74 Step 2) — issues a real, usable
 * email_verification or password_reset token for a qa- fixture user, the
 * same way authController.js does (crypto.randomBytes + sha256 hash stored,
 * raw token returned). The DB only ever stores the hash, so Playwright
 * cannot read a usable token back out of it directly — this mirrors the
 * real issuing code path instead of reimplementing it differently.
 *
 * Usage: node src/db/qaIssueToken.js <email> <email_verification|password_reset>
 * Prints {"token":"..."} to stdout. Refuses any email not under qa.truehive.test.
 */
import './../env.js';
import crypto from 'crypto';
import { pool } from './index.js';

const [, , email, type] = process.argv;

if (!email || !email.endsWith('@qa.truehive.test')) {
  console.error('Refusing — only qa.truehive.test fixture emails are allowed.');
  process.exit(1);
}
if (!['email_verification', 'password_reset'].includes(type)) {
  console.error('type must be email_verification or password_reset');
  process.exit(1);
}

function generateToken() { return crypto.randomBytes(32).toString('hex'); }
function hashToken(raw) { return crypto.createHash('sha256').update(raw).digest('hex'); }

async function main() {
  const { rows: [user] } = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
  if (!user) { console.error('No such user:', email); process.exit(1); }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pool.query('DELETE FROM auth_tokens WHERE user_id = $1 AND type = $2', [user.user_id, type]);
  await pool.query(
    `INSERT INTO auth_tokens (user_id, type, token_hash, expires_at) VALUES ($1,$2,$3,$4)`,
    [user.user_id, type, tokenHash, expiresAt],
  );
  console.log(JSON.stringify({ token: rawToken }));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
