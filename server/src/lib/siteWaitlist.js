/**
 * Prompt 89 — the site-wide waitlist. Single source of truth for:
 *   - site_settings (waitlist_enabled, next_group_size), cached 30s
 *   - place-in-line math (Priority first, then effective_seq, then joined_seq)
 *   - referral credits and the 3/10/25 reward tiers
 *   - letting people in (one transaction: site_waitlist + users.access_status)
 *
 * Unrelated to the `waitlist` table (category/location queue for Hive
 * matching, used elsewhere) — that table is untouched by this file.
 *
 * credits are never cached on site_waitlist. Every read recomputes
 * COUNT(*) FROM site_referrals WHERE referrer_user_id=$1 AND credited_at IS
 * NOT NULL. That is what lets account purge (site_referrals has two
 * ON DELETE CASCADE user FKs) correctly shrink a live count with zero extra
 * purge-job code — see purgeJob.js's dynamic FK scan, which already picks up
 * both new tables.
 */
import crypto from 'crypto';
import { query, getClient } from '../db/index.js';
import { CATEGORY_NAME_MAP } from '../controllers/hivesController.js';

export const CATEGORY_KEYS = Object.keys(CATEGORY_NAME_MAP); // social, professional, travel, project, event, specialized
export const MEET_PREFS = ['online', 'in_person', 'both'];

// Short display names for the waitlist's "you said you're looking for…" line
// and the admin table — CATEGORY_NAME_MAP's own names ("Social Groups") read
// stiff in a sentence, so this trims them the way the Prompt 89 mockup does.
export const CATEGORY_SHORT_LABELS = {
  social: 'Social', professional: 'Professional', travel: 'Travel',
  project: 'Project Collab', event: 'Event', specialized: 'Specialized',
};

const PRIORITY_CREDITS      = 3;
const SKIP_LINE_CREDITS     = 10;
const FREE_MONTH_CREDITS    = 25;
const MOVE_UP_PER_CREDIT    = 10;

// Alphabet excludes 0/O, 1/I/l — the ambiguous characters the prompt calls out.
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function _randomCode(len = 8) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

// ── site_settings ────────────────────────────────────────────────────────────

const SETTINGS_TTL_MS = 30_000;
let settingsCache = null; // Map<key, value> | null
let settingsCacheAt = 0;

function _clearSettingsCache() {
  settingsCache = null;
}

async function _loadSettings(db = query) {
  if (settingsCache && Date.now() - settingsCacheAt < SETTINGS_TTL_MS) return settingsCache;
  const { rows } = await db('SELECT key, value FROM site_settings');
  settingsCache = new Map(rows.map(r => [r.key, r.value]));
  settingsCacheAt = Date.now();
  return settingsCache;
}

export async function getSetting(key) {
  const settings = await _loadSettings();
  return settings.has(key) ? settings.get(key) : null;
}

export async function setSetting(key, value) {
  await query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
  _clearSettingsCache();
}

export async function isWaitlistOn() {
  return (await getSetting('waitlist_enabled')) === true;
}

// ── Referral codes ───────────────────────────────────────────────────────────

async function _uniqueReferralCode(db) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = _randomCode(8);
    const { rows } = await db('SELECT 1 FROM site_waitlist WHERE referral_code = $1', [code]);
    if (!rows.length) return code;
  }
  throw new Error('Could not generate a unique referral code after 10 attempts.');
}

// ── createEntry ───────────────────────────────────────────────────────────────

