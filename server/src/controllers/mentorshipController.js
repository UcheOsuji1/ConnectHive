// Mentorship (Prompt 64 Part 3, tool_key = 'mentorship') — mentor/mentee
// cards, topic-matched discovery, requests, and the accepted pairing's chat.
import { query, getClient } from '../db/index.js';
import { requireMembership } from '../lib/hiveMembership.js';
import { getPairScore } from '../lib/pairScoreCache.js';
import { createPairChannel } from '../lib/hiveChannels.js';
import { createNotification } from './notificationsController.js';

const MAX_PENDING_REQUESTS = 3;

function validateProfileBody(raw) {
  const role = raw?.role;
  if (!['mentor', 'mentee', 'both'].includes(role)) return { error: 'role must be mentor, mentee or both.' };

  const topics = (Array.isArray(raw?.topics) ? raw.topics : [])
    .map(t => String(t ?? '').trim()).filter(Boolean);
  if (topics.length < 1 || topics.length > 8) return { error: 'Pick between 1 and 8 topics.' };
  if (topics.some(t => t.length > 40)) return { error: 'Each topic must be 40 characters or fewer.' };

  const about = String(raw?.about ?? '').trim();
  if (about.length > 280) return { error: 'About must be 280 characters or fewer.' };

  let capacity = raw?.capacity;
  capacity = capacity == null ? 2 : Number(capacity);
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 5) {
    return { error: 'Capacity must be a whole number between 0 and 5.' };
  }

  return { role, topics, about, capacity, accepting: raw?.accepting !== false };
}

async function loadMyProfile(hiveId, userId) {
  const { rows: [p] } = await query(
    `SELECT * FROM hive_mentor_profiles WHERE hive_id = $1 AND user_id = $2`, [hiveId, userId]);
  return p ?? null;
}

// Open spots: capacity minus requests currently accepted — computed live, so
// it can never drift from the requests it's counting.
async function openSpotsFor(hiveId, mentorId, capacity) {
  const { rows: [r] } = await query(
    `SELECT COUNT(*)::int AS n FROM hive_mentor_requests
      WHERE hive_id = $1 AND mentor_id = $2 AND status = 'accepted'`,
    [hiveId, mentorId],
  );
  return Math.max(0, capacity - r.n);
}

// ── GET /api/hives/:id/tools/mentorship/profile ───────────────────────────────
export const getMyProfile = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const profile = await loadMyProfile(hiveId, req.userId);
    res.json({ profile });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[mentorship/getMyProfile]', err);
    res.status(500).json({ error: 'Failed to load your mentorship profile.' });
  }
};

// ── PUT /api/hives/:id/tools/mentorship/profile ───────────────────────────────
export const upsertMyProfile = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const v = validateProfileBody(req.body);
    if (v.error) return res.status(400).json({ error: v.error });

    const { rows: [p] } = await query(
      `INSERT INTO hive_mentor_profiles (hive_id, user_id, role, topics, about, capacity, accepting, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (hive_id, user_id) DO UPDATE SET
         role = EXCLUDED.role, topics = EXCLUDED.topics, about = EXCLUDED.about,
         capacity = EXCLUDED.capacity, accepting = EXCLUDED.accepting, updated_at = NOW()
       RETURNING *`,
      [hiveId, req.userId, v.role, v.topics, v.about, v.capacity, v.accepting],
    );
    res.json({ profile: p });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[mentorship/upsertMyProfile]', err);
    res.status(500).json({ error: 'Failed to save your mentorship profile.' });
  }
};

// ── DELETE /api/hives/:id/tools/mentorship/profile ────────────────────────────
export const deleteMyProfile = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    await query(`DELETE FROM hive_mentor_profiles WHERE hive_id = $1 AND user_id = $2`, [hiveId, req.userId]);
    res.json({ deleted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[mentorship/deleteMyProfile]', err);
    res.status(500).json({ error: 'Failed to remove your mentorship profile.' });
  }
};

