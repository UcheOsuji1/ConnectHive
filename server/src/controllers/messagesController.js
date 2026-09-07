import crypto from 'crypto';
import { query } from '../db/index.js';
import { getMembership, requireMembership } from '../lib/hiveMembership.js';
import { getDefaultChannelId } from '../lib/hiveChannels.js';
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

// ── Attachment URL validation ─────────────────────────────────────────────────
const ALLOWED_RESOURCE_TYPES = new Set(['image', 'video', 'raw']);
const MAX_ATTACHMENT_BYTES   = 25 * 1024 * 1024; // 25 MB
const MAX_ATTACHMENTS        = 6;

function _validateAttachment(att) {
  if (!ALLOWED_RESOURCE_TYPES.has(att.resource_type)) {
    return `Invalid resource_type "${att.resource_type}".`;
  }
  if (att.bytes != null && Number(att.bytes) > MAX_ATTACHMENT_BYTES) {
    return 'Each attachment must be 25 MB or less.';
  }
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  try {
    const u = new URL(att.url);
    if (u.protocol !== 'https:')                         throw new Error();
    if (u.hostname !== 'res.cloudinary.com')             throw new Error();
    if (!u.pathname.startsWith(`/${cloudName}/`))        throw new Error();
  } catch {
    return 'Invalid attachment URL — must be hosted on your Cloudinary account.';
  }
  return null; // OK
}

// ── Enriched message query ────────────────────────────────────────────────────
// Runs the full enrichment join for any WHERE/ORDER/LIMIT clause you append.
async function _runEnriched(extraSQL, params) {
  const { rows } = await query(
    `SELECT
       m.message_id,
       m.hive_id,
       m.channel_id,
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
       COALESCE(rxn.reactions, '[]'::json) AS reactions,
       CASE WHEN m.deleted_at IS NOT NULL
            THEN '[]'::json
            ELSE COALESCE(att.attachments, '[]'::json)
       END AS attachments
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
     LEFT JOIN LATERAL (
       SELECT json_agg(
         json_build_object(
           'attachment_id', a.attachment_id,
           'url',           a.url,
           'resource_type', a.resource_type,
           'file_name',     a.file_name,
           'mime_type',     a.mime_type,
           'bytes',         a.bytes,
           'width',         a.width,
           'height',        a.height
         ) ORDER BY a.position
       ) AS attachments
       FROM message_attachments a
       WHERE a.message_id = m.message_id
     ) att ON true
     ${extraSQL}`,
    params,
  );
  return rows.map(_shape);
}

function _shape(row) {
  return {
    message_id:     row.message_id,
    hive_id:        row.hive_id,
    channel_id:     row.channel_id ?? null,
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
    reactions:   Array.isArray(row.reactions)   ? row.reactions   : [],
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
  };
}

// ── Channel resolver ─────────────────────────────────────────────────────────
// Returns a validated channel_id belonging to hiveId.
// If requestedId is provided and belongs to the hive, returns it.
// Otherwise falls back to the hive's default channel.
async function _resolveChannelId(hiveId, requestedId) {
  if (requestedId) {
    const { rows: [ch] } = await query(
      `SELECT channel_id FROM hive_channels
       WHERE channel_id = $1 AND hive_id = $2 AND archived_at IS NULL`,
      [requestedId, hiveId],
    );
    if (ch) return ch.channel_id;
  }
  return getDefaultChannelId(hiveId);
}

// ── Controllers ───────────────────────────────────────────────────────────────