// client is a pg client already inside the caller's transaction (the same one
// that just inserted the new user row). Never throws on a bad/missing refCode
// — an invalid code is ignored silently, per spec.
export async function createEntry(client, userId, { refCode } = {}) {
  const referralCode = await _uniqueReferralCode(client);

  let referrerUserId = null;
  if (refCode && /^[A-Za-z0-9]{8}$/.test(refCode)) {
    const { rows } = await client.query(
      `SELECT user_id FROM site_waitlist WHERE referral_code = $1`,
      [refCode],
    );
    // Self-referral is impossible by construction: the new user's own row
    // doesn't exist yet when this lookup runs, so it can never match itself.
    if (rows.length && rows[0].user_id !== userId) referrerUserId = rows[0].user_id;
  }

  await client.query(
    `INSERT INTO site_waitlist (user_id, referral_code, referred_by)
     VALUES ($1, $2, $3)`,
    [userId, referralCode, referrerUserId],
  );

  if (referrerUserId) {
    await client.query(
      `INSERT INTO site_referrals (referred_user_id, referrer_user_id) VALUES ($1, $2)`,
      [userId, referrerUserId],
    );
  }

  return { referralCode, referrerUserId };
}

// ── Tiers ─────────────────────────────────────────────────────────────────────

async function _liveCredits(db, userId) {
  const { rows } = await db(
    `SELECT COUNT(*)::int AS n FROM site_referrals WHERE referrer_user_id = $1 AND credited_at IS NOT NULL`,
    [userId],
  );
  return rows[0]?.n ?? 0;
}

// Re-checks an inviter's current live credit count against the 10/25 tiers.
// Safe to call any number of times: free_month_earned_at only ever gets set
// once (COALESCE), and letIn no-ops on anyone not currently 'waiting'.
export async function checkReferralTiers(client, userId) {
  const credits = await _liveCredits((...a) => client.query(...a), userId);

  if (credits >= FREE_MONTH_CREDITS) {
    await client.query(
      `UPDATE site_waitlist SET free_month_earned_at = COALESCE(free_month_earned_at, NOW()), updated_at = NOW()
        WHERE user_id = $1`,
      [userId],
    );
  }

  if (credits >= SKIP_LINE_CREDITS) {
    const { rows } = await client.query(
      `SELECT sw.status, u.email_verified FROM site_waitlist sw
       JOIN users u ON u.user_id = sw.user_id WHERE sw.user_id = $1`,
      [userId],
    );
    if (rows.length && rows[0].status === 'waiting' && rows[0].email_verified) {
      await letIn(client, [userId], { reason: 'referrals_10', batchId: null });
    }
  }

  return { credits };
}

// Credits the inviter of `referredUserId`, if any, and applies their tiers.
// Idempotent: a referral already credited is a no-op.
export async function creditReferral(client, referredUserId) {
  const { rows } = await client.query(
    `SELECT referrer_user_id, credited_at FROM site_referrals WHERE referred_user_id = $1`,
    [referredUserId],
  );
  if (!rows.length || rows[0].credited_at) return null;

  const referrerUserId = rows[0].referrer_user_id;
  await client.query(
    `UPDATE site_referrals SET credited_at = NOW() WHERE referred_user_id = $1`,
    [referredUserId],
  );

  return checkReferralTiers(client, referrerUserId);
}

// ── Place in line ────────────────────────────────────────────────────────────

// One query, one window function — no JS loop over the whole line. Exported
// so the admin queue listing can build on the exact same ordering/credits
// logic instead of a second, driftable copy of it.
export const PLACE_CTE = `
  WITH credits_cte AS (
    SELECT referrer_user_id AS user_id, COUNT(*)::int AS credits
      FROM site_referrals WHERE credited_at IS NOT NULL GROUP BY referrer_user_id
  ),
  ranked AS (
    SELECT sw.user_id,
           ROW_NUMBER() OVER (
             ORDER BY (COALESCE(c.credits, 0) >= ${PRIORITY_CREDITS}) DESC,
                      (sw.joined_seq - ${MOVE_UP_PER_CREDIT} * COALESCE(c.credits, 0)) ASC,
                      sw.joined_seq ASC
           ) AS place
      FROM site_waitlist sw
      LEFT JOIN credits_cte c ON c.user_id = sw.user_id
     WHERE sw.status = 'waiting'
  )`;