// ── GET /api/hives/:id/tools/mentorship/mentors ───────────────────────────────
// Ranked by topic overlap, then by the same cached pair score every other
// surface uses — never shown as a number, just the ordering.
export const listMentors = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const mine = await loadMyProfile(hiveId, req.userId);
    const myTopics = (mine?.topics ?? []).map(t => t.toLowerCase());

    const { rows: mentors } = await query(
      `SELECT mp.*, pr.full_name, pr.profile_photo_url
         FROM hive_mentor_profiles mp
         JOIN hive_members hm ON hm.hive_id = mp.hive_id AND hm.user_id = mp.user_id AND hm.membership_status = 'active'
         JOIN users u ON u.user_id = mp.user_id AND u.account_status = 'active'
         LEFT JOIN profiles pr ON pr.user_id = mp.user_id
        WHERE mp.hive_id = $1 AND mp.role IN ('mentor','both') AND mp.accepting = TRUE AND mp.user_id != $2`,
      [hiveId, req.userId],
    );

    const { rows: myProfileRow } = await query(`SELECT * FROM profiles WHERE user_id = $1`, [req.userId]);
    const myFullProfile = myProfileRow[0];

    const shaped = [];
    for (const m of mentors) {
      const openSpots = await openSpotsFor(hiveId, m.user_id, m.capacity);
      if (openSpots <= 0) continue;
      const overlap = m.topics.filter(t => myTopics.includes(t.toLowerCase()));
      const { rows: [mentorProfileRow] } = await query(`SELECT * FROM profiles WHERE user_id = $1`, [m.user_id]);
      const { total } = myFullProfile && mentorProfileRow
        ? await getPairScore(myFullProfile, mentorProfileRow)
        : { total: 0 };
      shaped.push({
        user_id: m.user_id, full_name: m.full_name, profile_photo_url: m.profile_photo_url,
        topics: m.topics, about: m.about, open_spots: openSpots,
        overlapping_topics: overlap,
        _overlapCount: overlap.length, _pairScore: total, // sort keys only — stripped below
      });
    }

    shaped.sort((a, b) => b._overlapCount - a._overlapCount || b._pairScore - a._pairScore);
    // No numeric score reaches the client — the ordering (and the
    // highlighted overlapping topics) is the only explanation shown.
    res.json({ mentors: shaped.map(({ _overlapCount, _pairScore, ...rest }) => rest) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[mentorship/listMentors]', err);
    res.status(500).json({ error: 'Failed to load mentors.' });
  }
};

