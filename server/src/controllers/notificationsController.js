import { query } from '../db/index.js';

export async function createNotification({
  userId, type, title, body = null,
  hiveId = null, actorUserId = null, link = null,
}) {
  await query(
    `INSERT INTO notifications (user_id, type, title, body, hive_id, actor_user_id, link)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, type, title, body, hiveId, actorUserId, link],
  );
}

export const getNotifications = async (req, res) => {
  try {
    const [{ rows: notifications }, { rows: [{ unread_count }] }] = await Promise.all([
      query(
        `SELECT notification_id, type, title, body, hive_id, actor_user_id, link, read, created_at
         FROM notifications WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 30`,
        [req.userId],
      ),
      query(
        `SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = $1 AND read = false`,
        [req.userId],
      ),
    ]);
    res.json({ notifications, unread_count: Number(unread_count) });
  } catch (err) {
    console.error('[notifications/getNotifications]', err);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const { rows: [{ unread_count }] } = await query(
      `SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = $1 AND read = false`,
      [req.userId],
    );
    res.json({ unread_count: Number(unread_count) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load count.' });
  }
};

export const markRead = async (req, res) => {
  try {
    await query(
      `UPDATE notifications SET read = true WHERE notification_id = $1 AND user_id = $2`,
      [req.params.id, req.userId],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark read.' });
  }
};

export const markAllRead = async (req, res) => {
  try {
    await query(
      `UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`,
      [req.userId],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all read.' });
  }
};
