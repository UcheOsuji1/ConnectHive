import { query, getClient } from '../db/index.js';
import { isBlockedEitherWay } from '../lib/blocks.js';

// ── Noise control (spec §14) ───────────────────────────────────────────────────
// No row for (hive, user) = every default below applies. A column left NULL
// within an existing row falls back to its own default too, so a future
// category added to the table doesn't silently mute everyone who saved prefs
// before it existed.
export const CATEGORIES = ['mentions', 'plans', 'rsvp_reminders', 'new_members', 'announcements', 'all_messages', 'costs', 'matches', 'opportunities', 'tasks', 'posts'];
export const DEFAULTS = {
  mentions: true, plans: true, rsvp_reminders: true,
  // all_messages ("Chat activity") defaults on as of Prompt 70 — the old
  // per-message noise is gone now that it's one grouped row per room while
  // you're away, not one row per message.
  new_members: false, announcements: true, all_messages: true, costs: true, matches: true, opportunities: true, tasks: true,
  posts: true,
};

export async function getPrefsRow(hiveId, userId) {
  const { rows: [row] } = await query(
    `SELECT mentions, plans, rsvp_reminders, new_members, announcements, all_messages, costs, matches, opportunities, tasks, posts
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
  category = 'system', groupKey = null, buildGrouped = null,
  // Set by a caller that already batched its own shouldNotify-equivalent
  // check across a whole recipient set in one query (Prompt 70 Part B's
  // chat-activity fan-out) — skips the per-call prefs lookup below, which
  // is otherwise an N+1 against the very batching that caller just did.
  skipPrefsCheck = false,
}) {
  // The one place this is checked — every createNotification call with an
  // actor (mentions, reactions, replies, acceptances, everything) gets this
  // for free. Checked ahead of the category gate so it holds even for
  // 'system' notifications, which that gate always lets through.
  if (actorUserId && await isBlockedEitherWay(userId, actorUserId)) return null;

  if (!skipPrefsCheck) {
    const allowed = await shouldNotify(userId, hiveId, category);
    if (!allowed) return null;
  }

  // Grouped: upsert into the person's one unread row for this group_key —
  // bump the count, replace title/body/actor/link with the latest, and
  // touch updated_at so the row moves to the top of the bell. The partial
  // unique index (user_id, group_key) WHERE read=false AND group_key IS NOT
  // NULL is the arbiter; once that row is marked read, the next event for
  // the same key starts a fresh group at count 1, which is the point.
  if (groupKey) {
    // The increment (above) and the buildGrouped title rewrite (below) must
    // land as one atomic unit per call. Two concurrent calls for the same
    // (user_id, group_key) each doing "INSERT...RETURNING group_count" then
    // a SEPARATE "UPDATE title" let their second statements interleave: call
    // A reads group_count=3, call B's INSERT bumps it to 4 and writes its
    // own "4 new messages" title, then call A's now-stale UPDATE overwrites
    // that with "3 new messages" — the title and the group_count column
    // drift apart (one seeded a real incident: a 4-message burst showed a
    // "1 new message" title next to a "3" count chip). Holding the row's
    // lock across both statements in one transaction serializes the whole
    // sequence per call, so whichever one commits last is also the one that
    // read the freshest count.
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const { rows: [row] } = await client.query(
        `INSERT INTO notifications
           (user_id, type, title, body, hive_id, actor_user_id, link, group_key, group_count, updated_at, read)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,NOW(),false)
         ON CONFLICT (user_id, group_key) WHERE read = false AND group_key IS NOT NULL
         DO UPDATE SET
           type = EXCLUDED.type,
           title = EXCLUDED.title,
           body = EXCLUDED.body,
           actor_user_id = EXCLUDED.actor_user_id,
           link = EXCLUDED.link,
           group_count = notifications.group_count + 1,
           updated_at = NOW()
         RETURNING notification_id, group_count`,
        [userId, type, title, body, hiveId, actorUserId, link, groupKey],
      );
      // The real "N new messages" count is only known after the increment
      // above — buildGrouped formats title/body from that count instead of
      // the caller having to guess it ahead of the write.
      if (buildGrouped) {
        const content = buildGrouped(row.group_count);
        await client.query(
          `UPDATE notifications SET title = $1, body = $2 WHERE notification_id = $3`,
          [content.title, content.body ?? null, row.notification_id],
        );
      }
      await client.query('COMMIT');
      return row.notification_id;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

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
        `SELECT n.notification_id, n.type, n.title, n.body, n.hive_id, n.actor_user_id, n.link, n.read, n.created_at,
                n.updated_at, n.group_key, n.group_count,
                ap.full_name AS actor_name, ap.profile_photo_url AS actor_photo,
                h.hive_name, h.logo_url AS hive_logo_url, c.category_name AS hive_category_name
           FROM notifications n
           LEFT JOIN profiles ap ON ap.user_id = n.actor_user_id
           LEFT JOIN hives h     ON h.hive_id = n.hive_id
           LEFT JOIN categories c ON c.category_id = h.category_id
          WHERE n.user_id = $1
          ORDER BY n.updated_at DESC LIMIT 30`,
        [req.userId],
      ),
      query(
        `SELECT COUNT(*)::int AS unread_count FROM notifications WHERE user_id = $1 AND read = false`,
        [req.userId],
      ),
    ]);
    res.json({ notifications, unread_count });
  } catch (err) {
    console.error('[notifications/getNotifications]', err);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const { rows: [{ unread_count }] } = await query(
      `SELECT COUNT(*)::int AS unread_count FROM notifications WHERE user_id = $1 AND read = false`,
      [req.userId],
    );
    res.json({ unread_count });
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
         (hive_id, user_id, mentions, plans, rsvp_reminders, new_members, announcements, all_messages, costs, matches, opportunities, tasks, posts, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       ON CONFLICT (hive_id, user_id) DO UPDATE SET
         mentions = EXCLUDED.mentions, plans = EXCLUDED.plans, rsvp_reminders = EXCLUDED.rsvp_reminders,
         new_members = EXCLUDED.new_members, announcements = EXCLUDED.announcements,
         all_messages = EXCLUDED.all_messages, costs = EXCLUDED.costs, matches = EXCLUDED.matches,
         opportunities = EXCLUDED.opportunities, tasks = EXCLUDED.tasks, posts = EXCLUDED.posts, updated_at = NOW()`,
      [hiveId, req.userId, next.mentions, next.plans, next.rsvp_reminders, next.new_members, next.announcements, next.all_messages, next.costs, next.matches, next.opportunities, next.tasks, next.posts],
    );

    res.json({ prefs: next });
  } catch (err) {
    console.error('[notifications/updateHiveNotificationPrefs]', err);
    res.status(500).json({ error: 'Failed to save notification preferences.' });
  }
};
