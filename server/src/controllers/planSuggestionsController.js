// How plans get made — owner-only, suggestions, and Hive votes (Prompt 60).
import { query, getClient } from '../db/index.js';
import { getMembership, requireMembership, requireCanPost } from '../lib/hiveMembership.js';
import { getDefaultChannelId, requireChannelAccess } from '../lib/hiveChannels.js';
import { getIO } from '../realtime/socket.js';
import { createNotification } from './notificationsController.js';
import {
  validatePlanInput, insertPlan, PLAN_SELECT, shapePlan,
  validateRepeat, insertPlanSeries,
} from './eventsController.js';
import { getEnrichedMessage, depersonalise } from './messagesController.js';

const RULE_FIELDS = ['plan_proposers', 'plan_approval', 'vote_min_yes', 'vote_window_hours', 'suggestions_per_day'];

// ── Plan rules ──────────────────────────────────────────────────────────────
export const getPlanRules = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const { rows: [h] } = await query(
      `SELECT plan_proposers, plan_approval, vote_min_yes, vote_window_hours, suggestions_per_day
         FROM hives WHERE hive_id = $1`,
      [hiveId],
    );
    if (!h) return res.status(404).json({ error: 'Hive not found.' });
    res.json(h);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[planSuggestions/getPlanRules]', err);
    res.status(500).json({ error: 'Failed to load plan rules.' });
  }
};

export const updatePlanRules = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return res.status(403).json({ error: 'Only owners and admins can change how plans get made.' });
    }

    const { plan_proposers, plan_approval, vote_min_yes, vote_window_hours, suggestions_per_day } = req.body ?? {};
    if (!['owners', 'members'].includes(plan_proposers)) {
      return res.status(400).json({ error: 'plan_proposers must be "owners" or "members".' });
    }
    if (!['owner', 'vote'].includes(plan_approval)) {
      return res.status(400).json({ error: 'plan_approval must be "owner" or "vote".' });
    }
    const minYes = Number(vote_min_yes);
    if (!Number.isInteger(minYes) || minYes < 1 || minYes > 50) {
      return res.status(400).json({ error: 'Yes votes needed must be a whole number between 1 and 50.' });
    }
    const windowHrs = Number(vote_window_hours);
    if (!Number.isInteger(windowHrs) || windowHrs < 6 || windowHrs > 168) {
      return res.status(400).json({ error: 'Voting window must be a whole number of hours between 6 and 168.' });
    }
    const perDay = Number(suggestions_per_day);
    if (!Number.isInteger(perDay) || perDay < 1 || perDay > 20) {
      return res.status(400).json({ error: 'Suggestions per day must be a whole number between 1 and 20.' });
    }

    const { rows: [updated] } = await query(
      `UPDATE hives
          SET plan_proposers = $1, plan_approval = $2, vote_min_yes = $3,
              vote_window_hours = $4, suggestions_per_day = $5, updated_at = NOW()
        WHERE hive_id = $6
        RETURNING plan_proposers, plan_approval, vote_min_yes, vote_window_hours, suggestions_per_day`,
      [plan_proposers, plan_approval, minYes, windowHrs, perDay, hiveId],
    );
    res.json(updated);
  } catch (err) {
    console.error('[planSuggestions/updatePlanRules]', err);
    res.status(500).json({ error: 'Failed to save plan rules.' });
  }
};

// ── Shared loaders ────────────────────────────────────────────────────────────
async function loadSuggestion(suggestionId) {
  const { rows: [s] } = await query(
    `SELECT * FROM hive_plan_suggestions WHERE suggestion_id = $1`,
    [suggestionId],
  );
  return s ?? null;
}

async function voteCounts(suggestionId) {
  const { rows: [c] } = await query(
    `SELECT COUNT(*) FILTER (WHERE vote = 'yes')::int AS yes,
            COUNT(*) FILTER (WHERE vote = 'no')::int  AS no
       FROM hive_plan_suggestion_votes WHERE suggestion_id = $1`,
    [suggestionId],
  );
  return c;
}

