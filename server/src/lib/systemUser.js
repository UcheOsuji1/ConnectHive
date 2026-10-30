// A real `users` row with no login, so system-authored chat messages (a
// coffee-chat intro, say) have a genuine sender_user_id — messages.sender_user_id
// is NOT NULL and there is no separate "system message" concept in this schema.
// Lazily created once, cached for the process; shows up in chat as "TrueHive".
import { query } from '../db/index.js';

const SYSTEM_EMAIL = 'system@truehive.internal';
let _cachedId = null;

export async function getSystemUserId() {
  if (_cachedId) return _cachedId;

  const { rows: [existing] } = await query(`SELECT user_id FROM users WHERE email = $1`, [SYSTEM_EMAIL]);
  if (existing) { _cachedId = existing.user_id; return _cachedId; }

  const { rows: [created] } = await query(
    `INSERT INTO users (email, password_hash, account_status) VALUES ($1, NULL, 'active')
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING user_id`,
    [SYSTEM_EMAIL],
  );
  await query(
    `INSERT INTO profiles (user_id, full_name) VALUES ($1, 'TrueHive')
     ON CONFLICT (user_id) DO NOTHING`,
    [created.user_id],
  );
  _cachedId = created.user_id;
  return _cachedId;
}

// Every query that counts, lists or scores "active members" as people must
// exclude is_system rows (the house account that owns starter Hives, this
// lazy chat-system user) — otherwise a starter Hive's member count, vote
// majority or pairwise fit is thrown off by an account nobody can log into.
// Takes the hive_members/users alias in scope (e.g. 'hm', 'hm2') or '' when
// the column is unaliased.
export function excludeSystemClause(alias = '') {
  const col = alias ? `${alias}.user_id` : 'user_id';
  return `${col} NOT IN (SELECT user_id FROM users WHERE is_system)`;
}
