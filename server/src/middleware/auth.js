import jwt   from 'jsonwebtoken';
import { query } from '../db/index.js';

// Cache DB token_version lookups to avoid a per-request query.
// Entries expire after 30s — old sessions are rejected within that window after logout.
const versionCache  = new Map(); // userId → { version, expiresAt }
const CACHE_TTL_MS  = 30_000;

async function _dbTokenVersion(userId) {
  const cached = versionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.version;

  const { rows } = await query('SELECT token_version FROM users WHERE user_id = $1', [userId]);
  const version = rows[0]?.token_version ?? 0;
  versionCache.set(userId, { version, expiresAt: Date.now() + CACHE_TTL_MS });
  return version;
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
      const dbVersion = await _dbTokenVersion(payload.userId);
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
