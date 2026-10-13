import { query } from '../db/index.js';

export const createBlock = async (req, res) => {
  try {
    const blockedId = req.params.userId;
    if (blockedId === req.userId) {
      return res.status(400).json({ error: "You can't block yourself." });
    }
    const { rows: [target] } = await query('SELECT user_id FROM users WHERE user_id = $1', [blockedId]);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    await query(
      `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [req.userId, blockedId],
    );
    res.json({ blocked: true });
  } catch (err) {
    console.error('[blocks/createBlock]', err);
    res.status(500).json({ error: 'Failed to block this person.' });
  }
};

export const removeBlock = async (req, res) => {
  try {
    await query(
      `DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
      [req.userId, req.params.userId],
    );
    res.json({ blocked: false });
  } catch (err) {
    console.error('[blocks/removeBlock]', err);
    res.status(500).json({ error: 'Failed to unblock this person.' });
  }
};

export const listBlocks = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.user_id, p.full_name, p.profile_photo_url, b.created_at
         FROM user_blocks b
         JOIN users u          ON u.user_id = b.blocked_id
         LEFT JOIN profiles p  ON p.user_id = u.user_id
        WHERE b.blocker_id = $1
        ORDER BY b.created_at DESC`,
      [req.userId],
    );
    res.json({ blocked: rows });
  } catch (err) {
    console.error('[blocks/listBlocks]', err);
    res.status(500).json({ error: 'Failed to load blocked people.' });
  }
};
