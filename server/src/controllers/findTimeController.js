// Find a time (Prompt 61 Part 3, tool_key = 'find_time').
import { query, getClient } from '../db/index.js';
import { getMembership, requireMembership, requireCanPost } from '../lib/hiveMembership.js';
import { getDefaultChannelId, requireChannelAccess } from '../lib/hiveChannels.js';
import { getIO } from '../realtime/socket.js';
import { createNotification } from './notificationsController.js';
import { insertPlan, PLAN_SELECT, shapePlan } from './eventsController.js';
import { getEnrichedMessage, depersonalise } from './messagesController.js';

const SCORE = { works: 2, if_needed: 1, cant: 0 };

// Highest score, ties broken by fewest Can't, then earliest start time.
export function bestSlot(slots) {
  if (!slots.length) return null;
  return [...slots].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.cant !== b.cant) return a.cant - b.cant;
    return new Date(a.starts_at) - new Date(b.starts_at);
  })[0];
}

async function loadPollWithSlots(pollId) {
  const { rows: [poll] } = await query(`SELECT * FROM hive_time_polls WHERE poll_id = $1`, [pollId]);
  if (!poll) return null;

  const { rows: slotRows } = await query(
    `SELECT s.slot_id, s.starts_at,
            COUNT(*) FILTER (WHERE a.answer = 'works')::int     AS works,
            COUNT(*) FILTER (WHERE a.answer = 'if_needed')::int AS if_needed,
            COUNT(*) FILTER (WHERE a.answer = 'cant')::int      AS cant
       FROM hive_time_poll_slots s
       LEFT JOIN hive_time_poll_answers a ON a.slot_id = s.slot_id
      WHERE s.poll_id = $1
      GROUP BY s.slot_id, s.starts_at
      ORDER BY s.starts_at ASC`,
    [pollId],
  );
  const slots = slotRows.map(s => ({
    ...s,
    score: s.works * SCORE.works + s.if_needed * SCORE.if_needed + s.cant * SCORE.cant,
  }));

  const { rows: answerRows } = await query(
    `SELECT a.slot_id, a.user_id, a.answer, pr.full_name, pr.profile_photo_url
       FROM hive_time_poll_answers a
       LEFT JOIN profiles pr ON pr.user_id = a.user_id
      WHERE a.slot_id = ANY($1)`,
    [slots.map(s => s.slot_id)],
  );

  return { poll, slots, answers: answerRows };
}

// Plural form for messagesController's enrichment join (Prompt 62 Part 0.1) —
// the same shape shapePoll returns, keyed by poll_id. Cardinality here is
// always small (one poll per chat message), so a loop over loadPollWithSlots
// is simpler than a real batch query and costs nothing in practice.
export async function shapeTimePolls(pollIds, viewerId) {
  const out = {};
  for (const id of pollIds) {
    const loaded = await loadPollWithSlots(id);
    if (loaded) out[id] = shapePoll(loaded, viewerId);
  }
  return out;
}

function shapePoll({ poll, slots, answers }, viewerId) {
  const best = bestSlot(slots);
  const bySlot = {};
  for (const a of answers) {
    (bySlot[a.slot_id] ??= []).push({
      user_id: a.user_id, answer: a.answer,
      full_name: a.full_name, profile_photo_url: a.profile_photo_url,
    });
  }
  return {
    poll_id: poll.poll_id,
    hive_id: poll.hive_id,
    created_by: poll.created_by,
    title: poll.title,
    duration_minutes: poll.duration_minutes,
    location: poll.location,
    closes_at: poll.closes_at,
    status: poll.status,
    plan_post_id: poll.plan_post_id,
    pending_suggestion_id: poll.pending_suggestion_id,
    created_at: poll.created_at,
    best_slot_id: best?.slot_id ?? null,
    slots: slots.map(s => ({
      slot_id: s.slot_id,
      starts_at: s.starts_at,
      works: s.works, if_needed: s.if_needed, cant: s.cant,
      score: s.score,
      answers: bySlot[s.slot_id] ?? [],
      viewer_answer: (bySlot[s.slot_id] ?? []).find(a => a.user_id === viewerId)?.answer ?? null,
    })),
  };
}

