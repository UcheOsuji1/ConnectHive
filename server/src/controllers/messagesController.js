import { query } from '../db/index.js';
import { getMembership, requireMembership } from '../lib/hiveMembership.js';
import { getIO } from '../realtime/socket.js';

// ── Rate limiting (8 messages per 10 s per user, in-memory) ──────────────────
const _rateMap = new Map();

function _checkRate(userId) {
  const now = Date.now();
  const times = (_rateMap.get(userId) ?? []).filter(t => now - t < 10_000);
  if (times.length >= 8) return false;
  times.push(now);
  _rateMap.set(userId, times);
  return true;
}

// ── Enriched message query ────────────────────────────────────────────────────
// Runs the full enrichment join for any WHERE/ORDER/LIMIT clause you append.
async function _runEnriched(extraSQL, params) {
  const { rows } = await query(
    `SELECT
       m.message_id,
       m.hive_id,
       m.sender_user_id,
       CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.message_text END AS message_text,
       m.sent_at,
       m.edited_at,
       (m.deleted_at IS NOT NULL)        AS is_deleted,
       p.full_name                        AS sender_name,
       p.profile_photo_url                AS sender_photo,
       COALESCE(hm.role, 'member')        AS sender_role,
       m.reply_to_message_id,
       rp.full_name                       AS reply_sender_name,
       CASE
         WHEN m.reply_to_message_id IS NULL THEN NULL
         WHEN rm.deleted_at IS NOT NULL      THEN '[deleted]'
         ELSE LEFT(rm.message_text, 90)
       END                                AS reply_snippet,
       COALESCE(rxn.reactions, '[]'::json) AS reactions
     FROM messages m
     LEFT JOIN profiles      p  ON p.user_id    = m.sender_user_id
     LEFT JOIN hive_members  hm ON hm.hive_id   = m.hive_id
                                AND hm.user_id   = m.sender_user_id
                                AND hm.membership_status = 'active'
     LEFT JOIN messages      rm ON rm.message_id = m.reply_to_message_id
     LEFT JOIN profiles      rp ON rp.user_id    = rm.sender_user_id
     LEFT JOIN LATERAL (
       SELECT json_agg(
         json_build_object('emoji', r.emoji, 'count', r.cnt, 'user_ids', r.uids)
         ORDER BY r.first_at
       ) AS reactions
       FROM (
         SELECT emoji,
                COUNT(*)::int                          AS cnt,
                json_agg(user_id ORDER BY reacted_at)  AS uids,
                MIN(reacted_at)                         AS first_at
         FROM message_reactions
         WHERE message_id = m.message_id
         GROUP BY emoji
       ) r
     ) rxn ON true
     ${extraSQL}`,
    params,
  );
  return rows.map(_shape);
}

function _shape(row) {
  return {
    message_id:     row.message_id,
    hive_id:        row.hive_id,
    sender_user_id: row.sender_user_id,
    message_text:   row.message_text ?? null,
    sent_at:        row.sent_at,
    edited_at:      row.edited_at ?? null,
    is_deleted:     Boolean(row.is_deleted),
    sender: {
      user_id:           row.sender_user_id,
      full_name:         row.sender_name ?? null,
      profile_photo_url: row.sender_photo ?? null,
      role:              row.sender_role,
    },
    reply_to: row.reply_to_message_id
      ? {
          message_id:  row.reply_to_message_id,
          sender_name: row.reply_sender_name ?? 'Unknown',
          snippet:     row.reply_snippet ?? '',
        }
      : null,
    reactions: Array.isArray(row.reactions) ? row.reactions : [],
  };
}

// ── Controllers ───────────────────────────────────────────────────────────────

export const listMessages = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const before = req.query.before ? new Date(req.query.before).toISOString() : new Date().toISOString();
    const limit  = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10), 1), 100);

    const msgs = await _runEnriched(
      `WHERE m.hive_id = $1 AND m.sent_at < $2 ORDER BY m.sent_at DESC LIMIT $3`,
      [hiveId, before, limit + 1],
    );

    const has_more = msgs.length > limit;
    res.json({ messages: msgs.slice(0, limit).reverse(), has_more });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[messages/list]', err);
    res.status(500).json({ error: 'Failed to load messages.' });
  }
};

export const createMessage = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const { message_text, reply_to_message_id } = req.body ?? {};
    const text = (message_text ?? '').trim();
    if (!text || text.length > 2000) {
      return res.status(400).json({ error: 'Message must be 1–2000 characters.' });
    }

    if (!_checkRate(req.userId)) {
      return res.status(429).json({ error: 'Slow down — you are sending messages too quickly.' });
    }

    if (reply_to_message_id) {
      const { rows: [ref] } = await query(
        `SELECT hive_id FROM messages WHERE message_id = $1`, [reply_to_message_id],
      );
      if (!ref || ref.hive_id !== hiveId) {
        return res.status(400).json({ error: 'Reply target not found in this Hive.' });
      }
    }

    const { rows: [ins] } = await query(
      `INSERT INTO messages (hive_id, sender_user_id, message_text, reply_to_message_id)
       VALUES ($1, $2, $3, $4)
       RETURNING message_id`,
      [hiveId, req.userId, text, reply_to_message_id ?? null],
    );

    const [msg] = await _runEnriched(`WHERE m.message_id = $1`, [ins.message_id]);

    try { getIO().to(`hive:${hiveId}`).emit('receive_message', msg); } catch { /* no socket in tests */ }

    res.status(201).json(msg);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[messages/create]', err);
    res.status(500).json({ error: 'Failed to send message.' });
  }
};