export const listMessages = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const before    = req.query.before ? new Date(req.query.before).toISOString() : new Date().toISOString();
    const limit     = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10), 1), 100);
    const channelId = await _resolveChannelId(hiveId, req.query.channel_id);

    const msgs = await _runEnriched(
      `WHERE m.hive_id    = $1
         AND m.channel_id = $2
         AND m.sent_at < $3
       ORDER BY m.sent_at DESC LIMIT $4`,
      [hiveId, channelId, before, limit + 1],
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

    const { message_text, reply_to_message_id, attachments: rawAtts, channel_id: reqChannelId } = req.body ?? {};
    const text        = (message_text ?? '').trim();
    const attachments = Array.isArray(rawAtts) ? rawAtts : [];

    // Need text, attachments, or both — but not neither
    if (!text && attachments.length === 0) {
      return res.status(400).json({ error: 'Message must have text or at least one attachment.' });
    }
    if (text.length > 2000) {
      return res.status(400).json({ error: 'Message text must be 2000 characters or fewer.' });
    }
    if (attachments.length > MAX_ATTACHMENTS) {
      return res.status(400).json({ error: `At most ${MAX_ATTACHMENTS} attachments per message.` });
    }

    // Validate every attachment before touching the DB
    for (const att of attachments) {
      const err = _validateAttachment(att);
      if (err) return res.status(400).json({ error: err });
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

    const channelId = await _resolveChannelId(hiveId, reqChannelId);

    const { rows: [ins] } = await query(
      `INSERT INTO messages (hive_id, sender_user_id, message_text, reply_to_message_id, channel_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING message_id`,
      [hiveId, req.userId, text, reply_to_message_id ?? null, channelId],
    );

    // Insert all attachments in a single multi-row INSERT so a partial set can never persist
    if (attachments.length > 0) {
      const placeholders = [];
      const values       = [];
      let   p            = 1;
      for (let i = 0; i < attachments.length; i++) {
        const a = attachments[i];
        placeholders.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
        values.push(
          ins.message_id,
          a.url,
          a.resource_type,
          a.file_name  ?? null,
          a.mime_type  ?? null,
          a.bytes      != null ? Number(a.bytes)  : null,
          a.width      != null ? Number(a.width)  : null,
          a.height     != null ? Number(a.height) : null,
          i,
        );
      }
      await query(
        `INSERT INTO message_attachments
           (message_id, url, resource_type, file_name, mime_type, bytes, width, height, position)
         VALUES ${placeholders.join(',')}`,
        values,
      );
    }

    const [msg] = await _runEnriched(`WHERE m.message_id = $1`, [ins.message_id]);
    try {
      const io = getIO();
      io.to(`hive:${hiveId}:ch:${channelId}`).emit('receive_message', msg);
      io.to(`hive:${hiveId}`).emit('channel_activity', { hive_id: hiveId, channel_id: channelId });
    } catch { /* no socket in tests */ }
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
      `SELECT message_id, hive_id, channel_id, sender_user_id, deleted_at FROM messages WHERE message_id = $1`,
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
    try {
      const room = existing.channel_id
        ? `hive:${existing.hive_id}:ch:${existing.channel_id}`
        : `hive:${existing.hive_id}`;
      getIO().to(room).emit('message_updated', msg);
    } catch {}
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
      `SELECT message_id, hive_id, channel_id, sender_user_id, deleted_at FROM messages WHERE message_id = $1`,
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
      const room = existing.channel_id
        ? `hive:${existing.hive_id}:ch:${existing.channel_id}`
        : `hive:${existing.hive_id}`;
      getIO().to(room).emit('message_deleted', {
        message_id: messageId,
        hive_id:    existing.hive_id,
        channel_id: existing.channel_id ?? null,
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
      `SELECT message_id, hive_id, channel_id FROM messages WHERE message_id = $1`, [messageId],
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
      const room = msg.channel_id
        ? `hive:${msg.hive_id}:ch:${msg.channel_id}`
        : `hive:${msg.hive_id}`;
      getIO().to(room).emit('reaction_updated', {
        message_id: messageId,
        hive_id:    msg.hive_id,
        channel_id: msg.channel_id ?? null,
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

// ── Chat upload signature ─────────────────────────────────────────────────────
// Open to any active member (not owner/admin-only like the banner endpoint).
export const getChatUploadSignature = async (req, res) => {
  try {
    await requireMembership(req.params.id, req.userId);

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey    = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(503).json({ error: 'File uploads are not configured yet.' });
    }

    const folder    = `hives/${req.params.id}/chat`;
    const timestamp = Math.round(Date.now() / 1000);

    // Cloudinary signature: SHA-1( sorted_params + api_secret )
    const paramsStr = `folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto.createHash('sha1')
      .update(paramsStr + apiSecret)
      .digest('hex');

    res.json({ signature, timestamp, api_key: apiKey, cloud_name: cloudName, folder });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[messages/getChatUploadSignature]', err);
    res.status(500).json({ error: 'Failed to generate upload signature.' });
  }
};
