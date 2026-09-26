import { query } from '../db/index.js';

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