export const updateMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const text = ((req.body ?? {}).message_text ?? '').trim();
    if (!text || text.length > 2000) {
      return res.status(400).json({ error: 'Message must be 1–2000 characters.' });
    }

    const { rows: [existing] } = await query(
      `SELECT message_id, hive_id, sender_user_id, deleted_at FROM messages WHERE message_id = $1`,
      [messageId],
    );
    if (!existing)           return res.status(404).json({ error: 'Message not found.' });
    if (existing.deleted_at) return res.status(400).json({ error: 'Cannot edit a deleted message.' });
    if (existing.sender_user_id !== req.userId) {
      return res.status(403).json({ error: 'You can only edit your own messages.' });
    }

    await query(
      `UPDATE messages SET message_text = $1, edited_at = NOW() WHERE message_id = $2`,
      [text, messageId],
    );

    const [msg] = await _runEnriched(`WHERE m.message_id = $1`, [messageId]);

    try { getIO().to(`hive:${existing.hive_id}`).emit('message_updated', msg); } catch {}

    res.json(msg);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[messages/update]', err);
    res.status(500).json({ error: 'Failed to update message.' });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    const { rows: [existing] } = await query(
      `SELECT message_id, hive_id, sender_user_id, deleted_at FROM messages WHERE message_id = $1`,
      [messageId],
    );
    if (!existing) return res.status(404).json({ error: 'Message not found.' });
    if (existing.deleted_at) return res.json({ ok: true }); // already deleted — idempotent

    const isSender = existing.sender_user_id === req.userId;
    if (!isSender) {
      const membership = await getMembership(existing.hive_id, req.userId);
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        return res.status(403).json({ error: 'Not authorized to delete this message.' });
      }
    }

    await query(`UPDATE messages SET deleted_at = NOW() WHERE message_id = $1`, [messageId]);

    try {
      getIO().to(`hive:${existing.hive_id}`).emit('message_deleted', {
        message_id: messageId,
        hive_id:    existing.hive_id,
      });
    } catch {}

    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[messages/delete]', err);
    res.status(500).json({ error: 'Failed to delete message.' });
  }
};

export const toggleReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const emoji = ((req.body ?? {}).emoji ?? '').trim();
    if (!emoji || emoji.length > 16) {
      return res.status(400).json({ error: 'Invalid emoji.' });
    }

    const { rows: [msg] } = await query(
      `SELECT message_id, hive_id FROM messages WHERE message_id = $1`, [messageId],
    );
    if (!msg) return res.status(404).json({ error: 'Message not found.' });

    await requireMembership(msg.hive_id, req.userId);

    const { rows: [existing] } = await query(
      `SELECT reaction_id FROM message_reactions
       WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, req.userId, emoji],
    );

    if (existing) {
      await query(`DELETE FROM message_reactions WHERE reaction_id = $1`, [existing.reaction_id]);
    } else {
      await query(
        `INSERT INTO message_reactions (message_id, user_id, emoji)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [messageId, req.userId, emoji],
      );
    }

    const { rows: reactionRows } = await query(
      `SELECT emoji,
              COUNT(*)::int                          AS count,
              json_agg(user_id ORDER BY reacted_at)  AS user_ids
       FROM message_reactions
       WHERE message_id = $1
       GROUP BY emoji
       ORDER BY MIN(reacted_at)`,
      [messageId],
    );

    const reactions = reactionRows.map(r => ({
      emoji:    r.emoji,
      count:    r.count,
      user_ids: r.user_ids,
    }));

    try {
      getIO().to(`hive:${msg.hive_id}`).emit('reaction_updated', {
        message_id: messageId,
        hive_id:    msg.hive_id,
        reactions,
      });
    } catch {}

    res.json({ message_id: messageId, reactions });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[messages/reaction]', err);
    res.status(500).json({ error: 'Failed to toggle reaction.' });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const { rows: [row] } = await query(
      `SELECT LEAST(COUNT(*)::int, 99) AS count
       FROM messages m
       WHERE m.hive_id          = $1
         AND m.sender_user_id  != $2
         AND m.deleted_at       IS NULL
         AND m.sent_at > COALESCE(
           (SELECT last_seen_at FROM hive_last_seen WHERE user_id = $2 AND hive_id = $1),
           '1970-01-01'::timestamptz
         )`,
      [hiveId, req.userId],
    );

    res.json({ count: Number(row?.count ?? 0) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[messages/unread]', err);
    res.status(500).json({ error: 'Failed to get unread count.' });
  }
};
