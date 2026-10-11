// Task board and milestones (Prompt 65 Part 2, tool_key = 'tasks').
import { query } from '../db/index.js';
import { requireMembership, requireCanPost } from '../lib/hiveMembership.js';
import { positionBetween } from '../lib/fractionalPosition.js';
import { createNotification } from './notificationsController.js';
import { getIO } from '../realtime/socket.js';

const STATUSES = ['todo', 'doing', 'done'];
const LINK_KINDS = ['file', 'doc', 'url', 'plan'];

function broadcast(hiveId, payload) {
  try { getIO()?.to(`hive:${hiveId}`).emit('task_updated', { hive_id: hiveId, ...payload }); }
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

async function loadTask(hiveId, taskId) {
  const { rows: [t] } = await query(
    `SELECT * FROM hive_tasks WHERE task_id = $1 AND hive_id = $2 AND deleted_at IS NULL`,
    [taskId, hiveId],
  );
  if (!t) { const err = new Error('Task not found.'); err.status = 404; throw err; }
  return t;
}

// Creator, any assignee, or owner/admin — the "can edit title/description/
// assignees" set. Moving (status/position) is a separate, wider permission.
async function canEditTask(hiveId, userId, task) {
  if (task.created_by === userId) return true;
  const member = await requireMembership(hiveId, userId);
  if (member.role === 'owner' || member.role === 'admin') return true;
  const { rows: [a] } = await query(
    `SELECT 1 FROM hive_task_assignees WHERE task_id = $1 AND user_id = $2`, [task.task_id, userId]);
  return !!a;
}

// Recomputes (and flips, exactly on the transition) a milestone's
// completed_at: complete the instant every one of its tasks is done and it
// has at least one; un-complete the instant a task reopens. Idempotent —
// calling this when nothing changed is a no-op UPDATE.
async function recomputeMilestone(milestoneId) {
  if (!milestoneId) return;
  const { rows: [agg] } = await query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'done')::int AS done
       FROM hive_tasks WHERE milestone_id = $1 AND deleted_at IS NULL`,
    [milestoneId],
  );
  const { rows: [m] } = await query(`SELECT completed_at FROM hive_milestones WHERE milestone_id = $1`, [milestoneId]);
  if (!m) return;
  const shouldBeComplete = agg.total > 0 && agg.done === agg.total;
  if (shouldBeComplete && !m.completed_at) {
    await query(`UPDATE hive_milestones SET completed_at = NOW() WHERE milestone_id = $1`, [milestoneId]);
  } else if (!shouldBeComplete && m.completed_at) {
    await query(`UPDATE hive_milestones SET completed_at = NULL WHERE milestone_id = $1`, [milestoneId]);
  }
}

// ═══════════════════════════ Milestones ═══════════════════════════════════

// ── GET /api/hives/:id/tools/tasks/milestones ─────────────────────────────
export const listMilestones = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const { rows } = await query(
      `SELECT ms.*,
              COUNT(t.task_id)::int AS total_tasks,
              COUNT(t.task_id) FILTER (WHERE t.status = 'done')::int AS done_tasks
         FROM hive_milestones ms
         LEFT JOIN hive_tasks t ON t.milestone_id = ms.milestone_id AND t.deleted_at IS NULL
        WHERE ms.hive_id = $1
        GROUP BY ms.milestone_id
        ORDER BY (ms.completed_at IS NOT NULL) ASC, ms.due_on ASC NULLS LAST, ms.created_at ASC`,
      [hiveId],
    );
    res.json({
      milestones: rows.map(m => ({
        milestone_id: m.milestone_id, title: m.title, due_on: m.due_on, completed_at: m.completed_at,
        total_tasks: m.total_tasks, done_tasks: m.done_tasks,
        progress_pct: m.total_tasks > 0 ? Math.round((m.done_tasks / m.total_tasks) * 100) : 0,
      })),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/listMilestones]', err);
    res.status(500).json({ error: 'Failed to load milestones.' });
  }
};

// ── POST /api/hives/:id/tools/tasks/milestones ────────────────────────────
export const createMilestone = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireOwnerAdmin(hiveId, req.userId);
    const title = String(req.body?.title ?? '').trim();
    if (title.length < 1 || title.length > 120) return res.status(400).json({ error: 'Title must be 1-120 characters.' });
    const dueOn = req.body?.dueOn || null;
    if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return res.status(400).json({ error: 'dueOn must be a valid date.' });

    const { rows: [m] } = await query(
      `INSERT INTO hive_milestones (hive_id, title, due_on, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [hiveId, title, dueOn, req.userId],
    );
    broadcast(hiveId, { kind: 'milestone_created', milestone_id: m.milestone_id });
    res.status(201).json({ milestone: m });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/createMilestone]', err);
    res.status(500).json({ error: 'Failed to create this milestone.' });
  }
};

