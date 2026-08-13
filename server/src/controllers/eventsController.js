import * as db from '../db/index.js';
import { query } from '../db/index.js';
import { suggestEvents } from '../lib/suggestEvents.js';

async function attachRsvpMeta(events, userId) {
  if (!events.length) return events;
  const ids = events.map(e => e.post_id);
  const { rows } = await query(
    `SELECT post_id, COUNT(*)::int AS going_count,
            BOOL_OR(user_id = $2) AS viewer_going
     FROM event_rsvps
     WHERE post_id = ANY($1)
     GROUP BY post_id`,
    [ids, userId],
  );
  const map = Object.fromEntries(rows.map(r => [r.post_id, r]));
  return events.map(e => ({
    ...e,
    going_count:  map[e.post_id]?.going_count ?? 0,
    viewer_going: map[e.post_id]?.viewer_going ?? false,
  }));
}

// ── getUpcomingEvents ─────────────────────────────────────────────────────────
export const getUpcomingEvents = async (req, res) => {
  try {
    const [{ rows: myEventsRaw }, suggestedRaw, { rows: [totalRow] }] = await Promise.all([
      query(
        `SELECT p.post_id, p.headline, p.event_at, p.event_location,
                h.hive_id, h.hive_name, c.category_name
         FROM hive_posts p
         JOIN hives h ON h.hive_id = p.hive_id
         LEFT JOIN categories c ON c.category_id = h.category_id
         JOIN hive_members hm ON hm.hive_id = h.hive_id
           AND hm.user_id = $1 AND hm.membership_status = 'active'
         WHERE p.post_type = 'event' AND p.event_at > NOW()
         ORDER BY p.event_at ASC
         LIMIT 3`,
        [req.userId],
      ),
      suggestEvents(db, req.userId, { limit: 2 }),
      query(
        `SELECT COUNT(*) FROM hive_posts p
         JOIN hive_members hm ON hm.hive_id = p.hive_id
           AND hm.user_id = $1 AND hm.membership_status = 'active'
         WHERE p.post_type = 'event' AND p.event_at > NOW()`,
        [req.userId],
      ),
    ]);

    const [myEvents, suggestedEvents] = await Promise.all([
      attachRsvpMeta(myEventsRaw, req.userId),
      attachRsvpMeta(suggestedRaw, req.userId),
    ]);

    res.json({ myEvents, suggestedEvents, myEventsTotal: Number(totalRow.count) });
  } catch (err) {
    console.error('[events/getUpcomingEvents]', err);
    res.status(500).json({ error: 'Failed to fetch upcoming events.' });
  }
};

// ── toggleRsvp ────────────────────────────────────────────────────────────────
export const toggleRsvp = async (req, res) => {
  try {
    const { postId } = req.params;
    const { rows: [post] } = await query(
      'SELECT post_type FROM hive_posts WHERE post_id = $1',
      [postId],
    );
    if (!post) return res.status(400).json({ error: 'Post not found.' });
    if (post.post_type !== 'event') {
      return res.status(400).json({ error: 'This post is not an event.' });
    }

    const { rows: [existing] } = await query(
      'SELECT rsvp_id FROM event_rsvps WHERE post_id = $1 AND user_id = $2',
      [postId, req.userId],
    );

    let going;
    if (existing) {
      await query('DELETE FROM event_rsvps WHERE post_id = $1 AND user_id = $2', [postId, req.userId]);
      going = false;
    } else {
      await query(
        'INSERT INTO event_rsvps (post_id, user_id) VALUES ($1, $2)',
        [postId, req.userId],
      );
      going = true;
    }

    const { rows: [{ count }] } = await query(
      'SELECT COUNT(*) FROM event_rsvps WHERE post_id = $1', [postId],
    );

    res.json({ going, goingCount: Number(count) });
  } catch (err) {
    console.error('[events/toggleRsvp]', err);
    res.status(500).json({ error: 'Failed to update RSVP.' });
  }
};
