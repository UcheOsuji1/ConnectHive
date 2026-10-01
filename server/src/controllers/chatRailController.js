import { query } from '../db/index.js';
import { requireMembership } from '../lib/hiveMembership.js';
import { PLAN_SELECT, PLAN_END, shapePlan } from './eventsController.js';

const MEDIA_LIMIT = 6;

// ── GET /api/hives/:id/channels/:channelId/rail ──────────────────────────────
// Everything the Chat context rail needs for one room, in one round trip.
// Members only. nextPlan reuses the Plans projection rather than re-deriving it.
export const getChannelRail = async (req, res) => {
  try {
    const { id: hiveId, channelId } = req.params;
    await requireMembership(hiveId, req.userId);

    const { rows: [ch] } = await query(
      `SELECT channel_id FROM hive_channels WHERE channel_id = $1 AND hive_id = $2`,
      [channelId, hiveId],
    );
    if (!ch) return res.status(404).json({ error: 'Room not found.' });

    const [planRes, mediaRes, pinRes] = await Promise.all([
      query(
        `${PLAN_SELECT}
          WHERE p.hive_id = $2 AND p.post_type = 'event'
            AND p.event_at IS NOT NULL
            AND ${PLAN_END} >= NOW()
          ORDER BY p.event_at ASC
          LIMIT 1`,
        [req.userId, hiveId],
      ),
      query(
        `SELECT a.attachment_id, a.url, a.width, a.height, a.created_at,
                m.message_id, m.channel_id
           FROM message_attachments a
           JOIN messages m ON m.message_id = a.message_id
          WHERE m.channel_id = $1 AND m.deleted_at IS NULL
            AND a.resource_type = 'image'
          ORDER BY a.created_at DESC
          LIMIT ${MEDIA_LIMIT}`,
        [channelId],
      ),
      query(
        `SELECT m.message_id, m.channel_id, m.message_text, m.sent_at,
                m.pinned_at, c.name AS channel_name,
                pr.user_id AS sender_user_id, pr.full_name, pr.profile_photo_url
           FROM messages m
           JOIN hive_channels c ON c.channel_id = m.channel_id
           LEFT JOIN profiles pr ON pr.user_id = m.sender_user_id
          WHERE m.channel_id = $1 AND m.pinned_at IS NOT NULL AND m.deleted_at IS NULL
          ORDER BY m.pinned_at DESC
          LIMIT 1`,
        [channelId],
      ),
    ]);

    const p0 = pinRes.rows[0];
    res.json({
      nextPlan: planRes.rows.length ? shapePlan(planRes.rows[0]) : null,
      recentMedia: mediaRes.rows,
      pin: p0 ? {
        message_id: p0.message_id, channel_id: p0.channel_id, channel_name: p0.channel_name,
        text: p0.message_text, sent_at: p0.sent_at, pinned_at: p0.pinned_at,
        sender: { user_id: p0.sender_user_id, full_name: p0.full_name,
                  profile_photo_url: p0.profile_photo_url },
      } : null,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[chat/getChannelRail]', err);
    res.status(500).json({ error: 'Failed to load the room rail.' });
  }
};
