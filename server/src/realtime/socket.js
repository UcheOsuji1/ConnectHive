import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { parseCookie } from 'cookie';
import { query } from '../db/index.js';
import { requireMembership } from '../lib/hiveMembership.js';

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

// Kick a user from a hive room without disconnecting their socket.
// Called by hivesController after setting membership_status = 'removed'.
export function evictUserFromHive(hiveId, userId) {
  if (!io) return;
  const room = `hive:${hiveId}`;

  // Remove every socket belonging to this user from the hive room
  io.in(`user:${userId}`).socketsLeave(room);

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

  // JWT auth via cookie on every connection
  io.use((socket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const payload = jwt.verify(cookies.token, process.env.JWT_SECRET);
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId;

    // Personal room — used for targeted events (access revocation, DMs, etc.)
    socket.join(`user:${userId}`);

    // Lazy-load display name and stored presence status once per connection.
    // LEFT JOIN profiles so presence_status loads even before profile setup.
    try {
      const { rows: [p] } = await query(
        `SELECT p.full_name, u.presence_status
         FROM users u LEFT JOIN profiles p ON p.user_id = u.user_id
         WHERE u.user_id = $1`,
        [userId],
      );
      socket.data.fullName = p?.full_name ?? null;
      if (p?.presence_status) userStatus.set(userId, p.presence_status);
    } catch { /* non-fatal */ }

    // ── join_hive_room ───────────────────────────────────────────────────────
    socket.on('join_hive_room', async ({ hiveId } = {}, ack) => {
      try {
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
    socket.on('leave_hive_room', ({ hiveId } = {}) => {
      socket.leave(`hive:${hiveId}`);
      _removePresence(hiveId, userId, socket.id);
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

      // Rebroadcast updated presence to every hive this socket has joined
      for (const room of socket.rooms) {
        if (!room.startsWith('hive:')) continue;
        const hiveId = room.slice(5);
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