async function activeMemberCount(hiveId) {
  const { rows: [c] } = await query(
    `SELECT COUNT(*)::int AS n FROM hive_members WHERE hive_id = $1 AND membership_status = 'active'`,
    [hiveId],
  );
  return c.n;
}

function broadcastSuggestion(hiveId, suggestionId, payload) {
  // Counts and status only — never an individual vote (decision 5).
  try {
    getIO()?.to(`hive:${hiveId}`).emit('suggestion_updated', { hive_id: hiveId, suggestion_id: suggestionId, ...payload });
  } catch { /* no socket in tests */ }
}

// Vote-rule outcome (decision 2). `early` checks the can't-change-anymore
// threshold while a suggestion is still open; the deadline check is the full
// approve/decline/expire rule once closes_at has passed.
function voteOutcome({ yes, no, voteMinYes, members }, early) {
  if (early) {
    const majority = Math.floor(members / 2) + 1;
    const threshold = Math.max(voteMinYes, majority);
    return yes >= threshold ? 'approved' : null;
  }
  if (yes > no && yes >= voteMinYes) return 'approved';
  if (no >= yes) return 'declined';
  return 'expired'; // yes > no but yes < voteMinYes
}

async function resolveIfOverdue(suggestionId) {
  const s = await loadSuggestion(suggestionId);
  if (!s || s.status !== 'pending' || new Date(s.closes_at) > new Date()) return s;
  await resolveSuggestionRow(s);
  return loadSuggestion(suggestionId);
}

// Resolves every overdue pending suggestion in a Hive — used by GET (list)
// so the whole page is fresh in one pass instead of one resolve per row.
async function resolveOverdueForHive(hiveId) {
  const { rows } = await query(
    `SELECT suggestion_id FROM hive_plan_suggestions
      WHERE hive_id = $1 AND status = 'pending' AND closes_at <= NOW()`,
    [hiveId],
  );
  for (const r of rows) {
    const s = await loadSuggestion(r.suggestion_id);
    if (s) await resolveSuggestionRow(s);
  }
}

// The deadline resolution for one already-loaded, already-overdue suggestion
// row — the one place (besides the early-approval check in voteSuggestion)
// that decides a pending suggestion's outcome. Reads the Hive's CURRENT
// plan_approval/vote_min_yes rather than a value snapshotted at suggest-time:
// an owner can change the rules mid-vote, and those are display-time
// settings, not a promise already made to voters about this suggestion.
async function resolveSuggestionRow(s) {
  const { rows: [h] } = await query(
    `SELECT plan_approval, vote_min_yes FROM hives WHERE hive_id = $1`, [s.hive_id],
  );
  let outcome;
  if (h.plan_approval !== 'vote') {
    outcome = 'expired';
  } else {
    const counts = await voteCounts(s.suggestion_id);
    const members = await activeMemberCount(s.hive_id);
    outcome = voteOutcome({ yes: counts.yes, no: counts.no, voteMinYes: h.vote_min_yes, members }, false);
  }
  const result = await finishResolution(s, outcome, null);
  if (result) await notifyOutcome(result);
  return result;
}

