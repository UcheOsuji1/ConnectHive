import { query, getClient } from '../db/index.js';
import { getSetting, setSetting, letInNext, letIn, PLACE_CTE } from '../lib/siteWaitlist.js';
import { sendLetInEmail } from '../lib/email.js';
import { invalidateAccessStatus } from '../middleware/access.js';
import { reportProblem } from '../lib/reportProblem.js';

const PAGE_SIZE = 50;

function _sendLetInEmails(changed) {
  for (const { userId, place } of changed) {
    sendLetInEmail(userId, { place }).catch(e =>
      reportProblem('[admin/waitlist] sendLetInEmail failed', { userId, error: e.message }));
    invalidateAccessStatus(userId);
  }
}

export async function getWaitlistQueue(req, res) {
  try {
    const { city, wants, meet, q } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const clauses = [`sw.status = 'waiting'`];
    const vals = [];
    if (city)  { vals.push(`%${city}%`); clauses.push(`sw.city ILIKE $${vals.length}`); }
    if (wants) { vals.push(JSON.stringify([wants])); clauses.push(`sw.wants @> $${vals.length}::jsonb`); }
    if (meet)  { vals.push(meet); clauses.push(`sw.meet_pref = $${vals.length}`); }
    if (q) {
      vals.push(`%${q}%`);
      clauses.push(`(p.full_name ILIKE $${vals.length} OR u.email ILIKE $${vals.length})`);
    }
    const where = clauses.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*)::int AS n FROM site_waitlist sw
         JOIN users u ON u.user_id = sw.user_id
         LEFT JOIN profiles p ON p.user_id = sw.user_id
        WHERE ${where}`,
      vals,
    );
    const matchCount = countResult.rows[0].n;

    const rowsResult = await query(
      `${PLACE_CTE}
       SELECT sw.user_id, u.email, u.email_verified, p.full_name, sw.city, sw.wants, sw.meet_pref,
              sw.created_at, COALESCE(c.credits, 0) AS credits,
              (COALESCE(c.credits, 0) >= 3) AS priority, r.place
         FROM site_waitlist sw
         JOIN users u ON u.user_id = sw.user_id
         JOIN ranked r ON r.user_id = sw.user_id
         LEFT JOIN credits_cte c ON c.user_id = sw.user_id
         LEFT JOIN profiles p ON p.user_id = sw.user_id
        WHERE ${where}
        ORDER BY r.place ASC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      vals,
    );

    const [{ rows: [counts] }, waitlistEnabled, nextGroupSize, { rows: recentRaw }] = await Promise.all([
      query(
        `SELECT
           (SELECT COUNT(*)::int FROM site_waitlist WHERE status = 'waiting') AS waiting,
           (SELECT COUNT(*)::int FROM site_waitlist WHERE status = 'let_in') AS let_in,
           (SELECT COUNT(*)::int FROM site_waitlist WHERE created_at >= NOW() - INTERVAL '7 days') AS joined_this_week`,
      ),
      getSetting('waitlist_enabled'),
      getSetting('next_group_size'),
      query(
        `SELECT sw.user_id, p.full_name, u.email, sw.let_in_reason, sw.let_in_at
           FROM site_waitlist sw
           JOIN users u ON u.user_id = sw.user_id
           LEFT JOIN profiles p ON p.user_id = sw.user_id
          WHERE sw.status = 'let_in'
          ORDER BY sw.let_in_at DESC LIMIT 20`,
      ),
    ]);

    const recent = recentRaw.map(r => ({
      userId: r.user_id,
      name: r.full_name || r.email,
      reason: r.let_in_reason,
      reasonText: r.let_in_reason === 'group'
        ? `Your group, ${new Date(r.let_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : r.let_in_reason === 'referrals_10' ? '10 friends invited'
        : 'Manual let-in',
      letInAt: r.let_in_at,
    }));

    res.json({
      settings: { waitlistEnabled: waitlistEnabled === true, nextGroupSize },
      counts: { waiting: counts.waiting, letIn: counts.let_in, joinedThisWeek: counts.joined_this_week },
      matchCount,
      rows: rowsResult.rows.map(r => ({
        place: r.place, userId: r.user_id, name: r.full_name || r.email, email: r.email,
        emailVerified: r.email_verified, city: r.city, wants: r.wants, meetPref: r.meet_pref,
        credits: r.credits, priority: r.priority, createdAt: r.created_at,
      })),
      recent,
    });
  } catch (err) {
    console.error('[adminWaitlist/getWaitlistQueue]', err);
    res.status(500).json({ error: 'Failed to load the waitlist queue.' });
  }
}

export async function updateWaitlistSettings(req, res) {
  try {
    const { waitlistEnabled, nextGroupSize } = req.body ?? {};

    if (waitlistEnabled !== undefined) {
      if (typeof waitlistEnabled !== 'boolean') return res.status(400).json({ error: 'waitlistEnabled must be a boolean.' });
      await setSetting('waitlist_enabled', waitlistEnabled);
    }
    if (nextGroupSize !== undefined) {
      if (nextGroupSize !== null && (!Number.isInteger(nextGroupSize) || nextGroupSize < 1 || nextGroupSize > 1000)) {
        return res.status(400).json({ error: 'nextGroupSize must be an integer from 1 to 1000, or null.' });
      }
      await setSetting('next_group_size', nextGroupSize);
    }

    res.json({
      waitlistEnabled: (await getSetting('waitlist_enabled')) === true,
      nextGroupSize: await getSetting('next_group_size'),
    });
  } catch (err) {
    console.error('[adminWaitlist/updateWaitlistSettings]', err);
    res.status(500).json({ error: 'Failed to save settings.' });
  }
}

export async function letInNextBatch(req, res) {
  try {
    const n = parseInt(req.body?.n, 10);
    if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'n must be a positive integer.' });

    const filters = req.body?.filters ?? {};
    const { changed, skippedUnverified } = await letInNext(n, filters);

    // The group that justified "spots in the next group" just went in — a
    // stale leftover number would keep advertising a group that already
    // happened. Cleared unconditionally; flagged here as a judgment call
    // the prompt explicitly invited feedback on.
    await setSetting('next_group_size', null);

    _sendLetInEmails(changed);

    res.json({ letIn: changed.length, skippedUnverified });
  } catch (err) {
    console.error('[adminWaitlist/letInNextBatch]', err);
    res.status(500).json({ error: 'Failed to let people in.' });
  }
}

export async function letInOne(req, res) {
  try {
    const client = await getClient();
    let changed;
    try {
      await client.query('BEGIN');
      const { rows: [row] } = await client.query(
        `SELECT u.email_verified FROM site_waitlist sw JOIN users u ON u.user_id = sw.user_id WHERE sw.user_id = $1`,
        [req.params.id],
      );
      if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found.' }); }
      if (!row.email_verified) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This person has not verified their email yet.' }); }
      changed = await letIn(client, [req.params.id], { reason: 'manual', batchId: null });
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    if (!changed.length) return res.status(409).json({ error: 'This person is no longer waiting.' });
    _sendLetInEmails(changed);
    res.json({ ok: true });
  } catch (err) {
    console.error('[adminWaitlist/letInOne]', err);
    res.status(500).json({ error: 'Failed to let this person in.' });
  }
}
