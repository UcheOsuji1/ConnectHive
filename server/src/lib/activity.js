import { query } from '../db/index.js';

// Throttles users.last_active_at writes to at most once per 5 minutes per
// user — called on every authenticated request and socket connect, so an
// unthrottled UPDATE would be one of the hottest queries in the app.
const THROTTLE_MS = 5 * 60 * 1000;
const lastTouch = new Map(); // userId → ms timestamp of the last DB write

export function touchLastActive(userId) {
  const now = Date.now();
  const prev = lastTouch.get(userId);
  if (prev && now - prev < THROTTLE_MS) return;
  lastTouch.set(userId, now);
  query(`UPDATE users SET last_active_at = NOW() WHERE user_id = $1`, [userId])
    .catch(err => console.error('[activity] last_active_at update failed:', err));
}