// ── GET /api/hives/:id/tools/find_time/polls ────────────────────────────────
export const listTimePolls = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const { rows } = await query(
      `SELECT p.poll_id, p.title, p.status, p.created_at, p.plan_post_id,
              (SELECT COUNT(*)::int FROM hive_time_poll_slots WHERE poll_id = p.poll_id) AS slot_count,
              EXISTS(
                SELECT 1 FROM hive_time_poll_slots s
                  JOIN hive_time_poll_answers a ON a.slot_id = s.slot_id
                 WHERE s.poll_id = p.poll_id AND a.user_id = $2
              ) AS viewer_answered
         FROM hive_time_polls p
        WHERE p.hive_id = $1
        ORDER BY p.created_at DESC`,
      [hiveId, req.userId],
    );
    res.json({ polls: rows });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[findTime/listTimePolls]', err);
    res.status(500).json({ error: 'Failed to load polls.' });
  }
};

// ── POST /api/hives/:id/tools/find_time/polls ───────────────────────────────
export const createTimePoll = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanPost(hiveId, req.userId);

    const { title, durationMinutes, location, closesAt, slots, channelId: bodyChannelId } = req.body ?? {};
    const t = String(title ?? '').trim();
    if (!t) return res.status(400).json({ error: 'A title is required.' });
    if (t.length > 120) return res.status(400).json({ error: 'Title must be 120 characters or fewer.' });

    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < 15 || duration > 1440) {
      return res.status(400).json({ error: 'Duration must be a whole number of minutes between 15 and 1440.' });
    }

    const loc = location == null ? null : String(location).trim();
    if (loc && loc.length > 200) return res.status(400).json({ error: 'Location must be 200 characters or fewer.' });

    if (!Array.isArray(slots) || slots.length < 2 || slots.length > 20) {
      return res.status(400).json({ error: 'Offer between 2 and 20 candidate times.' });
    }
    const parsedSlots = [];
    for (const raw of slots) {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'One of the candidate times is not a valid date.' });
      if (d.getTime() <= Date.now()) return res.status(400).json({ error: 'Every candidate time must be in the future.' });
      parsedSlots.push(d);
    }

    let closes = null;
    if (closesAt) {
      closes = new Date(closesAt);
      if (isNaN(closes.getTime())) return res.status(400).json({ error: 'Closing time is not a valid date.' });
    }

    // "Posts a card into the room" (Prompt 61 Part 3's scope note, fixed in
    // Prompt 62 Part 0.1) — the poll's own message is created in the same
    // transaction, same pattern as createPoll/createSuggestion, so it's
    // never possible to have the poll exist with no card to show it.
    const channelId = bodyChannelId || await getDefaultChannelId(hiveId);
    const chCheck = await requireChannelAccess(hiveId, channelId, req.userId).catch(() => null);
    if (!chCheck || chCheck.archived_at) return res.status(400).json({ error: 'That room does not belong to this Hive.' });

    const client = await getClient();
    let pollId, messageId;
    try {
      await client.query('BEGIN');
      const { rows: [p] } = await client.query(
        `INSERT INTO hive_time_polls (hive_id, created_by, title, duration_minutes, location, closes_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING poll_id`,
        [hiveId, req.userId, t, duration, loc || null, closes ? closes.toISOString() : null],
      );
      pollId = p.poll_id;
      for (const d of parsedSlots) {
        await client.query(
          `INSERT INTO hive_time_poll_slots (poll_id, starts_at) VALUES ($1,$2)`,
          [pollId, d.toISOString()],
        );
      }
      const { rows: [msg] } = await client.query(
        `INSERT INTO messages (hive_id, channel_id, sender_user_id, message_text, time_poll_id)
         VALUES ($1,$2,$3,'',$4) RETURNING message_id`,
        [hiveId, channelId, req.userId, pollId],
      );
      messageId = msg.message_id;
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    const msg = await getEnrichedMessage(messageId, req.userId);
    try {
      const io = getIO();
      io?.to(`hive:${hiveId}:ch:${channelId}`).emit('receive_message', depersonalise(msg));
      if (chCheck.kind !== 'pair') {
        io?.to(`hive:${hiveId}`).emit('channel_activity', { hive_id: hiveId, channel_id: channelId });
      }
    } catch { /* no socket in tests */ }

    const shaped = shapePoll(await loadPollWithSlots(pollId), req.userId);
    res.status(201).json({ poll: shaped, message_id: messageId });

    try {
      const { rows: hiveRow } = await query(`SELECT hive_name FROM hives WHERE hive_id = $1`, [hiveId]);
      const { rows: members } = await query(
        `SELECT user_id FROM hive_members WHERE hive_id = $1 AND membership_status = 'active' AND user_id != $2`,
        [hiveId, req.userId],
      );
      for (const m of members) {
        await createNotification({
          userId: m.user_id, type: 'time_poll_created', category: 'plans',
          title: `New time poll in ${hiveRow[0]?.hive_name ?? 'your Hive'}: ${t}`,
          body: 'Say what works for you', hiveId, actorUserId: req.userId,
          link: `/hive/${hiveId}/tools/find_time`,
        });
      }
    } catch (notifErr) {
      console.error('[findTime/createTimePoll] notify failed (non-fatal):', notifErr);
    }
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[findTime/createTimePoll]', err);
    res.status(500).json({ error: 'Failed to create the poll.' });
  }
};

