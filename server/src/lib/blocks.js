/**
 * Blocking storage is directional (blocker_id -> blocked_id), but every
 * product rule is bidirectional — a block stops contact in both directions.
 * These two helpers are the single source of truth for that; nothing else
 * in the codebase should query user_blocks directly.
 */
import { query } from '../db/index.js';

export async function isBlockedEitherWay(a, b) {
  if (!a || !b || a === b) return false;
  const { rows } = await query(
    `SELECT 1 FROM user_blocks
      WHERE (blocker_id = $1 AND blocked_id = $2)
         OR (blocker_id = $2 AND blocked_id = $1)
      LIMIT 1`,
    [a, b],
  );
  return rows.length > 0;
}

// Every user_id touching userId in either direction — who they blocked, and
// who blocked them. Callers use this as an exclusion set, so direction
// doesn't matter: either one is reason enough to hide a person from the other.
export async function blockedIdsFor(userId) {
  const { rows } = await query(
    `SELECT blocked_id AS id FROM user_blocks WHERE blocker_id = $1
     UNION
     SELECT blocker_id AS id FROM user_blocks WHERE blocked_id = $1`,
    [userId],
  );
  return rows.map(r => r.id);
}

// A pair channel is created block-free (createPairChannel checks), but a
// block can happen afterward — a coffee match from weeks ago, one of them
// blocks the other today. The channel isn't deleted; it just stops taking
// new messages. A ride/group channel can have more than 2 members, so this
// checks every pairwise combination, not just the first two.
export async function isPairChannelBlocked(channelId) {
  const { rows } = await query(
    `SELECT user_id FROM hive_channel_members WHERE channel_id = $1`,
    [channelId],
  );
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (await isBlockedEitherWay(rows[i].user_id, rows[j].user_id)) return true;
    }
  }
  return false;
}