// ── PATCH /api/hives/:id/tools/tasks/milestones/:milestoneId ──────────────
export const updateMilestone = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireOwnerAdmin(hiveId, req.userId);
    const { rows: [existing] } = await query(
      `SELECT * FROM hive_milestones WHERE milestone_id = $1 AND hive_id = $2`, [req.params.milestoneId, hiveId]);
    if (!existing) return res.status(404).json({ error: 'Milestone not found.' });

    const title = req.body?.title !== undefined ? String(req.body.title).trim() : existing.title;
    if (title.length < 1 || title.length > 120) return res.status(400).json({ error: 'Title must be 1-120 characters.' });
    const dueOn = req.body?.dueOn !== undefined ? (req.body.dueOn || null) : existing.due_on;

    const { rows: [m] } = await query(
      `UPDATE hive_milestones SET title = $1, due_on = $2 WHERE milestone_id = $3 RETURNING *`,
      [title, dueOn, existing.milestone_id],
    );
    broadcast(hiveId, { kind: 'milestone_updated', milestone_id: m.milestone_id });
    res.json({ milestone: m });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/updateMilestone]', err);
    res.status(500).json({ error: 'Failed to update this milestone.' });
  }
};

// ── DELETE /api/hives/:id/tools/tasks/milestones/:milestoneId ─────────────
export const deleteMilestone = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireOwnerAdmin(hiveId, req.userId);
    const { rows: [existing] } = await query(
      `SELECT milestone_id FROM hive_milestones WHERE milestone_id = $1 AND hive_id = $2`, [req.params.milestoneId, hiveId]);
    if (!existing) return res.status(404).json({ error: 'Milestone not found.' });
    // Tasks keep existing (milestone_id -> NULL via FK ON DELETE SET NULL).
    await query(`DELETE FROM hive_milestones WHERE milestone_id = $1`, [existing.milestone_id]);
    broadcast(hiveId, { kind: 'milestone_deleted', milestone_id: existing.milestone_id });
    res.json({ deleted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/deleteMilestone]', err);
    res.status(500).json({ error: 'Failed to delete this milestone.' });
  }
};

// ═══════════════════════════════ Tasks ═════════════════════════════════════

async function shapeTasks(rows) {
  const taskIds = rows.map(r => r.task_id);
  const [{ rows: assigneeRows }, { rows: commentCountRows }] = await Promise.all([
    taskIds.length
      ? query(
          `SELECT ta.task_id, pr.user_id, pr.full_name, pr.profile_photo_url
             FROM hive_task_assignees ta LEFT JOIN profiles pr ON pr.user_id = ta.user_id
            WHERE ta.task_id = ANY($1)`,
          [taskIds],
        )
      : { rows: [] },
    taskIds.length
      ? query(
          `SELECT task_id, COUNT(*)::int AS n FROM hive_task_comments
            WHERE task_id = ANY($1) AND deleted_at IS NULL GROUP BY task_id`,
          [taskIds],
        )
      : { rows: [] },
  ]);
  const assigneesByTask = {};
  for (const a of assigneeRows) (assigneesByTask[a.task_id] ??= []).push({ user_id: a.user_id, full_name: a.full_name, profile_photo_url: a.profile_photo_url });
  const commentCountByTask = Object.fromEntries(commentCountRows.map(r => [r.task_id, r.n]));

  return rows.map(t => ({
    task_id: t.task_id, title: t.title, description: t.description, status: t.status,
    position: Number(t.position), milestone_id: t.milestone_id, due_on: t.due_on,
    created_by: t.created_by, created_at: t.created_at, updated_at: t.updated_at, completed_at: t.completed_at,
    assignees: assigneesByTask[t.task_id] ?? [],
    comment_count: commentCountByTask[t.task_id] ?? 0,
  }));
}

