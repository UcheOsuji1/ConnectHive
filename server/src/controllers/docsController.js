// Hive docs (Prompt 63 Part 1, tool_key = 'docs') — a shared, versioned doc
// space. body is markdown; rendering + sanitizing happens client-side
// (client/src/lib/safeMarkdown.js) — this controller never interprets it.
//
// Editing permission: owners/admins can always create, edit, pin, delete and
// restore a revision. Members can also create and edit when the tool's
// `editors` setting is 'members' — but pin/delete/restore stay owner/admin
// only regardless of that setting (a moderation boundary, not a writing one).
//
// Concurrency: updateDoc takes the `updatedAt` the client last loaded. If the
// doc has moved on since, the UPDATE's WHERE clause matches zero rows and we
// 409 with the current version instead of silently overwriting someone
// else's edit.
import { query, getClient } from '../db/index.js';
import { requireMembership, requireCanPost } from '../lib/hiveMembership.js';
import { getToolSettings } from '../lib/hiveTools.js';

const REVISION_CAP = 25;

async function getEditors(hiveId) {
  const settings = await getToolSettings(hiveId, 'docs');
  return settings?.editors === 'members' ? 'members' : 'owners';
}

async function requireCanEdit(hiveId, userId) {
  const member = await requireMembership(hiveId, userId);
  const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
  if (isOwnerOrAdmin) return member;

  const editors = await getEditors(hiveId);
  if (editors !== 'members') {
    const err = new Error('Only owners and admins can edit docs in this Hive.');
    err.status = 403;
    throw err;
  }
  await requireCanPost(hiveId, userId);
  return member;
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

async function loadDoc(hiveId, docId) {
  const { rows: [d] } = await query(
    `SELECT doc.*, pr.full_name AS updated_by_name
       FROM hive_docs doc
       LEFT JOIN profiles pr ON pr.user_id = doc.updated_by
      WHERE doc.doc_id = $1`,
    [docId],
  );
  if (!d || d.hive_id !== hiveId || d.deleted_at) {
    const err = new Error('Doc not found.');
    err.status = 404;
    throw err;
  }
  return d;
}

function validateTitleBody(raw) {
  const title = String(raw?.title ?? '').trim();
  if (!title) return { error: 'A title is required.' };
  if (title.length > 120) return { error: 'Title must be 120 characters or fewer.' };
  const body = String(raw?.body ?? '');
  if (body.length > 50000) return { error: 'A doc can be at most 50,000 characters.' };
  return { title, body };
}

// Inserts a revision snapshot and prunes anything past the last 25, in the
// same transaction as the caller's save — never a separate, skippable step.
async function saveRevisionAndPrune(client, docId, title, body, userId) {
  await client.query(
    `INSERT INTO hive_doc_revisions (doc_id, title, body, edited_by) VALUES ($1,$2,$3,$4)`,
    [docId, title, body, userId],
  );
  await client.query(
    `DELETE FROM hive_doc_revisions
      WHERE doc_id = $1 AND revision_id NOT IN (
        SELECT revision_id FROM hive_doc_revisions WHERE doc_id = $1 ORDER BY edited_at DESC LIMIT ${REVISION_CAP}
      )`,
    [docId],
  );
}

// ── GET /api/hives/:id/tools/docs/docs ───────────────────────────────────────
export const listDocs = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const { rows } = await query(
      `SELECT doc.doc_id, doc.hive_id, doc.title, doc.icon, doc.pinned, doc.updated_at,
              pr.full_name AS updated_by_name
         FROM hive_docs doc
         LEFT JOIN profiles pr ON pr.user_id = doc.updated_by
        WHERE doc.hive_id = $1 AND doc.deleted_at IS NULL
        ORDER BY doc.pinned DESC, doc.updated_at DESC`,
      [hiveId],
    );
    const editors = await getEditors(hiveId);
    res.json({ docs: rows, editors });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[docs/listDocs]', err);
    res.status(500).json({ error: 'Failed to load docs.' });
  }
};

// ── POST /api/hives/:id/tools/docs/docs ──────────────────────────────────────
export const createDoc = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanEdit(hiveId, req.userId);

    const v = validateTitleBody(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const icon = req.body?.icon ? String(req.body.icon).slice(0, 40) : null;

    const client = await getClient();
    let docId;
    try {
      await client.query('BEGIN');
      const { rows: [d] } = await client.query(
        `INSERT INTO hive_docs (hive_id, title, body, icon, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$5) RETURNING doc_id`,
        [hiveId, v.title, v.body, icon, req.userId],
      );
      docId = d.doc_id;
      await saveRevisionAndPrune(client, docId, v.title, v.body, req.userId);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // Offer (never auto-apply) a pinned_goal-style replace only the first
    // time this Hive ever creates a doc — a one-shot hint, not a migration.
    const { rows: [countRow] } = await query(`SELECT COUNT(*)::int AS n FROM hive_docs WHERE hive_id = $1`, [hiveId]);
    const doc = await loadDoc(hiveId, docId);
    res.status(201).json({ doc, isFirstDoc: countRow.n === 1 });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[docs/createDoc]', err);
    res.status(500).json({ error: 'Failed to create the doc.' });
  }
};

