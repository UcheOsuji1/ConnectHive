import { query } from '../db/index.js';
import { getMembership, requireMembership } from '../lib/hiveMembership.js';
import { getCategoryConfig } from '../lib/categoryConfig.js';

export const listChannels = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    // The Manage Hive > Rooms table needs archived rooms too, to offer
    // restore — everywhere else (the chat rail) only ever wants live ones.
    const includeArchived = req.query.includeArchived === 'true';

    const { rows } = await query(
      `SELECT channel_id, hive_id, name, description, channel_type, is_default, position, icon,
              archived_at
       FROM   hive_channels
       WHERE  hive_id = $1
         ${includeArchived ? '' : 'AND archived_at IS NULL'}
       ORDER  BY (archived_at IS NOT NULL) ASC, position ASC, created_at ASC`,
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

    const { name, description, icon } = req.body ?? {};
    const trimmedName = (name ?? '').trim();
    if (trimmedName.length > 32) {
      return res.status(400).json({ error: 'Room name must be 32 characters or fewer.' });
    }

    const { rows: [updated] } = await query(
      `UPDATE hive_channels
       SET name        = COALESCE(NULLIF($1, ''), name),
           description = $2,
           icon        = $3,
           updated_at  = NOW()
       WHERE channel_id = $4
       RETURNING channel_id, hive_id, name, description, channel_type, is_default, position, icon`,
      [trimmedName || null, description ?? null, icon ?? null, channelId],
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

export const restoreChannel = async (req, res) => {
  try {
    const { id: hiveId, channelId } = req.params;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return res.status(403).json({ error: 'Only owners and admins can restore rooms.' });
    }

    const { rows: [existing] } = await query(
      `SELECT channel_id, archived_at FROM hive_channels WHERE channel_id = $1 AND hive_id = $2`,
      [channelId, hiveId],
    );
    if (!existing || !existing.archived_at) {
      return res.status(404).json({ error: 'Archived room not found.' });
    }

    const { rows: [{ maxPos }] } = await query(
      `SELECT COALESCE(MAX(position), -1) AS "maxPos"
       FROM   hive_channels WHERE hive_id = $1 AND archived_at IS NULL`,
      [hiveId],
    );

    const { rows: [restored] } = await query(
      `UPDATE hive_channels
       SET archived_at = NULL, position = $1, updated_at = NOW()
       WHERE channel_id = $2
       RETURNING channel_id, hive_id, name, description, channel_type, is_default, position, icon`,
      [Number(maxPos) + 1, channelId],
    );
    res.json(restored);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A room with that name already exists in this Hive.' });
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[channels/restore]', err);
    res.status(500).json({ error: 'Failed to restore room.' });
  }
};

// POST /api/hives/:id/channels/reorder — body: { order: [channelId, ...] }
export const reorderChannels = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return res.status(403).json({ error: 'Only owners and admins can reorder rooms.' });
    }

    const { order } = req.body ?? {};
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of room IDs.' });

    for (let i = 0; i < order.length; i++) {
      await query(
        `UPDATE hive_channels SET position = $1, updated_at = NOW()
         WHERE channel_id = $2 AND hive_id = $3 AND archived_at IS NULL`,
        [i, order[i], hiveId],
      );
    }

    const { rows } = await query(
      `SELECT channel_id, hive_id, name, description, channel_type, is_default, position, icon
       FROM   hive_channels
       WHERE  hive_id = $1 AND archived_at IS NULL
       ORDER  BY position ASC, created_at ASC`,
      [hiveId],
    );
    res.json({ channels: rows });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[channels/reorder]', err);
    res.status(500).json({ error: 'Failed to reorder rooms.' });
  }
};

// GET /api/hives/:id/channels/suggested — the category's default rooms the
// Hive doesn't already have (case-insensitive), for the one-time "Add
// suggested rooms" card. Returns [] once every default room exists, which
// is also how the client knows to stop showing the card.
export const getSuggestedRooms = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return res.status(403).json({ error: 'Only owners and admins can view room suggestions.' });
    }

    const { rows: [hive] } = await query(
      `SELECT c.category_name FROM hives h
       LEFT JOIN categories c ON c.category_id = h.category_id
       WHERE h.hive_id = $1`,
      [hiveId],
    );
    const catConfig = hive?.category_name ? getCategoryConfig(hive.category_name) : null;
    const defaultRooms = catConfig?.defaultRooms ?? [];
    if (defaultRooms.length === 0) return res.json({ suggested: [] });

    const { rows: existing } = await query(
      `SELECT LOWER(name) AS name FROM hive_channels WHERE hive_id = $1`,
      [hiveId],
    );
    const existingNames = new Set(existing.map(r => r.name));
    const suggested = defaultRooms.filter(r => !existingNames.has(r.toLowerCase()));
    res.json({ suggested });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[channels/getSuggestedRooms]', err);
    res.status(500).json({ error: 'Failed to load room suggestions.' });
  }
};

// POST /api/hives/:id/channels/suggested — adds only the rooms missing from
// getSuggestedRooms above. Idempotent: calling it twice in a row adds
// nothing the second time, since the first call already closed the gap.
export const addSuggestedRooms = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return res.status(403).json({ error: 'Only owners and admins can add rooms.' });
    }

    const { rows: [hive] } = await query(
      `SELECT c.category_name FROM hives h
       LEFT JOIN categories c ON c.category_id = h.category_id
       WHERE h.hive_id = $1`,
      [hiveId],
    );
    const catConfig = hive?.category_name ? getCategoryConfig(hive.category_name) : null;
    const defaultRooms = catConfig?.defaultRooms ?? [];

    const { rows: existing } = await query(
      `SELECT LOWER(name) AS name FROM hive_channels WHERE hive_id = $1`,
      [hiveId],
    );
    const existingNames = new Set(existing.map(r => r.name));
    const toAdd = defaultRooms.filter(r => !existingNames.has(r.toLowerCase()));

    if (toAdd.length > 0) {
      const { rows: [{ maxPos }] } = await query(
        `SELECT COALESCE(MAX(position), -1) AS "maxPos"
         FROM   hive_channels WHERE hive_id = $1 AND archived_at IS NULL`,
        [hiveId],
      );
      let pos = Number(maxPos) + 1;
      for (const name of toAdd) {
        await query(
          `INSERT INTO hive_channels (hive_id, name, channel_type, is_default, position)
           VALUES ($1, $2, 'text', FALSE, $3)`,
          [hiveId, name, pos],
        );
        pos += 1;
      }
    }

    const { rows: channels } = await query(
      `SELECT channel_id, hive_id, name, description, channel_type, is_default, position, icon
       FROM   hive_channels
       WHERE  hive_id = $1 AND archived_at IS NULL
       ORDER  BY position ASC, created_at ASC`,
      [hiveId],
    );
    res.json({ added: toAdd, channels });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[channels/addSuggestedRooms]', err);
    res.status(500).json({ error: 'Failed to add suggested rooms.' });
  }
};