// ── GET /api/hives/:id/tools/find_time/polls/:pollId ────────────────────────
export const getTimePoll = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const loaded = await loadPollWithSlots(req.params.pollId);
    if (!loaded || loaded.poll.hive_id !== hiveId) {
      return res.status(404).json({ error: 'Poll not found.' });
    }
    res.json({ poll: shapePoll(loaded, req.userId) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[findTime/getTimePoll]', err);
    res.status(500).json({ error: 'Failed to load the poll.' });
  }
};

// ── POST /api/hives/:id/tools/find_time/polls/:pollId/answer ────────────────
export const answerTimePollSlot = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const { rows: [poll] } = await query(`SELECT * FROM hive_time_polls WHERE poll_id = $1`, [req.params.pollId]);
    if (!poll || poll.hive_id !== hiveId) return res.status(404).json({ error: 'Poll not found.' });
    if (poll.status !== 'open') return res.status(400).json({ error: 'This poll is no longer open.' });

    const { slotId, answer } = req.body ?? {};
    if (!['works', 'if_needed', 'cant', 'clear'].includes(answer)) {
      return res.status(400).json({ error: 'answer must be "works", "if_needed", "cant" or "clear".' });
    }
    const { rows: [slot] } = await query(
      `SELECT slot_id FROM hive_time_poll_slots WHERE slot_id = $1 AND poll_id = $2`,
      [slotId, req.params.pollId],
    );
    if (!slot) return res.status(400).json({ error: 'That slot does not belong to this poll.' });

    if (answer === 'clear') {
      await query(`DELETE FROM hive_time_poll_answers WHERE slot_id = $1 AND user_id = $2`, [slotId, req.userId]);
    } else {
      await query(
        `INSERT INTO hive_time_poll_answers (slot_id, user_id, answer)
         VALUES ($1,$2,$3)
         ON CONFLICT (slot_id, user_id) DO UPDATE SET answer = EXCLUDED.answer`,
        [slotId, req.userId, answer],
      );
    }

    const loaded = await loadPollWithSlots(req.params.pollId);
    const shaped = shapePoll(loaded, req.userId);

    try {
      getIO()?.to(`hive:${hiveId}`).emit('time_poll_updated', {
        hive_id: hiveId, poll_id: poll.poll_id, status: 'open',
        slots: shaped.slots.map(s => ({ slot_id: s.slot_id, works: s.works, if_needed: s.if_needed, cant: s.cant, score: s.score })),
        best_slot_id: shaped.best_slot_id,
      });
    } catch { /* no socket in tests */ }

    res.json({ poll: shaped });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[findTime/answerTimePollSlot]', err);
    res.status(500).json({ error: 'Failed to save your answer.' });
  }
};

