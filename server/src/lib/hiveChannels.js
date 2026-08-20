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

  // Lazy-create for hives that predate the migration.
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
