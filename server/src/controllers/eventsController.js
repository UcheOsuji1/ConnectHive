import * as db from '../db/index.js';
import { query, getClient } from '../db/index.js';
import { suggestEvents } from '../lib/suggestEvents.js';
import { getMembership } from '../lib/hiveMembership.js';
import { getIO } from '../realtime/socket.js';
import { createNotification } from './notificationsController.js';

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
export const PLAN_END = `COALESCE(p.event_end_at, p.event_at + INTERVAL '${DEFAULT_PLAN_HOURS} hours')`;

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
      `SELECT post_id, post_type, hive_id, event_at, event_end_at, visibility, cancelled_at
         FROM hive_posts WHERE post_id = $1`,
      [postId],
    );
    if (!post) return res.status(400).json({ error: 'Post not found.' });
    if (post.post_type !== 'event') {
      return res.status(400).json({ error: 'This post is not an event.' });
    }
    if (post.cancelled_at) {
      return res.status(400).json({ error: 'This plan was cancelled.' });
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

    // Plan cards in chat show a live "N going". Broadcast the counts only —
    // one member's viewer_rsvp is theirs, and each client keeps its own.
    try {
      getIO()?.to(`hive:${post.hive_id}`).emit('plan_rsvp_updated', {
        hive_id: post.hive_id,
        post_id: postId,
        going_count:     c.going,
        maybe_count:     c.maybe,
        not_going_count: c.not_going,
      });
    } catch { /* no socket in tests */ }

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
export const PLAN_SELECT = `
  SELECT p.post_id, p.hive_id, p.headline, p.body, p.media_url,
         p.event_at, p.event_end_at, p.cancelled_at,
         p.series_id, p.series_index, ser.rule AS series_rule, ser.count AS series_count,
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
         (SELECT COUNT(DISTINCT c.user_id)::int
            FROM plan_checkins c WHERE c.post_id = p.post_id)    AS attended_count,
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
    LEFT JOIN profiles prof        ON prof.user_id = p.author_user_id
    LEFT JOIN hive_members hm      ON hm.hive_id = p.hive_id
                                   AND hm.user_id = p.author_user_id
                                   AND hm.membership_status = 'active'
    LEFT JOIN hive_plan_series ser ON ser.series_id = p.series_id
`;

export function shapePlan(r) {
  return {
    post_id: r.post_id,
    hive_id: r.hive_id,
    headline: r.headline,
    body: r.body,
    media_url: r.media_url,
    event_at: r.event_at,
    event_end_at: r.event_end_at,
    cancelled_at: r.cancelled_at,
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
    attended_count: r.attended_count ?? 0,
    going_preview: r.going_preview ?? [],
    series: r.series_id
      ? { series_id: r.series_id, index: r.series_index, rule: r.series_rule, count: r.series_count }
      : null,
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
            AND p.cancelled_at IS NULL
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
      `SELECT COUNT(*) FILTER (WHERE ${PLAN_END} >= NOW() AND p.cancelled_at IS NULL)::int
                AS upcoming_count,
              COUNT(*) FILTER (WHERE ${PLAN_END} <  NOW())::int
                AS past_count,
              COALESCE(SUM(CASE WHEN ${PLAN_END} >= NOW() AND p.cancelled_at IS NULL
                THEN (SELECT COUNT(*) FILTER (WHERE r.rsvp_status='going')
                        FROM event_rsvps r WHERE r.post_id = p.post_id)
                ELSE 0 END), 0)::int AS going_total,
              COUNT(*) FILTER (WHERE ${PLAN_END} >= NOW() AND p.cancelled_at IS NULL
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
          AND p.cancelled_at IS NULL
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

// ── validatePlanInput ──────────────────────────────────────────────────────────
// Pulled out of createPlan unchanged, so a suggestion validates with exactly
// the same rules a direct plan does (Prompt 60 part 2.1). Returns either
// { error } (a ready-to-send 400 message) or the normalised fields.
export function validatePlanInput(body) {
  const {
    title, planType, startsAt, endsAt, location, description, mediaUrl, visibility,
  } = body ?? {};

  const t = String(title ?? '').trim();
  if (!t)             return { error: 'A title is required.' };
  if (t.length > 120) return { error: 'Title must be 120 characters or fewer.' };

  if (!startsAt) return { error: 'A start time is required.' };
  const start = new Date(startsAt);
  if (isNaN(start.getTime())) return { error: 'Start time is not a valid date.' };
  if (start.getTime() <= Date.now()) {
    return { error: 'Start time must be in the future.' };
  }

  let end = null;
  if (endsAt) {
    end = new Date(endsAt);
    if (isNaN(end.getTime())) return { error: 'End time is not a valid date.' };
    if (end.getTime() <= start.getTime()) {
      return { error: 'End time must be after the start time.' };
    }
  }

  const type = planType == null || planType === '' ? 'other' : String(planType);
  if (!PLAN_TYPES.includes(type)) {
    return { error: 'That plan type is not recognised.' };
  }

  const loc = location == null ? null : String(location).trim();
  if (loc && loc.length > 200) {
    return { error: 'Location must be 200 characters or fewer.' };
  }
  const desc = description == null ? null : String(description).trim();
  if (desc && desc.length > 2000) {
    return { error: 'Description must be 2000 characters or fewer.' };
  }

  let media = null;
  if (mediaUrl) {
    const prefix = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`;
    if (!String(mediaUrl).startsWith(prefix)) {
      return { error: 'Cover image must be hosted on your Cloudinary account.' };
    }
    media = String(mediaUrl);
  }

  const vis = visibility === 'public' ? 'public' : 'hive';

  return {
    title: t, type, start, end, loc: loc || null, desc: desc || null, media, vis,
  };
}

// ── insertPlan ─────────────────────────────────────────────────────────────────
// The hive_posts row plus the author's own Going RSVP, as one statement pair —
// called inside a transaction the caller already opened (createPlan's own, or
// a suggestion's approval transaction). authorUserId is whoever the plan is
// "by": the creator for a direct plan, the suggester for an approved one.
// seriesMeta (Prompt 61 Part 4) is optional — { seriesId, index } tags this
// occurrence as part of a recurring series.
export async function insertPlan(client, hiveId, authorUserId, fields, seriesMeta = null) {
  const { title, type, start, end, loc, desc, media, vis } = fields;
  const { rows: [row] } = await client.query(
    `INSERT INTO hive_posts
       (hive_id, author_user_id, post_type, headline, body, media_url,
        event_at, event_end_at, event_location, plan_type, visibility,
        series_id, series_index)
     VALUES ($1,$2,'event',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING post_id`,
    [hiveId, authorUserId, title, desc, media,
     start.toISOString(), end ? end.toISOString() : null, loc, type, vis,
     seriesMeta?.seriesId ?? null, seriesMeta?.index ?? null],
  );
  await client.query(
    `INSERT INTO event_rsvps (post_id, user_id, rsvp_status) VALUES ($1,$2,'going')`,
    [row.post_id, authorUserId],
  );
  return row.post_id;
}

// ── Recurring plans (Prompt 61 Part 4) ──────────────────────────────────────────
function nthWeekdayOfMonth(year, month, weekday, n) {
  // month is 0-indexed. Returns a Date at local midnight, or null if the
  // month has no such occurrence (e.g. a 5th Tuesday that doesn't exist).
  const firstWeekday = new Date(year, month, 1).getDay();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (n - 1) * 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return day > daysInMonth ? null : new Date(year, month, day);
}

// Returns { dates, skippedMonths } — dates always has exactly `count` entries
// (unless the rule guard trips first, which would be a bug, not real input),
// skippedMonths lists any 'YYYY-MM' a monthly_weekday series had no Nth
// weekday for, so the form preview can say so.
export function computeSeriesDates(rule, startDate, count) {
  if (rule === 'weekly' || rule === 'biweekly') {
    const stepDays = rule === 'weekly' ? 7 : 14;
    const dates = Array.from({ length: count }, (_, i) =>
      new Date(startDate.getTime() + i * stepDays * 86400000));
    return { dates, skippedMonths: [] };
  }
  if (rule === 'monthly_weekday') {
    const weekday = startDate.getDay();
    const n = Math.ceil(startDate.getDate() / 7); // which occurrence (1st..5th) this weekday is
    const [hh, mm, ss] = [startDate.getHours(), startDate.getMinutes(), startDate.getSeconds()];
    const dates = [new Date(startDate)];
    const skippedMonths = [];
    let year = startDate.getFullYear();
    let month = startDate.getMonth();
    let guard = 0;
    while (dates.length < count && guard < 240) {
      guard++;
      month++;
      if (month > 11) { month = 0; year++; }
      const d = nthWeekdayOfMonth(year, month, weekday, n);
      if (d) {
        d.setHours(hh, mm, ss, 0);
        dates.push(d);
      } else {
        skippedMonths.push(`${year}-${String(month + 1).padStart(2, '0')}`);
      }
    }
    return { dates, skippedMonths };
  }
  throw new Error('Unknown recurrence rule.');
}

export function validateRepeat(repeat) {
  if (!repeat) return { repeat: null };
  const { rule, count } = repeat;
  if (!['weekly', 'biweekly', 'monthly_weekday'].includes(rule)) {
    return { error: 'repeat.rule must be "weekly", "biweekly" or "monthly_weekday".' };
  }
  const n = Number(count);
  if (!Number.isInteger(n) || n < 2 || n > 26) {
    return { error: 'repeat.count must be a whole number between 2 and 26.' };
  }
  return { repeat: { rule, count: n } };
}

// Inserts a series row plus every occurrence, in one transaction — a failure
// partway through leaves zero occurrences and zero series rows behind.
// Returns { seriesId, postIds }.
export async function insertPlanSeries(client, hiveId, authorUserId, baseFields, rule, count) {
  const { dates } = computeSeriesDates(rule, baseFields.start, count);
  const durationMs = baseFields.end ? baseFields.end.getTime() - baseFields.start.getTime() : null;

  const { rows: [series] } = await client.query(
    `INSERT INTO hive_plan_series (hive_id, created_by, rule, count)
     VALUES ($1,$2,$3,$4) RETURNING series_id`,
    [hiveId, authorUserId, rule, dates.length],
  );

  const postIds = [];
  for (let i = 0; i < dates.length; i++) {
    const start = dates[i];
    const end = durationMs != null ? new Date(start.getTime() + durationMs) : null;
    const postId = await insertPlan(
      client, hiveId, authorUserId, { ...baseFields, start, end },
      { seriesId: series.series_id, index: i + 1 },
    );
    postIds.push(postId);
  }
  return { seriesId: series.series_id, postIds };
}

// ── createPlan — POST /api/hives/:id/plans ────────────────────────────────────
export const createPlan = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await getMembership(hiveId, req.userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only Hive owners and admins can create plans.' });
    }

    const fields = validatePlanInput(req.body);
    if (fields.error) return res.status(400).json({ error: fields.error });

    const repeatResult = validateRepeat(req.body?.repeat);
    if (repeatResult.error) return res.status(400).json({ error: repeatResult.error });
    const repeat = repeatResult.repeat;

    // Plan row(s) and the host's going RSVP(s) are one unit of work — the same
    // no-orphan standard as createHive. A series inserts every occurrence in
    // this same transaction, so a failure partway through leaves nothing.
    const client = await getClient();
    let postId, seriesPostIds = null;
    try {
      await client.query('BEGIN');
      if (repeat) {
        const result = await insertPlanSeries(client, hiveId, req.userId, fields, repeat.rule, repeat.count);
        seriesPostIds = result.postIds;
        postId = result.postIds[0];
      } else {
        postId = await insertPlan(client, hiveId, req.userId, fields);
      }
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
    const plan = shapePlan(rows[0]);
    const plans = seriesPostIds
      ? [plan, ...(await query(`${PLAN_SELECT} WHERE p.post_id = ANY($2)`, [req.userId, seriesPostIds.slice(1)]))
          .rows.map(shapePlan)]
      : null;
    res.status(201).json(seriesPostIds ? { plan, plans } : { plan });
    const t = fields.title;

    // New Plan notification (spec §14) — best-effort, after the response so a
    // slow fan-out never delays the creator's own confirmation. One
    // notification per series, not one per occurrence.
    try {
      const { rows: hiveRow } = await query(`SELECT hive_name FROM hives WHERE hive_id = $1`, [hiveId]);
      const { rows: members } = await query(
        `SELECT user_id FROM hive_members WHERE hive_id = $1 AND membership_status = 'active' AND user_id != $2`,
        [hiveId, req.userId],
      );
      const suffix = seriesPostIds ? ` (repeats ${seriesPostIds.length}×)` : '';
      for (const m of members) {
        await createNotification({
          userId: m.user_id, type: 'plan_created', category: 'plans',
          title: `New plan in ${hiveRow[0]?.hive_name ?? 'your Hive'}: ${t}${suffix}`,
          body: plan.event_location || null,
          hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/events/${postId}`,
        });
      }
    } catch (notifErr) {
      console.error('[events/createPlan] plan_created notify failed (non-fatal):', notifErr);
    }
  } catch (err) {
    console.error('[events/createPlan]', err);
    res.status(500).json({ error: 'Failed to create plan.' });
  }
};

// ── getPlanDetail — GET /api/hives/:id/plans/:postId (Prompt 61 Part 2) ──────
export const getPlanDetail = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await getMembership(hiveId, req.userId);
    if (!member) return res.status(403).json({ error: 'You must be a member of this Hive.' });

    const { rows } = await query(
      `${PLAN_SELECT} WHERE p.post_id = $2 AND p.post_type = 'event'`,
      [req.userId, req.params.postId],
    );
    const row = rows[0];
    if (!row || row.hive_id !== hiveId) {
      return res.status(404).json({ error: 'Plan not found.' });
    }

    res.json({ plan: shapePlan(row) });
  } catch (err) {
    console.error('[events/getPlanDetail]', err);
    res.status(500).json({ error: 'Failed to load this plan.' });
  }
};

async function loadPlanForManage(hiveId, postId, userId) {
  const member = await getMembership(hiveId, userId);
  if (!member || !['owner', 'admin'].includes(member.role)) {
    const err = new Error('Only owners and admins can do this.'); err.status = 403; throw err;
  }
  const { rows: [post] } = await query(
    `SELECT post_id, hive_id, post_type, series_id, series_index, cancelled_at
       FROM hive_posts WHERE post_id = $1`,
    [postId],
  );
  if (!post || post.hive_id !== hiveId || post.post_type !== 'event') {
    const err = new Error('Plan not found.'); err.status = 404; throw err;
  }
  return post;
}

// ── editPlan — PATCH /api/hives/:id/plans/:postId (Prompt 61 Part 2 + 4) ─────
// scope: 'this' (default) or 'future' — Part 4's "this plan only" vs "this
// and all future plans". A 'future' edit never touches start/end time: those
// are inherently per-occurrence, and this endpoint has no way to know how a
// single new time should map across several different dates.
export const editPlan = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const post = await loadPlanForManage(hiveId, req.params.postId, req.userId);
    if (post.cancelled_at) return res.status(400).json({ error: 'This plan was cancelled.' });

    const scope = req.body?.scope === 'future' ? 'future' : 'this';
    if (scope === 'future' && !post.series_id) {
      return res.status(400).json({ error: 'This plan is not part of a series.' });
    }

    const fields = validatePlanInput(req.body);
    if (fields.error) return res.status(400).json({ error: fields.error });

    if (scope === 'this') {
      await query(
        `UPDATE hive_posts SET
           headline = $1, body = $2, media_url = $3, event_at = $4, event_end_at = $5,
           event_location = $6, plan_type = $7, visibility = $8, updated_at = NOW()
         WHERE post_id = $9`,
        [fields.title, fields.desc, fields.media, fields.start.toISOString(),
         fields.end ? fields.end.toISOString() : null, fields.loc, fields.type, fields.vis,
         post.post_id],
      );
    } else {
      // Non-time fields only, applied to this occurrence and every later one
      // in the same series.
      await query(
        `UPDATE hive_posts SET
           headline = $1, body = $2, media_url = $3,
           event_location = $4, plan_type = $5, visibility = $6, updated_at = NOW()
         WHERE series_id = $7 AND series_index >= $8 AND cancelled_at IS NULL`,
        [fields.title, fields.desc, fields.media, fields.loc, fields.type, fields.vis,
         post.series_id, post.series_index],
      );
    }

    const { rows } = await query(`${PLAN_SELECT} WHERE p.post_id = $2`, [req.userId, post.post_id]);
    res.json({ plan: shapePlan(rows[0]) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[events/editPlan]', err);
    res.status(500).json({ error: 'Failed to update this plan.' });
  }
};

// ── rsvpSeries — POST /api/hives/:id/plans/:postId/rsvp-series (Part 4) ──────
// "Going to all" shortcut — Going on this occurrence and every future one in
// the same series. RSVPs stay per-occurrence otherwise; this is purely a bulk
// convenience, not a new RSVP concept.
export const rsvpSeries = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await getMembership(hiveId, req.userId);
    if (!member) return res.status(403).json({ error: 'You must be a member of this Hive.' });

    const { rows: [post] } = await query(
      `SELECT post_id, hive_id, series_id, series_index FROM hive_posts WHERE post_id = $1`,
      [req.params.postId],
    );
    if (!post || post.hive_id !== hiveId) return res.status(404).json({ error: 'Plan not found.' });
    if (!post.series_id) return res.status(400).json({ error: 'This plan is not part of a series.' });

    const { rows: targets } = await query(
      `SELECT post_id FROM hive_posts
        WHERE series_id = $1 AND series_index >= $2 AND cancelled_at IS NULL AND ${PLAN_END} >= NOW()`,
      [post.series_id, post.series_index],
    );
    for (const t of targets) {
      await query(
        `INSERT INTO event_rsvps (post_id, user_id, rsvp_status)
         VALUES ($1,$2,'going')
         ON CONFLICT (post_id, user_id) DO UPDATE SET rsvp_status = 'going', updated_at = NOW()`,
        [t.post_id, req.userId],
      );
    }
    res.json({ updated: targets.map(t => t.post_id) });
  } catch (err) {
    console.error('[events/rsvpSeries]', err);
    res.status(500).json({ error: 'Failed to RSVP to the series.' });
  }
};

// ── cancelPlan — POST /api/hives/:id/plans/:postId/cancel (Prompt 61 Part 2+4) ─
export const cancelPlan = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const post = await loadPlanForManage(hiveId, req.params.postId, req.userId);
    if (post.cancelled_at) return res.status(400).json({ error: 'This plan is already cancelled.' });

    const scope = req.body?.scope === 'future' ? 'future' : 'this';
    if (scope === 'future' && !post.series_id) {
      return res.status(400).json({ error: 'This plan is not part of a series.' });
    }

    const targetIds = scope === 'this'
      ? [post.post_id]
      : (await query(
          `SELECT post_id FROM hive_posts
            WHERE series_id = $1 AND series_index >= $2 AND cancelled_at IS NULL`,
          [post.series_id, post.series_index],
        )).rows.map(r => r.post_id);

    await query(
      `UPDATE hive_posts SET cancelled_at = NOW() WHERE post_id = ANY($1) AND cancelled_at IS NULL`,
      [targetIds],
    );

    res.json({ cancelled: targetIds });

    // Notify everyone who RSVP'd Going or Maybe to each cancelled occurrence —
    // exactly once per person per plan.
    try {
      const { rows: hiveRow } = await query(`SELECT hive_name FROM hives WHERE hive_id = $1`, [hiveId]);
      for (const postId of targetIds) {
        const { rows: plan } = await query(`SELECT headline FROM hive_posts WHERE post_id = $1`, [postId]);
        const { rows: rsvps } = await query(
          `SELECT user_id FROM event_rsvps WHERE post_id = $1 AND rsvp_status IN ('going','maybe')`,
          [postId],
        );
        for (const r of rsvps) {
          await createNotification({
            userId: r.user_id, type: 'plan_cancelled', category: 'plans',
            title: `Cancelled in ${hiveRow[0]?.hive_name ?? 'your Hive'}: ${plan[0]?.headline ?? 'a plan'}`,
            body: null, hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/events/${postId}`,
          });
        }
      }
    } catch (notifErr) {
      console.error('[events/cancelPlan] notify failed (non-fatal):', notifErr);
    }
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[events/cancelPlan]', err);
    res.status(500).json({ error: 'Failed to cancel this plan.' });
  }
};
