import { query } from '../db/index.js';
import { getMembership, requireMembership } from '../lib/hiveMembership.js';
import { getIO } from '../realtime/socket.js';

// One pinned message, shaped for the rail and the pins list.
const PIN_SELECT = `
  SELECT m.message_id, m.channel_id, m.message_text, m.sent_at,
         m.pinned_at, m.pinned_by,
         c.name AS channel_name,
         pr.user_id AS sender_user_id, pr.full_name, pr.profile_photo_url
    FROM messages m
    JOIN hive_channels c ON c.channel_id = m.channel_id
    LEFT JOIN profiles pr ON pr.user_id = m.sender_user_id
`;

const shapePin = (r) => ({
  message_id:   r.message_id,
  channel_id:   r.channel_id,
  channel_name: r.channel_name,
  text:         r.message_text,
  sent_at:      r.sent_at,
  pinned_at:    r.pinned_at,
  pinned_by:    r.pinned_by,
  sender: {
    user_id:           r.sender_user_id,
    full_name:         r.full_name,
    profile_photo_url: r.profile_photo_url,
  },
});

async function ownerOrAdmin(hiveId, userId) {
  const member = await getMembership(hiveId, userId);
  return member && ['owner', 'admin'].includes(member.role);
}

// Loads the message and checks it belongs to this Hive and is not deleted.
async function loadPinnable(hiveId, messageId) {
  const { rows: [m] } = await query(
    `SELECT message_id, channel_id, deleted_at FROM messages
      WHERE message_id = $1 AND hive_id = $2`,
    [messageId, hiveId],
  );
  return m;
}

// ── POST /api/hives/:id/messages/:messageId/pin ──────────────────────────────
export const pinMessage = async (req, res) => {
  try {
    const { id: hiveId, messageId } = req.params;
    if (!(await ownerOrAdmin(hiveId, req.userId))) {
      return res.status(403).json({ error: 'Only Hive owners and admins can pin messages.' });
    }
    const m = await loadPinnable(hiveId, messageId);
    if (!m) return res.status(404).json({ error: 'Message not found.' });
    if (m.deleted_at) return res.status(400).json({ error: 'A deleted message cannot be pinned.' });

    await query(
      `UPDATE messages SET pinned_at = NOW(), pinned_by = $2 WHERE message_id = $1`,
      [messageId, req.userId],
    );

    const { rows } = await query(`${PIN_SELECT} WHERE m.message_id = $1`, [messageId]);
    const pin = shapePin(rows[0]);
    getIO()?.to(`hive:${hiveId}`).emit('message_pinned', { hive_id: hiveId, pin });
    res.json({ pin });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[pins/pinMessage]', err);
    res.status(500).json({ error: 'Failed to pin the message.' });
  }
};

// ── DELETE /api/hives/:id/messages/:messageId/pin ────────────────────────────
export const unpinMessage = async (req, res) => {
  try {
    const { id: hiveId, messageId } = req.params;
    if (!(await ownerOrAdmin(hiveId, req.userId))) {
      return res.status(403).json({ error: 'Only Hive owners and admins can unpin messages.' });
    }
    const m = await loadPinnable(hiveId, messageId);
    if (!m) return res.status(404).json({ error: 'Message not found.' });

    await query(
      `UPDATE messages SET pinned_at = NULL, pinned_by = NULL WHERE message_id = $1`,
      [messageId],
    );
    getIO()?.to(`hive:${hiveId}`).emit('message_unpinned', {
      hive_id: hiveId, message_id: messageId, channel_id: m.channel_id,
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[pins/unpinMessage]', err);
    res.status(500).json({ error: 'Failed to unpin the message.' });
  }
};

// ── GET /api/hives/:id/channels/:channelId/pins ──────────────────────────────
export const listPins = async (req, res) => {
  try {
    const { id: hiveId, channelId } = req.params;
    await requireMembership(hiveId, req.userId);

    const { rows } = await query(
      `${PIN_SELECT}
        WHERE m.hive_id = $1 AND m.channel_id = $2
          AND m.pinned_at IS NOT NULL AND m.deleted_at IS NULL
        ORDER BY m.pinned_at DESC
        LIMIT 50`,
      [hiveId, channelId],
    );
    res.json({ pins: rows.map(shapePin) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[pins/listPins]', err);
    res.status(500).json({ error: 'Failed to load pinned messages.' });
  }
};
