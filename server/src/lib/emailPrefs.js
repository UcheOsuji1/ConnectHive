// Unsubscribe tokens and the send-time preference gate shared by every
// non-account email (joins, digest, news). Account emails (verify, reset,
// deletion) are unaffected — they don't go through sendIfAllowed and carry
// no unsubscribe link, since there's no preference to turn them off.
import crypto from 'crypto';
import { query } from '../db/index.js';
import { sendEmail } from './email.js';

const CATEGORIES = ['joins', 'digest', 'news'];
const CLIENT_URL = process.env.CLIENT_URL;
const API_BASE   = process.env.API_URL || 'https://api.truehive.app';

function hmac(input) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(input).digest('base64url');
}

// One-way, stateless — verified by recomputing the same HMAC, not stored.
export function unsubscribeToken(userId, category) {
  return hmac(`${userId}:${category}`);
}

export function verifyUnsubscribeToken(userId, category, token) {
  if (!userId || !category || !token || !CATEGORIES.includes(category)) return false;
  const expected = unsubscribeToken(userId, category);
  // Constant-time compare — this is a bearer credential (anyone with the
  // link can flip the flag with no login), so timing must not leak it.
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function unsubscribeUrl(userId, category) {
  const t = unsubscribeToken(userId, category);
  return `${API_BASE}/api/email/unsubscribe?u=${userId}&c=${category}&t=${t}`;
}

// Resend's `headers` option — RFC 8058 one-click unsubscribe. Every
// non-account email passes this through unchanged.
export function unsubscribeHeaders(userId, category) {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl(userId, category)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

const FLAG_COLUMN = { joins: 'email_joins', digest: 'email_digest', news: 'email_news' };

// The one gate every join/digest/news email passes through: the category
// flag, plus account_status='active' and email_verified — an unverified
// address never receives a join, digest or news email, only the
// verification email itself.
export async function sendIfAllowed(userId, category, buildFn) {
  if (!CATEGORIES.includes(category)) throw new Error(`Unknown email category: ${category}`);
  const col = FLAG_COLUMN[category];
  const { rows: [user] } = await query(
    `SELECT email, ${col} AS allowed, account_status, email_verified FROM users WHERE user_id = $1`,
    [userId],
  );
  if (!user) return false;
  if (!user.allowed) return false;
  if (user.account_status !== 'active') return false;
  if (!user.email_verified) return false;

  const built = await buildFn(user);
  if (!built) return false;
  await sendEmail({
    to: user.email,
    subject: built.subject,
    html: built.html,
    text: built.text,
    headers: unsubscribeHeaders(userId, category),
  });
  return true;
}

export { CATEGORIES as EMAIL_CATEGORIES };
