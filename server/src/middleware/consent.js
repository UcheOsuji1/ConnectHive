/**
 * Closes two gaps at once: the 23 pre-existing accounts that signed up
 * before date_of_birth/terms were collected, and Google signup, which has
 * never asked for a birth date (OAuth only hands over name/email).
 *
 * Applied globally to every /api/* route EXCEPT /api/auth/* (registered
 * before this) — a session that hasn't confirmed both yet gets 428 on
 * anything else, including its own /api/account/delete, until it resolves
 * via POST /api/auth/consent.
 *
 * Deliberately independent of requireAuth: this runs before any individual
 * router's own requireAuth, so it decodes the cookie itself. No cookie, an
 * invalid one, or no matching user all just pass through — there is nothing
 * to gate without a known identity, and the route's own requireAuth (if any)
 * is what actually 401s those cases.
 */
import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';
import { POLICY_VERSION } from '../lib/policy.js';

export async function requireConsent(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return next();

  let userId;
  try {
    userId = jwt.verify(token, process.env.JWT_SECRET).userId;
  } catch {
    return next();
  }

  try {
    const { rows: [user] } = await query(
      `SELECT date_of_birth, terms_policy_version FROM users WHERE user_id = $1`,
      [userId],
    );
    if (!user) return next();

    if (user.date_of_birth === null || user.terms_policy_version !== POLICY_VERSION) {
      return res.status(428).json({ needsConsent: true });
    }
    next();
  } catch (err) {
    console.error('[requireConsent]', err);
    res.status(500).json({ error: 'Authorization check failed.' });
  }
}