// ── GET /api/hives/:id/tools/tasks/tasks ──────────────────────────────────
export const listTasks = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const params = [hiveId];
    let where = `t.hive_id = $1 AND t.deleted_at IS NULL`;
    let join = '';
    if (req.query.assignedToMe === 'true') {
      params.push(req.userId);
      join = `JOIN hive_task_assignees ta2 ON ta2.task_id = t.task_id AND ta2.user_id = $${params.length}`;
    }
    if (req.query.milestoneId) {
      params.push(req.query.milestoneId);
      where += ` AND t.milestone_id = $${params.length}`;
    }
    if (req.query.dueThisWeek === 'true') {
      where += ` AND t.due_on IS NOT NULL AND t.due_on BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')::date`;
    }

    const { rows } = await query(
      `SELECT t.* FROM hive_tasks t ${join} WHERE ${where} ORDER BY t.status, t.position ASC`,
      params,
    );
    res.json({ tasks: await shapeTasks(rows) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/listTasks]', err);
    res.status(500).json({ error: 'Failed to load tasks.' });
  }
};

// ── GET /api/hives/:id/tools/tasks/tasks/:taskId ──────────────────────────
export const getTask = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const task = await loadTask(hiveId, req.params.taskId);
    const [shaped] = await shapeTasks([task]);

    const [{ rows: links }, { rows: comments }] = await Promise.all([
      query(`SELECT link_id, kind, ref, label FROM hive_task_links WHERE task_id = $1`, [task.task_id]),
      query(
        `SELECT c.comment_id, c.body, c.created_at, c.deleted_at, pr.user_id, pr.full_name, pr.profile_photo_url
           FROM hive_task_comments c LEFT JOIN profiles pr ON pr.user_id = c.user_id
          WHERE c.task_id = $1 ORDER BY c.created_at ASC`,
        [task.task_id],
      ),
    ]);

    res.json({
      task: {
        ...shaped, links,
        comments: comments.map(c => ({
          comment_id: c.comment_id, created_at: c.created_at,
          body: c.deleted_at ? null : c.body, is_deleted: !!c.deleted_at,
          author: { user_id: c.user_id, full_name: c.full_name, profile_photo_url: c.profile_photo_url },
        })),
      },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/getTask]', err);
    res.status(500).json({ error: 'Failed to load this task.' });
  }
};

// ── POST /api/hives/:id/tools/tasks/tasks ─────────────────────────────────
export const createTask = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanPost(hiveId, req.userId);

    const title = String(req.body?.title ?? '').trim();
    if (title.length < 1 || title.length > 160) return res.status(400).json({ error: 'Title must be 1-160 characters.' });
    const description = String(req.body?.description ?? '');
    if (description.length > 4000) return res.status(400).json({ error: 'Description must be 4000 characters or fewer.' });
    const dueOn = req.body?.dueOn || null;
    if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return res.status(400).json({ error: 'dueOn must be a valid date.' });

    let milestoneId = null;
    if (req.body?.milestoneId) {
      const { rows: [ms] } = await query(`SELECT milestone_id FROM hive_milestones WHERE milestone_id = $1 AND hive_id = $2`, [req.body.milestoneId, hiveId]);
      if (!ms) return res.status(400).json({ error: 'That milestone does not belong to this Hive.' });
      milestoneId = ms.milestone_id;
    }

    const assigneeIds = [...new Set((Array.isArray(req.body?.assigneeIds) ? req.body.assigneeIds : []).filter(Boolean))];
    let validAssignees = [];
    if (assigneeIds.length) {
      const { rows } = await query(
        `SELECT user_id FROM hive_members WHERE hive_id = $1 AND membership_status = 'active' AND user_id = ANY($2)`,
        [hiveId, assigneeIds],
      );
      validAssignees = rows.map(r => r.user_id);
    }

    const { rows: [{ maxPos }] } = await query(
      `SELECT COALESCE(MAX(position), 0) AS "maxPos" FROM hive_tasks WHERE hive_id = $1 AND status = 'todo' AND deleted_at IS NULL`,
      [hiveId],
    );

    const { rows: [t] } = await query(
      `INSERT INTO hive_tasks (hive_id, title, description, status, position, milestone_id, due_on, created_by)
       VALUES ($1,$2,$3,'todo',$4,$5,$6,$7) RETURNING *`,
      [hiveId, title, description, Number(maxPos) + 1, milestoneId, dueOn, req.userId],
    );

    if (validAssignees.length) {
      for (const uid of validAssignees) {
        await query(`INSERT INTO hive_task_assignees (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [t.task_id, uid]);
      }
      const { rows: [me] } = await query(`SELECT full_name FROM profiles WHERE user_id = $1`, [req.userId]);
      await Promise.all(validAssignees.filter(uid => uid !== req.userId).map(uid => createNotification({
        userId: uid, type: 'task_assigned', category: 'tasks',
        title: `${me?.full_name ?? 'Someone'} assigned you a task: ${title}`,
        hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/tools/tasks?task=${t.task_id}`,
      }).catch(e => console.error('[tasks/createTask] assign notify failed', e))));
    }

    if (milestoneId) await recomputeMilestone(milestoneId);
    broadcast(hiveId, { kind: 'created', task_id: t.task_id, status: t.status });
    const [shaped] = await shapeTasks([t]);
    res.status(201).json({ task: shaped });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/createTask]', err);
    res.status(500).json({ error: 'Failed to create this task.' });
  }
};

