import { query, getClient } from '../db/index.js';
import { getMembership, requireMembership } from '../lib/hiveMembership.js';
import { getIO } from '../realtime/socket.js';
import { getEnrichedMessage, depersonalise } from './messagesController.js';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

// ── Shared loaders ───────────────────────────────────────────────────────────

export async function loadPoll(pollId) {
  const { rows: [p] } = await query(
    `SELECT poll_id, hive_id, channel_id, created_by, question,
            allows_multiple, closes_at, created_at
       FROM hive_polls WHERE poll_id = $1`,
    [pollId],
  );
  return p;
}

// Options with their counts, plus this viewer's votes. One query per poll set,
// never one per option.
export async function shapePolls(pollIds, viewerId) {
  if (!pollIds.length) return {};
  const [{ rows: polls }, { rows: options }, { rows: mine }] = await Promise.all([
    query(
      `SELECT poll_id, question, allows_multiple, closes_at, created_by, created_at
         FROM hive_polls WHERE poll_id = ANY($1)`, [pollIds]),
    query(
      `SELECT o.option_id, o.poll_id, o.label, o.position,
              COUNT(v.user_id)::int AS count
         FROM hive_poll_options o
         LEFT JOIN hive_poll_votes v ON v.option_id = o.option_id
        WHERE o.poll_id = ANY($1)
        GROUP BY o.option_id
        ORDER BY o.position ASC`, [pollIds]),
    query(
      `SELECT poll_id, option_id FROM hive_poll_votes
        WHERE poll_id = ANY($1) AND user_id = $2`, [pollIds, viewerId]),
  ]);

  const byPoll = {};
  for (const p of polls) {
    byPoll[p.poll_id] = {
      poll_id: p.poll_id,
      question: p.question,
      allows_multiple: p.allows_multiple,
      closes_at: p.closes_at,
      closed: Boolean(p.closes_at && new Date(p.closes_at) <= new Date()),
      created_by: p.created_by,
      created_at: p.created_at,
      options: [],
      total_votes: 0,
      my_votes: [],
    };
  }
  for (const o of options) {
    const p = byPoll[o.poll_id];
    if (!p) continue;
    p.options.push({ option_id: o.option_id, label: o.label, position: o.position, count: o.count });
    p.total_votes += o.count;
  }
  for (const v of mine) byPoll[v.poll_id]?.my_votes.push(v.option_id);
  return byPoll;
}

// Counts only — never one viewer's my_votes, which is per recipient.
async function pollCounts(pollId) {
  const { rows } = await query(
    `SELECT o.option_id, COUNT(v.user_id)::int AS count
       FROM hive_poll_options o
       LEFT JOIN hive_poll_votes v ON v.option_id = o.option_id
      WHERE o.poll_id = $1
      GROUP BY o.option_id`, [pollId]);
  return { results: rows, total_votes: rows.reduce((n, r) => n + r.count, 0) };
}

function broadcastPoll(hiveId, pollId, payload) {
  getIO()?.to(`hive:${hiveId}`).emit('poll_updated', { hive_id: hiveId, poll_id: pollId, ...payload });
}

