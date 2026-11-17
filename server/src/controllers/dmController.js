/**
 * Direct Messages (Prompt 86).
 *
 * One conversation per pair (dm_conversations, canonical user_a < user_b),
 * created on the first send, never before. Who may message whom comes from
 * lib/connections.js: a shared active Hive or a connection means 'direct';
 * anyone else starts a 'request' that allows exactly one message until the
 * recipient replies. Blocked pairs can't send (403), and their conversations
 * vanish from both lists and from every read (404).
 *
 * No bell notification and no email for DMs — the Messages badge is the
 * signal (dm_unread over the socket).
 */
import crypto from 'crypto';
import { query, getClient } from '../db/index.js';
import { isBlockedEitherWay } from '../lib/blocks.js';
import { contextFor, messagingContext, messageableUsers } from '../lib/connections.js';
import { isUuid } from '../lib/isUuid.js';
import { LIMITS } from '../lib/limits.js';
import { getIO } from '../realtime/socket.js';

const PAGE_SIZE      = 30;
const MAX_BODY       = 4000;
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const LIST_LIMIT     = 100;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function fail(res, err, tag, message) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(`[dm/${tag}]`, err);
  return res.status(500).json({ error: message });
}

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'them';

// Socket pushes never fail a request: the write is already committed.
function emitTo(userId, event, payload) {
  let io;
  try { io = getIO(); } catch { return; } // scripts/checks: no Socket.IO
  try {
    io.to(`user:${userId}`).emit(event, payload);
  } catch (err) {
    console.error(`[dm/emit ${event}]`, err);
  }
}

// Either direction of a block hides the conversation, so a symmetric check on
// the pair's two columns is enough.
const NOT_BLOCKED = `NOT EXISTS (
  SELECT 1 FROM user_blocks b
   WHERE (b.blocker_id = c.user_a AND b.blocked_id = c.user_b)
      OR (b.blocker_id = c.user_b AND b.blocked_id = c.user_a))`;

const UNREAD_FOR = (who) => `EXISTS (
  SELECT 1 FROM dm_messages x
   WHERE x.conversation_id = c.conversation_id
     AND x.sender_id <> ${who}
     AND x.deleted_at IS NULL
     AND x.created_at > COALESCE(m.last_read_at, '-infinity'::timestamptz))`;

// Conversations with unread messages, by tab. Muted and hidden ones don't
// count toward the badge (they still show their unread dot in the list).
export async function unreadCounts(userId) {
  const { rows: [r] } = await query(
    `SELECT COUNT(*) FILTER (WHERE c.status = 'active' OR c.requested_by = $1)::int AS inbox,
            COUNT(*) FILTER (WHERE c.status = 'request' AND c.requested_by IS DISTINCT FROM $1)::int AS requests
       FROM dm_members m
       JOIN dm_conversations c ON c.conversation_id = m.conversation_id
      WHERE m.user_id = $1 AND m.hidden_at IS NULL AND NOT m.muted
        AND ${NOT_BLOCKED}
        AND ${UNREAD_FOR('$1')}`,
    [userId],
  );
  return { inbox: r.inbox, requests: r.requests };
}

async function pushUnread(userId) {
  try {
    emitTo(userId, 'dm_unread', await unreadCounts(userId));
  } catch (err) {
    console.error('[dm/pushUnread]', err);
  }
}

function shapeMessage(m) {
  const deleted = !!m.deleted_at;
  return {
    message_id:      m.message_id,
    conversation_id: m.conversation_id,
    sender_id:       m.sender_id,
    body:            deleted ? null : m.body,
    image_url:       deleted ? null : m.image_url,
    created_at:      m.created_at,
    edited_at:       m.edited_at,
    deleted,
  };
}

function previewOf(r, me) {
  if (r.last_deleted) return 'Message deleted';
  const mine = r.last_sender === me;
  const text = r.last_body ? r.last_body.replace(/\s+/g, ' ').slice(0, 140) : 'Photo';
  return mine ? `You: ${text}` : text;
}

async function loadPerson(userId) {
  const { rows: [p] } = await query(
    `SELECT u.user_id, u.account_status, u.is_system,
            p.full_name, p.profile_photo_url, p.headline
       FROM users u LEFT JOIN profiles p ON p.user_id = u.user_id
      WHERE u.user_id = $1`,
    [userId],
  );
  return p ?? null;
}