async function finishResolution(s, outcome, overrideUserId, editedFields = null) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows: [locked] } = await client.query(
      `SELECT * FROM hive_plan_suggestions WHERE suggestion_id = $1 AND status = 'pending' FOR UPDATE`,
      [s.suggestion_id],
    );
    if (!locked) { await client.query('ROLLBACK'); return null; }

    let planPostId = null;
    if (outcome === 'approved') {
      const fields = editedFields ?? {
        title: locked.title, type: locked.plan_type ?? 'other', start: new Date(locked.event_at),
        end: locked.event_end_at ? new Date(locked.event_end_at) : null, loc: locked.event_location,
        desc: locked.description, media: locked.media_url, vis: locked.visibility,
      };
      // Series suggestion (Prompt 61 Part 4) — approval creates every
      // occurrence at once. An edit at approval time (editedFields) opts out
      // of the series and creates a single plan instead: fine-tuning one
      // occurrence's fields on approval and also recurring it isn't a
      // combination this endpoint supports.
      if (locked.series_rule && !editedFields) {
        const { postIds } = await insertPlanSeries(
          client, locked.hive_id, locked.suggested_by, fields, locked.series_rule, locked.series_count,
        );
        planPostId = postIds[0];
      } else {
        planPostId = await insertPlan(client, locked.hive_id, locked.suggested_by, fields);
      }

      // Find a time (Prompt 61 Part 3): this suggestion was prefilled from a
      // poll slot — the people who said they could make it become the plan's
      // RSVPs, same as a direct schedule would have done.
      if (locked.source_poll_id && locked.source_slot_id) {
        const { rows: answerRows } = await client.query(
          `SELECT user_id, answer FROM hive_time_poll_answers
            WHERE slot_id = $1 AND answer IN ('works','if_needed')`,
          [locked.source_slot_id],
        );
        for (const a of answerRows) {
          const status = a.answer === 'works' ? 'going' : 'maybe';
          await client.query(
            `INSERT INTO event_rsvps (post_id, user_id, rsvp_status)
             VALUES ($1,$2,$3)
             ON CONFLICT (post_id, user_id) DO UPDATE SET rsvp_status = EXCLUDED.rsvp_status, updated_at = NOW()`,
            [planPostId, a.user_id, status],
          );
        }
        await client.query(
          `UPDATE hive_time_polls SET status = 'scheduled', plan_post_id = $1, pending_suggestion_id = NULL
            WHERE poll_id = $2`,
          [planPostId, locked.source_poll_id],
        );
      }
    } else if (locked.source_poll_id) {
      // Declined, expired or withdrawn — reopen the poll so the Hive can try
      // scheduling again instead of it being stuck closed forever.
      await client.query(
        `UPDATE hive_time_polls SET status = 'open', pending_suggestion_id = NULL WHERE poll_id = $1`,
        [locked.source_poll_id],
      );
    }

    await client.query(
      `UPDATE hive_plan_suggestions
          SET status = $1, resolved_at = NOW(), resolved_by = $2, plan_post_id = $3
        WHERE suggestion_id = $4 AND status = 'pending'`,
      [outcome, overrideUserId, planPostId, s.suggestion_id],
    );
    await client.query('COMMIT');
    broadcastSuggestion(locked.hive_id, locked.suggestion_id, { status: outcome });
    if (locked.source_poll_id) {
      try {
        getIO()?.to(`hive:${locked.hive_id}`).emit('time_poll_updated', {
          hive_id: locked.hive_id, poll_id: locked.source_poll_id,
          status: outcome === 'approved' ? 'scheduled' : 'open',
          ...(outcome === 'approved' ? { plan_post_id: planPostId } : {}),
        });
      } catch { /* no socket in tests */ }
    }
    return { hiveId: locked.hive_id, suggestedBy: locked.suggested_by, title: locked.title, outcome, planPostId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function notifyOutcome({ hiveId, suggestedBy, title, outcome }) {
  try {
    const { rows: hiveRow } = await query(`SELECT hive_name FROM hives WHERE hive_id = $1`, [hiveId]);
    const label = outcome === 'approved' ? 'approved'
      : outcome === 'declined' ? 'declined'
      : outcome === 'expired'  ? "didn't get enough votes in time"
      : outcome;
    await createNotification({
      userId: suggestedBy, type: 'suggestion_resolved', category: 'plans',
      title: `Your suggestion "${title}" was ${label}`,
      body: null, hiveId, link: `/hive/${hiveId}/events`,
    });
  } catch (e) {
    console.error('[planSuggestions] outcome notify failed (non-fatal):', e);
  }
}

// ── POST /api/hives/:id/plan-suggestions ──────────────────────────────────────
export const createSuggestion = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem) return res.status(403).json({ error: 'You must be a member of this Hive.' });
    const isOwnerOrAdmin = ['owner', 'admin'].includes(mem.role);

    const { rows: [h] } = await query(
      `SELECT plan_proposers, plan_approval, vote_min_yes, vote_window_hours, suggestions_per_day
         FROM hives WHERE hive_id = $1`,
      [hiveId],
    );

    if (!isOwnerOrAdmin) {
      if (h.plan_proposers !== 'members') {
        return res.status(403).json({ error: 'Only owners and admins can propose plans in this Hive.' });
      }
      await requireCanPost(hiveId, req.userId);

      // Spam guard (decision 7) — owners/admins exempt.
      const { rows: [cnt] } = await query(
        `SELECT COUNT(*)::int AS n FROM hive_plan_suggestions
          WHERE suggested_by = $1 AND hive_id = $2 AND created_at >= NOW() - INTERVAL '24 hours'`,
        [req.userId, hiveId],
      );
      if (cnt.n >= h.suggestions_per_day) {
        return res.status(429).json({
          error: `You've reached ${h.suggestions_per_day} suggestion${h.suggestions_per_day === 1 ? '' : 's'} in 24 hours. Try again later.`,
        });
      }
    }

    const fields = validatePlanInput(req.body);
    if (fields.error) return res.status(400).json({ error: fields.error });

    // A member suggesting a recurring plan suggests the whole series as one
    // suggestion (Prompt 61 Part 4) — approval creates every occurrence.
    const repeatResult = validateRepeat(req.body?.repeat);
    if (repeatResult.error) return res.status(400).json({ error: repeatResult.error });
    const repeat = repeatResult.repeat;

    let closesAt;
    if (h.plan_approval === 'vote') {
      const twoHoursFromNow = Date.now() + 2 * 3600e3;
      if (fields.start.getTime() < twoHoursFromNow) {
        return res.status(400).json({ error: 'Too soon to vote on, so ask an owner to create it directly.' });
      }
      const windowEnd = Date.now() + h.vote_window_hours * 3600e3;
      const oneHourBefore = fields.start.getTime() - 3600e3;
      closesAt = new Date(Math.min(windowEnd, oneHourBefore));
    } else {
      closesAt = fields.start; // owner-approve: no deadline rule, closes_at is just the plan start
    }

    const channelId = req.body?.channelId || await getDefaultChannelId(hiveId);
    const chCheck = await requireChannelAccess(hiveId, channelId, req.userId).catch(() => null);
    if (!chCheck || chCheck.archived_at) return res.status(400).json({ error: 'That room does not belong to this Hive.' });

    const client = await getClient();
    let suggestionId, messageId;
    try {
      await client.query('BEGIN');
      const { rows: [s] } = await client.query(
        `INSERT INTO hive_plan_suggestions
           (hive_id, channel_id, suggested_by, title, plan_type, event_at, event_end_at,
            event_location, description, media_url, visibility, status, closes_at,
            series_rule, series_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12,$13,$14)
         RETURNING suggestion_id`,
        [hiveId, channelId, req.userId, fields.title, fields.type,
         fields.start.toISOString(), fields.end ? fields.end.toISOString() : null,
         fields.loc, fields.desc, fields.media, fields.vis, closesAt.toISOString(),
         repeat?.rule ?? null, repeat?.count ?? null],
      );
      suggestionId = s.suggestion_id;
      const { rows: [msg] } = await client.query(
        `INSERT INTO messages (hive_id, channel_id, sender_user_id, message_text, suggestion_id)
         VALUES ($1,$2,$3,'',$4) RETURNING message_id`,
        [hiveId, channelId, req.userId, suggestionId],
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

    const shaped = await shapeSuggestions([suggestionId], req.userId);
    res.status(201).json({ suggestion: shaped[suggestionId], message_id: messageId, message: msg });

    // Notify, in the plans category (decision in part 2.4) — best-effort,
    // after the response.
    try {
      const { rows: hiveRow } = await query(`SELECT hive_name FROM hives WHERE hive_id = $1`, [hiveId]);
      const hiveName = hiveRow[0]?.hive_name ?? 'your Hive';
      let recipients;
      if (h.plan_approval === 'vote') {
        const { rows } = await query(
          `SELECT user_id FROM hive_members WHERE hive_id = $1 AND membership_status = 'active' AND user_id != $2`,
          [hiveId, req.userId],
        );
        recipients = rows.map(r => r.user_id);
      } else {
        const { rows } = await query(
          `SELECT user_id FROM hive_members WHERE hive_id = $1 AND membership_status = 'active' AND role IN ('owner','admin')`,
          [hiveId],
        );
        recipients = rows.map(r => r.user_id).filter(id => id !== req.userId);
      }
      for (const uid of recipients) {
        await createNotification({
          userId: uid, type: 'plan_suggested', category: 'plans',
          title: `New plan suggestion in ${hiveName}: ${fields.title}`,
          body: h.plan_approval === 'vote' ? 'Vote now' : 'Needs your review',
          hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/events`,
        });
      }
    } catch (notifErr) {
      console.error('[planSuggestions/createSuggestion] notify failed (non-fatal):', notifErr);
    }
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[planSuggestions/createSuggestion]', err);
    res.status(500).json({ error: 'Failed to submit your suggestion.' });
  }
};

// ── shapeSuggestions — used by GET list and message enrichment ──────────────
export async function shapeSuggestions(ids, viewerId) {
  if (!ids.length) return {};
  const [{ rows: sugs }, { rows: counts }, { rows: mine }] = await Promise.all([
    query(
      `SELECT s.*, pr.full_name AS suggester_name, pr.profile_photo_url AS suggester_photo
         FROM hive_plan_suggestions s
         LEFT JOIN profiles pr ON pr.user_id = s.suggested_by
        WHERE s.suggestion_id = ANY($1)`,
      [ids],
    ),
    query(
      `SELECT suggestion_id,
              COUNT(*) FILTER (WHERE vote = 'yes')::int AS yes,
              COUNT(*) FILTER (WHERE vote = 'no')::int  AS no
         FROM hive_plan_suggestion_votes WHERE suggestion_id = ANY($1)
        GROUP BY suggestion_id`,
      [ids],
    ),
    query(
      `SELECT suggestion_id, vote FROM hive_plan_suggestion_votes
        WHERE suggestion_id = ANY($1) AND user_id = $2`,
      [ids, viewerId],
    ),
  ]);

  const planIds = sugs.map(s => s.plan_post_id).filter(Boolean);
  const plans = planIds.length
    ? await query(`${PLAN_SELECT} WHERE p.post_id = ANY($2)`, [viewerId, planIds])
        .then(({ rows }) => Object.fromEntries(rows.map(r => [r.post_id, shapePlan(r)])))
    : {};

  const countsById = Object.fromEntries(counts.map(c => [c.suggestion_id, c]));
  const mineById = Object.fromEntries(mine.map(m => [m.suggestion_id, m.vote]));

  const out = {};
  for (const s of sugs) {
    out[s.suggestion_id] = {
      suggestion_id: s.suggestion_id,
      hive_id: s.hive_id,
      channel_id: s.channel_id,
      title: s.title,
      plan_type: s.plan_type ?? 'other',
      event_at: s.event_at,
      event_end_at: s.event_end_at,
      event_location: s.event_location,
      description: s.description,
      media_url: s.media_url,
      visibility: s.visibility,
      status: s.status,
      closes_at: s.closes_at,
      resolved_at: s.resolved_at,
      plan_post_id: s.plan_post_id,
      plan: s.plan_post_id ? (plans[s.plan_post_id] ?? null) : null,
      created_at: s.created_at,
      suggested_by: {
        user_id: s.suggested_by, full_name: s.suggester_name, profile_photo_url: s.suggester_photo,
      },
      yes: countsById[s.suggestion_id]?.yes ?? 0,
      no: countsById[s.suggestion_id]?.no ?? 0,
      my_vote: mineById[s.suggestion_id] ?? null,
    };
  }
  return out;
}

// ── GET /api/hives/:id/plan-suggestions?status=pending|recent ───────────────
export const listSuggestions = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    await resolveOverdueForHive(hiveId);

    const status = req.query.status === 'recent' ? 'recent' : 'pending';
    let rows;
    if (status === 'pending') {
      ({ rows } = await query(
        `SELECT suggestion_id FROM hive_plan_suggestions
          WHERE hive_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
        [hiveId],
      ));
    } else {
      ({ rows } = await query(
        `SELECT suggestion_id FROM hive_plan_suggestions
          WHERE hive_id = $1 AND status != 'pending' AND resolved_at >= NOW() - INTERVAL '14 days'
          ORDER BY resolved_at DESC`,
        [hiveId],
      ));
    }

    const ids = rows.map(r => r.suggestion_id);
    const shaped = await shapeSuggestions(ids, req.userId);
    res.json({ suggestions: ids.map(id => shaped[id]) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[planSuggestions/listSuggestions]', err);
    res.status(500).json({ error: 'Failed to load suggestions.' });
  }
};

// ── POST /api/hives/:id/plan-suggestions/:sid/vote ───────────────────────────
export const voteSuggestion = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const sid = req.params.sid;
    await requireMembership(hiveId, req.userId);

    let s = await resolveIfOverdue(sid);
    if (!s || s.hive_id !== hiveId) return res.status(404).json({ error: 'Suggestion not found.' });

    const { rows: [h] } = await query(`SELECT plan_approval, vote_min_yes FROM hives WHERE hive_id = $1`, [hiveId]);
    if (h.plan_approval !== 'vote') {
      return res.status(400).json({ error: 'This Hive does not vote on plan suggestions.' });
    }
    if (s.status !== 'pending') {
      return res.status(400).json({ error: 'This suggestion is no longer open for voting.' });
    }

    const vote = req.body?.vote;
    if (!['yes', 'no', 'clear'].includes(vote)) {
      return res.status(400).json({ error: 'vote must be "yes", "no" or "clear".' });
    }

    if (vote === 'clear') {
      await query(`DELETE FROM hive_plan_suggestion_votes WHERE suggestion_id = $1 AND user_id = $2`, [sid, req.userId]);
    } else {
      await query(
        `INSERT INTO hive_plan_suggestion_votes (suggestion_id, user_id, vote)
         VALUES ($1,$2,$3)
         ON CONFLICT (suggestion_id, user_id) DO UPDATE SET vote = EXCLUDED.vote, voted_at = NOW()`,
        [sid, req.userId, vote],
      );
    }

    const counts = await voteCounts(sid);
    broadcastSuggestion(hiveId, sid, { yes: counts.yes, no: counts.no, status: 'pending' });

    // Early approval (decision 2) — can't change after this, so no reason to
    // make voters wait for the deadline.
    const members = await activeMemberCount(hiveId);
    const early = voteOutcome({ yes: counts.yes, no: counts.no, voteMinYes: h.vote_min_yes, members }, true);
    if (early === 'approved') {
      const refreshed = await loadSuggestion(sid);
      const result = await finishResolution(refreshed, 'approved', null);
      if (result) await notifyOutcome(result);
    }

    const shaped = await shapeSuggestions([sid], req.userId);
    res.json({ suggestion: shaped[sid] });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[planSuggestions/voteSuggestion]', err);
    res.status(500).json({ error: 'Failed to record your vote.' });
  }
};

// ── POST /api/hives/:id/plan-suggestions/:sid/approve ─────────────────────────
export const approveSuggestion = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const sid = req.params.sid;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return res.status(403).json({ error: 'Only owners and admins can approve a suggestion.' });
    }

    let s = await resolveIfOverdue(sid);
    if (!s || s.hive_id !== hiveId) return res.status(404).json({ error: 'Suggestion not found.' });
    if (s.status !== 'pending') return res.status(400).json({ error: 'This suggestion has already been resolved.' });

    let editedFields = null;
    if (req.body?.edits) {
      const fields = validatePlanInput(req.body.edits);
      if (fields.error) return res.status(400).json({ error: fields.error });
      editedFields = fields;
    }

    const result = await finishResolution(s, 'approved', req.userId, editedFields);
    if (!result) return res.status(400).json({ error: 'This suggestion has already been resolved.' });
    await notifyOutcome(result);

    const shaped = await shapeSuggestions([sid], req.userId);
    res.json({ suggestion: shaped[sid] });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[planSuggestions/approveSuggestion]', err);
    res.status(500).json({ error: 'Failed to approve the suggestion.' });
  }
};