export async function getPlace(userId) {
  const { rows } = await query(
    `${PLACE_CTE} SELECT place FROM ranked WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.place ?? null;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

function _tierState(credits, reward) {
  const reached = credits >= reward;
  return { credits: reward, reached, remaining: reached ? 0 : reward - credits };
}

export async function getWaitlistView(userId) {
  const { rows: [entry] } = await query(
    `SELECT sw.*, u.email_verified
       FROM site_waitlist sw JOIN users u ON u.user_id = sw.user_id
      WHERE sw.user_id = $1`,
    [userId],
  );
  if (!entry) return null;

  const [{ rows: [counts] }, credits, place, settings] = await Promise.all([
    query(
      `SELECT
         (SELECT COUNT(*)::int FROM site_waitlist WHERE status = 'waiting') AS waiting_count,
         (SELECT COUNT(*)::int FROM site_waitlist WHERE status = 'let_in') AS let_in_count`,
    ),
    _liveCredits(query, userId),
    getPlace(userId),
    (async () => ({
      waitlistEnabled: (await getSetting('waitlist_enabled')) === true,
      nextGroupSize:   await getSetting('next_group_size'),
    }))(),
  ]);

  const leaderboard = await _leaderboard(userId);

  return {
    place,
    waitingCount: counts.waiting_count,
    letInCount:   counts.let_in_count,
    nextGroupSize: settings.nextGroupSize,
    referralLink: `${(process.env.CLIENT_URL || '').replace(/\/$/, '')}/join/${entry.referral_code}`,
    referralCode: entry.referral_code,
    credits,
    tiers: {
      priority:  _tierState(credits, PRIORITY_CREDITS),
      skipLine:  _tierState(credits, SKIP_LINE_CREDITS),
      freeMonth: { ...(_tierState(credits, FREE_MONTH_CREDITS)), earned: Boolean(entry.free_month_earned_at) },
    },
    answers: {
      fullName: null, // filled by the route from profiles.full_name
      wants: entry.wants,
      city: entry.city,
      meetPref: entry.meet_pref,
    },
    showOnLeaderboard: entry.show_on_leaderboard,
    emailVerified: entry.email_verified,
    status: entry.status,
    leaderboard,
  };
}

async function _leaderboard(viewerUserId) {
  const { rows } = await query(
    `SELECT sr.referrer_user_id AS user_id, COUNT(*)::int AS week_credits
       FROM site_referrals sr
      WHERE sr.credited_at >= NOW() - INTERVAL '7 days'
      GROUP BY sr.referrer_user_id
      ORDER BY week_credits DESC`,
  );
  if (!rows.length) {
    return { top: [], viewer: null, empty: true };
  }

  const userIds = rows.map(r => r.user_id);
  const { rows: people } = await query(
    `SELECT sw.user_id, sw.show_on_leaderboard, p.full_name
       FROM site_waitlist sw LEFT JOIN profiles p ON p.user_id = sw.user_id
      WHERE sw.user_id = ANY($1)`,
    [userIds],
  );
  const byId = new Map(people.map(p => [p.user_id, p]));

  const display = (fullName) => {
    if (!fullName) return 'Someone';
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0];
    const lastInitial = parts.length > 1 ? `${parts[parts.length - 1][0]}.` : '';
    return lastInitial ? `${first} ${lastInitial}` : first;
  };

  const ranked = rows.map((r, i) => ({
    userId: r.user_id,
    rank: i + 1,
    credits: r.week_credits,
    name: display(byId.get(r.user_id)?.full_name),
  }));

  const top = ranked.filter(r => byId.get(r.userId)?.show_on_leaderboard !== false).slice(0, 3);
  const viewerRanked = ranked.find(r => r.userId === viewerUserId);
  const viewer = viewerRanked
    ? { ...viewerRanked, name: 'You' }
    : { userId: viewerUserId, rank: null, credits: 0, name: 'You' };

  return { top, viewer, empty: false };
}

export async function getYoureInView(userId) {
  const { rows: [entry] } = await query(
    `SELECT sw.status, sw.let_in_reason, sw.let_in_batch_id, sw.let_in_at, p.full_name
       FROM site_waitlist sw LEFT JOIN profiles p ON p.user_id = sw.user_id
      WHERE sw.user_id = $1`,
    [userId],
  );
  if (!entry || entry.status !== 'let_in') return null;

  const credits = await _liveCredits(query, userId);

  let groupCount = 1;
  if (entry.let_in_batch_id) {
    const { rows: [g] } = await query(
      `SELECT COUNT(*)::int AS n FROM site_waitlist WHERE let_in_batch_id = $1`,
      [entry.let_in_batch_id],
    );
    groupCount = g.n;
  }

  return {
    reason: entry.let_in_reason,
    groupCount,
    letInAt: entry.let_in_at,
    credits,
    firstName: entry.full_name ? entry.full_name.trim().split(/\s+/)[0] : null,
    founderCallUrl: process.env.FOUNDER_CALL_URL || null,
  };
}

// ── Letting people in ────────────────────────────────────────────────────────

// Transaction: flips site_waitlist.status -> 'let_in' and users.access_status
// -> 'active' together. Skips (does not throw on) anyone not currently
// 'waiting' or not email-verified. Returns the users actually changed, with
// each one's place AT THE MOMENT OF LETTING IN (captured before the UPDATE,
// since once status flips to 'let_in' they drop out of the ranked query).
export async function letIn(client, userIds, { reason, batchId }) {
  if (!userIds.length) return [];

  const { rows: eligible } = await client.query(
    `SELECT sw.user_id FROM site_waitlist sw JOIN users u ON u.user_id = sw.user_id
      WHERE sw.user_id = ANY($1) AND sw.status = 'waiting' AND u.email_verified = TRUE`,
    [userIds],
  );
  if (!eligible.length) return [];
  const eligibleIds = eligible.map(r => r.user_id);

  const { rows: placed } = await client.query(
    `${PLACE_CTE} SELECT user_id, place FROM ranked WHERE user_id = ANY($1)`,
    [eligibleIds],
  );
  const placeByUser = new Map(placed.map(r => [r.user_id, r.place]));

  await client.query(
    `UPDATE site_waitlist SET status = 'let_in', let_in_at = NOW(), let_in_reason = $2,
            let_in_batch_id = $3, updated_at = NOW()
      WHERE user_id = ANY($1)`,
    [eligibleIds, reason, batchId ?? null],
  );
  await client.query(`UPDATE users SET access_status = 'active' WHERE user_id = ANY($1)`, [eligibleIds]);

  return eligibleIds.map(userId => ({ userId, place: placeByUser.get(userId) ?? null }));
}

// Picks from the top of the (filtered) line, in order, up to n verified
// users — skipping (and counting) any unverified rows encountered along the
// way. Returns the candidate userIds plus the skip count; the caller runs
// the actual letIn transaction and the post-commit side effects.
export async function letInCandidates(n, filters = {}) {
  const clauses = [`sw.status = 'waiting'`];
  const vals = [];
  if (filters.city) { vals.push(`%${filters.city}%`); clauses.push(`sw.city ILIKE $${vals.length}`); }
  if (filters.wants) { vals.push(JSON.stringify(filters.wants)); clauses.push(`sw.wants @> $${vals.length}::jsonb`); }
  if (filters.meet) { vals.push(filters.meet); clauses.push(`sw.meet_pref = $${vals.length}`); }

  const { rows } = await query(
    `${PLACE_CTE}
     SELECT sw.user_id, u.email_verified, r.place
       FROM site_waitlist sw
       JOIN users u ON u.user_id = sw.user_id
       JOIN ranked r ON r.user_id = sw.user_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY r.place ASC`,
    vals,
  );

  const chosen = [];
  let skippedUnverified = 0;
  for (const row of rows) {
    if (chosen.length >= n) break;
    if (!row.email_verified) { skippedUnverified++; continue; }
    chosen.push(row.user_id);
  }
  return { userIds: chosen, skippedUnverified };
}

export async function letInNext(n, filters = {}) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { userIds, skippedUnverified } = await letInCandidates(n, filters);
    const batchId = crypto.randomUUID();
    const changed = await letIn(client, userIds, { reason: 'group', batchId });
    await client.query('COMMIT');
    return { changed, skippedUnverified, batchId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
