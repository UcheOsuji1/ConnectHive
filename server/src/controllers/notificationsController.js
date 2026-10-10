import { query } from '../db/index.js';

// ── Noise control (spec §14) ───────────────────────────────────────────────────
// No row for (hive, user) = every default below applies. A column left NULL
// within an existing row falls back to its own default too, so a future
// category added to the table doesn't silently mute everyone who saved prefs
// before it existed.
const CATEGORIES = ['mentions', 'plans', 'rsvp_reminders', 'new_members', 'announcements', 'all_messages', 'costs'];
const DEFAULTS = {
  mentions: true, plans: true, rsvp_reminders: true,
  new_members: false, announcements: true, all_messages: false, costs: true,
};

export async function getPrefsRow(hiveId, userId) {
  const { rows: [row] } = await query(
    `SELECT mentions, plans, rsvp_reminders, new_members, announcements, all_messages, costs
       FROM hive_notification_prefs WHERE hive_id = $1 AND user_id = $2`,
    [hiveId, userId],
  );
  const effective = {};
  for (const c of CATEGORIES) {
    const v = row?.[c];
    effective[c] = v === null || v === undefined ? DEFAULTS[c] : v;
  }
  return effective;
}

// The single gate every createNotification() call passes through for a
// member-facing category. System notifications (access, join
// acceptance/rejection, role changes, ownership, safety) skip this entirely —
// no per-Hive preference, owner setting or anything else can suppress them.
export async function shouldNotify(userId, hiveId, category) {
  if (category === 'system' || !hiveId) return true;
  if (!CATEGORIES.includes(category)) return true; // unknown category — fail open, don't silently eat a notification
  const effective = await getPrefsRow(hiveId, userId);
  return effective[category];
}

export async function createNotification({
  userId, type, title, body = null,
  hiveId = null, actorUserId = null, link = null,
  category = 'system',
}) {
  const allowed = await shouldNotify(userId, hiveId, category);
  if (!allowed) return null;

  const { rows: [row] } = await query(
    `INSERT INTO notifications (user_id, type, title, body, hive_id, actor_user_id, link)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING notification_id`,
    [userId, type, title, body, hiveId, actorUserId, link],
  );
  return row.notification_id;
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

// ── Per-Hive notification preferences ──────────────────────────────────────────
export const getHiveNotificationPrefs = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const { rows: [mem] } = await query(
      `SELECT 1 FROM hive_members WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (!mem) return res.status(403).json({ error: 'You must be a member of this Hive.' });

    const effective = await getPrefsRow(hiveId, req.userId);
    res.json({ prefs: effective, defaults: DEFAULTS });
  } catch (err) {
    console.error('[notifications/getHiveNotificationPrefs]', err);
    res.status(500).json({ error: 'Failed to load notification preferences.' });
  }
};

export const updateHiveNotificationPrefs = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const { rows: [mem] } = await query(
      `SELECT 1 FROM hive_members WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (!mem) return res.status(403).json({ error: 'You must be a member of this Hive.' });

    const current = await getPrefsRow(hiveId, req.userId);
    const next = { ...current };
    for (const c of CATEGORIES) {
      if (typeof req.body?.[c] === 'boolean') next[c] = req.body[c];
    }

    await query(
      `INSERT INTO hive_notification_prefs
         (hive_id, user_id, mentions, plans, rsvp_reminders, new_members, announcements, all_messages, costs, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (hive_id, user_id) DO UPDATE SET
         mentions = EXCLUDED.mentions, plans = EXCLUDED.plans, rsvp_reminders = EXCLUDED.rsvp_reminders,
         new_members = EXCLUDED.new_members, announcements = EXCLUDED.announcements,
         all_messages = EXCLUDED.all_messages, costs = EXCLUDED.costs, updated_at = NOW()`,
      [hiveId, req.userId, next.mentions, next.plans, next.rsvp_reminders, next.new_members, next.announcements, next.all_messages, next.costs],
    );

    res.json({ prefs: next });
  } catch (err) {
    console.error('[notifications/updateHiveNotificationPrefs]', err);
    res.status(500).json({ error: 'Failed to save notification preferences.' });
  }
};