// ── GET /api/hives/:id/tools/docs/docs/:docId ────────────────────────────────
export const getDoc = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const doc = await loadDoc(hiveId, req.params.docId);
    const editors = await getEditors(hiveId);
    res.json({ doc, editors });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[docs/getDoc]', err);
    res.status(500).json({ error: 'Failed to load this doc.' });
  }
};

// ── PATCH /api/hives/:id/tools/docs/docs/:docId ──────────────────────────────
// Body: { title, body, updatedAt } — updatedAt must match what the client
// loaded, or this 409s with the current version instead of overwriting it.
export const updateDoc = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanEdit(hiveId, req.userId);
    const existing = await loadDoc(hiveId, req.params.docId);

    const v = validateTitleBody(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const clientUpdatedAt = req.body?.updatedAt ? new Date(req.body.updatedAt) : null;
    if (!clientUpdatedAt || isNaN(clientUpdatedAt.getTime())) {
      return res.status(400).json({ error: 'updatedAt (the version you loaded) is required.' });
    }

    const client = await getClient();
    let conflict = false;
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        `UPDATE hive_docs SET title = $1, body = $2, updated_by = $3, updated_at = NOW()
          WHERE doc_id = $4 AND updated_at = $5`,
        [v.title, v.body, req.userId, existing.doc_id, clientUpdatedAt.toISOString()],
      );
      if (rowCount === 0) {
        conflict = true;
      } else {
        await saveRevisionAndPrune(client, existing.doc_id, v.title, v.body, req.userId);
      }
      await client.query(conflict ? 'ROLLBACK' : 'COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    if (conflict) {
      const current = await loadDoc(hiveId, existing.doc_id);
      return res.status(409).json({ error: 'This doc changed since you loaded it.', current });
    }

    const doc = await loadDoc(hiveId, existing.doc_id);
    res.json({ doc });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[docs/updateDoc]', err);
    res.status(500).json({ error: 'Failed to save the doc.' });
  }
};

// ── POST /api/hives/:id/tools/docs/docs/:docId/pin ───────────────────────────
// ── DELETE /api/hives/:id/tools/docs/docs/:docId/pin ─────────────────────────
export const setDocPinned = (pinned) => async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireOwnerAdmin(hiveId, req.userId);
    const existing = await loadDoc(hiveId, req.params.docId);
    await query(`UPDATE hive_docs SET pinned = $1 WHERE doc_id = $2`, [pinned, existing.doc_id]);
    const doc = await loadDoc(hiveId, existing.doc_id);
    res.json({ doc });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[docs/setDocPinned]', err);
    res.status(500).json({ error: 'Failed to update this doc.' });
  }
};

// ── DELETE /api/hives/:id/tools/docs/docs/:docId ─────────────────────────────
export const deleteDoc = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireOwnerAdmin(hiveId, req.userId);
    const existing = await loadDoc(hiveId, req.params.docId);
    await query(`UPDATE hive_docs SET deleted_at = NOW() WHERE doc_id = $1`, [existing.doc_id]);
    res.json({ deleted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[docs/deleteDoc]', err);
    res.status(500).json({ error: 'Failed to delete this doc.' });
  }
};

// ── GET /api/hives/:id/tools/docs/docs/:docId/revisions ──────────────────────
export const listRevisions = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const doc = await loadDoc(hiveId, req.params.docId);
    const { rows } = await query(
      `SELECT r.revision_id, r.title, r.edited_at, pr.full_name AS edited_by_name
         FROM hive_doc_revisions r
         LEFT JOIN profiles pr ON pr.user_id = r.edited_by
        WHERE r.doc_id = $1
        ORDER BY r.edited_at DESC`,
      [doc.doc_id],
    );
    res.json({ revisions: rows });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[docs/listRevisions]', err);
    res.status(500).json({ error: 'Failed to load revision history.' });
  }
};

// ── POST /api/hives/:id/tools/docs/docs/:docId/revisions/:revisionId/restore ─
// Owner/admin only. Restoring sets the doc's current content to the chosen
// revision's content and records that as a NEW revision (history only grows
// forward — nothing is deleted except by the 25-cap prune).
export const restoreRevision = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireOwnerAdmin(hiveId, req.userId);
    const doc = await loadDoc(hiveId, req.params.docId);

    const { rows: [rev] } = await query(
      `SELECT * FROM hive_doc_revisions WHERE revision_id = $1 AND doc_id = $2`,
      [req.params.revisionId, doc.doc_id],
    );
    if (!rev) return res.status(404).json({ error: 'That revision no longer exists.' });

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE hive_docs SET title = $1, body = $2, updated_by = $3, updated_at = NOW() WHERE doc_id = $4`,
        [rev.title, rev.body, req.userId, doc.doc_id],
      );
      await saveRevisionAndPrune(client, doc.doc_id, rev.title, rev.body, req.userId);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    const updated = await loadDoc(hiveId, doc.doc_id);
    res.json({ doc: updated });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[docs/restoreRevision]', err);
    res.status(500).json({ error: 'Failed to restore that revision.' });
  }
};

// ── Pinned docs for Chat's context rail and About ────────────────────────────
export async function getPinnedDocs(hiveId, limit = 5) {
  const { rows } = await query(
    `SELECT doc_id, title, icon, updated_at FROM hive_docs
      WHERE hive_id = $1 AND pinned = TRUE AND deleted_at IS NULL
      ORDER BY updated_at DESC LIMIT ${limit}`,
    [hiveId],
  );
  return rows;
}
