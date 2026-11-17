/**
 * Connections (Prompt 86) — the single source of truth for user_connections,
 * user_connection_sources and user_connection_removals, the same way
 * blocks.js is for user_blocks. Nothing else in the codebase should query
 * those tables directly.
 *
 * Connections are created by the hive_members_connect trigger (schema.sql)
 * and the one-time backfill (migrations/016); this module only reads them,
 * removes them, and drops them on a block.
 *
 * Pair ordering is done in SQL (LEAST/GREATEST on uuid), never in JS: a
 * request param may arrive upper-case, and JS string order then disagrees
 * with Postgres's uuid order.
 */
import { query } from '../db/index.js';
import { isBlockedEitherWay } from './blocks.js';

// Per other person: the earliest shared *active* Hive (the strongest context),
// whether they're connected, and the earliest still-existing source Hive.
// One round trip for any number of people — the Messages list needs this for
// every row.
const CONTEXT_SQL = `
  SELECT o.id AS user_id,
         sh.hive_id   AS shared_hive_id,
         sh.hive_name AS shared_hive_name,
         EXISTS (SELECT 1 FROM user_connections c
                  WHERE c.user_a = LEAST($1::uuid, o.id) AND c.user_b = GREATEST($1::uuid, o.id)) AS connected,
         (SELECT h.hive_name
            FROM user_connection_sources s
            JOIN hives h ON h.hive_id = s.hive_id AND h.hive_status <> 'deleted'
           WHERE s.user_a = LEAST($1::uuid, o.id) AND s.user_b = GREATEST($1::uuid, o.id)
           ORDER BY s.created_at ASC
           LIMIT 1) AS via
    FROM unnest($2::uuid[]) AS o(id)
    LEFT JOIN LATERAL (
      SELECT h.hive_id, h.hive_name
        FROM hive_members x
        JOIN hive_members y ON y.hive_id = x.hive_id AND y.user_id = o.id AND y.membership_status = 'active'
        JOIN hives h        ON h.hive_id = x.hive_id AND h.hive_status = 'active'
       WHERE x.user_id = $1 AND x.membership_status = 'active'
       ORDER BY GREATEST(x.joined_at, y.joined_at) ASC
       LIMIT 1
    ) sh ON TRUE`;

/**
 * Map<otherId, { sharedHive: {hive_id, hive_name}|null, connected, via, label }>
 * label is the context line, in priority order: shared Hive, connection,
 * otherwise a message request.
 */
export async function contextFor(viewerId, otherIds) {
  const ids = [...new Set(otherIds.filter(Boolean))];
  const out = new Map();
  if (!viewerId || ids.length === 0) return out;
  const { rows } = await query(CONTEXT_SQL, [viewerId, ids]);
  for (const r of rows) {
    const sharedHive = r.shared_hive_id ? { hive_id: r.shared_hive_id, hive_name: r.shared_hive_name } : null;
    const label = sharedHive
      ? `You're both in ${sharedHive.hive_name}`
      : r.connected
        ? (r.via ? `Connected · via ${r.via}` : 'Connected')
        : 'Message request';
    out.set(r.user_id, { sharedHive, connected: r.connected, via: r.connected ? r.via : null, label });
  }
  return out;
}

export async function areConnected(a, b) {
  if (!a || !b || a === b) return false;
  const { rows } = await query(
    `SELECT 1 FROM user_connections
      WHERE user_a = LEAST($1::uuid, $2::uuid) AND user_b = GREATEST($1::uuid, $2::uuid)`,
    [a, b],
  );
  return rows.length > 0;
}

// One shared active Hive ({ hive_id, hive_name }) or null.
export async function sharedActiveHive(a, b) {
  if (!a || !b || a === b) return null;
  const ctx = (await contextFor(a, [b])).get(b);
  return ctx?.sharedHive ?? null;
}

