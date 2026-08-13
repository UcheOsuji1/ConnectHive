import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { parseCookie } from 'cookie';
import { query } from '../db/index.js';
import { requireMembership } from '../lib/hiveMembership.js';

let io = null;

// hiveId -> Map<userId, Set<socketId>>
const presence = new Map();

export function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
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

    // Lazy-load full_name once per socket
    try {
      const { rows: [p] } = await query(
        `SELECT full_name FROM profiles WHERE user_id = $1`, [userId],
      );
      socket.data.fullName = p?.full_name ?? null;
    } catch { /* non-fatal */ }

    socket.on('join_hive_room', async ({ hiveId } = {}, ack) => {
      try {
        await requireMembership(hiveId, userId);

        const room = `hive:${hiveId}`;
        socket.join(room);

        if (!presence.has(hiveId)) presence.set(hiveId, new Map());
        const hivePres = presence.get(hiveId);
        if (!hivePres.has(userId)) hivePres.set(userId, new Set());
        hivePres.get(userId).add(socket.id);

        const onlineUserIds = [...hivePres.keys()];
        io.to(room).emit('presence_update', { hive_id: hiveId, online_user_ids: onlineUserIds });

        if (typeof ack === 'function') ack({ ok: true, online_user_ids: onlineUserIds });
      } catch (err) {
        if (typeof ack === 'function') ack({ error: err.message });
      }
    });

    socket.on('leave_hive_room', ({ hiveId } = {}) => {
      socket.leave(`hive:${hiveId}`);
      _removePresence(hiveId, userId, socket.id);
    });

    socket.on('typing_start', ({ hiveId } = {}) => {
      const room = `hive:${hiveId}`;
      if (!socket.rooms.has(room)) return;
      socket.to(room).emit('typing_update', {
        hive_id: hiveId,
        user_id: userId,
        full_name: socket.data.fullName,
        typing: true,
      });
    });

    socket.on('typing_stop', ({ hiveId } = {}) => {
      const room = `hive:${hiveId}`;
      if (!socket.rooms.has(room)) return;
      socket.to(room).emit('typing_update', {
        hive_id: hiveId,
        user_id: userId,
        full_name: socket.data.fullName,
        typing: false,
      });
    });

    socket.on('disconnect', () => {
      for (const [hiveId] of presence.entries()) {
        _removePresence(hiveId, userId, socket.id);
      }
    });
  });

  return io;
}

function _removePresence(hiveId, userId, socketId) {
  const hivePres = presence.get(hiveId);
  if (!hivePres) return;

  const userSockets = hivePres.get(userId);
  if (userSockets) {
    userSockets.delete(socketId);
    if (userSockets.size === 0) hivePres.delete(userId);
  }

  const onlineUserIds = [...hivePres.keys()];
  if (io) {
    io.to(`hive:${hiveId}`).emit('presence_update', {
      hive_id: hiveId,
      online_user_ids: onlineUserIds,
    });
  }
}
