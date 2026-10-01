import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { parseCookie } from 'cookie';
import { query } from '../db/index.js';
import { requireMembership } from '../lib/hiveMembership.js';
import { dbTokenVersion } from '../middleware/auth.js';

let io = null;

// hiveId → Map<userId, Set<socketId>>
const presence = new Map();

// userId → 'online' | 'away' | 'busy' | 'invisible'
// Hydrated from DB on connect; kept in sync by set_status events.
const userStatus = new Map();

const VALID_STATUSES = new Set(['online', 'away', 'busy', 'invisible']);

export function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

// Build the presence payload for a hive, omitting invisible members.
// Other clients must never learn that an invisible user is connected.
function _buildPresence(hiveId) {
  const hivePres = presence.get(hiveId);
  if (!hivePres) return { online_user_ids: [], presence: [] };

  const presenceArr = [];
  const onlineIds   = [];

  for (const [uid] of hivePres) {
    const status = userStatus.get(uid) ?? 'online';
    if (status === 'invisible') continue;
    onlineIds.push(uid);
    presenceArr.push({ user_id: uid, status });
  }

  return { online_user_ids: onlineIds, presence: presenceArr };
}

function _removePresence(hiveId, userId, socketId) {
  const hivePres = presence.get(hiveId);
  if (!hivePres) return;

  const userSockets = hivePres.get(userId);
  if (userSockets) {
    userSockets.delete(socketId);
    if (userSockets.size === 0) hivePres.delete(userId);
  }

  if (io) {
    const payload = _buildPresence(hiveId);
    io.to(`hive:${hiveId}`).emit('presence_update', { hive_id: hiveId, ...payload });
  }
}

// Force-close all sockets belonging to a user (call after version bump on logout / pw reset).
export function disconnectUserSockets(userId) {
  if (!io) return;
  io.in(`user:${userId}`).disconnectSockets(true);
}

// Kick a user from a hive room without disconnecting their socket.
// Called by hivesController after setting membership_status = 'removed'.
export async function evictUserFromHive(hiveId, userId) {
  if (!io) return;
  const room = `hive:${hiveId}`;

  // Leave the hive room
  io.in(`user:${userId}`).socketsLeave(room);

  // Leave all channel rooms for this hive
  const chPrefix = `hive:${hiveId}:ch:`;
  try {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    for (const s of sockets) {
      for (const r of s.rooms) {
        if (r.startsWith(chPrefix)) s.leave(r);
      }
    }
  } catch { /* non-fatal */ }

  // Clean up presence
  const hivePres = presence.get(hiveId);
  if (hivePres) {
    hivePres.delete(userId);
    const payload = _buildPresence(hiveId);
    io.to(room).emit('presence_update', { hive_id: hiveId, ...payload });
  }

  // Tell the evicted user their access is gone
  io.to(`user:${userId}`).emit('hive_access_revoked', { hive_id: hiveId });
}