// ── POST /api/hives/:id/tools/mentorship/requests ─────────────────────────────
export const createRequest = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const mentorId = req.body?.mentorId;
    const message = String(req.body?.message ?? '').trim();
    if (!mentorId) return res.status(400).json({ error: 'mentorId is required.' });
    if (message.length < 1 || message.length > 500) {
      return res.status(400).json({ error: 'Message must be 1-500 characters.' });
    }
    if (mentorId === req.userId) return res.status(400).json({ error: 'You can’t request yourself.' });

    const { rows: [mentor] } = await query(
      `SELECT * FROM hive_mentor_profiles WHERE hive_id = $1 AND user_id = $2`, [hiveId, mentorId]);
    if (!mentor || !['mentor', 'both'].includes(mentor.role) || !mentor.accepting) {
      return res.status(400).json({ error: 'This person isn’t accepting mentorship requests right now.' });
    }
    const openSpots = await openSpotsFor(hiveId, mentorId, mentor.capacity);
    if (openSpots <= 0) return res.status(409).json({ error: 'This mentor has no open spots right now.' });

    const { rows: [pendingCount] } = await query(
      `SELECT COUNT(*)::int AS n FROM hive_mentor_requests
        WHERE hive_id = $1 AND mentee_id = $2 AND status = 'pending'`,
      [hiveId, req.userId],
    );
    if (pendingCount.n >= MAX_PENDING_REQUESTS) {
      return res.status(400).json({ error: `You can have at most ${MAX_PENDING_REQUESTS} pending requests at once.` });
    }

    const { rows: [existing] } = await query(
      `SELECT request_id FROM hive_mentor_requests
        WHERE hive_id = $1 AND mentee_id = $2 AND mentor_id = $3 AND status = 'pending'`,
      [hiveId, req.userId, mentorId],
    );
    if (existing) return res.status(400).json({ error: 'You already have a pending request with this mentor.' });

    const { rows: [r] } = await query(
      `INSERT INTO hive_mentor_requests (hive_id, mentee_id, mentor_id, message) VALUES ($1,$2,$3,$4) RETURNING *`,
      [hiveId, req.userId, mentorId, message],
    );

    const { rows: [myProfile] } = await query(`SELECT full_name FROM profiles WHERE user_id = $1`, [req.userId]);
    await createNotification({
      userId: mentorId, type: 'mentor_request', category: 'matches',
      title: `${myProfile?.full_name ?? 'Someone'} requested mentorship`,
      body: message.slice(0, 140),
      hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/tools/mentorship?tab=requests`,
    }).catch(e => console.error('[mentorship/createRequest] notify failed', e));

    res.status(201).json({ request: r });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[mentorship/createRequest]', err);
    res.status(500).json({ error: 'Failed to send this request.' });
  }
};

async function shapeRequests(rows) {
  const ids = [...new Set(rows.flatMap(r => [r.mentee_id, r.mentor_id]))];
  const { rows: profiles } = ids.length
    ? await query(`SELECT user_id, full_name, profile_photo_url FROM profiles WHERE user_id = ANY($1)`, [ids])
    : { rows: [] };
  const byId = Object.fromEntries(profiles.map(p => [p.user_id, p]));
  return rows.map(r => ({
    request_id: r.request_id, status: r.status, message: r.message,
    created_at: r.created_at, decided_at: r.decided_at, channel_id: r.channel_id,
    mentee: byId[r.mentee_id] ?? { user_id: r.mentee_id, full_name: 'Member' },
    mentor: byId[r.mentor_id] ?? { user_id: r.mentor_id, full_name: 'Member' },
  }));
}

// ── GET /api/hives/:id/tools/mentorship/requests?direction=incoming|outgoing ──
export const listRequests = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const direction = req.query.direction === 'outgoing' ? 'outgoing' : 'incoming';
    const column = direction === 'outgoing' ? 'mentee_id' : 'mentor_id';

    const { rows } = await query(
      `SELECT * FROM hive_mentor_requests WHERE hive_id = $1 AND ${column} = $2
        ORDER BY (status = 'pending') DESC, created_at DESC`,
      [hiveId, req.userId],
    );
    res.json({ requests: await shapeRequests(rows) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[mentorship/listRequests]', err);
    res.status(500).json({ error: 'Failed to load requests.' });
  }
};

// ── GET /api/hives/:id/tools/mentorship/mine ──────────────────────────────────
// Accepted (and ended) mentorships either as mentor or mentee.
export const listMine = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const { rows } = await query(
      `SELECT * FROM hive_mentor_requests
        WHERE hive_id = $1 AND (mentee_id = $2 OR mentor_id = $2) AND status IN ('accepted','ended')
        ORDER BY (status = 'accepted') DESC, decided_at DESC`,
      [hiveId, req.userId],
    );
    res.json({ mentorships: await shapeRequests(rows) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[mentorship/listMine]', err);
    res.status(500).json({ error: 'Failed to load your mentorships.' });
  }
};

async function loadRequestForUser(hiveId, requestId, userId) {
  const { rows: [r] } = await query(`SELECT * FROM hive_mentor_requests WHERE request_id = $1`, [requestId]);
  if (!r || r.hive_id !== hiveId) { const err = new Error('Request not found.'); err.status = 404; throw err; }
  if (r.mentee_id !== userId && r.mentor_id !== userId) {
    const err = new Error('Not your request.'); err.status = 403; throw err;
  }
  return r;
}

// ── POST /api/hives/:id/tools/mentorship/requests/:requestId/accept ──────────
export const acceptRequest = async (req, res) => {
  const client = await getClient();
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadRequestForUser(hiveId, req.params.requestId, req.userId);
    if (existing.mentor_id !== req.userId) return res.status(403).json({ error: 'Only the mentor can accept this request.' });
    if (existing.status !== 'pending') return res.status(400).json({ error: 'This request is no longer pending.' });

    let channelId;
    try {
      await client.query('BEGIN');
      // Lock the mentor's profile row so two concurrent accepts can't both
      // succeed past capacity.
      const { rows: [profile] } = await client.query(
        `SELECT capacity FROM hive_mentor_profiles WHERE hive_id = $1 AND user_id = $2 FOR UPDATE`,
        [hiveId, req.userId],
      );
      const { rows: [accepted] } = await client.query(
        `SELECT COUNT(*)::int AS n FROM hive_mentor_requests WHERE hive_id = $1 AND mentor_id = $2 AND status = 'accepted'`,
        [hiveId, req.userId],
      );
      if (!profile || accepted.n >= profile.capacity) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'No open spots left.' });
      }

      channelId = await createPairChannel(client, hiveId, [existing.mentee_id, existing.mentor_id], 'mentorship');
      await client.query(
        `UPDATE hive_mentor_requests SET status = 'accepted', channel_id = $1, decided_at = NOW() WHERE request_id = $2`,
        [channelId, existing.request_id],
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await createNotification({
      userId: existing.mentee_id, type: 'mentor_accepted', category: 'matches',
      title: 'Your mentorship request was accepted!',
      body: 'Say hello and get started.',
      hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/chat/${channelId}`,
    }).catch(e => console.error('[mentorship/acceptRequest] notify failed', e));

    const { rows: [updated] } = await query(`SELECT * FROM hive_mentor_requests WHERE request_id = $1`, [existing.request_id]);
    res.json({ request: (await shapeRequests([updated]))[0] });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[mentorship/acceptRequest]', err);
    res.status(500).json({ error: 'Failed to accept this request.' });
  }
};