// ── PATCH /api/hives/:id/tools/tasks/tasks/:taskId ────────────────────────
// Title, description, assignees, milestone, due date — creator/assignee/owner-admin only.
export const updateTask = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadTask(hiveId, req.params.taskId);
    if (!(await canEditTask(hiveId, req.userId, existing))) {
      return res.status(403).json({ error: 'Only the creator, an assignee, or an owner/admin can edit this task.' });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (req.body?.title !== undefined) {
      const title = String(req.body.title).trim();
      if (title.length < 1 || title.length > 160) return res.status(400).json({ error: 'Title must be 1-160 characters.' });
      fields.push(`title = $${++idx}`); values.push(title);
    }
    if (req.body?.description !== undefined) {
      const description = String(req.body.description);
      if (description.length > 4000) return res.status(400).json({ error: 'Description must be 4000 characters or fewer.' });
      fields.push(`description = $${++idx}`); values.push(description);
    }
    if (req.body?.dueOn !== undefined) {
      const dueOn = req.body.dueOn || null;
      if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return res.status(400).json({ error: 'dueOn must be a valid date.' });
      fields.push(`due_on = $${++idx}`); values.push(dueOn);
    }
    let newMilestoneId;
    if (req.body?.milestoneId !== undefined) {
      if (req.body.milestoneId) {
        const { rows: [ms] } = await query(`SELECT milestone_id FROM hive_milestones WHERE milestone_id = $1 AND hive_id = $2`, [req.body.milestoneId, hiveId]);
        if (!ms) return res.status(400).json({ error: 'That milestone does not belong to this Hive.' });
        newMilestoneId = ms.milestone_id;
      } else {
        newMilestoneId = null;
      }
      fields.push(`milestone_id = $${++idx}`); values.push(newMilestoneId);
    }

    if (fields.length) {
      await query(`UPDATE hive_tasks SET ${fields.join(', ')}, updated_at = NOW() WHERE task_id = $1`, [existing.task_id, ...values]);
    }

    if (Array.isArray(req.body?.assigneeIds)) {
      const assigneeIds = [...new Set(req.body.assigneeIds.filter(Boolean))];
      const { rows: validRows } = assigneeIds.length
        ? await query(`SELECT user_id FROM hive_members WHERE hive_id = $1 AND membership_status = 'active' AND user_id = ANY($2)`, [hiveId, assigneeIds])
        : { rows: [] };
      const validIds = validRows.map(r => r.user_id);
      const { rows: currentRows } = await query(`SELECT user_id FROM hive_task_assignees WHERE task_id = $1`, [existing.task_id]);
      const currentIds = currentRows.map(r => r.user_id);
      const toAdd = validIds.filter(id => !currentIds.includes(id));
      const toRemove = currentIds.filter(id => !validIds.includes(id));

      await query(`DELETE FROM hive_task_assignees WHERE task_id = $1 AND user_id = ANY($2)`, [existing.task_id, toRemove]).catch(() => {});
      for (const uid of toAdd) await query(`INSERT INTO hive_task_assignees (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [existing.task_id, uid]);

      if (toAdd.length) {
        const { rows: [me] } = await query(`SELECT full_name FROM profiles WHERE user_id = $1`, [req.userId]);
        await Promise.all(toAdd.filter(uid => uid !== req.userId).map(uid => createNotification({
          userId: uid, type: 'task_assigned', category: 'tasks',
          title: `${me?.full_name ?? 'Someone'} assigned you a task: ${existing.title}`,
          hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/tools/tasks?task=${existing.task_id}`,
        }).catch(e => console.error('[tasks/updateTask] assign notify failed', e))));
      }
    }

    if (newMilestoneId !== undefined) {
      await recomputeMilestone(existing.milestone_id); // old milestone may have lost its last incomplete task
      await recomputeMilestone(newMilestoneId);
    }

    broadcast(hiveId, { kind: 'updated', task_id: existing.task_id });
    const updated = await loadTask(hiveId, existing.task_id);
    const [shaped] = await shapeTasks([updated]);
    res.json({ task: shaped });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/updateTask]', err);
    res.status(500).json({ error: 'Failed to update this task.' });
  }
};

