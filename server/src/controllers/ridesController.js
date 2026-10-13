// Ride board (Prompt 66 Part 2, tool_key = 'rides') — per plan, with a
// Tools-hub overview grouped by plan. CSS prefix (client): rd-.
import { query, getClient } from '../db/index.js';
import { requireMembership, requireCanPost } from '../lib/hiveMembership.js';
import { createPairChannel } from '../lib/hiveChannels.js';
import { createNotification } from './notificationsController.js';
import { getIO } from '../realtime/socket.js';
import { isBlockedEitherWay } from '../lib/blocks.js';

function broadcast(hiveId, postId, payload) {
  try { getIO()?.to(`hive:${hiveId}`).emit('rides_updated', { hive_id: hiveId, post_id: postId, ...payload }); }
  catch { /* no socket in tests */ }
}

async function requireOwnerAdmin(hiveId, userId) {
  const member = await requireMembership(hiveId, userId);
  if (member.role !== 'owner' && member.role !== 'admin') {
    const err = new Error('Only an owner or admin can do that.');
    err.status = 403;
    throw err;
  }
  return member;
}

async function loadPlanPost(hiveId, postId) {
  const { rows: [p] } = await query(
    `SELECT post_id, hive_id, headline, event_at, cancelled_at FROM hive_posts
      WHERE post_id = $1 AND hive_id = $2 AND post_type = 'event'`,
    [postId, hiveId],
  );
  if (!p) { const err = new Error('Plan not found.'); err.status = 404; throw err; }
  return p;
}

