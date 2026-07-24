import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import '../styles/onboarding-settings.css';

const JOIN_EXP = [
  {
    value: 'simple',
    icon: '⚡',
    label: 'Simple',
    desc: 'Just the welcome ceremony. No checklist. Members dive straight in.',
  },
  {
    value: 'standard',
    icon: '✅',
    label: 'Standard',
    desc: 'Members see an optional onboarding checklist. Nothing is blocked.',
  },
  {
    value: 'guided',
    icon: '🗺️',
    label: 'Guided',
    desc: 'Members must complete required steps before accessing Hive content.',
  },
];

const STEP_TYPE_LABELS = { task: 'To-do', read: 'Reading', link: 'Link' };

function Toggle({ on, onToggle }) {
  return (
    <button
      type="button"
      className={['hw-toggle', on ? 'hw-toggle-on' : ''].filter(Boolean).join(' ')}
      onClick={onToggle}
      aria-pressed={on}
    >
      <span className="hw-toggle-thumb" />
    </button>
  );
}

function StepRow({ step, index, total, onEdit, onDelete, onReorder, onToggleRequired }) {
  return (
    <div className="obs-step-row">
      <div className="obs-step-order">
        <button
          type="button"
          className="obs-reorder-btn"
          onClick={() => onReorder(step.step_id, 'up')}
          disabled={index === 0}
          title="Move up"
        >▲</button>
        <span className="obs-step-num">{index + 1}</span>
        <button
          type="button"
          className="obs-reorder-btn"
          onClick={() => onReorder(step.step_id, 'down')}
          disabled={index === total - 1}
          title="Move down"
        >▼</button>
      </div>
      <div className="obs-step-body">
        <div className="obs-step-title">{step.title}</div>
        {step.description && <div className="obs-step-desc">{step.description}</div>}
      </div>
      <div className="obs-step-meta">
        <span className="obs-step-type-badge">{STEP_TYPE_LABELS[step.step_type] ?? step.step_type}</span>
        <button
          type="button"
          className={['obs-req-badge', step.is_required ? 'obs-req-badge--on' : 'obs-req-badge--off'].join(' ')}
          onClick={() => onToggleRequired(step.step_id, step.is_required)}
          title={step.is_required ? 'Required — click to make optional' : 'Optional — click to make required'}
        >
          {step.is_required ? 'Required' : 'Optional'}
        </button>
      </div>
      <div className="obs-step-actions">
        <button type="button" className="obs-step-edit-btn" onClick={() => onEdit(step)}>Edit</button>
        <button type="button" className="obs-step-del-btn" onClick={() => onDelete(step.step_id)}>✕</button>
      </div>
    </div>
  );
}