// ── POST /api/hives/:id/tools/tasks/tasks/:taskId/move ────────────────────
// Any member who passes requireCanPost may move a task — this is
// deliberately NOT restricted to creator/assignee/owner-admin (editing
// content is; moving it on the board is everyone's).
// body: { status, beforeTaskId, afterTaskId } — the two neighbors in the
// TARGET column/position the card is being dropped between (either may be
// omitted for an edge). Only this task's own position/status is written.
export const moveTask = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanPost(hiveId, req.userId);
    const existing = await loadTask(hiveId, req.params.taskId);

    const status = req.body?.status;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'status must be todo, doing or done.' });

    let beforePos = null, afterPos = null;
    if (req.body?.beforeTaskId) {
      const { rows: [b] } = await query(`SELECT position FROM hive_tasks WHERE task_id = $1 AND hive_id = $2`, [req.body.beforeTaskId, hiveId]);
      beforePos = b ? Number(b.position) : null;
    }
    if (req.body?.afterTaskId) {
      const { rows: [a] } = await query(`SELECT position FROM hive_tasks WHERE task_id = $1 AND hive_id = $2`, [req.body.afterTaskId, hiveId]);
      afterPos = a ? Number(a.position) : null;
    }
    const newPosition = positionBetween(beforePos, afterPos);

    const wasDone = existing.status === 'done';
    const isDone = status === 'done';
    const completedAtSql = isDone && !wasDone ? 'NOW()' : (!isDone && wasDone ? 'NULL' : 'completed_at');

    await query(
      `UPDATE hive_tasks SET status = $1, position = $2, completed_at = ${completedAtSql}, updated_at = NOW() WHERE task_id = $3`,
      [status, newPosition, existing.task_id],
    );

    if (existing.milestone_id) await recomputeMilestone(existing.milestone_id);

    broadcast(hiveId, { kind: 'moved', task_id: existing.task_id, status, position: newPosition });
    res.json({ task_id: existing.task_id, status, position: newPosition });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/moveTask]', err);
    res.status(500).json({ error: 'Failed to move this task.' });
  }
};

// ── DELETE /api/hives/:id/tools/tasks/tasks/:taskId ────────────────────────
export const deleteTask = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await requireMembership(hiveId, req.userId);
    const existing = await loadTask(hiveId, req.params.taskId);
    const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
    if (existing.created_by !== req.userId && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the creator or an owner/admin can delete this task.' });
    }
    await query(`UPDATE hive_tasks SET deleted_at = NOW() WHERE task_id = $1`, [existing.task_id]);
    if (existing.milestone_id) await recomputeMilestone(existing.milestone_id);
    broadcast(hiveId, { kind: 'deleted', task_id: existing.task_id });
    res.json({ deleted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/deleteTask]', err);
    res.status(500).json({ error: 'Failed to delete this task.' });
  }
};

