/**
 * Pre-beta QA helper (Prompt 84, Flow 16 — collab walkthrough) — creates a
 * disposable qa- user, consent-ready (so it never lands on /confirm-details),
 * with no Hive memberships and no Deep Dive answers. The spec drives
 * everything else about this user through the real app/API.
 *
 * Usage: node src/db/qaCreateThrowawayUser.js <label> <fullName>
 * Prints { email, user_id }.
 */
import './../env.js';
import bcrypt from 'bcryptjs';
import { pool } from './index.js';

const [, , label, fullName] = process.argv;
if (!label) {
  console.error('Usage: node src/db/qaCreateThrowawayUser.js <label> <fullName>');
  process.exit(1);
}

async function main() {
  const email = `qa-throwaway-${label}-${Date.now()}@qa.truehive.test`;
  const passwordHash = await bcrypt.hash('QaBeta2026!', 10);

  const { rows: [user] } = await pool.query(
    `INSERT INTO users (email, password_hash, account_status, date_of_birth,
                         terms_accepted_at, terms_policy_version, email_verified)
     VALUES ($1,$2,'active','1995-06-15', NOW(), 'v2-2026-10', true)
     RETURNING user_id`,
    [email, passwordHash],
  );
  await pool.query(
    `INSERT INTO profiles (user_id, full_name, age, location) VALUES ($1,$2,30,'Los Angeles, CA')`,
    [user.user_id, fullName || 'QA Throwaway'],
  );

  console.log(JSON.stringify({ email, user_id: user.user_id }));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
