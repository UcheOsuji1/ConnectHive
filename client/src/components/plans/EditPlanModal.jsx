import { useState, useRef, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { PLAN_TYPES, TYPE_LABELS, localInputToISO } from '../../lib/plans.js';
import '../../styles/hive-plans.css';

// Edit a plan from its detail page (Prompt 61 Part 2). When the plan is part
// of a series (Part 4), offers This plan only / This and all future plans —
// a 'future' edit never touches start/end time (the server rejects that
// combination; see editPlan's comment for why).
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditPlanModal({ hiveId, plan, onClose, onSaved }) {
  const [title, setTitle]   = useState(plan.headline);
  const [type, setType]     = useState(plan.plan_type);
  const [location, setLoc]  = useState(plan.event_location ?? '');
  const [starts, setStarts] = useState(toLocalInput(plan.event_at));
  const [ends, setEnds]     = useState(toLocalInput(plan.event_end_at));
  const [desc, setDesc]     = useState(plan.body ?? '');
  const [visibility, setVis] = useState(plan.visibility);
  const [scope, setScope]   = useState('this');
  const [error, setError]   = useState(null);
  const [saving, setSaving] = useState(false);
  const firstRef = useRef(null);

  useEffect(() => { firstRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return setError('A title is required.');
    if (scope === 'this' && !starts) return setError('A start time is required.');

    setSaving(true);
    setError(null);
    const payload = {
      title: t,
      planType: type,
      location: location.trim() || null,
      description: desc.trim() || null,
      visibility,
      scope,
      ...(scope === 'this' ? {
        startsAt: localInputToISO(starts),
        endsAt: ends ? localInputToISO(ends) : null,
      } : {
        // 'future' never changes time — resend the plan's own current time so
        // validatePlanInput (which requires a start) still passes.
        startsAt: plan.event_at,
        endsAt: plan.event_end_at,
      }),
    };
    try {
      const { plan: updated } = await api.patch(`/api/hives/${hiveId}/plans/${plan.post_id}`, payload);
      onSaved(updated);
    } catch (err) {
      setError(err?.data?.error ?? 'Could not save this.');
      setSaving(false);
    }
  }

  return (
    <>
      <div className="plans-scrim" onClick={onClose} />
      <div className="plans-modal" role="dialog" aria-modal="true" aria-label="Edit plan">
        <div className="plans-modal-head">
          <h2 className="plans-modal-title">Edit Plan</h2>
          <button type="button" className="plans-drawer-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form className="plans-form" onSubmit={submit}>
          {plan.series && (
            <div className="pd-scope-row">
              <label className="pd-scope-opt">
                <input type="radio" name="scope" checked={scope === 'this'} onChange={() => setScope('this')} />
                This plan only
              </label>
              <label className="pd-scope-opt">
                <input type="radio" name="scope" checked={scope === 'future'} onChange={() => setScope('future')} />
                This and all future plans
              </label>
            </div>
          )}

          <label className="plans-field">
            <span>Title *</span>
            <input ref={firstRef} value={title} maxLength={120} onChange={e => setTitle(e.target.value)} />
          </label>

          <div className="plans-field-row">
            <label className="plans-field">
              <span>Type</span>
              <select value={type} onChange={e => setType(e.target.value)}>
                {PLAN_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="plans-field">
              <span>Location</span>
              <input value={location} maxLength={200} onChange={e => setLoc(e.target.value)} />
            </label>
          </div>

          {scope === 'this' && (
            <div className="plans-field-row">
              <label className="plans-field">
                <span>Starts *</span>
                <input type="datetime-local" value={starts} onChange={e => setStarts(e.target.value)} />
              </label>
              <label className="plans-field">
                <span>Ends</span>
                <input type="datetime-local" value={ends} onChange={e => setEnds(e.target.value)} />
              </label>
            </div>
          )}
          {scope === 'future' && (
            <p className="plans-form-note">Date and time can only be changed one occurrence at a time — switch to "This plan only" to change this one's time.</p>
          )}

          <label className="plans-field">
            <span>Description</span>
            <textarea value={desc} maxLength={2000} rows={3} onChange={e => setDesc(e.target.value)} />
          </label>

          <label className="plans-field">
            <span>Who can see it</span>
            <select value={visibility} onChange={e => setVis(e.target.value)}>
              <option value="hive">Hive members only</option>
              <option value="public">Public (followers can see it in their feed)</option>
            </select>
          </label>

          {error && <p className="plans-form-error">{error}</p>}

          <div className="plans-modal-foot">
            <button type="button" className="plans-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="plans-btn-gold" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