// The earliest still-existing source Hive's name for "Connected · via {Hive}",
// or null when not connected or every source Hive is gone (label: "Connected").
export async function connectionSource(viewerId, otherId) {
  const ctx = (await contextFor(viewerId, [otherId])).get(otherId);
  return ctx?.connected ? ctx.via : null;
}

// { mode, sharedHive, connected, via, label } for one pair. mode: 'blocked'
// beats everything; then a shared active Hive or a connection means a direct
// conversation; anyone else gets a message request.
export async function messagingContext(a, b) {
  const [blocked, ctxMap] = await Promise.all([isBlockedEitherWay(a, b), contextFor(a, [b])]);
  const ctx = ctxMap.get(b) ?? { sharedHive: null, connected: false, via: null, label: 'Message request' };
  const mode = blocked ? 'blocked' : (ctx.sharedHive || ctx.connected) ? 'direct' : 'request';
  return { ...ctx, mode };
}

export async function canDirectMessage(a, b) {
  return (await messagingContext(a, b)).mode;
}

// Silent (no notification). The removal row stops the trigger and backfill
// from ever re-connecting the pair. One statement, so the delete and the
// removal row land together. Returns false when they weren't connected.
export async function removeConnection(removerId, otherId) {
  const { rows: [{ n }] } = await query(
    `WITH d AS (
       DELETE FROM user_connections
        WHERE user_a = LEAST($1::uuid, $2::uuid) AND user_b = GREATEST($1::uuid, $2::uuid)
        RETURNING 1
     ), r AS (
       INSERT INTO user_connection_removals (remover_id, other_id)
       SELECT $1::uuid, $2::uuid WHERE EXISTS (SELECT 1 FROM d)
       ON CONFLICT DO NOTHING
     )
     SELECT COUNT(*)::int AS n FROM d`,
    [removerId, otherId],
  );
  return n > 0;
}

// Used by every place that creates a block (Block button, report-and-block).
// The block insert and the connection delete are one statement, so they're
// one transaction. Unblocking never restores the connection; the trigger
// won't re-create it while blocked, and after an unblock only a *new* shared
// active membership would.
export async function blockAndDisconnect(blockerId, blockedId) {
  await query(
    `WITH b AS (
       INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING
     )
     DELETE FROM user_connections
      WHERE user_a = LEAST($1::uuid, $2::uuid) AND user_b = GREATEST($1::uuid, $2::uuid)`,
    [blockerId, blockedId],
  );
}

// "New message" recipients: your connections plus everyone you share an
// active Hive with, minus blocked people and system accounts. Name search is
// a plain case-insensitive substring.
export async function messageableUsers(viewerId, q = '', limit = 20) {
  const term = String(q ?? '').trim().slice(0, 80);
  const { rows } = await query(
    `WITH candidates AS (
       SELECT CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END AS user_id
         FROM user_connections c
        WHERE c.user_a = $1 OR c.user_b = $1
       UNION
       SELECT y.user_id
         FROM hive_members x
         JOIN hive_members y ON y.hive_id = x.hive_id AND y.membership_status = 'active' AND y.user_id <> $1
         JOIN hives h        ON h.hive_id = x.hive_id AND h.hive_status = 'active'
        WHERE x.user_id = $1 AND x.membership_status = 'active'
     )
     SELECT u.user_id, p.full_name, p.profile_photo_url, p.headline
       FROM candidates cd
       JOIN users u    ON u.user_id = cd.user_id AND u.account_status = 'active' AND NOT u.is_system
       JOIN profiles p ON p.user_id = u.user_id
      WHERE NOT EXISTS (SELECT 1 FROM user_blocks b
                         WHERE (b.blocker_id = $1 AND b.blocked_id = u.user_id)
                            OR (b.blocker_id = u.user_id AND b.blocked_id = $1))
        AND ($2 = '' OR p.full_name ILIKE '%' || $2 || '%')
      ORDER BY p.full_name
      LIMIT $3`,
    [viewerId, term.replace(/[\\%_]/g, (m) => `\\${m}`), limit],
  );
  return rows;
}
