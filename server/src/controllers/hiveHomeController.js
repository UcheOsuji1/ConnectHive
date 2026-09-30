import { query } from '../db/index.js';
import { getMembership } from '../lib/hiveMembership.js';
import { PLAN_SELECT, PLAN_END, shapePlan } from './eventsController.js';
import { FEED_SELECT } from './postsController.js';

const ACTIVITY_LIMIT = 8;
const MESSAGE_LIMIT  = 4;
const PHOTO_LIMIT    = 5;
const SNIPPET_LEN    = 140;

const person = (r, prefix = '') => ({
  user_id:           r[`${prefix}user_id`],
  full_name:         r[`${prefix}full_name`],
  profile_photo_url: r[`${prefix}profile_photo_url`],
});

// ── GET /api/hives/:id/home ──────────────────────────────────────────────────
// One response, built from parallel queries — never one query per row.
export const getHiveHome = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const me     = await getMembership(hiveId, req.userId);
    if (!me) return res.status(403).json({ error: 'You must be a member of this Hive.' });
    const isOwner = ['owner', 'admin'].includes(me.role);

    const [
      planRes, statsRes, activityRes, messagesRes,
      unreadRes, photosRes, hiveRes, hostRes, pendingRes,
    ] = await Promise.all([
      // ── nextPlan — reuses the Plans projection, no duplicated SQL ──────────
      query(
        `${PLAN_SELECT}
          WHERE p.hive_id = $2 AND p.post_type = 'event'
            AND p.event_at IS NOT NULL
            AND ${PLAN_END} >= NOW()
          ORDER BY p.event_at ASC
          LIMIT 1`,
        [req.userId, hiveId],
      ),

      // ── stats ──────────────────────────────────────────────────────────────
      query(
        `SELECT
           (SELECT COUNT(*)::int FROM hive_members
             WHERE hive_id = $1 AND membership_status = 'active')            AS member_count,
           (SELECT max_members FROM hives WHERE hive_id = $1)                AS max_members,
           (SELECT COUNT(*)::int FROM hive_posts p
             WHERE p.hive_id = $1 AND p.post_type = 'event'
               AND p.event_at IS NOT NULL AND ${PLAN_END} >= NOW())          AS upcoming_plans,
           (SELECT COUNT(*)::int
              FROM message_attachments a
              JOIN messages m ON m.message_id = a.message_id
             WHERE m.hive_id = $1 AND m.deleted_at IS NULL)                  AS media_count`,
        [hiveId],
      ),

      // ── activity — named, active members only ─────────────────────────────
      // An outsider who RSVP'd is deliberately excluded by the hive_members
      // join on every branch, so they can never be named here.
      query(
        `WITH acts AS (
           SELECT 'join'::text AS type, hm.user_id, hm.joined_at AS at,
                  'joined the Hive'::text AS text, NULL::text AS target,
                  NULL::uuid AS post_id, NULL::uuid AS channel_id, 0 AS n
             FROM hive_members hm
            WHERE hm.hive_id = $1 AND hm.membership_status = 'active'

           UNION ALL
           SELECT CASE WHEN p.post_type = 'event' THEN 'plan' ELSE 'post' END,
                  p.author_user_id, p.created_at,
                  CASE WHEN p.post_type = 'event' THEN 'created a plan'
                       ELSE 'posted an update' END,
                  p.headline, p.post_id, NULL::uuid, 0
             FROM hive_posts p
             JOIN hive_members hm ON hm.hive_id = p.hive_id
                                 AND hm.user_id = p.author_user_id
                                 AND hm.membership_status = 'active'
            WHERE p.hive_id = $1 AND p.post_type IN ('update','event')

           UNION ALL
           SELECT 'rsvp', r.user_id, r.updated_at, 'is going to', p.headline, p.post_id, NULL::uuid, 0
             FROM event_rsvps r
             JOIN hive_posts p   ON p.post_id = r.post_id
             JOIN hive_members hm ON hm.hive_id = p.hive_id
                                 AND hm.user_id = r.user_id
                                 AND hm.membership_status = 'active'
            WHERE p.hive_id = $1 AND r.rsvp_status = 'going'

           UNION ALL
           SELECT 'upload', m.sender_user_id, MAX(a.created_at), 'shared', c.name,
                  NULL::uuid, m.channel_id, COUNT(*)::int
             FROM message_attachments a
             JOIN messages m       ON m.message_id = a.message_id
             JOIN hive_channels c  ON c.channel_id = m.channel_id
             JOIN hive_members hm  ON hm.hive_id = m.hive_id
                                  AND hm.user_id = m.sender_user_id
                                  AND hm.membership_status = 'active'
            WHERE m.hive_id = $1 AND m.deleted_at IS NULL
              AND a.resource_type = 'image' AND c.archived_at IS NULL
            GROUP BY m.message_id, m.sender_user_id, m.channel_id, c.name
         )
         SELECT acts.*, pr.full_name, pr.profile_photo_url
           FROM acts
           JOIN profiles pr ON pr.user_id = acts.user_id
          ORDER BY at DESC
          LIMIT ${ACTIVITY_LIMIT}`,
        [hiveId],
      ),

      // ── recentMessages ────────────────────────────────────────────────────
      query(
        `SELECT m.message_id, m.channel_id, c.name AS channel_name, m.sent_at,
                LEFT(m.message_text, ${SNIPPET_LEN}) AS text,
                LENGTH(m.message_text) > ${SNIPPET_LEN} AS truncated,
                EXISTS(SELECT 1 FROM message_attachments a
                        WHERE a.message_id = m.message_id) AS has_attachment,
                pr.user_id, pr.full_name, pr.profile_photo_url
           FROM messages m
           JOIN hive_channels c ON c.channel_id = m.channel_id
           LEFT JOIN profiles pr ON pr.user_id = m.sender_user_id
          WHERE m.hive_id = $1 AND m.deleted_at IS NULL AND c.archived_at IS NULL
          ORDER BY m.sent_at DESC
          LIMIT ${MESSAGE_LIMIT}`,
        [hiveId],
      ),

      // Same expression as GET /messages/unread-count, so the two never diverge.
      query(
        `SELECT LEAST(COUNT(*)::int, 99) AS count
           FROM messages m
          WHERE m.hive_id = $1 AND m.sender_user_id != $2 AND m.deleted_at IS NULL
            AND m.sent_at > COALESCE(
              (SELECT last_seen_at FROM hive_last_seen WHERE user_id = $2 AND hive_id = $1),
              '1970-01-01'::timestamptz)`,
        [hiveId, req.userId],
      ),

      // ── recentPhotos ──────────────────────────────────────────────────────
      query(
        `SELECT a.attachment_id, a.url, a.width, a.height, a.created_at,
                m.message_id, m.channel_id
           FROM message_attachments a
           JOIN messages m      ON m.message_id = a.message_id
           JOIN hive_channels c ON c.channel_id = m.channel_id
          WHERE m.hive_id = $1 AND m.deleted_at IS NULL
            AND c.archived_at IS NULL AND a.resource_type = 'image'
          ORDER BY a.created_at DESC
          LIMIT ${PHOTO_LIMIT}`,
        [hiveId],
      ),

      // pinned_goal plus the owner's name, which the member empty states use
      // instead of a generic "the Hive owner".
      query(
        `SELECT h.pinned_goal, COALESCE(om.full_name, cp.full_name) AS owner_name
           FROM hives h
           LEFT JOIN LATERAL (
             SELECT pr.full_name
               FROM hive_members m
               JOIN profiles pr ON pr.user_id = m.user_id
              WHERE m.hive_id = h.hive_id AND m.role = 'owner'
                AND m.membership_status = 'active'
              ORDER BY m.joined_at ASC NULLS LAST
              LIMIT 1
           ) om ON TRUE
           LEFT JOIN profiles cp ON cp.user_id = h.creator_user_id
          WHERE h.hive_id = $1`,
        [hiveId],
      ),

      // ── hostPost — newest update by an owner or admin ─────────────────────
      query(
        `${FEED_SELECT}
           JOIN hive_members hm ON hm.hive_id = p.hive_id
                               AND hm.user_id = p.author_user_id
                               AND hm.membership_status = 'active'
                               AND hm.role IN ('owner','admin')
          WHERE p.hive_id = $2 AND p.post_type = 'update'
          ORDER BY p.created_at DESC
          LIMIT 1`,
        [req.userId, hiveId],
      ),

      // Same source as getHiveOverview's action item.
      isOwner
        ? query(
            `SELECT COUNT(*)::int AS n FROM join_requests
              WHERE hive_id = $1 AND status = 'pending'`, [hiveId])
        : Promise.resolve({ rows: [null] }),
    ]);

    const st = statsRes.rows[0];

    res.json({
      nextPlan: planRes.rows.length ? shapePlan(planRes.rows[0]) : null,

      stats: {
        memberCount:   st.member_count,
        maxMembers:    st.max_members,
        upcomingPlans: st.upcoming_plans,
        mediaCount:    st.media_count,
      },

      activity: activityRes.rows.map(r => {
        const text = r.type === 'upload'
          ? `shared ${r.n} photo${r.n === 1 ? '' : 's'} in #${r.target}`
          : r.type === 'rsvp'  ? `is going to ${r.target}`
          : r.type === 'plan'  ? `created a plan: ${r.target}`
          : r.type === 'post'  ? `posted ${r.target}`
          : r.text;
        const link = r.channel_id ? `/hive/${hiveId}/chat/${r.channel_id}`
          : r.type === 'plan' || r.type === 'rsvp' ? `/hive/${hiveId}/events`
          : r.type === 'join' ? `/hive/${hiveId}/members`
          : `/hive/${hiveId}`;
        return { type: r.type, actor: person(r), text, target: r.target, link, at: r.at };
      }),

      recentMessages: messagesRes.rows.map(r => ({
        message_id:   r.message_id,
        channel_id:   r.channel_id,
        channel_name: r.channel_name,
        sender:       person(r),
        text:         r.truncated ? `${r.text}…` : r.text,
        has_attachment: r.has_attachment,
        sent_at:      r.sent_at,
      })),

      unreadCount: Number(unreadRes.rows[0]?.count ?? 0),

      recentPhotos: photosRes.rows,

      goal: hiveRes.rows[0]?.pinned_goal ?? null,

      owner: hiveRes.rows[0]?.owner_name?.trim()
        ? { full_name: hiveRes.rows[0].owner_name.trim() }
        : null,

      hostPost: hostRes.rows[0] ?? null,

      pendingRequests: isOwner ? Number(pendingRes.rows[0]?.n ?? 0) : null,
    });
  } catch (err) {
    console.error('[hives/getHiveHome]', err);
    res.status(500).json({ error: 'Failed to load Hive Home.' });
  }
};
