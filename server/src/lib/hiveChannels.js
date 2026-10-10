import { query } from '../db/index.js';

// ── Pair-chat privacy gate (Prompt 64 Part 1) ────────────────────────────────
// A pair channel ('coffee_chats'/'mentorship') is a normal hive_channels row
// with kind='pair' — messages, reactions, mentions, pins and polls all reuse
// their existing code paths unchanged. The one thing every one of those paths
// must do before touching a channelId that came from the client is call
// requireChannelAccess: a 'room' channel just has to belong to the Hive (the
// caller's own Hive-membership check covers the rest); a 'pair' channel
// additionally requires the viewer be one of its own members. A non-member
// gets 404 — a pair chat is invisible to everyone outside it, not merely
// forbidden, same as a disabled tool.
export async function loadChannel(hiveId, channelId) {
  const { rows: [ch] } = await query(
    `SELECT channel_id, hive_id, kind, created_for, archived_at
       FROM hive_channels WHERE channel_id = $1 AND hive_id = $2`,
    [channelId, hiveId],
  );
  return ch ?? null;
}

export async function isPairMember(channelId, userId) {
  const { rows: [row] } = await query(
    `SELECT 1 FROM hive_channel_members WHERE channel_id = $1 AND user_id = $2`,
    [channelId, userId],
  );
  return !!row;
}

export async function requireChannelAccess(hiveId, channelId, userId) {
  const ch = await loadChannel(hiveId, channelId);
  if (!ch) { const err = new Error('Room not found.'); err.status = 404; throw err; }
  if (ch.kind === 'pair' && !(await isPairMember(channelId, userId))) {
    const err = new Error('Room not found.'); err.status = 404; throw err;
  }
  return ch;
}

// Creates a pair channel + its membership rows inside the caller's own
// transaction (client), so a pairing job's channel and its match row either
// both land or neither does. name is an opaque, globally-unique placeholder —
// pair channels are never shown by name; the UI always renders the other
// member(s) instead.
export async function createPairChannel(client, hiveId, userIds, createdFor) {
  const { rows: [ch] } = await client.query(
    `INSERT INTO hive_channels (hive_id, name, kind, created_for, is_default, position)
     VALUES ($1, gen_random_uuid()::text, 'pair', $2, FALSE, 0)
     RETURNING channel_id`,
    [hiveId, createdFor],
  );
  for (const userId of userIds) {
    await client.query(
      `INSERT INTO hive_channel_members (channel_id, user_id) VALUES ($1, $2)`,
      [ch.channel_id, userId],
    );
  }
  return ch.channel_id;
}

// Per-hive default channel cache — invalidated only on server restart.
const _cache = new Map(); // hiveId → channelId

export async function getDefaultChannelId(hiveId) {
  if (_cache.has(hiveId)) return _cache.get(hiveId);

  // Try to find the existing default channel
  const { rows: [existing] } = await query(
    `SELECT channel_id FROM hive_channels WHERE hive_id = $1 AND is_default`,
    [hiveId],
  );
  if (existing) {
    _cache.set(hiveId, existing.channel_id);
    return existing.channel_id;
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  // Reaching here means a Hive exists with no default channel. Since
  // createHive became transactional this should be unreachable: the API has no
  // path that removes a default channel (archiveChannel refuses is_default, and
  // there is no hard delete), so the data got here some other way.
  //
  // The repair stays — a member should get a working chat, not an error, for a
  // fault that is not theirs. But it is logged at error level, because a repair
  // that runs silently hides the bug it repairs. The user is fixed AND the
  // fault is reported.
  const { rows: [h] } = await query(
    `SELECT hive_name FROM hives WHERE hive_id = $1`, [hiveId],
  );
  const line = '!'.repeat(72);
  console.error(`\n${line}`);
  console.error('  DATA FAULT — Hive had no default channel; one was created on the fly');
  console.error(line);
  console.error(`  hive_id    ${hiveId}`);
  console.error(`  hive_name  ${h?.hive_name ?? '(hive row not found)'}`);
  console.error(`  when       ${new Date().toISOString()}`);
  console.error('');
  console.error('  createHive creates #general inside its transaction, so no Hive');
  console.error('  created through the API should ever reach this path. Something');
  console.error('  else produced a channel-less Hive — find it. Chat kept working');
  console.error('  for this member; the underlying fault did not fix itself.');
  console.error(`${line}\n`);

  // ON CONFLICT DO NOTHING makes this race-safe: if two requests race here,
  // one insert wins and the other is silently discarded; the re-SELECT below
  // always returns the winner.
  await query(
    `INSERT INTO hive_channels (hive_id, name, channel_type, is_default, position)
     VALUES ($1, 'general', 'text', TRUE, 0)
     ON CONFLICT DO NOTHING`,
    [hiveId],
  );
  const { rows: [created] } = await query(
    `SELECT channel_id FROM hive_channels WHERE hive_id = $1 AND is_default`,
    [hiveId],
  );
  const channelId = created.channel_id;
  _cache.set(hiveId, channelId);
  return channelId;
}
