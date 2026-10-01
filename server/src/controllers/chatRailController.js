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

    const [planRes, mediaRes] = await Promise.all([
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
    ]);

    res.json({
      nextPlan: planRes.rows.length ? shapePlan(planRes.rows[0]) : null,
      recentMedia: mediaRes.rows,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[chat/getChannelRail]', err);
    res.status(500).json({ error: 'Failed to load the room rail.' });
  }
};
