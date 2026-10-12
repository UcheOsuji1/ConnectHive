// Ideas board (Prompt 66 Part 3, tool_key = 'ideas') — "places we should go"
// and "things we should do," collected over time. CSS prefix (client): id-.
import { query } from '../db/index.js';
import { requireMembership, requireCanPost } from '../lib/hiveMembership.js';
import { validateUrl } from '../lib/validateUrl.js';
import { PLAN_TYPES } from './eventsController.js';
import { getIO } from '../realtime/socket.js';

const KINDS = ['place', 'activity', 'trip', 'other'];

function broadcast(hiveId, payload) {
  try { getIO()?.to(`hive:${hiveId}`).emit('idea_updated', { hive_id: hiveId, ...payload }); }
  catch { /* no socket in tests */ }
}

async function loadIdea(hiveId, ideaId) {
  const { rows: [i] } = await query(`SELECT * FROM hive_ideas WHERE idea_id = $1 AND hive_id = $2`, [ideaId, hiveId]);
  if (!i) { const err = new Error('Idea not found.'); err.status = 404; throw err; }
  return i;
}

function linkDomain(url) {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

async function shapeIdeas(rows, viewerId) {
  const ideaIds = rows.map(r => r.idea_id);
  const [{ rows: voteCounts }, { rows: myVotes }] = await Promise.all([
    ideaIds.length
      ? query(`SELECT idea_id, COUNT(*)::int AS n FROM hive_idea_votes WHERE idea_id = ANY($1) GROUP BY idea_id`, [ideaIds])
      : { rows: [] },
    ideaIds.length
      ? query(`SELECT idea_id FROM hive_idea_votes WHERE idea_id = ANY($1) AND user_id = $2`, [ideaIds, viewerId])
      : { rows: [] },
  ]);
  const countByIdea = Object.fromEntries(voteCounts.map(v => [v.idea_id, v.n]));
  const mySet = new Set(myVotes.map(v => v.idea_id));

  return rows.map(i => ({
    idea_id: i.idea_id, title: i.title, kind: i.kind, url: i.url, url_domain: linkDomain(i.url),
    location: i.location, note: i.note, plan_type: i.plan_type,
    created_by: i.created_by, created_by_name: i.created_by_name ?? null,
    created_by_photo: i.created_by_photo ?? null,
    created_at: i.created_at, done_at: i.done_at, plan_post_id: i.plan_post_id,
    vote_count: countByIdea[i.idea_id] ?? 0, my_vote: mySet.has(i.idea_id),
  }));
}

// ── GET /api/hives/:id/tools/ideas/ideas ───────────────────────────────────
// Active ideas sorted by votes then newest; Done ideas separately.
export const listIdeas = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const { rows } = await query(
      `SELECT i.*, pr.full_name AS created_by_name, pr.profile_photo_url AS created_by_photo,
              COUNT(v.user_id)::int AS vote_count
         FROM hive_ideas i
         LEFT JOIN profiles pr ON pr.user_id = i.created_by
         LEFT JOIN hive_idea_votes v ON v.idea_id = i.idea_id
        WHERE i.hive_id = $1 AND i.archived_at IS NULL
        GROUP BY i.idea_id, pr.full_name, pr.profile_photo_url
        ORDER BY (i.done_at IS NOT NULL) ASC, vote_count DESC, i.created_at DESC`,
      [hiveId],
    );
    const shaped = await shapeIdeas(rows, req.userId);
    res.json({
      ideas: shaped.filter(i => !i.done_at),
      done: shaped.filter(i => !!i.done_at),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[ideas/listIdeas]', err);
    res.status(500).json({ error: 'Failed to load ideas.' });
  }
};

// ── POST /api/hives/:id/tools/ideas/ideas ──────────────────────────────────
export const createIdea = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanPost(hiveId, req.userId);

    const title = String(req.body?.title ?? '').trim();
    if (title.length < 1 || title.length > 120) return res.status(400).json({ error: 'Title must be 1-120 characters.' });
    const kind = req.body?.kind;
    if (!KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of: ${KINDS.join(', ')}.` });
    const { url, error: urlError } = validateUrl(req.body?.url);
    if (urlError) return res.status(400).json({ error: urlError });
    const location = req.body?.location ? String(req.body.location).trim().slice(0, 200) : null;
    const note = String(req.body?.note ?? '');
    if (note.length > 500) return res.status(400).json({ error: 'note must be 500 characters or fewer.' });
    let planType = req.body?.planType || null;
    if (planType && !PLAN_TYPES.includes(planType)) return res.status(400).json({ error: 'That plan type is not recognised.' });

    const { rows: [idea] } = await query(
      `INSERT INTO hive_ideas (hive_id, title, kind, url, location, note, plan_type, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [hiveId, title, kind, url, location, note, planType, req.userId],
    );
    broadcast(hiveId, { kind: 'idea_created', idea_id: idea.idea_id });
    const [shaped] = await shapeIdeas([idea], req.userId);
    res.status(201).json({ idea: shaped });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[ideas/createIdea]', err);
    res.status(500).json({ error: 'Failed to add this idea.' });
  }
};