// ── POST /api/hives/:id/polls ────────────────────────────────────────────────
// Creates the poll, its options and its message in one transaction.
export const createPoll = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await getMembership(hiveId, req.userId);
    if (!member) return res.status(403).json({ error: 'You must be a member of this Hive.' });

    const { channelId, question, options, allowsMultiple, closesAt } = req.body ?? {};

    const q = String(question ?? '').trim();
    if (!q)              return res.status(400).json({ error: 'A question is required.' });
    if (q.length > 200)  return res.status(400).json({ error: 'The question must be 200 characters or fewer.' });

    const labels = (Array.isArray(options) ? options : [])
      .map(o => String(o ?? '').trim()).filter(Boolean);
    if (labels.length < MIN_OPTIONS || labels.length > MAX_OPTIONS) {
      return res.status(400).json({ error: `A poll needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} options.` });
    }
    if (labels.some(l => l.length > 80)) {
      return res.status(400).json({ error: 'Each option must be 80 characters or fewer.' });
    }

    const { rows: [ch] } = await query(
      `SELECT channel_id FROM hive_channels WHERE channel_id = $1 AND hive_id = $2`,
      [channelId, hiveId],
    );
    if (!ch) return res.status(400).json({ error: 'That room does not belong to this Hive.' });

    let closes = null;
    if (closesAt) {
      closes = new Date(closesAt);
      if (isNaN(closes.getTime())) return res.status(400).json({ error: 'Closing time is not a valid date.' });
      if (closes.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'Closing time must be in the future.' });
      }
    }

    const client = await getClient();
    let pollId, messageId;
    try {
      await client.query('BEGIN');
      const { rows: [poll] } = await client.query(
        `INSERT INTO hive_polls (hive_id, channel_id, created_by, question, allows_multiple, closes_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING poll_id`,
        [hiveId, channelId, req.userId, q, Boolean(allowsMultiple), closes],
      );
      pollId = poll.poll_id;
      for (const [i, label] of labels.entries()) {
        await client.query(
          `INSERT INTO hive_poll_options (poll_id, label, position) VALUES ($1,$2,$3)`,
          [pollId, label, i],
        );
      }
      const { rows: [msg] } = await client.query(
        `INSERT INTO messages (hive_id, channel_id, sender_user_id, message_text, poll_id)
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

    // The poll's message is inserted inside the transaction rather than through
    // createMessage, so it has to be broadcast here — otherwise the card only
    // appeared after a reload, for everyone including its creator.
    const msg = await getEnrichedMessage(messageId, req.userId);
    try {
      const io = getIO();
      io?.to(`hive:${hiveId}:ch:${channelId}`).emit('receive_message', depersonalise(msg));
      io?.to(`hive:${hiveId}`).emit('channel_activity', { hive_id: hiveId, channel_id: channelId });
    } catch { /* no socket in tests */ }

    const shaped = await shapePolls([pollId], req.userId);
    res.status(201).json({ poll: shaped[pollId], message_id: messageId, message: msg });
  } catch (err) {
    console.error('[polls/createPoll]', err);
    res.status(500).json({ error: 'Failed to create the poll.' });
  }
};

// ── POST /api/hives/:id/polls/:pollId/vote ───────────────────────────────────
// Replaces this user's votes. Single-choice is enforced in the handler and
// inside the transaction, so a double submit cannot leave two rows behind.
export const votePoll = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const poll = await loadPoll(req.params.pollId);
    if (!poll || poll.hive_id !== hiveId) {
      return res.status(404).json({ error: 'Poll not found.' });
    }
    if (poll.closes_at && new Date(poll.closes_at) <= new Date()) {
      return res.status(400).json({ error: 'This poll has closed.' });
    }

    const ids = Array.isArray(req.body?.optionIds) ? req.body.optionIds : [];
    if (ids.length === 0) return res.status(400).json({ error: 'Pick at least one option.' });
    if (!poll.allows_multiple && ids.length > 1) {
      return res.status(400).json({ error: 'This poll allows one choice.' });
    }

    const { rows: valid } = await query(
      `SELECT option_id FROM hive_poll_options WHERE poll_id = $1 AND option_id = ANY($2)`,
      [poll.poll_id, ids],
    );
    if (valid.length !== ids.length) {
      return res.status(400).json({ error: 'That option does not belong to this poll.' });
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      // Replacing means clearing first — this is also what keeps a
      // single-choice poll to one row per user whatever the client sends.
      await client.query(
        `DELETE FROM hive_poll_votes WHERE poll_id = $1 AND user_id = $2`,
        [poll.poll_id, req.userId],
      );
      const toInsert = poll.allows_multiple ? ids : ids.slice(0, 1);
      for (const optionId of toInsert) {
        await client.query(
          `INSERT INTO hive_poll_votes (poll_id, option_id, user_id) VALUES ($1,$2,$3)`,
          [poll.poll_id, optionId, req.userId],
        );
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    const counts = await pollCounts(poll.poll_id);
    broadcastPoll(hiveId, poll.poll_id, counts);
    const shaped = await shapePolls([poll.poll_id], req.userId);
    res.json({ poll: shaped[poll.poll_id] });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[polls/votePoll]', err);
    res.status(500).json({ error: 'Failed to record your vote.' });
  }
};

// ── DELETE /api/hives/:id/polls/:pollId/vote ─────────────────────────────────
export const clearVote = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const poll = await loadPoll(req.params.pollId);
    if (!poll || poll.hive_id !== hiveId) return res.status(404).json({ error: 'Poll not found.' });
    if (poll.closes_at && new Date(poll.closes_at) <= new Date()) {
      return res.status(400).json({ error: 'This poll has closed.' });
    }

    await query(`DELETE FROM hive_poll_votes WHERE poll_id = $1 AND user_id = $2`,
      [poll.poll_id, req.userId]);

    const counts = await pollCounts(poll.poll_id);
    broadcastPoll(hiveId, poll.poll_id, counts);
    const shaped = await shapePolls([poll.poll_id], req.userId);
    res.json({ poll: shaped[poll.poll_id] });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[polls/clearVote]', err);
    res.status(500).json({ error: 'Failed to clear your vote.' });
  }
};

// ── GET /api/hives/:id/polls/:pollId/voters ──────────────────────────────────
// Members only. Names are visible inside the Hive; outsiders get 403.
export const listVoters = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const poll = await loadPoll(req.params.pollId);
    if (!poll || poll.hive_id !== hiveId) return res.status(404).json({ error: 'Poll not found.' });

    const { rows } = await query(
      `SELECT v.option_id, v.user_id, v.voted_at, pr.full_name, pr.profile_photo_url
         FROM hive_poll_votes v
         JOIN hive_members m ON m.hive_id = $2 AND m.user_id = v.user_id
                            AND m.membership_status = 'active'
         LEFT JOIN profiles pr ON pr.user_id = v.user_id
        WHERE v.poll_id = $1
        ORDER BY v.voted_at ASC`,
      [poll.poll_id, hiveId],
    );

    const byOption = {};
    for (const r of rows) {
      (byOption[r.option_id] ??= []).push({
        user_id: r.user_id, full_name: r.full_name, profile_photo_url: r.profile_photo_url,
      });
    }
    res.json({ voters: byOption });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[polls/listVoters]', err);
    res.status(500).json({ error: 'Failed to load voters.' });
  }
};
