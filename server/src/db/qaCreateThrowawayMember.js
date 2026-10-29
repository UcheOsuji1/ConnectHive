/**
 * Pre-beta QA helper (Prompt 74 Flow 13) — creates a disposable qa- member
 * of an existing Hive, with one chat message authored, purely so the purge
 * job test has a target that isn't a shared fixture (member1, member2, …)
 * another flow's test also depends on later in the same combined run.
 * Purging a shared fixture rewrites its email (deleted-<uuid>@...) and
 * breaks every later test in the suite that still looks it up by its old
 * qa- email — confirmed directly: Flow 13's own purge test on member2
 * broke Flow 3's "blocked member" test on the iPhone 13/Pixel 7 passes
 * that ran after it in the same invocation.
 *
 * Usage: node src/db/qaCreateThrowawayMember.js <hiveId>
 * Prints { email, user_id, message_text }.
 */
import './../env.js';
import bcrypt from 'bcryptjs';
import { pool } from './index.js';
import { getDefaultChannelId } from '../lib/hiveChannels.js';

const [, , hiveId] = process.argv;
if (!hiveId) {
  console.error('Usage: node src/db/qaCreateThrowawayMember.js <hiveId>');
  process.exit(1);
}

async function main() {
  const email = `qa-throwaway-${Date.now()}@qa.truehive.test`;
  const passwordHash = await bcrypt.hash('QaBeta2026!', 10);
  const messageText = `QA throwaway fixture message ${Date.now()}`;

  const { rows: [user] } = await pool.query(
    `INSERT INTO users (email, password_hash, account_status, date_of_birth,
                         terms_accepted_at, terms_policy_version, email_verified)
     VALUES ($1,$2,'active','1995-06-15', NOW(), 'v2-2026-10', true)
     RETURNING user_id`,
    [email, passwordHash],
  );
  await pool.query(
    `INSERT INTO profiles (user_id, full_name, age, location) VALUES ($1,'QA Throwaway',30,'Los Angeles, CA')`,
    [user.user_id],
  );
  await pool.query(
    `INSERT INTO hive_members (hive_id, user_id, role, membership_status, joined_at)
     VALUES ($1,$2,'member','active',NOW())`,
    [hiveId, user.user_id],
  );
  const channelId = await getDefaultChannelId(hiveId);
  await pool.query(
    `INSERT INTO messages (hive_id, channel_id, sender_user_id, message_text, sent_at)
     VALUES ($1,$2,$3,$4,NOW())`,
    [hiveId, channelId, user.user_id, messageText],
  );

  console.log(JSON.stringify({ email, user_id: user.user_id, message_text: messageText }));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