// The conversation row plus this viewer's own member row, or null if the
// viewer isn't in it. Other-person id is derived, never client-supplied.
async function loadMembership(conversationId, me, db = { query }) {
  const { rows: [c] } = await db.query(
    `SELECT c.*, m.last_read_at, m.hidden_at, m.muted,
            CASE WHEN c.user_a = $2 THEN c.user_b ELSE c.user_a END AS other_id
       FROM dm_conversations c
       JOIN dm_members m ON m.conversation_id = c.conversation_id AND m.user_id = $2
      WHERE c.conversation_id = $1`,
    [conversationId, me],
  );
  return c ?? null;
}

// Everything the conversation pane needs about one pair, conversation or not.
async function conversationView(me, otherId, conv) {
  const [person, ctx] = await Promise.all([loadPerson(otherId), messagingContext(me, otherId)]);
  let mySent = 0;
  let otherLastRead = null;
  if (conv) {
    const { rows: [s] } = await query(
      `SELECT (SELECT COUNT(*)::int FROM dm_messages WHERE conversation_id = $1 AND sender_id = $2) AS my_sent,
              (SELECT last_read_at FROM dm_members WHERE conversation_id = $1 AND user_id = $3) AS other_last_read_at`,
      [conv.conversation_id, me, otherId],
    );
    mySent = s.my_sent;
    otherLastRead = s.other_last_read_at;
  }
  const awaitingReply = !!conv && conv.status === 'request' && conv.requested_by === me;
  const canSend = ctx.mode !== 'blocked' && !(awaitingReply && ctx.mode !== 'direct' && mySent >= 1);
  return {
    conversation_id:    conv?.conversation_id ?? null,
    status:             conv?.status ?? null,
    requested_by:       conv?.requested_by ?? null,
    muted:              !!conv?.muted,
    other: {
      user_id:           otherId,
      full_name:         person?.full_name ?? 'Member',
      profile_photo_url: person?.profile_photo_url ?? null,
      headline:          person?.headline ?? null,
    },
    context:            ctx.label,
    mode:               ctx.mode,
    can_send:           canSend,
    awaiting_reply:     awaitingReply,
    incoming_request:   !!conv && conv.status === 'request' && conv.requested_by !== me,
    other_last_read_at: otherLastRead,
  };
}

// ── GET /api/dm/conversations?tab=inbox|requests ─────────────────────────────
export const listConversations = async (req, res) => {
  try {
    const me = req.userId;
    const tab = req.query.tab === 'requests' ? 'requests' : 'inbox';
    const tabFilter = tab === 'inbox'
      ? `(c.status = 'active' OR c.requested_by = $1)`
      : `(c.status = 'request' AND c.requested_by IS DISTINCT FROM $1)`;

    const { rows } = await query(
      `SELECT c.conversation_id, c.status, c.requested_by, c.last_message_at,
              o.other_id, m.muted,
              p.full_name, p.profile_photo_url, p.headline,
              lm.body AS last_body, lm.image_url AS last_image, lm.sender_id AS last_sender,
              (lm.deleted_at IS NOT NULL) AS last_deleted,
              (SELECT COUNT(*)::int FROM dm_messages x
                WHERE x.conversation_id = c.conversation_id AND x.sender_id <> $1 AND x.deleted_at IS NULL
                  AND x.created_at > COALESCE(m.last_read_at, '-infinity'::timestamptz)) AS unread
         FROM dm_members m
         JOIN dm_conversations c ON c.conversation_id = m.conversation_id
         CROSS JOIN LATERAL (SELECT CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END AS other_id) o
         LEFT JOIN profiles p ON p.user_id = o.other_id
         LEFT JOIN LATERAL (
           SELECT body, image_url, sender_id, deleted_at
             FROM dm_messages WHERE conversation_id = c.conversation_id
            ORDER BY created_at DESC LIMIT 1
         ) lm ON TRUE
        WHERE m.user_id = $1 AND m.hidden_at IS NULL
          AND ${NOT_BLOCKED}
          AND ${tabFilter}
        ORDER BY c.last_message_at DESC
        LIMIT ${LIST_LIMIT}`,
      [me],
    );

    const ctx = await contextFor(me, rows.map(r => r.other_id));
    const conversations = rows.map(r => ({
      conversation_id: r.conversation_id,
      status:          r.status,
      request_sent:    r.status === 'request' && r.requested_by === me,
      muted:           r.muted,
      last_message_at: r.last_message_at,
      unread:          r.unread,
      preview:         previewOf(r, me),
      context:         ctx.get(r.other_id)?.label ?? 'Message request',
      other: {
        user_id:           r.other_id,
        full_name:         r.full_name ?? 'Member',
        profile_photo_url: r.profile_photo_url ?? null,
        headline:          r.headline ?? null,
      },
    }));
    res.json({ tab, conversations });
  } catch (err) {
    fail(res, err, 'listConversations', 'Failed to load messages.');
  }
};