// ── PATCH /api/hives/:id/tools/ideas/ideas/:ideaId ─────────────────────────
// Creator only.
export const updateIdea = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadIdea(hiveId, req.params.ideaId);
    if (existing.created_by !== req.userId) {
      return res.status(403).json({ error: 'Only the person who posted this idea can edit it.' });
    }
    if (existing.done_at) return res.status(400).json({ error: 'This idea already became a plan and can no longer be edited.' });

    const title = req.body?.title !== undefined ? String(req.body.title).trim() : existing.title;
    if (title.length < 1 || title.length > 120) return res.status(400).json({ error: 'Title must be 1-120 characters.' });
    const kind = req.body?.kind !== undefined ? req.body.kind : existing.kind;
    if (!KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of: ${KINDS.join(', ')}.` });
    let url = existing.url;
    if (req.body?.url !== undefined) {
      const v = validateUrl(req.body.url);
      if (v.error) return res.status(400).json({ error: v.error });
      url = v.url;
    }
    const location = req.body?.location !== undefined ? (req.body.location ? String(req.body.location).trim().slice(0, 200) : null) : existing.location;
    const note = req.body?.note !== undefined ? String(req.body.note) : existing.note;
    if (note.length > 500) return res.status(400).json({ error: 'note must be 500 characters or fewer.' });
    let planType = req.body?.planType !== undefined ? req.body.planType : existing.plan_type;
    if (planType && !PLAN_TYPES.includes(planType)) return res.status(400).json({ error: 'That plan type is not recognised.' });

    const { rows: [idea] } = await query(
      `UPDATE hive_ideas SET title=$1, kind=$2, url=$3, location=$4, note=$5, plan_type=$6 WHERE idea_id=$7 RETURNING *`,
      [title, kind, url, location, note, planType, existing.idea_id],
    );
    broadcast(hiveId, { kind: 'idea_updated', idea_id: idea.idea_id });
    const [shaped] = await shapeIdeas([idea], req.userId);
    res.json({ idea: shaped });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[ideas/updateIdea]', err);
    res.status(500).json({ error: 'Failed to update this idea.' });
  }
};

// ── DELETE /api/hives/:id/tools/ideas/ideas/:ideaId ────────────────────────
// Archive — creator or owner/admin.
export const archiveIdea = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await requireMembership(hiveId, req.userId);
    const existing = await loadIdea(hiveId, req.params.ideaId);
    const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
    if (existing.created_by !== req.userId && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the creator or an owner/admin can archive this idea.' });
    }
    await query(`UPDATE hive_ideas SET archived_at = NOW() WHERE idea_id = $1`, [existing.idea_id]);
    broadcast(hiveId, { kind: 'idea_archived', idea_id: existing.idea_id });
    res.json({ archived: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[ideas/archiveIdea]', err);
    res.status(500).json({ error: 'Failed to archive this idea.' });
  }
};

// ── POST /api/hives/:id/tools/ideas/ideas/:ideaId/vote ─────────────────────
export const voteIdea = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanPost(hiveId, req.userId);
    const existing = await loadIdea(hiveId, req.params.ideaId);
    await query(`INSERT INTO hive_idea_votes (idea_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [existing.idea_id, req.userId]);
    broadcast(hiveId, { kind: 'idea_voted', idea_id: existing.idea_id });
    res.json({ voted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[ideas/voteIdea]', err);
    res.status(500).json({ error: 'Failed to vote for this idea.' });
  }
};

// ── DELETE /api/hives/:id/tools/ideas/ideas/:ideaId/vote ───────────────────
export const unvoteIdea = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadIdea(hiveId, req.params.ideaId);
    await query(`DELETE FROM hive_idea_votes WHERE idea_id = $1 AND user_id = $2`, [existing.idea_id, req.userId]);
    broadcast(hiveId, { kind: 'idea_voted', idea_id: existing.idea_id });
    res.json({ voted: false });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[ideas/unvoteIdea]', err);
    res.status(500).json({ error: 'Failed to remove your vote.' });
  }
};

// Used by hiveHomeController for the Social Home module's "Top idea" slot,
// which alternates with Recent media.
export async function getTopIdea(hiveId) {
  const { rows: [i] } = await query(
    `SELECT i.*, COUNT(v.user_id)::int AS vote_count
       FROM hive_ideas i LEFT JOIN hive_idea_votes v ON v.idea_id = i.idea_id
      WHERE i.hive_id = $1 AND i.archived_at IS NULL AND i.done_at IS NULL
      GROUP BY i.idea_id
      ORDER BY vote_count DESC, i.created_at DESC
      LIMIT 1`,
    [hiveId],
  );
  if (!i) return null;
  return {
    idea_id: i.idea_id, title: i.title, kind: i.kind, location: i.location,
    vote_count: Number(i.vote_count),
  };
}