async function assertCanManage(hiveId, pollId, userId) {
  const mem = await requireMembership(hiveId, userId);
  const { rows: [poll] } = await query(`SELECT * FROM hive_time_polls WHERE poll_id = $1`, [pollId]);
  if (!poll || poll.hive_id !== hiveId) {
    const err = new Error('Poll not found.'); err.status = 404; throw err;
  }
  const canManage = poll.created_by === userId || ['owner', 'admin'].includes(mem.role);
  if (!canManage) {
    const err = new Error('Only the poll\'s creator or an owner/admin can do this.'); err.status = 403; throw err;
  }
  return poll;
}

// ── POST /api/hives/:id/tools/find_time/polls/:pollId/close ─────────────────
export const closeTimePoll = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const poll = await assertCanManage(hiveId, req.params.pollId, req.userId);
    if (poll.status !== 'open') return res.status(400).json({ error: 'This poll is already closed.' });

    await query(`UPDATE hive_time_polls SET status = 'closed' WHERE poll_id = $1`, [poll.poll_id]);
    try {
      getIO()?.to(`hive:${hiveId}`).emit('time_poll_updated', { hive_id: hiveId, poll_id: poll.poll_id, status: 'closed' });
    } catch { /* no socket in tests */ }
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[findTime/closeTimePoll]', err);
    res.status(500).json({ error: 'Failed to close the poll.' });
  }
};

// ── DELETE /api/hives/:id/tools/find_time/polls/:pollId ─────────────────────
export const deleteTimePoll = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const poll = await assertCanManage(hiveId, req.params.pollId, req.userId);
    if (poll.status === 'scheduled') {
      return res.status(400).json({ error: 'This poll already became a plan — cancel the plan instead.' });
    }
    await query(`DELETE FROM hive_time_polls WHERE poll_id = $1`, [poll.poll_id]);
    res.json({ deleted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[findTime/deleteTimePoll]', err);
    res.status(500).json({ error: 'Failed to delete the poll.' });
  }
};

