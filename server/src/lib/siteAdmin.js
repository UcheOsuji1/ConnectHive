/**
 * Site admins come from an env var, not the database — SITE_ADMIN_EMAILS,
 * comma-separated. There is no admin role/flag anywhere in the schema; this
 * is the single source of truth for "is this person TrueHive staff."
 */
import { query } from '../db/index.js';

let cachedEmails = null;

function _adminEmails() {
  if (cachedEmails) return cachedEmails;
  const raw = process.env.SITE_ADMIN_EMAILS ?? '';
  cachedEmails = new Set(raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean));
  return cachedEmails;
}

export async function isSiteAdmin(userId) {
  const emails = _adminEmails();
  if (emails.size === 0 || !userId) return false;
  const { rows: [user] } = await query('SELECT email FROM users WHERE user_id = $1', [userId]);
  if (!user) return false;
  return emails.has(user.email.toLowerCase());
}

// 404, never 403 — the admin area must not confirm its own existence to
// someone who isn't on the list. Must chain after requireAuth (reads req.userId).
export async function requireSiteAdmin(req, res, next) {
  try {
    if (!(await isSiteAdmin(req.userId))) {
      return res.status(404).json({ error: 'Not found.' });
    }
    next();
  } catch (err) {
    console.error('[siteAdmin/requireSiteAdmin]', err);
    res.status(404).json({ error: 'Not found.' });
  }
}
