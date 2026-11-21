/**
 * Prompt 89 — the waitlist access gate. A 'waiting' account is real (can log
 * in, verify email, change Settings, delete itself) but every other API
 * answers 403 'waitlisted' until a site admin lets them in.
 *
 * Built exactly like requireConsent: decodes the cookie itself and passes
 * through when there's no or a bad token, so it runs ahead of any route's
 * own requireAuth and never duplicates that 401 logic. Mounted right after
 * requireConsent in index.js.
 */
import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';

// Mounted as app.use('/api', requireAccess) — Express strips the '/api'
// mount prefix before this runs, so req.path here is already relative
// (e.g. '/account/delete'), not '/api/account/delete'.
const ALLOWED_PREFIXES = ['/waitlist', '/account'];

const CACHE_TTL_MS = 30_000;
const statusCache = new Map(); // userId -> { status, expiresAt }

async function _accessStatus(userId) {
  const cached = statusCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.status;

  const { rows } = await query('SELECT access_status FROM users WHERE user_id = $1', [userId]);
  const status = rows[0]?.access_status ?? 'active';
  statusCache.set(userId, { status, expiresAt: Date.now() + CACHE_TTL_MS });
  return status;
}

// Call wherever a user is let in so the cache doesn't serve 'waiting' for up
// to 30s after the DB flips to 'active'.
export function invalidateAccessStatus(userId) {
  statusCache.delete(userId);
}

export async function requireAccess(req, res, next) {
  if (ALLOWED_PREFIXES.some(p => req.path.startsWith(p))) return next();

  const token = req.cookies?.token;
  if (!token) return next();

  let userId;
  try {
    userId = jwt.verify(token, process.env.JWT_SECRET).userId;
  } catch {
    return next();
  }

  try {
    const status = await _accessStatus(userId);
    if (status === 'waiting') {
      return res.status(403).json({ code: 'waitlisted', error: "You're on the waitlist." });
    }
    next();
  } catch (err) {
    console.error('[requireAccess]', err);
    res.status(500).json({ error: 'Authorization check failed.' });
  }
}