// ── POST /api/hives/:id/plan-suggestions/:sid/decline ────────────────────────
export const declineSuggestion = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const sid = req.params.sid;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return res.status(403).json({ error: 'Only owners and admins can decline a suggestion.' });
    }

    let s = await resolveIfOverdue(sid);
    if (!s || s.hive_id !== hiveId) return res.status(404).json({ error: 'Suggestion not found.' });
    if (s.status !== 'pending') return res.status(400).json({ error: 'This suggestion has already been resolved.' });

    const result = await finishResolution(s, 'declined', req.userId);
    if (!result) return res.status(400).json({ error: 'This suggestion has already been resolved.' });
    await notifyOutcome(result);

    const shaped = await shapeSuggestions([sid], req.userId);
    res.json({ suggestion: shaped[sid] });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[planSuggestions/declineSuggestion]', err);
    res.status(500).json({ error: 'Failed to decline the suggestion.' });
  }
};

// ── POST /api/hives/:id/plan-suggestions/:sid/withdraw ────────────────────────
export const withdrawSuggestion = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const sid = req.params.sid;
    await requireMembership(hiveId, req.userId);

    let s = await resolveIfOverdue(sid);
    if (!s || s.hive_id !== hiveId) return res.status(404).json({ error: 'Suggestion not found.' });
    if (s.suggested_by !== req.userId) {
      return res.status(403).json({ error: 'Only the person who suggested this can withdraw it.' });
    }
    if (s.status !== 'pending') return res.status(400).json({ error: 'This suggestion has already been resolved.' });

    const result = await finishResolution(s, 'withdrawn', req.userId);
    if (!result) return res.status(400).json({ error: 'This suggestion has already been resolved.' });

    const shaped = await shapeSuggestions([sid], req.userId);
    res.json({ suggestion: shaped[sid] });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[planSuggestions/withdrawSuggestion]', err);
    res.status(500).json({ error: 'Failed to withdraw the suggestion.' });
  }
};

// ── planSuggestionJob entry point ────────────────────────────────────────────
export async function resolveAllOverdueSuggestions() {
  const { rows } = await query(
    `SELECT suggestion_id, hive_id FROM hive_plan_suggestions
      WHERE status = 'pending' AND closes_at <= NOW()`,
  );
  let resolved = 0;
  for (const r of rows) {
    const s = await loadSuggestion(r.suggestion_id);
    if (!s || s.status !== 'pending') continue;
    const result = await resolveSuggestionRow(s);
    if (result) resolved++;
  }
  return { checked: rows.length, resolved };
}