// Only members going (or maybe) to the plan can offer or request rides.
async function requireGoingOrMaybe(hiveId, postId, userId) {
  await requireCanPost(hiveId, userId);
  const { rows: [r] } = await query(
    `SELECT rsvp_status FROM event_rsvps WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
  if (!r || !['going', 'maybe'].includes(r.rsvp_status)) {
    const err = new Error('Only members going (or maybe going) to this plan can use the ride board.');
    err.status = 403;
    throw err;
  }
}

async function loadOffer(hiveId, offerId) {
  const { rows: [o] } = await query(
    `SELECT o.*, p.hive_id FROM plan_ride_offers o JOIN hive_posts p ON p.post_id = o.post_id
      WHERE o.offer_id = $1 AND p.hive_id = $2`,
    [offerId, hiveId],
  );
  if (!o) { const err = new Error('Ride offer not found.'); err.status = 404; throw err; }
  return o;
}

const person = (uid, name, photo) => ({ user_id: uid, full_name: name, profile_photo_url: photo });

// ── GET /api/hives/:id/tools/rides/overview ────────────────────────────────
// Tools -> Rides hub: every upcoming plan with any ride activity, grouped.
export const getRidesOverview = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const { rows } = await query(
      `SELECT p.post_id, p.headline, p.event_at, p.event_location,
              COUNT(DISTINCT o.offer_id) FILTER (WHERE o.cancelled_at IS NULL)::int AS offer_count,
              COUNT(DISTINCT r.request_id) FILTER (WHERE r.cancelled_at IS NULL)::int AS request_count
         FROM hive_posts p
         LEFT JOIN plan_ride_offers o ON o.post_id = p.post_id
         LEFT JOIN plan_ride_requests r ON r.post_id = p.post_id
        WHERE p.hive_id = $1 AND p.post_type = 'event' AND p.cancelled_at IS NULL
          AND p.event_at >= NOW() - INTERVAL '1 day'
        GROUP BY p.post_id
        HAVING COUNT(o.offer_id) > 0 OR COUNT(r.request_id) > 0
        ORDER BY p.event_at ASC`,
      [hiveId],
    );
    res.json({ plans: rows });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[rides/getRidesOverview]', err);
    res.status(500).json({ error: 'Failed to load the ride board overview.' });
  }
};

// ── GET /api/hives/:id/tools/rides/board?postId=X ──────────────────────────
export const getRideBoard = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const postId = req.query.postId;
    if (!postId) return res.status(400).json({ error: 'postId is required.' });
    const plan = await loadPlanPost(hiveId, postId);

    const [{ rows: offerRows }, { rows: requestRows }, { rows: seatRows }] = await Promise.all([
      query(
        `SELECT o.*, pr.full_name AS driver_name, pr.profile_photo_url AS driver_photo
           FROM plan_ride_offers o LEFT JOIN profiles pr ON pr.user_id = o.driver_id
          WHERE o.post_id = $1 AND o.cancelled_at IS NULL
          ORDER BY o.created_at ASC`,
        [postId],
      ),
      query(
        `SELECT r.*, pr.full_name AS rider_name, pr.profile_photo_url AS rider_photo
           FROM plan_ride_requests r LEFT JOIN profiles pr ON pr.user_id = r.rider_id
          WHERE r.post_id = $1 AND r.cancelled_at IS NULL
          ORDER BY r.created_at ASC`,
        [postId],
      ),
      query(
        `SELECT s.offer_id, s.rider_id, s.status, pr.full_name, pr.profile_photo_url
           FROM plan_ride_seats s
           JOIN plan_ride_offers o ON o.offer_id = s.offer_id
           LEFT JOIN profiles pr ON pr.user_id = s.rider_id
          WHERE o.post_id = $1`,
        [postId],
      ),
    ]);

    const seatsByOffer = {};
    for (const s of seatRows) (seatsByOffer[s.offer_id] ??= []).push(s);

    const offers = offerRows.map(o => {
      const seats = seatsByOffer[o.offer_id] ?? [];
      const confirmed = seats.filter(s => s.status === 'confirmed');
      const mySeat = seats.find(s => s.rider_id === req.userId);
      return {
        offer_id: o.offer_id, driver: person(o.driver_id, o.driver_name, o.driver_photo),
        seats: o.seats, seats_left: Math.max(0, o.seats - confirmed.length),
        leaving_from: o.leaving_from, departs_at: o.departs_at, note: o.note, created_at: o.created_at,
        is_mine: o.driver_id === req.userId,
        confirmed_riders: confirmed.map(s => person(s.rider_id, s.full_name, s.profile_photo_url)),
        requested_riders: o.driver_id === req.userId
          ? seats.filter(s => s.status === 'requested').map(s => person(s.rider_id, s.full_name, s.profile_photo_url))
          : [],
        my_seat_status: mySeat?.status ?? null,
      };
    });

    const requests = requestRows.map(r => ({
      request_id: r.request_id, rider: person(r.rider_id, r.rider_name, r.rider_photo),
      from_area: r.from_area, note: r.note, created_at: r.created_at, is_mine: r.rider_id === req.userId,
    }));

    res.json({
      plan: { post_id: plan.post_id, headline: plan.headline, event_at: plan.event_at },
      offers, requests,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[rides/getRideBoard]', err);
    res.status(500).json({ error: 'Failed to load the ride board.' });
  }
};

// ── POST /api/hives/:id/tools/rides/offers ─────────────────────────────────
export const createOffer = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const postId = req.body?.postId;
    if (!postId) return res.status(400).json({ error: 'postId is required.' });
    await loadPlanPost(hiveId, postId);
    await requireGoingOrMaybe(hiveId, postId, req.userId);

    const seats = Number(req.body?.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 8) return res.status(400).json({ error: 'seats must be a whole number between 1 and 8.' });
    const leavingFrom = String(req.body?.leavingFrom ?? '').trim();
    if (leavingFrom.length < 1 || leavingFrom.length > 80) return res.status(400).json({ error: 'leavingFrom must be 1-80 characters.' });
    const departsAt = req.body?.departsAt || null;
    if (departsAt && isNaN(new Date(departsAt).getTime())) return res.status(400).json({ error: 'departsAt must be a valid date/time.' });
    const note = String(req.body?.note ?? '');
    if (note.length > 280) return res.status(400).json({ error: 'note must be 280 characters or fewer.' });

    const { rows: [o] } = await query(
      `INSERT INTO plan_ride_offers (post_id, driver_id, seats, leaving_from, departs_at, note)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [postId, req.userId, seats, leavingFrom, departsAt, note],
    );
    broadcast(hiveId, postId, { kind: 'offer_created', offer_id: o.offer_id });
    res.status(201).json({ offer: o });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[rides/createOffer]', err);
    res.status(500).json({ error: 'Failed to post this ride offer.' });
  }
};

