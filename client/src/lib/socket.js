import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const socket = io(URL, {
  withCredentials: true,
  autoConnect: false,
});

// ── Hive room membership, reference counted ──────────────────────────────────
// There is one shared socket for the whole app, but room membership is per
// socket on the server. Two components can want the same Hive room at once
// (Chat and Hive Home both do), so an unconditional leave from one of them used
// to pull the socket out of the room for the other — presence went empty,
// typing was dropped by the server's room guard, and set_status had no room to
// rebroadcast to.
//
// joinHive/leaveHive keep a count per hive: the socket joins on the first
// claim and leaves only when the last one is released. Rejoining on `connect`
// covers reconnects, and is also why the first join is no longer lost.
const roomCounts = new Map(); // hiveId → number of live claims

function emitJoin(hiveId) {
  socket.emit('join_hive_room', { hiveId }, (ack) => {
    const handlers = ackHandlers.get(hiveId);
    if (handlers) for (const fn of handlers) fn(ack);
  });
}

// Components register a callback to receive the join ack (presence snapshot).
const ackHandlers = new Map(); // hiveId → Set<fn>

export function onHiveJoinAck(hiveId, fn) {
  if (!ackHandlers.has(hiveId)) ackHandlers.set(hiveId, new Set());
  ackHandlers.get(hiveId).add(fn);
  return () => {
    ackHandlers.get(hiveId)?.delete(fn);
    if (ackHandlers.get(hiveId)?.size === 0) ackHandlers.delete(hiveId);
  };
}

// Leaving is deferred briefly. Navigating between two pages of the same Hive
// unmounts one before the next mounts, and React StrictMode double-mounts in
// development, so the count dips to 0 for a few milliseconds. Leaving
// immediately removed the socket from the room in that gap, and everyone else
// watched the user blink offline. A pending leave is cancelled by any join
// that arrives first.
const LEAVE_GRACE_MS = 400;
const pendingLeaves = new Map(); // hiveId → timeout id

export function joinHive(hiveId) {
  if (!hiveId) return;
  if (!socket.connected) socket.connect();

  const pending = pendingLeaves.get(hiveId);
  if (pending) { clearTimeout(pending); pendingLeaves.delete(hiveId); }

  const next = (roomCounts.get(hiveId) ?? 0) + 1;
  roomCounts.set(hiveId, next);
  // Emit on every claim, not only the first: the server's join is idempotent,
  // and a late-mounting component still needs its own ack to seed presence.
  emitJoin(hiveId);
}

export function leaveHive(hiveId) {
  if (!hiveId) return;
  const next = (roomCounts.get(hiveId) ?? 1) - 1;
  if (next > 0) {
    roomCounts.set(hiveId, next);
    return;
  }
  roomCounts.delete(hiveId);
  if (pendingLeaves.has(hiveId)) return;
  pendingLeaves.set(hiveId, setTimeout(() => {
    pendingLeaves.delete(hiveId);
    if (roomCounts.has(hiveId)) return;       // re-claimed while we waited
    socket.emit('leave_hive_room', { hiveId });
  }, LEAVE_GRACE_MS));
}

// Rejoin every held room after a reconnect.
socket.on('connect', () => {
  for (const hiveId of roomCounts.keys()) emitJoin(hiveId);
});