function StepEditModal({ step, onSave, onCancel, saving }) {
  const [fields, setFields] = useState({
    title:       step.title,
    description: step.description ?? '',
    is_required: step.is_required,
    step_type:   step.step_type,
    link_url:    step.link_url ?? '',
  });

  function set(k, v) { setFields(f => ({ ...f, [k]: v })); }

  return (
    <div className="obs-modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="obs-modal">
        <div className="obs-modal-header">
          <span className="obs-modal-title">Edit step</span>
          <button type="button" className="obs-modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="obs-modal-body">
          <label className="obs-field-label">Title <span className="obs-required">*</span></label>
          <input
            className="obs-field-input"
            value={fields.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Step title"
          />
          <label className="obs-field-label" style={{ marginTop: 14 }}>Description (optional)</label>
          <textarea
            className="obs-field-textarea"
            rows={2}
            value={fields.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Briefly describe what the member should do"
          />
          <div className="obs-field-row">
            <div>
              <label className="obs-field-label">Type</label>
              <select className="obs-field-select" value={fields.step_type} onChange={e => set('step_type', e.target.value)}>
                <option value="task">To-do</option>
                <option value="read">Reading</option>
                <option value="link">Link</option>
              </select>
            </div>
            <div>
              <label className="obs-field-label">Completion</label>
              <select className="obs-field-select" value={fields.is_required ? 'required' : 'optional'} onChange={e => set('is_required', e.target.value === 'required')}>
                <option value="required">Required</option>
                <option value="optional">Optional</option>
              </select>
            </div>
          </div>
          {fields.step_type === 'link' && (
            <>
              <label className="obs-field-label" style={{ marginTop: 14 }}>URL</label>
              <input
                className="obs-field-input"
                value={fields.link_url}
                onChange={e => set('link_url', e.target.value)}
                placeholder="https://…"
              />
            </>
          )}
        </div>
        <div className="obs-modal-footer">
          <button type="button" className="obs-modal-cancel" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="obs-modal-save"
            disabled={!fields.title.trim() || saving}
            onClick={() => onSave(fields)}
          >
            {saving ? 'Saving…' : 'Save step'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddStepRow({ onAdd }) {
  const [open, setOpen]   = useState(false);
  const [title, setTitle] = useState('');
  const [desc,  setDesc]  = useState('');
  const [type,  setType]  = useState('task');
  const [req,   setReq]   = useState(true);

  async function handleAdd() {
    if (!title.trim()) return;
    await onAdd({ title: title.trim(), description: desc.trim() || null, step_type: type, is_required: req });
    setTitle(''); setDesc(''); setType('task'); setReq(true); setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="obs-add-step-btn" onClick={() => setOpen(true)}>
        + Add step
      </button>
    );
  }

  return (
    <div className="obs-add-step-form">
      <input
        className="obs-field-input"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Step title (required)"
        autoFocus
      />
      <textarea
        className="obs-field-textarea"
        rows={2}
        value={desc}
        onChange={e => setDesc(e.target.value)}
        placeholder="Description (optional)"
      />
      <div className="obs-field-row">
        <select className="obs-field-select" value={type} onChange={e => setType(e.target.value)}>
          <option value="task">To-do</option>
          <option value="read">Reading</option>
          <option value="link">Link</option>
        </select>
        <select className="obs-field-select" value={req ? 'required' : 'optional'} onChange={e => setReq(e.target.value === 'required')}>
          <option value="required">Required</option>
          <option value="optional">Optional</option>
        </select>
      </div>
      <div className="obs-add-step-footer">
        <button type="button" className="obs-modal-cancel" onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="obs-modal-save" disabled={!title.trim()} onClick={handleAdd}>Add step</button>
      </div>
    </div>
  );
}

// Inline preview of what a new member would see
function MemberPreview({ settings, steps }) {
  const req = steps.filter(s => s.is_required);
  const opt = steps.filter(s => !s.is_required);
  return (
    <div className="obs-preview">
      <div className="obs-preview-label">New member view</div>
      <div className="obs-preview-card">
        {settings.join_experience === 'simple' ? (
          <div className="obs-preview-simple">
            <span className="obs-preview-icon">⚡</span>
            <span>No checklist — members go straight to the Hive</span>
          </div>
        ) : (
          <>
            <div className="obs-preview-head">
              {settings.join_experience === 'guided' && (
                <div className="obs-preview-gate-badge">🔒 Content locked until required steps done</div>
              )}
              <div className="obs-preview-prog-bar">
                <div className="obs-preview-prog-fill" style={{ width: '0%' }} />
              </div>
              <span className="obs-preview-prog-text">0 of {req.length} required step{req.length !== 1 ? 's' : ''} complete</span>
            </div>
            {req.length > 0 && (
              <div className="obs-preview-steps">
                {req.map((s, i) => (
                  <div key={s.step_id ?? i} className="obs-preview-step">
                    <span className="obs-preview-step-check" />
                    <span className="obs-preview-step-title">{s.title}</span>
                    <span className="obs-preview-step-badge obs-preview-req">Required</span>
                  </div>
                ))}
                {opt.map((s, i) => (
                  <div key={s.step_id ?? i} className="obs-preview-step obs-preview-step--opt">
                    <span className="obs-preview-step-check" />
                    <span className="obs-preview-step-title">{s.title}</span>
                    <span className="obs-preview-step-badge obs-preview-opt">Optional</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function HiveOnboardingSettings({ hiveId }) {
  const [loading,    setLoading]    = useState(true);
  const [settings,   setSettings]   = useState(null);
  const [steps,      setSteps]      = useState([]);
  const [draft,      setDraft]      = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const [editingStep, setEditingStep] = useState(null);
  const [stepSaving,  setStepSaving]  = useState(false);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/onboarding`)
      .then(d => {
        setSettings(d.settings);
        setDraft({ ...d.settings });
        setSteps(d.steps);
      })
      .catch(err => console.error('[HiveOnboardingSettings]', err))
      .finally(() => setLoading(false));
  }, [hiveId]);

  function setField(k, v) { setDraft(p => ({ ...p, [k]: v })); }

  async function handleSave() {
    setSaving(true); setSaveStatus(null);
    try {
      const result = await api.put(`/api/hives/${hiveId}/onboarding`, {
        join_experience:    draft.join_experience,
        welcome_message:    draft.welcome_message || null,
        show_welcome_banner: draft.show_welcome_banner,
        show_owner_note:    draft.show_owner_note,
        require_photo:      draft.require_photo,
        send_welcome_notif: draft.send_welcome_notif,
        completion_unlocks: draft.completion_unlocks,
      });
      setSettings(result.settings);
      setDraft({ ...result.settings });
      setSteps(result.steps);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 4000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddStep(stepData) {
    const result = await api.post(`/api/hives/${hiveId}/onboarding/steps`, stepData);
    setSteps(result.steps);
  }

  async function handleDeleteStep(stepId) {
    const result = await api.delete(`/api/hives/${hiveId}/onboarding/steps/${stepId}`);
    setSteps(result.steps);
  }

  async function handleSaveStep(fields) {
    setStepSaving(true);
    try {
      const result = await api.put(`/api/hives/${hiveId}/onboarding/steps/${editingStep.step_id}`, fields);
      setSteps(result.steps);
      setEditingStep(null);
    } catch (e) {
      console.error(e);
    } finally {
      setStepSaving(false);
    }
  }

  async function handleReorder(stepId, dir) {
    const idx = steps.findIndex(s => s.step_id === stepId);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= steps.length) return;
    const next = [...steps];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setSteps(next); // optimistic
    try {
      const result = await api.post(`/api/hives/${hiveId}/onboarding/steps/reorder`, {
        order: next.map(s => s.step_id),
      });
      setSteps(result.steps);
    } catch {
      setSteps(steps); // rollback
    }
  }

  async function handleToggleRequired(stepId, current) {
    const result = await api.put(`/api/hives/${hiveId}/onboarding/steps/${stepId}`, {
      is_required: !current,
    });
    setSteps(result.steps);
  }

  if (loading) {
    return (
      <div className="hw-settings">
        <div className="hw-overview-header">
          <h2 className="hw-overview-title">Onboarding</h2>
        </div>
        <div className="obs-loading">Loading onboarding settings…</div>
      </div>
    );
  }

  const isDirty = draft && settings && (
    draft.join_experience    !== settings.join_experience    ||
    (draft.welcome_message   ?? '') !== (settings.welcome_message ?? '') ||
    draft.show_welcome_banner !== settings.show_welcome_banner ||
    draft.show_owner_note    !== settings.show_owner_note    ||
    draft.require_photo      !== settings.require_photo      ||
    draft.send_welcome_notif !== settings.send_welcome_notif ||
    draft.completion_unlocks !== settings.completion_unlocks
  );

  return (
    <div className="hw-settings obs-wrap">
      <div className="hw-overview-header">
        <h2 className="hw-overview-title">Onboarding</h2>
        <p className="hw-overview-sub">Configure the new-member experience for your Hive.</p>
      </div>

      {/* ── Join experience ── */}
      <div className="hw-settings-card">
        <div className="hw-card-label">Join experience</div>
        <div className="obs-exp-cards">
          {JOIN_EXP.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={['obs-exp-card', draft?.join_experience === opt.value ? 'obs-exp-card--active' : ''].filter(Boolean).join(' ')}
              onClick={() => setField('join_experience', opt.value)}
            >
              <span className="obs-exp-icon">{opt.icon}</span>
              <span className="obs-exp-label">{opt.label}</span>
              <span className="obs-exp-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Welcome message ── */}
      <div className="hw-settings-card">
        <div className="hw-card-label">Welcome message</div>
        <div className="hw-settings-hint" style={{ marginBottom: 8 }}>
          Shown to new members on their welcome ceremony. Appears as the owner note.
        </div>
        <textarea
          className="hw-settings-textarea"
          rows={3}
          value={draft?.welcome_message ?? ''}
          onChange={e => setField('welcome_message', e.target.value)}
          placeholder="Write a personal welcome to new members…"
        />
      </div>

      {/* ── Welcome toggles ── */}
      <div className="hw-settings-card">
        <div className="hw-card-label">Welcome ceremony</div>
        {[
          { key: 'show_welcome_banner', label: 'Show welcome banner', hint: 'Display the full-screen welcome ceremony when a member first opens the Hive' },
          { key: 'show_owner_note',     label: 'Show owner note',     hint: 'Include your personal message in the welcome ceremony' },
          { key: 'send_welcome_notif',  label: 'Send welcome notification', hint: 'Send a "You\'re in!" notification to the member' },
          { key: 'require_photo',       label: 'Require profile photo', hint: 'Members must upload a profile photo to complete onboarding' },
        ].map(({ key, label, hint }) => (
          <div key={key} className="hw-settings-field hw-settings-toggle-row">
            <div>
              <label className="hw-settings-label">{label}</label>
              <div className="hw-settings-hint">{hint}</div>
            </div>
            <Toggle on={draft?.[key] ?? false} onToggle={() => setField(key, !draft?.[key])} />
          </div>
        ))}
      </div>

      {/* ── Onboarding steps ── */}
      {draft?.join_experience !== 'simple' && (
        <div className="hw-settings-card obs-steps-card">
          <div className="hw-card-label">Onboarding steps</div>
          <div className="hw-settings-hint" style={{ marginBottom: 12 }}>
            Members work through these steps after joining.
            {draft?.join_experience === 'guided' && ' Required steps must be completed before accessing the Hive.'}
          </div>

          <div className="obs-steps-list">
            {steps.map((step, idx) => (
              <StepRow
                key={step.step_id}
                step={step}
                index={idx}
                total={steps.length}
                onEdit={s => setEditingStep(s)}
                onDelete={handleDeleteStep}
                onReorder={handleReorder}
                onToggleRequired={handleToggleRequired}
              />
            ))}
          </div>

          <AddStepRow onAdd={handleAddStep} />
        </div>
      )}

      {/* ── Completion & rules ── */}
      <div className="hw-settings-card">
        <div className="hw-card-label">Completion</div>
        <div className="hw-settings-field hw-settings-toggle-row">
          <div>
            <label className="hw-settings-label">Unlock Hive on completion</label>
            <div className="hw-settings-hint">
              When a member finishes all required steps, the Hive is fully unlocked even in Guided mode
            </div>
          </div>
          <Toggle on={draft?.completion_unlocks ?? false} onToggle={() => setField('completion_unlocks', !draft?.completion_unlocks)} />
        </div>
      </div>

      {/* ── Member preview ── */}
      {draft && <MemberPreview settings={draft} steps={steps} />}

      {/* ── Sticky save bar ── */}
      {isDirty && (
        <div className="obs-save-bar">
          <span className="obs-save-unsaved">Unsaved changes</span>
          {saveStatus === 'error' && <span className="obs-save-error">Save failed — try again</span>}
          {saveStatus === 'saved' && <span className="obs-save-success">Saved ✓</span>}
          <button type="button" className="obs-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
      {!isDirty && saveStatus === 'saved' && (
        <div className="obs-save-bar obs-save-bar--quiet">
          <span className="obs-save-success">Changes saved ✓</span>
        </div>
      )}

      {/* Step edit modal */}
      {editingStep && (
        <StepEditModal
          step={editingStep}
          saving={stepSaving}
          onSave={handleSaveStep}
          onCancel={() => setEditingStep(null)}
        />
      )}
    </div>
  );
}
