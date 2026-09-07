import { query } from '../db/index.js';
import { getMembership, requireMembership } from '../lib/hiveMembership.js';

export const listChannels = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const { rows } = await query(
      `SELECT channel_id, hive_id, name, description, channel_type, is_default, position, icon
       FROM   hive_channels
       WHERE  hive_id = $1
         AND  archived_at IS NULL
       ORDER  BY position ASC, created_at ASC`,
      [hiveId],
    );
    res.json({ channels: rows });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[channels/list]', err);
    res.status(500).json({ error: 'Failed to load channels.' });
  }
};

export const createChannel = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return res.status(403).json({ error: 'Only owners and admins can create rooms.' });
    }

    const { name, description, channel_type = 'text' } = req.body ?? {};
    const trimmedName = (name ?? '').trim();
    if (!trimmedName) return res.status(400).json({ error: 'Room name is required.' });
    if (trimmedName.length > 32) {
      return res.status(400).json({ error: 'Room name must be 32 characters or fewer.' });
    }

    const VALID_TYPES = new Set(['text', 'announcement', 'resource', 'planning']);
    if (!VALID_TYPES.has(channel_type)) {
      return res.status(400).json({ error: 'Invalid room type.' });
    }

    const { rows: [{ maxPos }] } = await query(
      `SELECT COALESCE(MAX(position), -1) AS "maxPos"
       FROM   hive_channels
       WHERE  hive_id = $1 AND archived_at IS NULL`,
      [hiveId],
    );

    const { rows: [ch] } = await query(
      `INSERT INTO hive_channels (hive_id, name, description, channel_type, is_default, position)
       VALUES ($1, $2, $3, $4, FALSE, $5)
       RETURNING channel_id, hive_id, name, description, channel_type, is_default, position`,
      [hiveId, trimmedName, description ?? null, channel_type, Number(maxPos) + 1],
    );
    res.status(201).json(ch);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A room with that name already exists in this Hive.' });
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[channels/create]', err);
    res.status(500).json({ error: 'Failed to create room.' });
  }
};

export const updateChannel = async (req, res) => {
  try {
    const { id: hiveId, channelId } = req.params;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return res.status(403).json({ error: 'Only owners and admins can update rooms.' });
    }

    const { rows: [existing] } = await query(
      `SELECT channel_id, is_default, archived_at
       FROM   hive_channels WHERE channel_id = $1 AND hive_id = $2`,
      [channelId, hiveId],
    );
    if (!existing || existing.archived_at) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    const { name, description } = req.body ?? {};
    const trimmedName = (name ?? '').trim();
    if (trimmedName.length > 32) {
      return res.status(400).json({ error: 'Room name must be 32 characters or fewer.' });
    }

    const { rows: [updated] } = await query(
      `UPDATE hive_channels
       SET name        = COALESCE(NULLIF($1, ''), name),
           description = $2,
           updated_at  = NOW()
       WHERE channel_id = $3
       RETURNING channel_id, hive_id, name, description, channel_type, is_default, position`,
      [trimmedName || null, description ?? null, channelId],
    );
    res.json(updated);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A room with that name already exists in this Hive.' });
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[channels/update]', err);
    res.status(500).json({ error: 'Failed to update room.' });
  }
};

export const archiveChannel = async (req, res) => {
  try {
    const { id: hiveId, channelId } = req.params;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return res.status(403).json({ error: 'Only owners and admins can archive rooms.' });
    }

    const { rows: [existing] } = await query(
      `SELECT channel_id, is_default, archived_at
       FROM   hive_channels WHERE channel_id = $1 AND hive_id = $2`,
      [channelId, hiveId],
    );
    if (!existing || existing.archived_at) {
      return res.status(404).json({ error: 'Room not found.' });
    }
    if (existing.is_default) {
      return res.status(400).json({ error: 'The default room cannot be archived.' });
    }

    await query(
      `UPDATE hive_channels SET archived_at = NOW() WHERE channel_id = $1`,
      [channelId],
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[channels/archive]', err);
    res.status(500).json({ error: 'Failed to archive room.' });
  }
};