// ── DELETE /api/hives/:id/tools/rides/offers/:offerId ──────────────────────
// Notifies confirmed riders and frees (reopens) their open requests.
export const cancelOffer = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await requireMembership(hiveId, req.userId);
    const offer = await loadOffer(hiveId, req.params.offerId);
    const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
    if (offer.driver_id !== req.userId && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the driver or an owner/admin can cancel this offer.' });
    }

    const { rows: confirmedRiders } = await query(
      `SELECT rider_id FROM plan_ride_seats WHERE offer_id = $1 AND status = 'confirmed'`, [offer.offer_id]);

    await query(`UPDATE plan_ride_offers SET cancelled_at = NOW() WHERE offer_id = $1`, [offer.offer_id]);
    // Reopen each confirmed rider's own request for this plan, if they have one.
    await query(
      `UPDATE plan_ride_requests SET cancelled_at = NULL
        WHERE post_id = $1 AND rider_id = ANY($2) AND cancelled_at IS NOT NULL`,
      [offer.post_id, confirmedRiders.map(r => r.rider_id)],
    );

    const { rows: [{ headline }] } = await query(`SELECT headline FROM hive_posts WHERE post_id = $1`, [offer.post_id]);
    for (const r of confirmedRiders) {
      await createNotification({
        userId: r.rider_id, type: 'ride_offer_cancelled', category: 'plans',
        title: `A ride you were on for "${headline}" was cancelled`,
        hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/events/${offer.post_id}`,
      }).catch(e => console.error('[rides/cancelOffer] notify failed', e));
    }

    broadcast(hiveId, offer.post_id, { kind: 'offer_cancelled', offer_id: offer.offer_id });
    res.json({ cancelled: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[rides/cancelOffer]', err);
    res.status(500).json({ error: 'Failed to cancel this offer.' });
  }
};

// ── POST /api/hives/:id/tools/rides/requests ───────────────────────────────
export const createRequest = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const postId = req.body?.postId;
    if (!postId) return res.status(400).json({ error: 'postId is required.' });
    await loadPlanPost(hiveId, postId);
    await requireGoingOrMaybe(hiveId, postId, req.userId);

    const fromArea = String(req.body?.fromArea ?? '').trim();
    if (fromArea.length < 1 || fromArea.length > 80) return res.status(400).json({ error: 'fromArea must be 1-80 characters.' });
    const note = String(req.body?.note ?? '');
    if (note.length > 280) return res.status(400).json({ error: 'note must be 280 characters or fewer.' });

    const { rows: [r] } = await query(
      `INSERT INTO plan_ride_requests (post_id, rider_id, from_area, note) VALUES ($1,$2,$3,$4) RETURNING *`,
      [postId, req.userId, fromArea, note],
    );
    broadcast(hiveId, postId, { kind: 'request_created', request_id: r.request_id });
    res.status(201).json({ request: r });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[rides/createRequest]', err);
    res.status(500).json({ error: 'Failed to post this ride request.' });
  }
};

// ── DELETE /api/hives/:id/tools/rides/requests/:requestId ──────────────────
export const cancelRequest = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await requireMembership(hiveId, req.userId);
    const { rows: [r] } = await query(
      `SELECT rq.* FROM plan_ride_requests rq JOIN hive_posts p ON p.post_id = rq.post_id
        WHERE rq.request_id = $1 AND p.hive_id = $2`,
      [req.params.requestId, hiveId],
    );
    if (!r) return res.status(404).json({ error: 'Ride request not found.' });
    const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
    if (r.rider_id !== req.userId && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the rider or an owner/admin can cancel this request.' });
    }
    await query(`UPDATE plan_ride_requests SET cancelled_at = NOW() WHERE request_id = $1`, [r.request_id]);
    broadcast(hiveId, r.post_id, { kind: 'request_cancelled', request_id: r.request_id });
    res.json({ cancelled: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[rides/cancelRequest]', err);
    res.status(500).json({ error: 'Failed to cancel this request.' });
  }
};

// ── POST /api/hives/:id/tools/rides/offers/:offerId/request ────────────────
// A rider requests a seat on a specific driver's offer.
export const requestSeat = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const offer = await loadOffer(hiveId, req.params.offerId);
    if (offer.cancelled_at) return res.status(400).json({ error: 'This offer was cancelled.' });
    if (offer.driver_id === req.userId) return res.status(400).json({ error: "You can't request a seat on your own offer." });
    await requireGoingOrMaybe(hiveId, offer.post_id, req.userId);

    await query(
      `INSERT INTO plan_ride_seats (offer_id, rider_id, status) VALUES ($1,$2,'requested')
       ON CONFLICT (offer_id, rider_id) DO UPDATE SET status = 'requested' WHERE plan_ride_seats.status = 'declined'`,
      [offer.offer_id, req.userId],
    );

    const { rows: [me] } = await query(`SELECT full_name FROM profiles WHERE user_id = $1`, [req.userId]);
    await createNotification({
      userId: offer.driver_id, type: 'ride_seat_requested', category: 'plans',
      title: `${me?.full_name ?? 'Someone'} requested a seat in your ride`,
      hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/events/${offer.post_id}`,
    }).catch(e => console.error('[rides/requestSeat] notify failed', e));

    broadcast(hiveId, offer.post_id, { kind: 'seat_requested', offer_id: offer.offer_id, rider_id: req.userId });
    res.status(201).json({ requested: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[rides/requestSeat]', err);
    res.status(500).json({ error: 'Failed to request this seat.' });
  }
};

// ── POST /api/hives/:id/tools/rides/offers/:offerId/riders/:riderId/confirm ─
// No-overbooking, enforced transactionally. Creates (or extends) the ride's
// private chat with every confirmed rider — same hive_channels(kind='pair')
// mechanism Prompt 64 built, just looped over N members and a new
// created_for value ('ride').
export const confirmSeat = async (req, res) => {
  const client = await getClient();
  try {
    const hiveId = req.params.id;
    const member = await requireMembership(hiveId, req.userId);
    const offer = await loadOffer(hiveId, req.params.offerId);
    const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
    if (offer.driver_id !== req.userId && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the driver can confirm riders.' });
    }
    const riderId = req.params.riderId;

    let channelId = null;
    let justCreatedChannel = false;
    try {
      await client.query('BEGIN');
      const { rows: [locked] } = await client.query(
        `SELECT * FROM plan_ride_offers WHERE offer_id = $1 FOR UPDATE`, [offer.offer_id]);
      const { rows: [{ n: confirmedCount }] } = await client.query(
        `SELECT COUNT(*)::int AS n FROM plan_ride_seats WHERE offer_id = $1 AND status = 'confirmed'`, [offer.offer_id]);
      if (confirmedCount >= locked.seats) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No seats left on this offer.' });
      }
      await client.query(
        `INSERT INTO plan_ride_seats (offer_id, rider_id, status) VALUES ($1,$2,'confirmed')
         ON CONFLICT (offer_id, rider_id) DO UPDATE SET status = 'confirmed'`,
        [offer.offer_id, riderId],
      );
      // That rider's own open request for this plan is fulfilled.
      await client.query(
        `UPDATE plan_ride_requests SET cancelled_at = NOW() WHERE post_id = $1 AND rider_id = $2 AND cancelled_at IS NULL`,
        [offer.post_id, riderId],
      );

      channelId = locked.channel_id;
      if (!channelId) {
        channelId = await createPairChannel(client, hiveId, [offer.driver_id, riderId], 'ride');
        if (!channelId) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'This rider can’t be confirmed for this offer.' });
        }
        await client.query(`UPDATE plan_ride_offers SET channel_id = $1 WHERE offer_id = $2`, [channelId, offer.offer_id]);
        justCreatedChannel = true;
      } else {
        // A ride channel can grow past 2 people — createPairChannel's own
        // guard only ever sees the first two. Confirming a new rider onto an
        // already-existing group channel has to check them against every
        // member already in it, not just the driver.
        const { rows: existingMembers } = await client.query(
          `SELECT user_id FROM hive_channel_members WHERE channel_id = $1`, [channelId],
        );
        for (const m of existingMembers) {
          if (await isBlockedEitherWay(riderId, m.user_id)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'This rider can’t be confirmed for this offer.' });
          }
        }
        await client.query(
          `INSERT INTO hive_channel_members (channel_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [channelId, riderId],
        );
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    const { rows: [me] } = await query(`SELECT full_name FROM profiles WHERE user_id = $1`, [req.userId]);
    await createNotification({
      userId: riderId, type: 'ride_seat_confirmed', category: 'plans',
      title: `${me?.full_name ?? 'The driver'} confirmed your seat`,
      hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/chat/${channelId}`,
    }).catch(e => console.error('[rides/confirmSeat] notify failed', e));

    broadcast(hiveId, offer.post_id, { kind: 'seat_confirmed', offer_id: offer.offer_id, rider_id: riderId });
    res.json({ confirmed: true, channel_id: channelId });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[rides/confirmSeat]', err);
    res.status(500).json({ error: 'Failed to confirm this rider.' });
  }
};

// ── POST /api/hives/:id/tools/rides/offers/:offerId/riders/:riderId/decline ─
export const declineSeat = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await requireMembership(hiveId, req.userId);
    const offer = await loadOffer(hiveId, req.params.offerId);
    const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
    if (offer.driver_id !== req.userId && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the driver can decline riders.' });
    }
    const riderId = req.params.riderId;
    await query(
      `UPDATE plan_ride_seats SET status = 'declined' WHERE offer_id = $1 AND rider_id = $2`,
      [offer.offer_id, riderId],
    );
    const { rows: [me] } = await query(`SELECT full_name FROM profiles WHERE user_id = $1`, [req.userId]);
    await createNotification({
      userId: riderId, type: 'ride_seat_declined', category: 'plans',
      title: `${me?.full_name ?? 'The driver'} couldn't fit you in this ride`,
      hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/events/${offer.post_id}`,
    }).catch(e => console.error('[rides/declineSeat] notify failed', e));

    broadcast(hiveId, offer.post_id, { kind: 'seat_declined', offer_id: offer.offer_id, rider_id: riderId });
    res.json({ declined: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[rides/declineSeat]', err);
    res.status(500).json({ error: 'Failed to decline this rider.' });
  }
};
