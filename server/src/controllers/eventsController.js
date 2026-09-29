import * as db from '../db/index.js';
import { query, getClient } from '../db/index.js';
import { suggestEvents } from '../lib/suggestEvents.js';
import { getMembership } from '../lib/hiveMembership.js';

export const PLAN_TYPES = [
  'networking', 'hangout', 'food_drinks', 'outdoors',
  'games', 'meeting', 'workshop', 'trip', 'other',
];

// An end time is optional, so most plans have none. Treating a missing end as
// the start time made a plan "past" the instant it began: it dropped out of
// Upcoming, never showed "Happening now", and late RSVPs were rejected. A plan
// with no end time lasts three hours instead.
export const DEFAULT_PLAN_HOURS = 3;
// SQL for a plan's effective end. Always pair it with the `p` alias.
const PLAN_END = `COALESCE(p.event_end_at, p.event_at + INTERVAL '${DEFAULT_PLAN_HOURS} hours')`;

// ── attachRsvpMeta ────────────────────────────────────────────────────────────
// going_count must count only 'going'. Before maybe/not_going existed a bare
// COUNT(*) was equivalent; now it would report a Maybe as Going on the home card.
async function attachRsvpMeta(events, userId) {
  if (!events.length) return events;
  const ids = events.map(e => e.post_id);
  const { rows } = await query(
    `SELECT post_id,
            COUNT(*) FILTER (WHERE rsvp_status = 'going')::int AS going_count,
            BOOL_OR(user_id = $2 AND rsvp_status = 'going')    AS viewer_going,
            MAX(rsvp_status) FILTER (WHERE user_id = $2)       AS viewer_rsvp
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
    viewer_rsvp:  map[e.post_id]?.viewer_rsvp ?? null,
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

// ── RSVP access ───────────────────────────────────────────────────────────────
// An active member may always RSVP. A non-member may only RSVP to a plan in a
// Hive that is discoverable and active — the same candidate filter suggestEvents
// uses, so the home page's Suggested events card keeps working. Before this,
// toggleRsvp checked nothing but post_type, so any logged-in user with a post id
// could RSVP into a private Hive.
async function canRsvp(postRow, userId) {
  const member = await getMembership(postRow.hive_id, userId);
  if (member) return true;
  // A members-only plan is closed to non-members even in a discoverable Hive —
  // otherwise the Hive being public would quietly make every plan in it public.
  if (postRow.visibility !== 'public') return false;
  const { rows: [h] } = await query(
    `SELECT 1 FROM hives
      WHERE hive_id = $1 AND discoverable = TRUE AND hive_status = 'active'`,
    [postRow.hive_id],
  );
  return !!h;
}

async function rsvpCounts(postId) {
  const { rows: [c] } = await query(
    `SELECT COUNT(*) FILTER (WHERE rsvp_status = 'going')::int     AS going,
            COUNT(*) FILTER (WHERE rsvp_status = 'maybe')::int     AS maybe,
            COUNT(*) FILTER (WHERE rsvp_status = 'not_going')::int AS not_going
       FROM event_rsvps WHERE post_id = $1`,
    [postId],
  );
  return c;
}

// ── toggleRsvp — POST /api/events/:postId/rsvp ────────────────────────────────
// Backward compatible: a body with no status keeps the original toggle meaning
// used by UpcomingEventsCard, and `going` / `goingCount` keep their exact
// original semantics.
export const toggleRsvp = async (req, res) => {
  try {
    const { postId } = req.params;
    const { rows: [post] } = await query(
      `SELECT post_id, post_type, hive_id, event_at, event_end_at, visibility
         FROM hive_posts WHERE post_id = $1`,
      [postId],
    );
    if (!post) return res.status(400).json({ error: 'Post not found.' });
    if (post.post_type !== 'event') {
      return res.status(400).json({ error: 'This post is not an event.' });
    }
    if (!(await canRsvp(post, req.userId))) {
      return res.status(403).json({ error: 'You must be a member of this Hive.' });
    }

    const endsAt = post.event_end_at
      ?? (post.event_at
        ? new Date(new Date(post.event_at).getTime() + DEFAULT_PLAN_HOURS * 3600e3)
        : null);
    if (endsAt && new Date(endsAt).getTime() < Date.now()) {
      return res.status(400).json({ error: 'This plan has already ended.' });
    }

    const raw = req.body?.status;
    const VALID = ['going', 'maybe', 'not_going'];
    if (raw != null && raw !== 'clear' && !VALID.includes(raw)) {
      return res.status(400).json({ error: 'status must be going, maybe, not_going or clear.' });
    }

    const { rows: [existing] } = await query(
      'SELECT rsvp_status FROM event_rsvps WHERE post_id = $1 AND user_id = $2',
      [postId, req.userId],
    );

    let status;
    if (raw == null) {
      // Legacy toggle: only an existing 'going' clears. Maybe becomes Going.
      status = existing?.rsvp_status === 'going' ? null : 'going';
    } else {
      status = raw === 'clear' ? null : raw;
    }

    if (status === null) {
      await query('DELETE FROM event_rsvps WHERE post_id = $1 AND user_id = $2',
        [postId, req.userId]);
    } else {
      await query(
        `INSERT INTO event_rsvps (post_id, user_id, rsvp_status)
         VALUES ($1, $2, $3)
         ON CONFLICT (post_id, user_id)
         DO UPDATE SET rsvp_status = EXCLUDED.rsvp_status, updated_at = NOW()`,
        [postId, req.userId, status],
      );
    }

    const c = await rsvpCounts(postId);
    res.json({
      status,
      going: status === 'going',
      goingCount:    c.going,
      maybeCount:    c.maybe,
      notGoingCount: c.not_going,
    });
  } catch (err) {
    console.error('[events/toggleRsvp]', err);
    res.status(500).json({ error: 'Failed to update RSVP.' });
  }
};

// ── Shared plan projection ────────────────────────────────────────────────────
// One query with aggregate subqueries — never one query per plan. Used by both
// GET /plans and the 201 response of POST /plans so the client can drop a newly
// created plan straight into the list.
const PLAN_SELECT = `
  SELECT p.post_id, p.hive_id, p.headline, p.body, p.media_url,
         p.event_at, p.event_end_at,
         COALESCE(p.plan_type, 'other') AS plan_type,
         p.event_location, p.visibility, p.created_at,
         p.author_user_id,
         prof.full_name          AS host_full_name,
         prof.profile_photo_url  AS host_profile_photo_url,
         hm.role                 AS host_role,
         (SELECT COUNT(*) FILTER (WHERE r.rsvp_status = 'going')::int
            FROM event_rsvps r WHERE r.post_id = p.post_id)     AS going_count,
         (SELECT COUNT(*) FILTER (WHERE r.rsvp_status = 'maybe')::int
            FROM event_rsvps r WHERE r.post_id = p.post_id)     AS maybe_count,
         (SELECT COUNT(*) FILTER (WHERE r.rsvp_status = 'not_going')::int
            FROM event_rsvps r WHERE r.post_id = p.post_id)     AS not_going_count,
         (SELECT r.rsvp_status FROM event_rsvps r
           WHERE r.post_id = p.post_id AND r.user_id = $1)      AS viewer_rsvp,
         (p.event_at <= NOW() AND ${PLAN_END} >= NOW())         AS is_live,
         COALESCE((
           SELECT json_agg(x) FROM (
             SELECT pr.user_id, pr.full_name, pr.profile_photo_url
               FROM event_rsvps r
               JOIN hive_members m ON m.hive_id = p.hive_id
                                  AND m.user_id = r.user_id
                                  AND m.membership_status = 'active'
               JOIN profiles pr ON pr.user_id = r.user_id
              WHERE r.post_id = p.post_id AND r.rsvp_status = 'going'
              ORDER BY r.updated_at ASC
              LIMIT 4
           ) x
         ), '[]'::json)                                          AS going_preview
    FROM hive_posts p
    LEFT JOIN profiles prof   ON prof.user_id = p.author_user_id
    LEFT JOIN hive_members hm ON hm.hive_id = p.hive_id
                             AND hm.user_id = p.author_user_id
                             AND hm.membership_status = 'active'
`;

function shapePlan(r) {
  return {
    post_id: r.post_id,
    hive_id: r.hive_id,
    headline: r.headline,
    body: r.body,
    media_url: r.media_url,
    event_at: r.event_at,
    event_end_at: r.event_end_at,
    plan_type: r.plan_type,
    event_location: r.event_location,
    visibility: r.visibility,
    created_at: r.created_at,
    author_user_id: r.author_user_id,
    host: {
      user_id: r.author_user_id,
      full_name: r.host_full_name,
      profile_photo_url: r.host_profile_photo_url,
      role: r.host_role,
    },
    going_count: r.going_count,
    maybe_count: r.maybe_count,
    not_going_count: r.not_going_count,
    viewer_rsvp: r.viewer_rsvp,
    is_live: r.is_live,
    going_preview: r.going_preview ?? [],
  };
}

// ── getHivePlans — GET /api/hives/:id/plans ───────────────────────────────────
export const getHivePlans = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await getMembership(hiveId, req.userId);
    if (!member) return res.status(403).json({ error: 'You must be a member of this Hive.' });

    const scope = req.query.scope === 'past' ? 'past' : 'upcoming';
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10) || 24, 1), 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    let rows;
    let hasMore = false;
    if (scope === 'upcoming') {
      ({ rows } = await query(
        `${PLAN_SELECT}
          WHERE p.hive_id = $2 AND p.post_type = 'event'
            AND p.event_at IS NOT NULL
            AND ${PLAN_END} >= NOW()
          ORDER BY p.event_at ASC
          LIMIT 200`,
        [req.userId, hiveId],
      ));
    } else {
      ({ rows } = await query(
        `${PLAN_SELECT}
          WHERE p.hive_id = $2 AND p.post_type = 'event'
            AND p.event_at IS NOT NULL
            AND ${PLAN_END} < NOW()
          ORDER BY p.event_at DESC
          LIMIT $3 OFFSET $4`,
        [req.userId, hiveId, limit + 1, offset],
      ));
      hasMore = rows.length > limit;
      if (hasMore) rows = rows.slice(0, limit);
    }

    // Summary counts upcoming plans whatever scope was requested. past_count is
    // here so the page can tell "no plans ever" from "only past plans" without
    // fetching the past list first.
    const { rows: [sum] } = await query(
      `SELECT COUNT(*) FILTER (WHERE ${PLAN_END} >= NOW())::int
                AS upcoming_count,
              COUNT(*) FILTER (WHERE ${PLAN_END} <  NOW())::int
                AS past_count,
              COALESCE(SUM(CASE WHEN ${PLAN_END} >= NOW()
                THEN (SELECT COUNT(*) FILTER (WHERE r.rsvp_status='going')
                        FROM event_rsvps r WHERE r.post_id = p.post_id)
                ELSE 0 END), 0)::int AS going_total,
              COUNT(*) FILTER (WHERE ${PLAN_END} >= NOW()
                AND EXISTS(SELECT 1 FROM event_rsvps r
                            WHERE r.post_id = p.post_id AND r.user_id = $1))::int
                AS my_rsvp_count
         FROM hive_posts p
        WHERE p.hive_id = $2 AND p.post_type = 'event'
          AND p.event_at IS NOT NULL`,
      [req.userId, hiveId],
    );

    const { rows: typeRows } = await query(
      `SELECT COALESCE(p.plan_type,'other') AS t, COUNT(*)::int AS n
         FROM hive_posts p
        WHERE p.hive_id = $1 AND p.post_type = 'event'
          AND p.event_at IS NOT NULL
          AND ${PLAN_END} >= NOW()
        GROUP BY 1`,
      [hiveId],
    );

    const { rows: [und] } = await query(
      `SELECT COUNT(*)::int AS n FROM hive_posts
        WHERE hive_id = $1 AND post_type = 'event' AND event_at IS NULL`,
      [hiveId],
    );

    // The member empty state names the owner rather than saying "the Hive
    // owner". Prefer the active member holding the owner role; fall back to the
    // creator's profile for a Hive whose owner has left or gone inactive.
    const { rows: [ownerRow] } = await query(
      `SELECT COALESCE(om.full_name, cp.full_name) AS full_name
         FROM hives h
         LEFT JOIN LATERAL (
           SELECT pr.full_name
             FROM hive_members m
             JOIN profiles pr ON pr.user_id = m.user_id
            WHERE m.hive_id = h.hive_id
              AND m.role = 'owner'
              AND m.membership_status = 'active'
            ORDER BY m.joined_at ASC NULLS LAST
            LIMIT 1
         ) om ON TRUE
         LEFT JOIN profiles cp ON cp.user_id = h.creator_user_id
        WHERE h.hive_id = $1`,
      [hiveId],
    );
    const ownerName = ownerRow?.full_name?.trim() || null;

    res.json({
      plans: rows.map(shapePlan),
      hasMore,
      undatedCount: und.n,
      owner: ownerName ? { full_name: ownerName } : null,
      summary: {
        upcomingCount: sum.upcoming_count,
        pastCount:     sum.past_count,
        goingTotal:    sum.going_total,
        myRsvpCount:   sum.my_rsvp_count,
        typeCounts:    Object.fromEntries(typeRows.map(r => [r.t, r.n])),
      },
    });
  } catch (err) {
    console.error('[events/getHivePlans]', err);
    res.status(500).json({ error: 'Failed to load plans.' });
  }
};

// ── getPlanAttendees — GET /api/events/:postId/attendees ──────────────────────
// Only active members are named. Everyone else is reduced to a count: no id,
// name, photo or email of a non-member appears anywhere in this payload.
export const getPlanAttendees = async (req, res) => {
  try {
    const { postId } = req.params;
    const { rows: [post] } = await query(
      `SELECT post_id, hive_id, post_type, author_user_id
         FROM hive_posts WHERE post_id = $1`,
      [postId],
    );
    if (!post || post.post_type !== 'event') {
      return res.status(404).json({ error: 'Plan not found.' });
    }
    const member = await getMembership(post.hive_id, req.userId);
    if (!member) return res.status(403).json({ error: 'You must be a member of this Hive.' });

    const { rows } = await query(
      `SELECT r.rsvp_status, r.user_id, pr.full_name, pr.profile_photo_url, m.role
         FROM event_rsvps r
         JOIN hive_members m ON m.hive_id = $2 AND m.user_id = r.user_id
                            AND m.membership_status = 'active'
         LEFT JOIN profiles pr ON pr.user_id = r.user_id
        WHERE r.post_id = $1
        ORDER BY pr.full_name NULLS LAST`,
      [postId, post.hive_id],
    );

    const { rows: [out] } = await query(
      `SELECT COUNT(*) FILTER (WHERE r.rsvp_status='going')::int     AS going,
              COUNT(*) FILTER (WHERE r.rsvp_status='maybe')::int     AS maybe,
              COUNT(*) FILTER (WHERE r.rsvp_status='not_going')::int AS not_going
         FROM event_rsvps r
        WHERE r.post_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM hive_members m
             WHERE m.hive_id = $2 AND m.user_id = r.user_id
               AND m.membership_status = 'active')`,
      [postId, post.hive_id],
    );

    const bucket = (s) => rows.filter(r => r.rsvp_status === s).map(r => ({
      user_id: r.user_id,
      full_name: r.full_name,
      profile_photo_url: r.profile_photo_url,
      role: r.role,
      is_host: r.user_id === post.author_user_id,
    }));

    res.json({
      going:     bucket('going'),
      maybe:     bucket('maybe'),
      not_going: bucket('not_going'),
      outside:   { going: out.going, maybe: out.maybe, not_going: out.not_going },
    });
  } catch (err) {
    console.error('[events/getPlanAttendees]', err);
    res.status(500).json({ error: 'Failed to load attendees.' });
  }
};

// ── createPlan — POST /api/hives/:id/plans ────────────────────────────────────
export const createPlan = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await getMembership(hiveId, req.userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only Hive owners and admins can create plans.' });
    }

    const {
      title, planType, startsAt, endsAt, location, description, mediaUrl, visibility,
    } = req.body ?? {};

    const t = String(title ?? '').trim();
    if (!t)            return res.status(400).json({ error: 'A title is required.' });
    if (t.length > 120) return res.status(400).json({ error: 'Title must be 120 characters or fewer.' });

    if (!startsAt) return res.status(400).json({ error: 'A start time is required.' });
    const start = new Date(startsAt);
    if (isNaN(start.getTime())) return res.status(400).json({ error: 'Start time is not a valid date.' });
    if (start.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Start time must be in the future.' });
    }

    let end = null;
    if (endsAt) {
      end = new Date(endsAt);
      if (isNaN(end.getTime())) return res.status(400).json({ error: 'End time is not a valid date.' });
      if (end.getTime() <= start.getTime()) {
        return res.status(400).json({ error: 'End time must be after the start time.' });
      }
    }

    const type = planType == null || planType === '' ? 'other' : String(planType);
    if (!PLAN_TYPES.includes(type)) {
      return res.status(400).json({ error: 'That plan type is not recognised.' });
    }

    const loc = location == null ? null : String(location).trim();
    if (loc && loc.length > 200) {
      return res.status(400).json({ error: 'Location must be 200 characters or fewer.' });
    }
    const desc = description == null ? null : String(description).trim();
    if (desc && desc.length > 2000) {
      return res.status(400).json({ error: 'Description must be 2000 characters or fewer.' });
    }

    let media = null;
    if (mediaUrl) {
      const prefix = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`;
      if (!String(mediaUrl).startsWith(prefix)) {
        return res.status(400).json({ error: 'Cover image must be hosted on your Cloudinary account.' });
      }
      media = String(mediaUrl);
    }

    const vis = visibility === 'public' ? 'public' : 'hive';

    // Plan row and the host's going RSVP are one unit of work — the same
    // no-orphan standard as createHive.
    const client = await getClient();
    let postId;
    try {
      await client.query('BEGIN');
      const { rows: [row] } = await client.query(
        `INSERT INTO hive_posts
           (hive_id, author_user_id, post_type, headline, body, media_url,
            event_at, event_end_at, event_location, plan_type, visibility)
         VALUES ($1,$2,'event',$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING post_id`,
        [hiveId, req.userId, t, desc || null, media,
         start.toISOString(), end ? end.toISOString() : null, loc || null, type, vis],
      );
      postId = row.post_id;
      await client.query(
        `INSERT INTO event_rsvps (post_id, user_id, rsvp_status) VALUES ($1,$2,$3)`,
        [postId, req.userId, 'going'],
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    const { rows } = await query(
      `${PLAN_SELECT} WHERE p.post_id = $2`, [req.userId, postId],
    );
    res.status(201).json({ plan: shapePlan(rows[0]) });
  } catch (err) {
    console.error('[events/createPlan]', err);
    res.status(500).json({ error: 'Failed to create plan.' });
  }
};
