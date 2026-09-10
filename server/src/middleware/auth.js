import jwt   from 'jsonwebtoken';
import { query } from '../db/index.js';

// Cache DB token_version lookups to avoid a per-request query.
// Exported so socket.js can reuse the same cache at connect time.
const versionCache  = new Map(); // userId → { version, expiresAt }
const CACHE_TTL_MS  = 30_000;

export async function dbTokenVersion(userId) {
  const cached = versionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.version;

  const { rows } = await query('SELECT token_version FROM users WHERE user_id = $1', [userId]);
  const version = rows[0]?.token_version ?? 0;
  versionCache.set(userId, { version, expiresAt: Date.now() + CACHE_TTL_MS });
  return version;
}

// Call this wherever token_version is incremented so the cache doesn't serve
// stale data for up to 30 seconds after a logout or password reset.
export function invalidateTokenVersion(userId) {
  versionCache.delete(userId);
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;

    // Verify the token's version matches the DB (detects post-logout sessions).
    if (payload.tokenVersion !== undefined) {
      const dbVersion = await dbTokenVersion(payload.userId);
      if (payload.tokenVersion !== dbVersion) {
        return res.status(401).json({ error: 'Session expired — please log in again' });
      }
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Session expired — please log in again' });
  }
}

// Alias kept for any file importing authenticate
export const authenticate = requireAuth;

// Must chain after requireAuth (relies on req.userId being set).
// Returns 403 if the account's email is unverified.
export function requireVerifiedEmail(req, res, next) {
  query('SELECT email_verified FROM users WHERE user_id = $1', [req.userId])
    .then(({ rows }) => {
      if (!rows.length) return res.status(401).json({ error: 'User not found.' });
      if (!rows[0].email_verified) {
        return res.status(403).json({
          error: 'Please verify your email address before joining or creating a Hive.',
        });
      }
      next();
    })
    .catch(err => {
      console.error('[requireVerifiedEmail]', err);
      return res.status(500).json({ error: 'Authorization check failed.' });
    });
}