// ── POST /api/dm/conversations { userId } ────────────────────────────────────
// Open-or-get. Never creates a row: conversation_id stays null until the
// first message is sent.
export const openConversation = async (req, res) => {
  try {
    const me = req.userId;
    const otherId = req.body?.userId;
    if (!isUuid(otherId)) return res.status(404).json({ error: 'Member not found.' });
    if (otherId.toLowerCase() === me.toLowerCase()) return res.status(400).json({ error: "You can't message yourself." });

    const person = await loadPerson(otherId);
    if (!person || person.account_status !== 'active' || person.is_system) {
      return res.status(404).json({ error: 'Member not found.' });
    }
    if (await isBlockedEitherWay(me, person.user_id)) {
      return res.status(403).json({ error: "You can't message this person." });
    }

    const { rows: [found] } = await query(
      `SELECT conversation_id FROM dm_conversations
        WHERE user_a = LEAST($1::uuid, $2::uuid) AND user_b = GREATEST($1::uuid, $2::uuid)`,
      [me, person.user_id],
    );
    const conv = found ? await loadMembership(found.conversation_id, me) : null;
    res.json({ conversation: await conversationView(me, person.user_id, conv) });
  } catch (err) {
    fail(res, err, 'openConversation', 'Failed to open the conversation.');
  }
};

// Membership + block gate shared by every :id route. 404 either way: a
// blocked pair's conversation is invisible, not forbidden.
async function requireConversation(conversationId, me) {
  const conv = await loadMembership(conversationId, me);
  if (!conv) throw httpError(404, 'Conversation not found.');
  if (await isBlockedEitherWay(me, conv.other_id)) throw httpError(404, 'Conversation not found.');
  return conv;
}

// ── GET /api/dm/conversations/:id ────────────────────────────────────────────
export const getConversation = async (req, res) => {
  try {
    const conv = await requireConversation(req.params.id, req.userId);
    res.json({ conversation: await conversationView(req.userId, conv.other_id, conv) });
  } catch (err) {
    fail(res, err, 'getConversation', 'Failed to load the conversation.');
  }
};

// ── GET /api/dm/conversations/:id/messages?before= ───────────────────────────
// 30 per page, oldest → newest within the page. `before` is the created_at of
// the oldest message the client already has.
export const getMessages = async (req, res) => {
  try {
    const conv = await requireConversation(req.params.id, req.userId);
    let before = null;
    if (req.query.before) {
      const d = new Date(String(req.query.before));
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid before.' });
      before = d.toISOString();
    }
    const { rows } = await query(
      `SELECT message_id, conversation_id, sender_id, body, image_url, created_at, edited_at, deleted_at
         FROM dm_messages
        WHERE conversation_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
        ORDER BY created_at DESC
        LIMIT ${PAGE_SIZE + 1}`,
      [conv.conversation_id, before],
    );
    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE).reverse().map(shapeMessage);
    res.json({ messages: page, has_more: hasMore });
  } catch (err) {
    fail(res, err, 'getMessages', 'Failed to load messages.');
  }
};

function cleanBody(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.length > MAX_BODY) throw httpError(400, `Messages can be up to ${MAX_BODY} characters.`);
  return s;
}

// Only an image this person uploaded through /upload-signature: our
// Cloudinary account, image delivery, their own dm/{userId} folder.
function cleanImageUrl(raw, me) {
  if (raw == null || raw === '') return null;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  try {
    const u = new URL(String(raw));
    if (!cloud) throw new Error();
    if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com') throw new Error();
    if (!u.pathname.startsWith(`/${cloud}/image/upload/`)) throw new Error();
    if (!u.pathname.includes(`/dm/${me}/`)) throw new Error();
    return u.toString();
  } catch {
    throw httpError(400, 'Invalid image.');
  }
}