// ── POST /api/hives/:id/tools/find_time/polls/:pollId/schedule ──────────────
// Respects Prompt 60: an owner/admin schedules directly; a member (who can
// only reach this because they created the poll — assertCanManage already
// enforced that) submits a suggestion instead, prefilled from the slot, with
// the poll's answers threaded through so they become RSVPs on approval.
export const scheduleTimePoll = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await requireMembership(hiveId, req.userId);
    const poll = await assertCanManage(hiveId, req.params.pollId, req.userId);
    if (poll.status === 'scheduled') return res.status(400).json({ error: 'This poll has already been scheduled.' });

    const { slotId } = req.body ?? {};
    const { rows: [slot] } = await query(
      `SELECT * FROM hive_time_poll_slots WHERE slot_id = $1 AND poll_id = $2`,
      [slotId, poll.poll_id],
    );
    if (!slot) return res.status(400).json({ error: 'That slot does not belong to this poll.' });
    if (new Date(slot.starts_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'That time has already passed.' });
    }

    const start = new Date(slot.starts_at);
    const end = new Date(start.getTime() + poll.duration_minutes * 60000);
    const fields = {
      title: poll.title, type: 'other', start, end,
      loc: poll.location, desc: null, media: null, vis: 'hive',
    };

    const isOwnerOrAdmin = ['owner', 'admin'].includes(mem.role);

    if (isOwnerOrAdmin) {
      const client = await getClient();
      let postId;
      try {
        await client.query('BEGIN');
        postId = await insertPlan(client, hiveId, req.userId, fields);
        // Auto-RSVP everyone who answered — Works -> Going, If needed -> Maybe.
        // The scheduler's own Going RSVP from insertPlan is upserted again
        // here if they also answered, which is harmless (same value or a
        // deliberate upgrade from If needed).
        const { rows: answerRows } = await client.query(
          `SELECT user_id, answer FROM hive_time_poll_answers WHERE slot_id = $1 AND answer IN ('works','if_needed')`,
          [slotId],
        );
        for (const a of answerRows) {
          const status = a.answer === 'works' ? 'going' : 'maybe';
          await client.query(
            `INSERT INTO event_rsvps (post_id, user_id, rsvp_status)
             VALUES ($1,$2,$3)
             ON CONFLICT (post_id, user_id) DO UPDATE SET rsvp_status = EXCLUDED.rsvp_status, updated_at = NOW()`,
            [postId, a.user_id, status],
          );
        }
        await client.query(
          `UPDATE hive_time_polls SET status = 'scheduled', plan_post_id = $1 WHERE poll_id = $2`,
          [postId, poll.poll_id],
        );
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      const { rows } = await query(`${PLAN_SELECT} WHERE p.post_id = $2`, [req.userId, postId]);
      const plan = shapePlan(rows[0]);

      try {
        getIO()?.to(`hive:${hiveId}`).emit('time_poll_updated', {
          hive_id: hiveId, poll_id: poll.poll_id, status: 'scheduled', plan_post_id: postId,
        });
      } catch { /* no socket in tests */ }

      try {
        const { rows: answerRows } = await query(
          `SELECT user_id FROM hive_time_poll_answers WHERE slot_id = $1 AND answer IN ('works','if_needed') AND user_id != $2`,
          [slotId, req.userId],
        );
        const { rows: hiveRow } = await query(`SELECT hive_name FROM hives WHERE hive_id = $1`, [hiveId]);
        for (const a of answerRows) {
          await createNotification({
            userId: a.user_id, type: 'time_poll_scheduled', category: 'plans',
            title: `${poll.title} is on in ${hiveRow[0]?.hive_name ?? 'your Hive'}`,
            body: 'Check the plan for details', hiveId, actorUserId: req.userId,
            link: `/hive/${hiveId}/events/${postId}`,
          });
        }
      } catch (notifErr) {
        console.error('[findTime/scheduleTimePoll] notify failed (non-fatal):', notifErr);
      }

      return res.json({ created: 'plan', plan });
    }

    // Member path — submit a suggestion instead.
    if (!await isMembersAllowedToPropose(hiveId)) {
      return res.status(403).json({ error: 'Only owners and admins can schedule plans in this Hive.' });
    }

    const { rows: [h] } = await query(
      `SELECT plan_approval, vote_min_yes, vote_window_hours FROM hives WHERE hive_id = $1`, [hiveId],
    );
    let closesAt;
    if (h.plan_approval === 'vote') {
      const twoHoursFromNow = Date.now() + 2 * 3600e3;
      if (start.getTime() < twoHoursFromNow) {
        return res.status(400).json({ error: 'Too soon to vote on, so ask an owner to schedule it directly.' });
      }
      const windowEnd = Date.now() + h.vote_window_hours * 3600e3;
      const oneHourBefore = start.getTime() - 3600e3;
      closesAt = new Date(Math.min(windowEnd, oneHourBefore));
    } else {
      closesAt = start;
    }

    const channelId = await getDefaultChannelId(hiveId);
    const { rows: [s] } = await query(
      `INSERT INTO hive_plan_suggestions
         (hive_id, channel_id, suggested_by, title, plan_type, event_at, event_end_at,
          event_location, description, media_url, visibility, status, closes_at,
          source_poll_id, source_slot_id)
       VALUES ($1,$2,$3,$4,'other',$5,$6,$7,NULL,NULL,'hive','pending',$8,$9,$10)
       RETURNING suggestion_id`,
      [hiveId, channelId, req.userId, poll.title, start.toISOString(), end.toISOString(),
       poll.location, closesAt.toISOString(), poll.poll_id, slotId],
    );
    await query(
      `UPDATE hive_time_polls SET status = 'closed', pending_suggestion_id = $1 WHERE poll_id = $2`,
      [s.suggestion_id, poll.poll_id],
    );
    try {
      getIO()?.to(`hive:${hiveId}`).emit('time_poll_updated', { hive_id: hiveId, poll_id: poll.poll_id, status: 'closed' });
    } catch { /* no socket in tests */ }

    res.json({ created: 'suggestion', suggestion_id: s.suggestion_id });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[findTime/scheduleTimePoll]', err);
    res.status(500).json({ error: 'Failed to schedule from this poll.' });
  }
};

async function isMembersAllowedToPropose(hiveId) {
  const { rows: [h] } = await query(`SELECT plan_proposers FROM hives WHERE hive_id = $1`, [hiveId]);
  return h?.plan_proposers === 'members';
}
