import { query } from '../db/index.js';
import { getWaitlistView, getYoureInView, CATEGORY_KEYS, MEET_PREFS } from '../lib/siteWaitlist.js';

export async function getMyWaitlist(req, res) {
  try {
    const view = await getWaitlistView(req.userId);
    if (!view) return res.status(404).json({ error: 'Not on the waitlist.' });

    const { rows: [profile] } = await query('SELECT full_name FROM profiles WHERE user_id = $1', [req.userId]);
    view.answers.fullName = profile?.full_name ?? null;

    res.json(view);
  } catch (err) {
    console.error('[waitlist/getMyWaitlist]', err);
    res.status(500).json({ error: 'Failed to load your waitlist status.' });
  }
}

export async function updateAnswers(req, res) {
  try {
    const { fullName, wants, city, meetPref, showOnLeaderboard } = req.body ?? {};

    const trimmedName = typeof fullName === 'string' ? fullName.trim() : '';
    if (!trimmedName || trimmedName.length > 80) {
      return res.status(400).json({ error: 'Your name is required (up to 80 characters).' });
    }
    if (wants !== undefined) {
      if (!Array.isArray(wants) || wants.some(w => !CATEGORY_KEYS.includes(w))) {
        return res.status(400).json({ error: 'Invalid group type selected.' });
      }
    }
    if (city !== undefined && city !== null && (typeof city !== 'string' || city.length > 120)) {
      return res.status(400).json({ error: 'City must be 120 characters or fewer.' });
    }
    if (meetPref !== undefined && meetPref !== null && !MEET_PREFS.includes(meetPref)) {
      return res.status(400).json({ error: 'Invalid meeting preference.' });
    }

    const { rows } = await query('SELECT 1 FROM site_waitlist WHERE user_id = $1', [req.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Not on the waitlist.' });

    await query(
      `INSERT INTO profiles (user_id, full_name) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET full_name = $2, updated_at = NOW()`,
      [req.userId, trimmedName],
    );

    await query(
      `UPDATE site_waitlist SET
         wants = COALESCE($2::jsonb, wants),
         city = COALESCE($3, city),
         meet_pref = COALESCE($4, meet_pref),
         show_on_leaderboard = COALESCE($5, show_on_leaderboard),
         updated_at = NOW()
       WHERE user_id = $1`,
      [req.userId, wants !== undefined ? JSON.stringify(wants) : null, city ?? null, meetPref ?? null,
       typeof showOnLeaderboard === 'boolean' ? showOnLeaderboard : null],
    );

    res.json({ saved: true });
  } catch (err) {
    console.error('[waitlist/updateAnswers]', err);
    res.status(500).json({ error: 'Failed to save your answers.' });
  }
}

export async function getYoureIn(req, res) {
  try {
    const view = await getYoureInView(req.userId);
    if (!view) return res.status(404).json({ error: 'Not let in yet.' });
    res.json(view);
  } catch (err) {
    console.error('[waitlist/getYoureIn]', err);
    res.status(500).json({ error: 'Failed to load this page.' });
  }
}

export async function markYoureInSeen(req, res) {
  try {
    await query(
      `UPDATE site_waitlist SET youre_in_seen_at = NOW() WHERE user_id = $1 AND youre_in_seen_at IS NULL`,
      [req.userId],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[waitlist/markYoureInSeen]', err);
    res.status(500).json({ error: 'Failed to update.' });
  }
}