// ── POST /api/hives/:id/tools/mentorship/requests/:requestId/decline ─────────
export const declineRequest = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadRequestForUser(hiveId, req.params.requestId, req.userId);
    if (existing.mentor_id !== req.userId) return res.status(403).json({ error: 'Only the mentor can decline this request.' });
    if (existing.status !== 'pending') return res.status(400).json({ error: 'This request is no longer pending.' });

    await query(`UPDATE hive_mentor_requests SET status = 'declined', decided_at = NOW() WHERE request_id = $1`, [existing.request_id]);
    await createNotification({
      userId: existing.mentee_id, type: 'mentor_declined', category: 'matches',
      title: 'A mentorship request was declined.',
      hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/tools/mentorship`,
    }).catch(e => console.error('[mentorship/declineRequest] notify failed', e));
    res.json({ declined: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[mentorship/declineRequest]', err);
    res.status(500).json({ error: 'Failed to decline this request.' });
  }
};

// ── POST /api/hives/:id/tools/mentorship/requests/:requestId/withdraw ────────
export const withdrawRequest = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadRequestForUser(hiveId, req.params.requestId, req.userId);
    if (existing.mentee_id !== req.userId) return res.status(403).json({ error: 'Only the mentee can withdraw this request.' });
    if (existing.status !== 'pending') return res.status(400).json({ error: 'This request is no longer pending.' });

    await query(`UPDATE hive_mentor_requests SET status = 'withdrawn', decided_at = NOW() WHERE request_id = $1`, [existing.request_id]);
    res.json({ withdrawn: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[mentorship/withdrawRequest]', err);
    res.status(500).json({ error: 'Failed to withdraw this request.' });
  }
};

// ── POST /api/hives/:id/tools/mentorship/requests/:requestId/end ─────────────
// Either side. The chat (channel kind='pair') stays readable to both — it's
// simply never writable again, enforced in messagesController's createMessage
// by checking for an 'ended' request on the channel.
export const endMentorship = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadRequestForUser(hiveId, req.params.requestId, req.userId);
    if (existing.status !== 'accepted') return res.status(400).json({ error: 'This mentorship isn’t active.' });

    await query(`UPDATE hive_mentor_requests SET status = 'ended', decided_at = NOW() WHERE request_id = $1`, [existing.request_id]);
    const otherId = existing.mentee_id === req.userId ? existing.mentor_id : existing.mentee_id;
    await createNotification({
      userId: otherId, type: 'mentor_ended', category: 'matches',
      title: 'A mentorship has ended.',
      body: 'The chat is still here to read, but won’t take new messages.',
      hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/chat/${existing.channel_id}`,
    }).catch(e => console.error('[mentorship/endMentorship] notify failed', e));
    res.json({ ended: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[mentorship/endMentorship]', err);
    res.status(500).json({ error: 'Failed to end this mentorship.' });
  }
};

// Used by messagesController to block new messages in an ended mentorship's
// pair channel — exported so that check has no reason to duplicate this
// query's shape.
export async function isEndedMentorshipChannel(channelId) {
  const { rows: [r] } = await query(
    `SELECT 1 FROM hive_mentor_requests WHERE channel_id = $1 AND status = 'ended'`, [channelId]);
  return !!r;
}