// ── POST /api/hives/:id/tools/tasks/tasks/:taskId/links ───────────────────
export const addLink = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadTask(hiveId, req.params.taskId);
    if (!(await canEditTask(hiveId, req.userId, existing))) {
      return res.status(403).json({ error: 'Only the creator, an assignee, or an owner/admin can add links.' });
    }
    const kind = req.body?.kind;
    if (!LINK_KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of: ${LINK_KINDS.join(', ')}.` });
    const ref = String(req.body?.ref ?? '').trim();
    if (!ref) return res.status(400).json({ error: 'ref is required.' });
    const label = String(req.body?.label ?? '').trim().slice(0, 120);

    const { rows: [link] } = await query(
      `INSERT INTO hive_task_links (task_id, kind, ref, label) VALUES ($1,$2,$3,$4) RETURNING *`,
      [existing.task_id, kind, ref, label],
    );
    res.status(201).json({ link });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/addLink]', err);
    res.status(500).json({ error: 'Failed to add this link.' });
  }
};

// ── DELETE /api/hives/:id/tools/tasks/tasks/:taskId/links/:linkId ─────────
export const removeLink = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const existing = await loadTask(hiveId, req.params.taskId);
    if (!(await canEditTask(hiveId, req.userId, existing))) {
      return res.status(403).json({ error: 'Only the creator, an assignee, or an owner/admin can remove links.' });
    }
    await query(`DELETE FROM hive_task_links WHERE link_id = $1 AND task_id = $2`, [req.params.linkId, existing.task_id]);
    res.json({ removed: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/removeLink]', err);
    res.status(500).json({ error: 'Failed to remove this link.' });
  }
};

// ── POST /api/hives/:id/tools/tasks/tasks/:taskId/comments ────────────────
export const addComment = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanPost(hiveId, req.userId);
    const existing = await loadTask(hiveId, req.params.taskId);
    const body = String(req.body?.body ?? '').trim();
    if (body.length < 1 || body.length > 2000) return res.status(400).json({ error: 'Comment must be 1-2000 characters.' });

    const { rows: [c] } = await query(
      `INSERT INTO hive_task_comments (task_id, user_id, body) VALUES ($1,$2,$3) RETURNING *`,
      [existing.task_id, req.userId, body],
    );

    const { rows: assigneeRows } = await query(`SELECT user_id FROM hive_task_assignees WHERE task_id = $1`, [existing.task_id]);
    const notifyIds = [...new Set([existing.created_by, ...assigneeRows.map(r => r.user_id)])].filter(id => id !== req.userId);
    const { rows: [me] } = await query(`SELECT full_name FROM profiles WHERE user_id = $1`, [req.userId]);
    await Promise.all(notifyIds.map(uid => createNotification({
      userId: uid, type: 'task_comment', category: 'tasks',
      title: `${me?.full_name ?? 'Someone'} commented on "${existing.title}"`,
      body: body.slice(0, 140),
      hiveId, actorUserId: req.userId, link: `/hive/${hiveId}/tools/tasks?task=${existing.task_id}`,
    }).catch(e => console.error('[tasks/addComment] notify failed', e))));

    broadcast(hiveId, { kind: 'comment', task_id: existing.task_id });
    res.status(201).json({ comment: { ...c, author: { user_id: req.userId, full_name: me?.full_name ?? null } } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/addComment]', err);
    res.status(500).json({ error: 'Failed to post this comment.' });
  }
};

// ── DELETE /api/hives/:id/tools/tasks/tasks/:taskId/comments/:commentId ───
export const deleteComment = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await requireMembership(hiveId, req.userId);
    const { rows: [c] } = await query(
      `SELECT tc.comment_id, tc.user_id FROM hive_task_comments tc
         JOIN hive_tasks t ON t.task_id = tc.task_id
        WHERE tc.comment_id = $1 AND t.hive_id = $2`,
      [req.params.commentId, hiveId],
    );
    if (!c) return res.status(404).json({ error: 'Comment not found.' });
    const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
    if (c.user_id !== req.userId && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the author or an owner/admin can delete this comment.' });
    }
    await query(`UPDATE hive_task_comments SET deleted_at = NOW() WHERE comment_id = $1`, [c.comment_id]);
    res.json({ deleted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[tasks/deleteComment]', err);
    res.status(500).json({ error: 'Failed to delete this comment.' });
  }
};

// Used by hiveHomeController — the soonest open (due_on not null, not
// completed) milestone, for the Project category's "Next Milestone" module.
export async function getSoonestOpenMilestone(hiveId) {
  const { rows: [m] } = await query(
    `SELECT ms.*,
            COUNT(t.task_id)::int AS total_tasks,
            COUNT(t.task_id) FILTER (WHERE t.status = 'done')::int AS done_tasks
       FROM hive_milestones ms
       LEFT JOIN hive_tasks t ON t.milestone_id = ms.milestone_id AND t.deleted_at IS NULL
      WHERE ms.hive_id = $1 AND ms.completed_at IS NULL AND ms.due_on IS NOT NULL
      GROUP BY ms.milestone_id
      ORDER BY ms.due_on ASC LIMIT 1`,
    [hiveId],
  );
  if (!m) return null;
  return {
    milestone_id: m.milestone_id, title: m.title, due_on: m.due_on,
    total_tasks: m.total_tasks, done_tasks: m.done_tasks,
    progress_pct: m.total_tasks > 0 ? Math.round((m.done_tasks / m.total_tasks) * 100) : 0,
  };
}
