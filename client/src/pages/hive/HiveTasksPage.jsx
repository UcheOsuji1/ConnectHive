import { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { renderMarkdown } from '../../lib/safeMarkdown.js';
import Avatar from '../../components/Avatar.jsx';
import '../../styles/hive-tasks.css';

const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'Doing' },
  { key: 'done', label: 'Done' },
];

function isOverdue(dueOn, status) {
  if (!dueOn || status === 'done') return false;
  return new Date(dueOn) < new Date(new Date().toDateString());
}
function fmtDue(dueOn) {
  return new Date(dueOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ───────────────────────── Milestones strip ───────────────────────── */
function MilestonesStrip({ hiveId, milestones, isOwner, activeMilestoneId, onFilter, onReload }) {
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/hives/${hiveId}/tools/tasks/milestones`, { title, dueOn: dueOn || null });
      setTitle(''); setDueOn(''); setShowNew(false);
      onReload();
    } catch { /* no-op */ }
    setBusy(false);
  }

  return (
    <div className="tb-milestones">
      <div className="tb-milestones-row">
        <button type="button" className={`tb-milestone-chip${!activeMilestoneId ? ' tb-milestone-chip--on' : ''}`}
                onClick={() => onFilter(null)}>
          All tasks
        </button>
        {milestones.map(m => (
          <button key={m.milestone_id} type="button"
                  className={`tb-milestone-chip${activeMilestoneId === m.milestone_id ? ' tb-milestone-chip--on' : ''}${m.completed_at ? ' tb-milestone-chip--done' : ''}`}
                  onClick={() => onFilter(m.milestone_id)}>
            <span className="tb-milestone-chip-title">{m.title}</span>
            <div className="tb-milestone-chip-bar"><div className="tb-milestone-chip-bar-fill" style={{ width: `${m.progress_pct}%` }} /></div>
            <span className="tb-milestone-chip-meta">
              {m.done_tasks}/{m.total_tasks}{m.due_on ? ` · ${fmtDue(m.due_on)}` : ''}{m.completed_at ? ' · Done' : ''}
            </span>
          </button>
        ))}
        {isOwner && (
          <button type="button" className="tb-btn-ghost tb-milestone-add" onClick={() => setShowNew(true)}>+ Milestone</button>
        )}
      </div>
      {showNew && (
        <form className="tb-new-milestone-form" onSubmit={create}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Milestone title" maxLength={120} autoFocus />
          <input type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} />
          <button type="submit" className="tb-btn-gold" disabled={busy}>Add</button>
          <button type="button" className="tb-btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
        </form>
      )}
    </div>
  );
}

/* ───────────────────────── Task card ───────────────────────── */
function TaskCard({ task, grabbed, onGrabToggle, onKeyMove, onOpen, onDragStart, onDropOn }) {
  return (
    <div
      className={`tb-card${grabbed ? ' tb-card--grabbed' : ''}`}
      role="button"
      tabIndex={0}
      aria-grabbed={grabbed}
      aria-label={`${task.title}, ${task.status}${task.due_on ? `, due ${fmtDue(task.due_on)}` : ''}${grabbed ? ', picked up — use arrow keys to move, Space to drop, Escape to cancel' : ''}`}
      draggable
      onDragStart={() => onDragStart(task)}
      onDragOver={e => e.preventDefault()}
      onDrop={() => onDropOn(task)}
      onClick={() => { if (!grabbed) onOpen(task); }}
      onKeyDown={e => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (e.key === 'Enter' && !grabbed) { onOpen(task); return; }
          onGrabToggle(task);
        } else if (grabbed && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          onKeyMove(task, e.key);
        } else if (grabbed && e.key === 'Escape') {
          e.preventDefault();
          onGrabToggle(task, true);
        }
      }}
    >
      <h4 className="tb-card-title">{task.title}</h4>
      <div className="tb-card-meta-row">
        {task.milestone_id && <span className="tb-card-chip">🎯</span>}
        {task.due_on && (
          <span className={`tb-card-due${isOverdue(task.due_on, task.status) ? ' tb-card-due--overdue' : ''}`}>
            {isOverdue(task.due_on, task.status) ? 'Overdue · ' : ''}{fmtDue(task.due_on)}
          </span>
        )}
        {task.comment_count > 0 && <span className="tb-card-comments">💬 {task.comment_count}</span>}
      </div>
      {task.assignees.length > 0 && (
        <div className="tb-card-avatars">
          {task.assignees.slice(0, 4).map(a => (
            <Avatar key={a.user_id} name={a.full_name} src={a.profile_photo_url} size={22} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── New task modal ───────────────────────── */
function NewTaskModal({ hiveId, members, milestones, defaultStatus, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save(e) {
    e.preventDefault();
    if (!title.trim()) { setError('A title is required.'); return; }
    setBusy(true); setError(null);
    try {
      await api.post(`/api/hives/${hiveId}/tools/tasks/tasks`, {
        title, description, dueOn: dueOn || null, milestoneId: milestoneId || null, assigneeIds,
      });
      onCreated();
    } catch (e2) {
      setError(e2?.data?.error ?? 'Could not create this task.');
      setBusy(false);
    }
  }

  function toggleAssignee(uid) {
    setAssigneeIds(ids => ids.includes(uid) ? ids.filter(x => x !== uid) : [...ids, uid]);
  }

  return (
    <>
      <div className="tb-scrim" onClick={onClose} />
      <div className="tb-modal" role="dialog" aria-modal="true">
        <div className="tb-modal-head">
          <h3 className="tb-modal-title">New task</h3>
          <button type="button" className="tb-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="tb-form" onSubmit={save}>
          <label className="tb-field">
            Title
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} autoFocus />
          </label>
          <label className="tb-field">
            Description (markdown supported)
            <textarea className="tb-textarea" rows={4} maxLength={4000} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <div className="tb-field-row">
            <label className="tb-field">
              Due date
              <input type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} />
            </label>
            <label className="tb-field">
              Milestone
              <select value={milestoneId} onChange={e => setMilestoneId(e.target.value)}>
                <option value="">None</option>
                {milestones.map(m => <option key={m.milestone_id} value={m.milestone_id}>{m.title}</option>)}
              </select>
            </label>
          </div>
          <div className="tb-field">
            Assignees
            <div className="tb-assignee-row">
              {members.map(m => (
                <button key={m.user_id} type="button"
                        className={`tb-assignee-chip${assigneeIds.includes(m.user_id) ? ' tb-assignee-chip--on' : ''}`}
                        onClick={() => toggleAssignee(m.user_id)}>
                  <Avatar name={m.full_name} src={m.profile_photo_url} size={18} /> {m.full_name}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="tb-error">{error}</p>}
          <div className="tb-modal-foot">
            <button type="button" className="tb-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="tb-btn-gold" disabled={busy}>{busy ? 'Creating…' : 'Create task'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ───────────────────────── Task side panel ───────────────────────── */
function TaskPanel({ hiveId, taskId, members, milestones, docsOn, onClose, onChanged }) {
  const [task, setTask] = useState(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [canEdit, setCanEdit] = useState(true);
  const [docs, setDocs] = useState(null);
  const [showDocPicker, setShowDocPicker] = useState(false);

  useEffect(() => {
    if (docsOn && showDocPicker && docs === null) {
      api.get(`/api/hives/${hiveId}/tools/docs/docs`).then(d => setDocs(d.docs ?? [])).catch(() => setDocs([]));
    }
  }, [docsOn, showDocPicker, docs, hiveId]);

  async function addDocLink(doc) {
    try {
      await api.post(`/api/hives/${hiveId}/tools/tasks/tasks/${taskId}/links`, { kind: 'doc', ref: doc.doc_id, label: doc.title });
      setShowDocPicker(false);
      load();
    } catch { /* no-op */ }
  }

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/tasks/tasks/${taskId}`).then(d => {
      setTask(d.task);
      setTitle(d.task.title); setDescription(d.task.description); setDueOn(d.task.due_on?.slice(0, 10) ?? '');
      setMilestoneId(d.task.milestone_id ?? ''); setAssigneeIds(d.task.assignees.map(a => a.user_id));
    }).catch(() => setTask(false));
  }, [hiveId, taskId]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    try {
      await api.patch(`/api/hives/${hiveId}/tools/tasks/tasks/${taskId}`, {
        title, description, dueOn: dueOn || null, milestoneId: milestoneId || null, assigneeIds,
      });
      setEditing(false);
      load(); onChanged();
    } catch (e) {
      if (e?.status === 403) setCanEdit(false);
    }
  }

  async function postComment() {
    if (!commentText.trim()) return;
    try {
      await api.post(`/api/hives/${hiveId}/tools/tasks/tasks/${taskId}/comments`, { body: commentText });
      setCommentText(''); load();
    } catch { /* no-op */ }
  }

  if (task === false) return null;

  return (
    <>
      <div className="tb-panel-scrim" onClick={onClose} />
      <aside className="tb-panel" role="dialog" aria-label="Task details">
        <div className="tb-panel-head">
          <h3 className="tb-panel-title">Task</h3>
          <button type="button" className="tb-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {!task ? <div className="tb-skel" /> : (
          <div className="tb-panel-body">
            {editing ? (
              <>
                <label className="tb-field">
                  Title
                  <input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} />
                </label>
                <label className="tb-field">
                  Description
                  <textarea className="tb-textarea" rows={5} value={description} onChange={e => setDescription(e.target.value)} />
                </label>
                <div className="tb-field-row">
                  <label className="tb-field">
                    Due date
                    <input type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} />
                  </label>
                  <label className="tb-field">
                    Milestone
                    <select value={milestoneId} onChange={e => setMilestoneId(e.target.value)}>
                      <option value="">None</option>
                      {milestones.map(m => <option key={m.milestone_id} value={m.milestone_id}>{m.title}</option>)}
                    </select>
                  </label>
                </div>
                <div className="tb-field">
                  Assignees
                  <div className="tb-assignee-row">
                    {members.map(m => (
                      <button key={m.user_id} type="button"
                              className={`tb-assignee-chip${assigneeIds.includes(m.user_id) ? ' tb-assignee-chip--on' : ''}`}
                              onClick={() => setAssigneeIds(ids => ids.includes(m.user_id) ? ids.filter(x => x !== m.user_id) : [...ids, m.user_id])}>
                        <Avatar name={m.full_name} src={m.profile_photo_url} size={18} /> {m.full_name}
                      </button>
                    ))}
                  </div>
                </div>
                {!canEdit && <p className="tb-error">You don’t have permission to edit this task.</p>}
                <div className="tb-modal-foot">
                  <button type="button" className="tb-btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                  <button type="button" className="tb-btn-gold" onClick={save}>Save</button>
                </div>
              </>
            ) : (
              <>
                <div className="tb-panel-top">
                  <h2 className="tb-panel-task-title">{task.title}</h2>
                  <button type="button" className="tb-btn-text" onClick={() => setEditing(true)}>Edit</button>
                </div>
                <div className="tb-render" dangerouslySetInnerHTML={{ __html: renderMarkdown(task.description) }} />
                <div className="tb-panel-meta">
                  {task.due_on && <span className={isOverdue(task.due_on, task.status) ? 'tb-card-due--overdue' : ''}>
                    {isOverdue(task.due_on, task.status) ? 'Overdue · ' : ''}Due {fmtDue(task.due_on)}
                  </span>}
                  {task.milestone_id && (
                    <span className="tb-milestone-chip">
                      {milestones.find(m => m.milestone_id === task.milestone_id)?.title ?? 'Milestone'}
                    </span>
                  )}
                  {task.assignees.length > 0 && (
                    <div className="tb-card-avatars">
                      {task.assignees.map(a => <Avatar key={a.user_id} name={a.full_name} src={a.profile_photo_url} size={22} />)}
                    </div>
                  )}
                </div>

                <div className="tb-links">
                  <h4 className="tb-section-title">Links</h4>
                  {task.links.length === 0 && !showDocPicker && <p className="tb-hint">No links yet.</p>}
                  {task.links.map(l => (
                    <a key={l.link_id}
                       href={l.kind === 'url' ? l.ref : l.kind === 'doc' ? `/hive/${hiveId}/tools/docs/${l.ref}` : '#'}
                       className="tb-link-item" target="_blank" rel="noopener noreferrer">
                      {l.label || l.ref}
                    </a>
                  ))}
                  {docsOn && (showDocPicker ? (
                    <div className="tb-doc-picker">
                      {docs === null && <p className="tb-hint">Loading docs…</p>}
                      {docs?.length === 0 && <p className="tb-hint">This Hive has no docs yet.</p>}
                      {docs?.map(d => (
                        <button key={d.doc_id} type="button" className="tb-doc-picker-item" onClick={() => addDocLink(d)}>
                          {d.title}
                        </button>
                      ))}
                      <button type="button" className="tb-btn-text" onClick={() => setShowDocPicker(false)}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" className="tb-btn-text" onClick={() => setShowDocPicker(true)}>+ Link a doc</button>
                  ))}
                </div>

                <div className="tb-comments">
                  <h4 className="tb-section-title">Comments</h4>
                  {task.comments.length === 0 && <p className="tb-hint">No comments yet.</p>}
                  {task.comments.map(c => (
                    <div key={c.comment_id} className="tb-comment">
                      <Avatar name={c.author.full_name} src={c.author.profile_photo_url} size={22} />
                      <div className="tb-comment-body">
                        <span className="tb-comment-name">{c.author.full_name ?? 'Member'}</span>
                        <p className="tb-comment-text">{c.is_deleted ? '[deleted]' : c.body}</p>
                      </div>
                    </div>
                  ))}
                  <div className="tb-comment-add">
                    <textarea className="tb-textarea" rows={2} value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Add a comment…" />
                    <button type="button" className="tb-btn-gold" onClick={postComment}>Post</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

export default function HiveTasksPage() {
  const { hiveId, isOwner } = useOutletContext() ?? {};
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [members, setMembers] = useState([]);
  const [docsOn, setDocsOn] = useState(false);
  const [activeMilestoneId, setActiveMilestoneId] = useState(null);
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const [dueThisWeekOnly, setDueThisWeekOnly] = useState(false);
  const [showNewTask, setShowNewTask] = useState(null); // status string or null
  const [grabbedTaskId, setGrabbedTaskId] = useState(null);
  const [mobileCol, setMobileCol] = useState('todo');
  const [dragTaskId, setDragTaskId] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const liveRegionRef = useRef(null);

  const openTaskId = searchParams.get('task');

  const loadMilestones = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/tasks/milestones`).then(d => setMilestones(d.milestones ?? [])).catch(() => {});
  }, [hiveId]);

  const loadTasks = useCallback(() => {
    const params = new URLSearchParams();
    if (activeMilestoneId) params.set('milestoneId', activeMilestoneId);
    if (assignedToMeOnly) params.set('assignedToMe', 'true');
    if (dueThisWeekOnly) params.set('dueThisWeek', 'true');
    api.get(`/api/hives/${hiveId}/tools/tasks/tasks?${params.toString()}`)
      .then(d => setTasks(d.tasks ?? [])).catch(() => setTasks([]));
  }, [hiveId, activeMilestoneId, assignedToMeOnly, dueThisWeekOnly]);

  useEffect(() => { loadMilestones(); }, [loadMilestones]);
  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => {
    api.get(`/api/hives/${hiveId}/members`).then(d => setMembers(d.members ?? [])).catch(() => {});
    api.get(`/api/hives/${hiveId}/tools`).then(d => setDocsOn((d.tools ?? []).some(t => t.key === 'docs' && t.enabled))).catch(() => {});
  }, [hiveId]);

  function announce(text) {
    setAnnouncement(text);
  }

  async function moveTaskTo(task, status, beforeTaskId, afterTaskId) {
    try {
      await api.post(`/api/hives/${hiveId}/tools/tasks/tasks/${task.task_id}/move`, { status, beforeTaskId, afterTaskId });
      loadTasks(); loadMilestones();
    } catch { loadTasks(); }
  }

  function columnTasks(status) {
    return (tasks ?? []).filter(t => t.status === status).sort((a, b) => a.position - b.position);
  }

  function handleGrabToggle(task, cancel = false) {
    if (grabbedTaskId === task.task_id) {
      if (cancel) {
        setGrabbedTaskId(null);
        announce(`Cancelled moving ${task.title}.`);
        return;
      }
      // Drop at its current (already-updated) position — nothing further
      // to compute since ArrowLeft/Right/Up/Down already wrote the move.
      setGrabbedTaskId(null);
      announce(`Dropped ${task.title} in ${COLUMNS.find(c => c.key === task.status)?.label}.`);
    } else {
      setGrabbedTaskId(task.task_id);
      announce(`Picked up ${task.title}. Use left and right arrow keys to change column, up and down to reorder, Space to drop, Escape to cancel.`);
    }
  }

  function handleKeyMove(task, key) {
    const colIdx = COLUMNS.findIndex(c => c.key === task.status);
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const newIdx = key === 'ArrowLeft' ? Math.max(0, colIdx - 1) : Math.min(COLUMNS.length - 1, colIdx + 1);
      if (newIdx === colIdx) return;
      const newStatus = COLUMNS[newIdx].key;
      const targetCol = columnTasks(newStatus);
      const last = targetCol[targetCol.length - 1];
      moveTaskTo(task, newStatus, last?.task_id ?? null, null);
      setMobileCol(newStatus); // follow the card to its new column on mobile
      announce(`Moved ${task.title} to ${COLUMNS[newIdx].label}.`);
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      const col = columnTasks(task.status);
      const idx = col.findIndex(t => t.task_id === task.task_id);
      const swapIdx = key === 'ArrowUp' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= col.length) return;
      const neighbor = col[swapIdx];
      // After hopping over `neighbor` (at swapIdx), this task's new
      // neighbors are whatever was on the far side of swapIdx (before it
      // for ArrowUp, after it for ArrowDown) and neighbor itself, now on
      // the near side.
      const beforeIdx = key === 'ArrowUp' ? swapIdx - 1 : swapIdx;
      const afterIdx = key === 'ArrowUp' ? swapIdx : swapIdx + 1;
      const beforeTaskId = beforeIdx >= 0 ? (col[beforeIdx]?.task_id ?? null) : null;
      const afterTaskId = afterIdx < col.length ? (col[afterIdx]?.task_id ?? null) : null;
      moveTaskTo(task, task.status, beforeTaskId, afterTaskId);
      announce(`Moved ${task.title} ${key === 'ArrowUp' ? 'up' : 'down'}, now next to ${neighbor.title}.`);
    }
  }

  function handleDrop(targetTask) {
    if (!dragTaskId || dragTaskId === targetTask.task_id) return;
    const dragTask = tasks.find(t => t.task_id === dragTaskId);
    const col = columnTasks(targetTask.status);
    const idx = col.findIndex(t => t.task_id === targetTask.task_id);
    moveTaskTo(dragTask, targetTask.status, idx > 0 ? col[idx - 1].task_id : null, targetTask.task_id);
    setDragTaskId(null);
  }

  function handleDropOnColumn(status) {
    if (!dragTaskId) return;
    const dragTask = tasks.find(t => t.task_id === dragTaskId);
    const col = columnTasks(status);
    const last = col[col.length - 1];
    moveTaskTo(dragTask, status, last?.task_id ?? null, null);
    setDragTaskId(null);
  }

  return (
    <div className="tb-page">
      <div className="tb-head">
        <div>
          <h2 className="tb-title">Task board</h2>
          <p className="tb-sub">Track what needs doing and who owns it.</p>
        </div>
      </div>

      <div aria-live="polite" className="tb-sr-only" ref={liveRegionRef}>{announcement}</div>

      <MilestonesStrip hiveId={hiveId} milestones={milestones} isOwner={isOwner}
                       activeMilestoneId={activeMilestoneId} onFilter={setActiveMilestoneId} onReload={loadMilestones} />

      <div className="tb-filters">
        <button type="button" className={`tb-chip${assignedToMeOnly ? ' tb-chip--on' : ''}`} onClick={() => setAssignedToMeOnly(v => !v)}>Assigned to me</button>
        <button type="button" className={`tb-chip${dueThisWeekOnly ? ' tb-chip--on' : ''}`} onClick={() => setDueThisWeekOnly(v => !v)}>Due this week</button>
      </div>

      {tasks === null ? <div className="tb-skel" /> : (
        <>
        <div className="tb-mobile-tabs" role="tablist" aria-label="Task board columns">
          {COLUMNS.map(col => (
            <button key={col.key} type="button" role="tab" aria-selected={mobileCol === col.key}
                    className={`tb-mobile-tab${mobileCol === col.key ? ' tb-mobile-tab--on' : ''}`}
                    onClick={() => setMobileCol(col.key)}>
              {col.label} <span className="tb-column-count">{columnTasks(col.key).length}</span>
            </button>
          ))}
        </div>

        <div className="tb-board">
          {COLUMNS.map(col => (
            <div key={col.key} data-col={col.key}
                 className={`tb-column${mobileCol === col.key ? ' tb-column--active' : ''}`}
                 onDragOver={e => e.preventDefault()} onDrop={() => handleDropOnColumn(col.key)}>
              <div className="tb-column-head">
                <h3 className="tb-column-title">{col.label}</h3>
                <span className="tb-column-count">{columnTasks(col.key).length}</span>
              </div>
              <div className="tb-column-cards">
                {columnTasks(col.key).map(task => (
                  <TaskCard key={task.task_id} task={task} grabbed={grabbedTaskId === task.task_id}
                            onGrabToggle={handleGrabToggle} onKeyMove={handleKeyMove}
                            onOpen={t => setSearchParams({ task: t.task_id })}
                            onDragStart={t => setDragTaskId(t.task_id)} onDropOn={handleDrop} />
                ))}
              </div>
              <button type="button" className="tb-add-card-btn" onClick={() => setShowNewTask(col.key)}>+ Add task</button>
            </div>
          ))}
        </div>
        </>
      )}

      {showNewTask && (
        <NewTaskModal hiveId={hiveId} members={members} milestones={milestones} defaultStatus={showNewTask}
                      onClose={() => setShowNewTask(null)} onCreated={() => { setShowNewTask(null); loadTasks(); loadMilestones(); }} />
      )}

      {openTaskId && (
        <TaskPanel hiveId={hiveId} taskId={openTaskId} members={members} milestones={milestones} docsOn={docsOn}
                   onClose={() => setSearchParams({})} onChanged={() => { loadTasks(); loadMilestones(); }} />
      )}
    </div>
  );
}
