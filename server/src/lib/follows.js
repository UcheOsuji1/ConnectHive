/**
 * Follows (Prompt 87) — the single source of truth for user_follows, the same
 * way blocks.js is for blocks and connections.js is for connections.
 *
 * Follow is one-way and open: anyone may follow anyone they aren't blocked
 * with, no approval. It only decides whose personal posts reach your Home
 * feed; it has nothing to do with connections (connecting never follows).
 *
 * The block hook lives in connections.js blockAndDisconnect, so the block
 * insert and both follow deletes land in one statement.
 */
import { query } from '../db/index.js';
import { isBlockedEitherWay } from './blocks.js';

export const FOLLOW_PAGE = 30;

// Counted people are active, non-system accounts the viewer isn't blocked
// with in either direction (relative to the profile owner, userId).
const COUNTABLE = (col) => `
  JOIN users cu ON cu.user_id = ${col} AND cu.account_status = 'active' AND NOT cu.is_system
  WHERE NOT EXISTS (SELECT 1 FROM user_blocks b
                     WHERE (b.blocker_id = $1 AND b.blocked_id = ${col})
                        OR (b.blocker_id = ${col} AND b.blocked_id = $1))`;

export async function isFollowing(a, b) {
  if (!a || !b || a === b) return false;
  const { rows } = await query(
    `SELECT 1 FROM user_follows WHERE follower_id = $1 AND followed_id = $2`, [a, b],
  );
  return rows.length > 0;
}

// { following, follows_you } for one viewer → other pair, in one round trip.
export async function followState(viewerId, otherId) {
  const { rows: [r] } = await query(
    `SELECT EXISTS (SELECT 1 FROM user_follows WHERE follower_id = $1 AND followed_id = $2) AS following,
            EXISTS (SELECT 1 FROM user_follows WHERE follower_id = $2 AND followed_id = $1) AS follows_you`,
    [viewerId, otherId],
  );
  return { following: r.following, follows_you: r.follows_you };
}

export async function followCounts(userId) {
  const [{ rows: [a] }, { rows: [b] }] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM user_follows f ${COUNTABLE('f.follower_id')} AND f.followed_id = $1`, [userId]),
    query(`SELECT COUNT(*)::int AS n FROM user_follows f ${COUNTABLE('f.followed_id')} AND f.follower_id = $1`, [userId]),
  ]);
  return { followers: a.n, following: b.n };
}

// Returns { created } — created is false when already following, so the
// caller only notifies on a real new follow. Throws status 400/403/404.
export async function follow(followerId, followedId) {
  if (followerId === followedId) {
    const err = new Error("You can't follow yourself."); err.status = 400; throw err;
  }
  const { rows: [target] } = await query(
    `SELECT user_id FROM users WHERE user_id = $1 AND account_status = 'active' AND NOT is_system`,
    [followedId],
  );
  if (!target) { const err = new Error('Member not found.'); err.status = 404; throw err; }
  if (await isBlockedEitherWay(followerId, followedId)) {
    const err = new Error("You can't follow this person."); err.status = 403; throw err;
  }
  const { rows } = await query(
    `INSERT INTO user_follows (follower_id, followed_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING 1`,
    [followerId, followedId],
  );
  return { created: rows.length > 0 };
}

export async function unfollow(followerId, followedId) {
  await query(`DELETE FROM user_follows WHERE follower_id = $1 AND followed_id = $2`, [followerId, followedId]);
}

// Followers of / people followed by `userId`, as seen by `viewerId`: 30 per
// page, newest follow first, each with is_following (viewer → them) and is_me.
// Blocked (relative to the viewer) and inactive accounts never appear.
export async function followList(viewerId, userId, direction, offset = 0) {
  const other = direction === 'followers' ? 'f.follower_id' : 'f.followed_id';
  const mine  = direction === 'followers' ? 'f.followed_id' : 'f.follower_id';
  const { rows } = await query(
    `SELECT u.user_id, p.full_name, p.profile_photo_url, p.headline,
            (u.user_id = $1) AS is_me,
            EXISTS (SELECT 1 FROM user_follows v WHERE v.follower_id = $1 AND v.followed_id = u.user_id) AS is_following
       FROM user_follows f
       JOIN users u ON u.user_id = ${other} AND u.account_status = 'active' AND NOT u.is_system
       LEFT JOIN profiles p ON p.user_id = u.user_id
      WHERE ${mine} = $2
        AND NOT EXISTS (SELECT 1 FROM user_blocks b
                         WHERE (b.blocker_id = $1 AND b.blocked_id = u.user_id)
                            OR (b.blocker_id = u.user_id AND b.blocked_id = $1))
      ORDER BY f.created_at DESC, u.user_id
      LIMIT ${FOLLOW_PAGE + 1} OFFSET $3`,
    [viewerId, userId, offset],
  );
  return { people: rows.slice(0, FOLLOW_PAGE), has_more: rows.length > FOLLOW_PAGE };
}

// Which of `ids` the viewer follows — for lists built elsewhere (members).
export async function followingSet(viewerId, ids) {
  if (!ids.length) return new Set();
  const { rows } = await query(
    `SELECT followed_id FROM user_follows WHERE follower_id = $1 AND followed_id = ANY($2::uuid[])`,
    [viewerId, ids],
  );
  return new Set(rows.map(r => r.followed_id));
}

// The 24 h dedupe for "{name} started following you": a follow → unfollow →
// follow cycle inside a day notifies once.
export async function recentlyNotifiedFollow(followerId, followedId) {
  const { rows } = await query(
    `SELECT 1 FROM notifications
      WHERE user_id = $1 AND actor_user_id = $2 AND type = 'new_follower'
        AND created_at > NOW() - INTERVAL '24 hours'
      LIMIT 1`,
    [followedId, followerId],
  );
  return rows.length > 0;
}