export function initSocket(httpServer, clientUrl) {
  io = new Server(httpServer, {
    cors: { origin: clientUrl, credentials: true },
  });

  // JWT auth via cookie on every connection — also checks token_version so revoked
  // sessions (after logout or password reset) cannot establish a new socket.
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const payload = jwt.verify(cookies.token, process.env.JWT_SECRET);

      if (payload.tokenVersion !== undefined) {
        const dbVersion = await dbTokenVersion(payload.userId);
        if (payload.tokenVersion !== dbVersion) {
          return next(new Error('Unauthorized'));
        }
      }

      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;

    // Personal room — used for targeted events (access revocation, DMs, etc.)
    socket.join(`user:${userId}`);

    // Lazy-load display name and stored presence status once per connection.
    // LEFT JOIN profiles so presence_status loads even before profile setup.
    //
    // This must NOT be awaited before the handlers below are registered. This
    // callback used to be `async` and awaited this query first, so for the
    // 80-600ms it took, the socket had no 'join_hive_room' listener at all —
    // and socket.io drops packets that arrive with no listener. The client
    // emits its first join the instant the connection opens, which landed
    // squarely in that window, so the very first join was silently lost: the
    // socket never entered the hive room, presence stayed empty, typing was
    // dropped by the room guard, and set_status had no room to rebroadcast to.
    query(
      `SELECT p.full_name, u.presence_status
       FROM users u LEFT JOIN profiles p ON p.user_id = u.user_id
       WHERE u.user_id = $1`,
      [userId],
    ).then(({ rows: [p] }) => {
      socket.data.fullName = p?.full_name ?? null;
      if (p?.presence_status) userStatus.set(userId, p.presence_status);
    }).catch(() => { /* non-fatal */ });

    // ── join_hive_room ───────────────────────────────────────────────────────
    // Idempotent: joining a room the socket is already in is a no-op, and the
    // presence Set keys on socket.id so a repeat add changes nothing.
    socket.on('join_hive_room', async ({ hiveId } = {}, ack) => {
      try {
        if (!hiveId) throw Object.assign(new Error('hiveId is required.'), { status: 400 });
        await requireMembership(hiveId, userId);

        const room = `hive:${hiveId}`;
        socket.join(room);

        if (!presence.has(hiveId)) presence.set(hiveId, new Map());
        const hivePres = presence.get(hiveId);
        if (!hivePres.has(userId)) hivePres.set(userId, new Set());
        hivePres.get(userId).add(socket.id);

        // Broadcast updated presence (invisible users excluded)
        const payload = _buildPresence(hiveId);
        io.to(room).emit('presence_update', { hive_id: hiveId, ...payload });

        const myStatus = userStatus.get(userId) ?? 'online';
        if (typeof ack === 'function') {
          ack({ ok: true, ...payload, your_status: myStatus });
        }
      } catch (err) {
        if (typeof ack === 'function') ack({ error: err.message });
      }
    });

    // ── leave_hive_room ──────────────────────────────────────────────────────
    // Harmless when the socket is not in the room: socket.leave is a no-op and
    // _removePresence only touches entries that exist.
    socket.on('leave_hive_room', ({ hiveId } = {}) => {
      if (!hiveId) return;
      socket.leave(`hive:${hiveId}`);
      _removePresence(hiveId, userId, socket.id);
    });

    // ── join_channel / leave_channel ─────────────────────────────────────────
    socket.on('join_channel', async ({ hiveId, channelId } = {}, ack) => {
      try {
        await requireMembership(hiveId, userId);
        socket.join(`hive:${hiveId}:ch:${channelId}`);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') ack({ error: err.message });
      }
    });

    socket.on('leave_channel', ({ hiveId, channelId } = {}) => {
      socket.leave(`hive:${hiveId}:ch:${channelId}`);
    });

    // ── set_status ───────────────────────────────────────────────────────────
    socket.on('set_status', async ({ status } = {}, ack) => {
      if (!VALID_STATUSES.has(status)) {
        if (typeof ack === 'function') ack({ error: 'Invalid status.' });
        return;
      }

      userStatus.set(userId, status);

      // Persist to DB (non-blocking — we already updated in-memory)
      query(`UPDATE users SET presence_status = $1 WHERE user_id = $2`, [status, userId])
        .catch(e => console.error('[socket/set_status] DB write failed:', e));

      // Rebroadcast updated presence to every hive this socket has joined.
      // Channel rooms are named hive:<hiveId>:ch:<channelId> and so also start
      // with "hive:". Treating one as a hive room sliced a bogus id, built an
      // empty presence from it and broadcast that to everyone in the channel —
      // which is why one user changing status emptied everybody's Online Now.
      for (const room of socket.rooms) {
        if (!room.startsWith('hive:')) continue;
        const hiveId = room.slice(5);
        if (hiveId.includes(':')) continue;      // a channel room, not a hive room
        const payload = _buildPresence(hiveId);
        io.to(room).emit('presence_update', { hive_id: hiveId, ...payload });
      }

      if (typeof ack === 'function') ack({ ok: true, status });
    });

    // ── typing ───────────────────────────────────────────────────────────────
    socket.on('typing_start', ({ hiveId } = {}) => {
      const room = `hive:${hiveId}`;
      if (!socket.rooms.has(room)) return;
      socket.to(room).emit('typing_update', {
        hive_id:   hiveId,
        user_id:   userId,
        full_name: socket.data.fullName,
        typing:    true,
      });
    });

    socket.on('typing_stop', ({ hiveId } = {}) => {
      const room = `hive:${hiveId}`;
      if (!socket.rooms.has(room)) return;
      socket.to(room).emit('typing_update', {
        hive_id:   hiveId,
        user_id:   userId,
        full_name: socket.data.fullName,
        typing:    false,
      });
    });

    // ── disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      for (const [hiveId] of presence.entries()) {
        _removePresence(hiveId, userId, socket.id);
      }
    });
  });

  return io;
}
