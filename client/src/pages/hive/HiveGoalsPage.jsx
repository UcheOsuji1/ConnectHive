import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.js';
import '../../styles/hive-goals.css';

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDaysISO(days) { return new Date(Date.now() + days * 86400e3).toISOString().slice(0, 10); }

const PERIOD_PRESETS = [
  { label: 'This month', start: todayISO, end: () => addDaysISO(30) },
  { label: 'Next 3 months', start: todayISO, end: () => addDaysISO(90) },
  { label: 'This year', start: todayISO, end: () => addDaysISO(365) },
];

function ProgressBar({ pct }) {
  return (
    <div className="gl-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="gl-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ───────────────────────── Create / edit modal ───────────────────────── */
function GoalModal({ hiveId, metrics, goal, onClose, onSaved }) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [metric, setMetric] = useState(goal?.metric ?? 'plans_held');
  const [target, setTarget] = useState(goal?.target ?? 5);
  const [periodStart, setPeriodStart] = useState(goal?.period_start?.slice(0, 10) ?? todayISO());
  const [periodEnd, setPeriodEnd] = useState(goal?.period_end?.slice(0, 10) ?? addDaysISO(30));
  const [manualValue, setManualValue] = useState(goal?.manual_value ?? 0);
  const [featured, setFeatured] = useState(goal?.featured ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const body = { title, description, metric, target: Number(target), periodStart, periodEnd, manualValue: Number(manualValue), featured };
    try {
      const result = goal
        ? await api.patch(`/api/hives/${hiveId}/tools/goals/goals/${goal.goal_id}`, body)
        : await api.post(`/api/hives/${hiveId}/tools/goals/goals`, body);
      onSaved(result);
    } catch (e2) {
      setError(e2?.data?.error ?? 'Could not save this Goal.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="gl-scrim" onClick={onClose} />
      <div className="gl-modal" role="dialog" aria-modal="true">
        <div className="gl-modal-head">
          <h3 className="gl-modal-title">{goal ? 'Edit Goal' : 'New Goal'}</h3>
          <button type="button" className="gl-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="gl-form" onSubmit={submit}>
          <label className="gl-field">
            Title
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} autoFocus />
          </label>
          <label className="gl-field">
            Description (optional)
            <input value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} />
          </label>

          <div className="gl-field">
            Metric
            <div className="gl-metric-grid">
              {Object.entries(metrics).map(([key, def]) => (
                <button key={key} type="button"
                        className={`gl-metric-btn${metric === key ? ' gl-metric-btn--on' : ''}`}
                        onClick={() => setMetric(key)}>
                  <span className="gl-metric-label">{def.label}</span>
                  <span className="gl-metric-explain">{def.explain}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="gl-field-row">
            <label className="gl-field">
              Target
              <input type="number" min={1} max={100000} value={target} onChange={e => setTarget(e.target.value)} />
            </label>
            {metric === 'manual' && (
              <label className="gl-field">
                Current value
                <input type="number" min={0} value={manualValue} onChange={e => setManualValue(e.target.value)} />
              </label>
            )}
          </div>

          <div className="gl-field">
            Period
            <div className="gl-preset-row">
              {PERIOD_PRESETS.map(p => (
                <button key={p.label} type="button" className="gl-btn-ghost gl-preset-btn"
                        onClick={() => { setPeriodStart(p.start()); setPeriodEnd(p.end()); }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="gl-field-row">
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
            </div>
          </div>

          <label className="gl-check-row">
            <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} />
            Feature on Hive Home
          </label>

          {error && <p className="gl-form-error">{error}</p>}
          <div className="gl-modal-foot">
            <button type="button" className="gl-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="gl-btn-gold" disabled={busy}>{busy ? 'Saving…' : 'Save Goal'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ───────────────────────── Manual progress modal ───────────────────────── */
function ManualProgressModal({ hiveId, goal, onClose, onSaved }) {
  const [value, setValue] = useState(goal.manual_value ?? 0);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { goal: updated } = await api.patch(`/api/hives/${hiveId}/tools/goals/goals/${goal.goal_id}/progress`, { value: Number(value) });
      onSaved(updated);
    } catch { setBusy(false); }
  }

  return (
    <>
      <div className="gl-scrim" onClick={onClose} />
      <div className="gl-modal" role="dialog" aria-modal="true">
        <div className="gl-modal-head">
          <h3 className="gl-modal-title">Update progress</h3>
          <button type="button" className="gl-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="gl-form" onSubmit={submit}>
          <label className="gl-field">
            Current value (target: {goal.target})
            <input type="number" min={0} value={value} onChange={e => setValue(e.target.value)} autoFocus />
          </label>
          <div className="gl-modal-foot">
            <button type="button" className="gl-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="gl-btn-gold" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ───────────────────────── Goal row ───────────────────────── */
function GoalRow({ goal, isOwner, onEdit, onArchive, onUpdateProgress }) {
  const done = !!goal.completed_at;
  const archived = !!goal.archived_at;
  return (
    <div className={`gl-card${done ? ' gl-card--done' : ''}${archived ? ' gl-card--archived' : ''}`}>
      <div className="gl-card-top">
        <div>
          <h3 className="gl-card-title">
            {goal.featured && !archived && <span aria-hidden="true" className="gl-star">⭐</span>} {goal.title}
          </h3>
          {goal.description && <p className="gl-card-desc">{goal.description}</p>}
        </div>
        {isOwner && !done && !archived && (
          <div className="gl-card-actions">
            {goal.metric === 'manual' && <button type="button" className="gl-btn-text" onClick={() => onUpdateProgress(goal)}>Update</button>}
            <button type="button" className="gl-btn-text" onClick={() => onEdit(goal)}>Edit</button>
            <button type="button" className="gl-btn-text gl-btn-text--danger" onClick={() => onArchive(goal)}>Archive</button>
          </div>
        )}
      </div>
      <ProgressBar pct={goal.progress_pct} />
      <p className="gl-card-meta">
        {goal.metric_label}: {goal.value} / {goal.target} · {goal.progress_pct}%
        {done && <span className="gl-done-chip"> · Completed 🎉</span>}
        {archived && <span className="gl-archived-chip"> · Archived</span>}
      </p>
    </div>
  );
}

export default function HiveGoalsPage() {
  const { hiveId, hive, isOwner } = useOutletContext() ?? {};
  const [goals, setGoals] = useState(null);
  const [metrics, setMetrics] = useState({});
  const [editingGoal, setEditingGoal] = useState(undefined); // undefined = closed, null = new, object = editing
  const [progressGoal, setProgressGoal] = useState(null);
  const [replacePrompt, setReplacePrompt] = useState(null);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/goals/goals`)
      .then(d => { setGoals(d.goals ?? []); setMetrics(d.metrics ?? {}); })
      .catch(() => setGoals([]));
  }, [hiveId]);

  useEffect(() => { load(); }, [load]);

  function handleSaved(result) {
    setEditingGoal(undefined);
    if (result.offerReplacePinnedGoal) setReplacePrompt(result.pinnedGoalText);
    load();
  }

  async function archive(goal) {
    if (!window.confirm(`Archive "${goal.title}"?`)) return;
    await api.post(`/api/hives/${hiveId}/tools/goals/goals/${goal.goal_id}/archive`);
    load();
  }

  if (goals === null) return <div className="gl-page"><div className="gl-skel" /></div>;

  const active = goals.filter(g => !g.completed_at && !g.archived_at);
  const done = goals.filter(g => g.completed_at || g.archived_at);

  return (
    <div className="gl-page">
      <div className="gl-head">
        <div>
          <h2 className="gl-title">Goals</h2>
          <p className="gl-sub">What this Hive is working toward together.</p>
        </div>
        {isOwner && <button type="button" className="gl-btn-gold" onClick={() => setEditingGoal(null)}>+ New Goal</button>}
      </div>

      {replacePrompt && (
        <div className="gl-replace-prompt">
          <p>Your old pinned goal was: <strong>"{replacePrompt}"</strong>. Clear it now that you have a real Goal tracking progress?</p>
          <div className="gl-modal-foot">
            <button type="button" className="gl-btn-ghost" onClick={() => setReplacePrompt(null)}>Keep it</button>
            <button type="button" className="gl-btn-gold" onClick={async () => {
              await api.put(`/api/hives/${hiveId}`, { pinned_goal: '' }).catch(() => {});
              setReplacePrompt(null);
            }}>Clear old text</button>
          </div>
        </div>
      )}

      {active.length === 0 && done.length === 0 ? (
        <p className="gl-empty">No Goals yet. {isOwner ? 'Create one to start tracking real progress.' : 'An owner or admin can create one.'}</p>
      ) : (
        <>
          {active.length > 0 && (
            <div className="gl-list">
              {active.map(g => (
                <GoalRow key={g.goal_id} goal={g} isOwner={isOwner} onEdit={setEditingGoal} onArchive={archive} onUpdateProgress={setProgressGoal} />
              ))}
            </div>
          )}
          {done.length > 0 && (
            <>
              <h3 className="gl-section-title">Completed &amp; archived</h3>
              <div className="gl-list">
                {done.map(g => <GoalRow key={g.goal_id} goal={g} isOwner={isOwner} onEdit={() => {}} onArchive={() => {}} onUpdateProgress={() => {}} />)}
              </div>
            </>
          )}
        </>
      )}

      {editingGoal !== undefined && (
        <GoalModal hiveId={hiveId} metrics={metrics} goal={editingGoal} onClose={() => setEditingGoal(undefined)} onSaved={handleSaved} />
      )}
      {progressGoal && (
        <ManualProgressModal hiveId={hiveId} goal={progressGoal} onClose={() => setProgressGoal(null)}
                              onSaved={() => { setProgressGoal(null); load(); }} />
      )}
    </div>
  );
}