// ── Send ─────────────────────────────────────────────────────────────────────
// POST /api/dm/messages { toUserId, body, image_url }
// POST /api/dm/conversations/:id/messages { body, image_url }
async function send(me, { conversationId, toUserId, body: rawBody, imageUrl: rawImage }) {
  const body = cleanBody(rawBody);
  const imageUrl = cleanImageUrl(rawImage, me);
  if (!body && !imageUrl) throw httpError(400, 'Write a message or add a photo.');

  let otherId;
  if (conversationId) {
    const conv = await loadMembership(conversationId, me);
    if (!conv) throw httpError(404, 'Conversation not found.');
    otherId = conv.other_id;
  } else {
    if (!isUuid(toUserId)) throw httpError(404, 'Member not found.');
    if (toUserId.toLowerCase() === me.toLowerCase()) throw httpError(400, "You can't message yourself.");
    otherId = toUserId;
  }

  const person = await loadPerson(otherId);
  if (!person || person.account_status !== 'active' || person.is_system) {
    throw httpError(404, 'Member not found.');
  }
  otherId = person.user_id;
  const { mode } = await messagingContext(me, otherId);
  if (mode === 'blocked') throw httpError(403, "You can't message this person.");

  const client = await getClient();
  let conv;
  let message;
  try {
    await client.query('BEGIN');

    // Row lock on the pair's conversation serializes two concurrent sends,
    // so "one message per request" can't be raced past.
    const lockSql = `SELECT * FROM dm_conversations
                      WHERE user_a = LEAST($1::uuid, $2::uuid) AND user_b = GREATEST($1::uuid, $2::uuid)
                      FOR UPDATE`;
    ({ rows: [conv] } = await client.query(lockSql, [me, otherId]));

    let created = false;
    if (!conv) {
      if (mode === 'request') {
        const { rows: [{ n }] } = await client.query(
          `SELECT COUNT(*)::int AS n FROM dm_conversations
            WHERE requested_by = $1 AND created_at > NOW() - INTERVAL '1 day'`,
          [me],
        );
        if (n >= LIMITS.dmRequestsPerDay.max) {
          throw httpError(429, "You've sent a lot of message requests today. Try again tomorrow.");
        }
      }
      const { rows: [ins] } = await client.query(
        `INSERT INTO dm_conversations (user_a, user_b, status, requested_by)
         VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), $3, $4)
         ON CONFLICT (user_a, user_b) DO NOTHING
         RETURNING *`,
        [me, otherId, mode === 'direct' ? 'active' : 'request', mode === 'direct' ? null : me],
      );
      if (ins) {
        conv = ins;
        created = true;
        await client.query(
          `INSERT INTO dm_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)
           ON CONFLICT DO NOTHING`,
          [conv.conversation_id, me, otherId],
        );
      } else {
        // Someone else's first send won the race; continue on their row.
        ({ rows: [conv] } = await client.query(lockSql, [me, otherId]));
      }
    }

    if (!created && conv.status === 'request') {
      if (conv.requested_by === me && mode !== 'direct') {
        const { rows: [{ n }] } = await client.query(
          `SELECT COUNT(*)::int AS n FROM dm_messages WHERE conversation_id = $1 AND sender_id = $2`,
          [conv.conversation_id, me],
        );
        if (n >= 1) throw httpError(403, `Wait for ${firstName(person.full_name)} to reply.`);
      } else {
        // The recipient's reply accepts the request. So does the pair now
        // sharing a Hive or being connected: they could message directly.
        ({ rows: [conv] } = await client.query(
          `UPDATE dm_conversations SET status = 'active' WHERE conversation_id = $1 RETURNING *`,
          [conv.conversation_id],
        ));
      }
    }

    ({ rows: [message] } = await client.query(
      `INSERT INTO dm_messages (conversation_id, sender_id, body, image_url)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [conv.conversation_id, me, body, imageUrl],
    ));
    await client.query(
      `UPDATE dm_conversations SET last_message_at = $2 WHERE conversation_id = $1`,
      [conv.conversation_id, message.created_at],
    );
    // A new message brings the conversation back for both sides (the
    // recipient may have ignored/deleted it; the sender is clearly using it),
    // and the sender has read everything up to what they just sent.
    await client.query(
      `UPDATE dm_members
          SET hidden_at = NULL,
              last_read_at = CASE WHEN user_id = $2 THEN GREATEST(COALESCE(last_read_at, $3), $3) ELSE last_read_at END
        WHERE conversation_id = $1`,
      [conv.conversation_id, me, message.created_at],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const payload = {
    conversation_id: conv.conversation_id,
    status:          conv.status,
    requested_by:    conv.requested_by,
    message:         shapeMessage(message),
  };
  emitTo(me, 'dm_message', payload);
  emitTo(otherId, 'dm_message', payload);
  void pushUnread(otherId);
  return payload;
}

export const sendToUser = async (req, res) => {
  try {
    const out = await send(req.userId, {
      toUserId: req.body?.toUserId, body: req.body?.body, imageUrl: req.body?.image_url,
    });
    res.status(201).json(out);
  } catch (err) {
    fail(res, err, 'sendToUser', 'Failed to send the message.');
  }
};

export const sendToConversation = async (req, res) => {
  try {
    const out = await send(req.userId, {
      conversationId: req.params.id, body: req.body?.body, imageUrl: req.body?.image_url,
    });
    res.status(201).json(out);
  } catch (err) {
    fail(res, err, 'sendToConversation', 'Failed to send the message.');
  }
};

// Own message in a conversation the viewer is in, else 404/403.
async function loadOwnMessage(messageId, me) {
  const { rows: [m] } = await query(
    `SELECT dm.*, CASE WHEN c.user_a = $2 THEN c.user_b ELSE c.user_a END AS other_id
       FROM dm_messages dm
       JOIN dm_conversations c ON c.conversation_id = dm.conversation_id
       JOIN dm_members mem     ON mem.conversation_id = dm.conversation_id AND mem.user_id = $2
      WHERE dm.message_id = $1`,
    [messageId, me],
  );
  if (!m) throw httpError(404, 'Message not found.');
  if (m.sender_id !== me) throw httpError(403, 'You can only change your own messages.');
  return m;
}

function emitUpdated(m) {
  const payload = { conversation_id: m.conversation_id, message: shapeMessage(m) };
  emitTo(m.sender_id, 'dm_message_updated', payload);
  emitTo(m.other_id, 'dm_message_updated', payload);
}

// ── PATCH /api/dm/messages/:messageId { body } ───────────────────────────────
export const editMessage = async (req, res) => {
  try {
    const m = await loadOwnMessage(req.params.messageId, req.userId);
    if (m.deleted_at) return res.status(400).json({ error: 'This message was deleted.' });
    if (await isBlockedEitherWay(req.userId, m.other_id)) {
      return res.status(403).json({ error: "You can't message this person." });
    }
    if (Date.now() - new Date(m.created_at).getTime() > EDIT_WINDOW_MS) {
      return res.status(403).json({ error: 'Messages can only be edited for 15 minutes after sending.' });
    }
    const body = cleanBody(req.body?.body);
    if (!body && !m.image_url) return res.status(400).json({ error: 'A message needs text or a photo.' });

    const { rows: [updated] } = await query(
      `UPDATE dm_messages SET body = $2, edited_at = NOW() WHERE message_id = $1 RETURNING *`,
      [m.message_id, body],
    );
    updated.other_id = m.other_id;
    emitUpdated(updated);
    res.json({ message: shapeMessage(updated) });
  } catch (err) {
    fail(res, err, 'editMessage', 'Failed to edit the message.');
  }
};

// ── DELETE /api/dm/messages/:messageId ───────────────────────────────────────
// Soft delete, any time. The row (and its body) stays for reports; every
// read returns it as "Message deleted".
export const deleteMessage = async (req, res) => {
  try {
    const m = await loadOwnMessage(req.params.messageId, req.userId);
    const { rows: [updated] } = await query(
      `UPDATE dm_messages SET deleted_at = COALESCE(deleted_at, NOW()) WHERE message_id = $1 RETURNING *`,
      [m.message_id],
    );
    updated.other_id = m.other_id;
    emitUpdated(updated);
    void pushUnread(m.other_id);
    res.json({ message: shapeMessage(updated) });
  } catch (err) {
    fail(res, err, 'deleteMessage', 'Failed to delete the message.');
  }
};

// ── POST /api/dm/conversations/:id/read ──────────────────────────────────────
export const markRead = async (req, res) => {
  try {
    const conv = await requireConversation(req.params.id, req.userId);
    const { rows: [m] } = await query(
      `UPDATE dm_members SET last_read_at = clock_timestamp()
        WHERE conversation_id = $1 AND user_id = $2
        RETURNING last_read_at`,
      [conv.conversation_id, req.userId],
    );
    res.json({ ok: true, last_read_at: m.last_read_at });
    emitTo(conv.other_id, 'dm_read', {
      conversation_id: conv.conversation_id, user_id: req.userId, last_read_at: m.last_read_at,
    });
    void pushUnread(req.userId);
  } catch (err) {
    fail(res, err, 'markRead', 'Failed to mark as read.');
  }
};

// ── POST /api/dm/conversations/:id/ignore ────────────────────────────────────
// Recipient hides a request. The sender is never told.
export const ignoreRequest = async (req, res) => {
  try {
    const conv = await requireConversation(req.params.id, req.userId);
    if (conv.status !== 'request' || conv.requested_by === req.userId) {
      return res.status(400).json({ error: 'Only a message request you received can be ignored.' });
    }
    await query(
      `UPDATE dm_members SET hidden_at = NOW() WHERE conversation_id = $1 AND user_id = $2`,
      [conv.conversation_id, req.userId],
    );
    res.json({ ok: true });
    void pushUnread(req.userId);
  } catch (err) {
    fail(res, err, 'ignoreRequest', 'Failed to ignore the request.');
  }
};

// ── POST /api/dm/conversations/:id/hide ──────────────────────────────────────
// "Delete conversation" on your own side only; a new message brings it back.
export const hideConversation = async (req, res) => {
  try {
    const conv = await requireConversation(req.params.id, req.userId);
    await query(
      `UPDATE dm_members SET hidden_at = NOW() WHERE conversation_id = $1 AND user_id = $2`,
      [conv.conversation_id, req.userId],
    );
    res.json({ ok: true });
    void pushUnread(req.userId);
  } catch (err) {
    fail(res, err, 'hideConversation', 'Failed to delete the conversation.');
  }
};

// ── POST /api/dm/conversations/:id/mute { muted } ────────────────────────────
// Muted conversations still show their unread dot but leave the nav badge.
export const muteConversation = async (req, res) => {
  try {
    const conv = await requireConversation(req.params.id, req.userId);
    const muted = req.body?.muted !== false;
    await query(
      `UPDATE dm_members SET muted = $3 WHERE conversation_id = $1 AND user_id = $2`,
      [conv.conversation_id, req.userId, muted],
    );
    res.json({ ok: true, muted });
    void pushUnread(req.userId);
  } catch (err) {
    fail(res, err, 'muteConversation', 'Failed to update the conversation.');
  }
};

// ── GET /api/dm/unread-count ─────────────────────────────────────────────────
export const getUnreadCount = async (req, res) => {
  try {
    res.json(await unreadCounts(req.userId));
  } catch (err) {
    fail(res, err, 'getUnreadCount', 'Failed to load the count.');
  }
};

// ── GET /api/dm/recipients?q= ────────────────────────────────────────────────
export const getRecipients = async (req, res) => {
  try {
    res.json({ recipients: await messageableUsers(req.userId, req.query.q ?? '', 20) });
  } catch (err) {
    fail(res, err, 'getRecipients', 'Failed to load people.');
  }
};

// ── GET /api/dm/upload-signature ─────────────────────────────────────────────
// Same signing as getChatUploadSignature, plus allowed_formats so Cloudinary
// itself rejects anything that isn't an image. Size is capped client-side at
// the same 25 MB as chat.
export const DM_IMAGE_FORMATS = 'gif,jpeg,jpg,png,webp';
export const getUploadSignature = async (req, res) => {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey    = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(503).json({ error: 'Photo uploads are not configured yet.' });
    }
    const folder    = `dm/${req.userId}`;
    const timestamp = Math.round(Date.now() / 1000);
    // Cloudinary signature: SHA-1 of the alphabetically sorted params + secret.
    const paramsStr = `allowed_formats=${DM_IMAGE_FORMATS}&folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto.createHash('sha1').update(paramsStr + apiSecret).digest('hex');
    res.json({
      signature, timestamp, api_key: apiKey, cloud_name: cloudName, folder,
      allowed_formats: DM_IMAGE_FORMATS,
    });
  } catch (err) {
    fail(res, err, 'getUploadSignature', 'Failed to prepare the upload.');
  }
};

// ── Socket: dm_typing ────────────────────────────────────────────────────────
// Called from realtime/socket.js. Relays to the other person only when the
// sender is in the conversation and the pair isn't blocked.
export async function relayTyping(userId, conversationId) {
  if (!isUuid(conversationId)) return;
  const conv = await loadMembership(conversationId, userId);
  if (!conv) return;
  if (await isBlockedEitherWay(userId, conv.other_id)) return;
  emitTo(conv.other_id, 'dm_typing', { conversation_id: conv.conversation_id, user_id: userId });
}
