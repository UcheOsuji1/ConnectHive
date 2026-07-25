import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import '../styles/hive-onboarding-page.css';

// ── Category config ─────────────────────────────────────────────────────────
const CAT_CONFIG = {
  'Social Groups':           { color: '#5dcaa5', icon: '👥' },
  'Professional Networking': { color: '#c49a28', icon: '💼' },
  'Travel Buddies':          { color: '#4db6c4', icon: '✈️' },
  'Project Collaboration':   { color: '#f08a4b', icon: '🚀' },
  'Event Buddies':           { color: '#e86a7c', icon: '🎟️' },
  'Specialized Groups':      { color: '#a59ae8', icon: '⭐' },
};

function HexIcon({ categoryName, size = 36 }) {
  const cfg = CAT_CONFIG[categoryName] ?? { color: '#8a8070', icon: '✦' };
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 36 36" width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        <polygon points="18,2 33,10 33,26 18,34 3,26 3,10"
          fill={cfg.color} fillOpacity="0.22" stroke={cfg.color}
          strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.33 + 'px',
      }}>{cfg.icon}</div>
    </div>
  );
}

// ── Join experience options (4) ──────────────────────────────────────────────
const JOIN_EXPERIENCES = [
  {
    value: 'simple',
    icon: '⚡',
    label: 'Instant Join',
    desc: 'Members join instantly with no waiting or steps.',
  },
  {
    value: 'standard',
    icon: '✅',
    label: 'Approved Join',
    desc: 'You review and approve each member request.',
  },
  {
    value: 'guided',
    icon: '🗺️',
    label: 'Guided Onboarding',
    desc: 'Members complete optional steps after joining.',
  },
  {
    value: 'application',
    icon: '🎓',
    label: 'Application + Orientation',
    desc: 'Full application flow with required orientation steps.',
  },
];

// ── Welcome & Celebration toggles (6) ──────────────────────────────────────
const WELCOME_TOGGLES = [
  { key: 'show_welcome_banner',  label: 'Show first-open welcome takeover', desc: 'Full-screen welcome ceremony when a member opens the Hive for the first time' },
  { key: 'notify_hive_on_join',  label: 'Notify the whole Hive to greet',   desc: 'Send a notification to all members when someone new joins' },
  { key: 'generate_certificate', label: 'Generate membership certificate',   desc: 'Auto-generate a welcome card / certificate for the new member' },
  { key: 'auto_welcome_post',    label: 'Auto-create a welcome post',        desc: 'Automatically post a welcome message in the Introductions channel' },
  { key: 'notify_owner_start',   label: 'Notify owner when onboarding begins', desc: 'Alert the owner when a new member starts their onboarding journey' },
  { key: 'show_activity_badge',  label: 'Show new activity badge',           desc: 'Display a Hive-specific unread badge until onboarding is complete' },
];

// ── Deadline options ─────────────────────────────────────────────────────────
const DEADLINE_OPTS = [
  { value: null,  label: 'No deadline' },
  { value: 3,     label: '3 days' },
  { value: 7,     label: '7 days' },
  { value: 14,    label: '14 days' },
  { value: 30,    label: '30 days' },
];

// ── Access mode options ──────────────────────────────────────────────────────
const ACCESS_OPTS = [
  { value: 'full',    label: 'Full Access' },
  { value: 'limited', label: 'Limited Access' },
  { value: 'none',    label: 'No Access' },
];

// ── Small shared components ──────────────────────────────────────────────────
function Toggle({ on, onToggle, size = 'md' }) {
  return (
    <button
      type="button"
      className={['hop-toggle', on ? 'hop-toggle--on' : '', `hop-toggle--${size}`].filter(Boolean).join(' ')}
      onClick={onToggle}
      aria-pressed={on}
    >
      <span className="hop-toggle-thumb" />
    </button>
  );
}

function SectionCard({ number, title, hint, headerRight, children, className = '' }) {
  return (
    <div className={`hop-section ${className}`}>
      <div className="hop-section-header">
        <div className="hop-section-title-row">
          <span className="hop-section-num">{number}</span>
          <div>
            <h3 className="hop-section-title">{title}</h3>
            {hint && <p className="hop-section-hint">{hint}</p>}
          </div>
        </div>
        {headerRight && <div className="hop-section-header-right">{headerRight}</div>}
      </div>
      <div className="hop-section-body">{children}</div>
    </div>
  );
}

// ── Sidebar nav ──────────────────────────────────────────────────────────────
function HopSidebar({ hiveId, hive, requestCount }) {
  const NAV_GROUPS = [
    {
      label: 'Hive',
      items: [
        { label: 'Overview',  href: `/hive/${hiveId}` },
        { label: 'Feed',      href: `/hive/${hiveId}` },
        { label: 'Chat',      soon: true },
        { label: 'Events',    soon: true },
        { label: 'Members',   href: `/hive/${hiveId}` },
        { label: 'Requests',  href: `/hive/${hiveId}`, badge: requestCount },
      ],
    },
    {
      label: 'Insights',
      items: [
        { label: 'Analytics', soon: true },
      ],
    },
    {
      label: 'Settings',
      items: [
        { label: 'General',              href: `/hive/${hiveId}` },
        { label: 'Roles & Permissions',  soon: true },
        { label: 'Member Onboarding',    href: `/hive/${hiveId}/onboarding`, active: true },
        { label: 'Integrations',         soon: true },
        { label: 'Billing',              soon: true },
      ],
    },
  ];

  return (
    <aside className="hop-sidebar">
      {/* Back chip */}
      <Link to={`/hive/${hiveId}`} className="hop-back-chip">
        ← Back to Hive
      </Link>

      {/* Hive mini-identity */}
      {hive && (
        <div className="hop-sb-identity">
          <HexIcon categoryName={hive.category_name} size={28} />
          <span className="hop-sb-hive-name">{hive.hive_name}</span>
        </div>
      )}

      {/* Navigation groups */}
      {NAV_GROUPS.map(group => (
        <div key={group.label} className="hop-sb-group">
          <div className="hop-sb-group-label">{group.label}</div>
          {group.items.map(item => (
            item.soon ? (
              <div key={item.label} className="hop-sb-item hop-sb-item--soon">
                <span>{item.label}</span>
                <span className="hop-sb-soon-pill">Soon</span>
              </div>
            ) : (
              <Link
                key={item.label}
                to={item.href}
                className={['hop-sb-item', item.active ? 'hop-sb-item--active' : ''].filter(Boolean).join(' ')}
              >
                <span>{item.label}</span>
                {item.badge != null && Number(item.badge) > 0 && (
                  <span className="hop-sb-badge">{item.badge}</span>
                )}
              </Link>
            )
          ))}
        </div>
      ))}

      {/* Pro tip card */}
      <div className="hop-pro-tip">
        <div className="hop-pro-tip-header">💡 Pro Tip</div>
        <p className="hop-pro-tip-body">
          Start with <strong>Guided Onboarding</strong> to ensure every new member completes your key community steps before joining the conversation.
        </p>
      </div>
    </aside>
  );
}

// ── Step edit modal ──────────────────────────────────────────────────────────
function StepModal({ step, onSave, onCancel, saving }) {
  const [fields, setFields] = useState({
    title:       step?.title ?? '',
    description: step?.description ?? '',
    is_required: step?.is_required ?? true,
    step_type:   step?.step_type ?? 'task',
    link_url:    step?.link_url ?? '',
  });
  const set = (k, v) => setFields(f => ({ ...f, [k]: v }));
  const isNew = !step?.step_id;

  return (
    <div className="hop-modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="hop-modal">
        <div className="hop-modal-header">
          <span className="hop-modal-title">{isNew ? 'Add step' : 'Edit step'}</span>
          <button type="button" className="hop-modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="hop-modal-body">
          <label className="hop-field-label">Title <span className="hop-req-star">*</span></label>
          <input className="hop-field-input" value={fields.title}
            onChange={e => set('title', e.target.value)} placeholder="Step title" autoFocus />

          <label className="hop-field-label" style={{ marginTop: 14 }}>Description</label>
          <textarea className="hop-field-textarea" rows={2} value={fields.description}
            onChange={e => set('description', e.target.value)}
            placeholder="What should the member do?" />

          <div className="hop-field-row2" style={{ marginTop: 14 }}>
            <div>
              <label className="hop-field-label">Type</label>
              <select className="hop-field-select" value={fields.step_type}
                onChange={e => set('step_type', e.target.value)}>
                <option value="task">To-do</option>
                <option value="read">Reading</option>
                <option value="link">Link</option>
              </select>
            </div>
            <div>
              <label className="hop-field-label">Completion</label>
              <select className="hop-field-select"
                value={fields.is_required ? 'required' : 'optional'}
                onChange={e => set('is_required', e.target.value === 'required')}>
                <option value="required">Required</option>
                <option value="optional">Optional</option>
              </select>
            </div>
          </div>

          {fields.step_type === 'link' && (
            <>
              <label className="hop-field-label" style={{ marginTop: 14 }}>URL</label>
              <input className="hop-field-input" value={fields.link_url}
                onChange={e => set('link_url', e.target.value)} placeholder="https://…" />
            </>
          )}
        </div>
        <div className="hop-modal-footer">
          <button type="button" className="hop-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="hop-btn-gold"
            disabled={!fields.title.trim() || saving}
            onClick={() => onSave(fields)}>
            {saving ? 'Saving…' : isNew ? 'Add step' : 'Save step'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Preview crest (small) ────────────────────────────────────────────────────
function SmallCrest() {
  return (
    <svg viewBox="0 0 180 52" className="hop-preview-crest" aria-hidden="true">
      <g fill="#c49a28">
        {[
          [62,16,8,3.5,-22],[50,11,7.5,3,-38],[40,9,7,2.5,-54],[32,10,6.5,2,-68],
          [62,36,8,3.5,22],[50,41,7.5,3,38],[40,43,7,2.5,54],[32,42,6.5,2,68],
        ].map(([cx,cy,rx,ry,rot],i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
            transform={`rotate(${rot},${cx},${cy})`}
            opacity={1 - i * 0.04} />
        ))}
        <path d="M70 26 C60 22 50 17 40 13 C33 10 26 10 20 12" stroke="#c49a28" strokeWidth="1" fill="none" opacity="0.5"/>
        <path d="M70 26 C60 30 50 35 40 39 C33 42 26 42 20 40" stroke="#c49a28" strokeWidth="1" fill="none" opacity="0.5"/>
        <path d="M20 12 C17 19 17 33 20 40" stroke="#c49a28" strokeWidth="1.2" fill="none" opacity="0.6"/>
      </g>
      <g fill="#c49a28" transform="translate(180,0) scale(-1,1)">
        {[
          [62,16,8,3.5,-22],[50,11,7.5,3,-38],[40,9,7,2.5,-54],[32,10,6.5,2,-68],
          [62,36,8,3.5,22],[50,41,7.5,3,38],[40,43,7,2.5,54],[32,42,6.5,2,68],
        ].map(([cx,cy,rx,ry,rot],i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
            transform={`rotate(${rot},${cx},${cy})`}
            opacity={1 - i * 0.04} />
        ))}
        <path d="M70 26 C60 22 50 17 40 13 C33 10 26 10 20 12" stroke="#c49a28" strokeWidth="1" fill="none" opacity="0.5"/>
        <path d="M70 26 C60 30 50 35 40 39 C33 42 26 42 20 40" stroke="#c49a28" strokeWidth="1" fill="none" opacity="0.5"/>
        <path d="M20 12 C17 19 17 33 20 40" stroke="#c49a28" strokeWidth="1.2" fill="none" opacity="0.6"/>
      </g>
      <polygon points="90,5 103,12.5 103,27.5 90,35 77,27.5 77,12.5"
        fill="#17120a" stroke="#c49a28" strokeWidth="1.5" strokeLinejoin="round"/>
      <text x="90" y="23" textAnchor="middle" dominantBaseline="middle"
        fill="#c49a28" fontSize="14" fontFamily="Georgia,serif">♛</text>
    </svg>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function HiveOnboardingPage() {
  const { id: hiveId } = useParams();
  const navigate        = useNavigate();

  const [loading,       setLoading]       = useState(true);
  const [hive,          setHive]          = useState(null);
  const [savedSettings, setSavedSettings] = useState(null);
  const [draft,         setDraft]         = useState(null);

  // Steps — always in sync (each step op hits API immediately)
  const [steps,         setSteps]         = useState([]);
  const [stepModal,     setStepModal]     = useState(null); // null | { step } | { isNew: true }
  const [stepSaving,    setStepSaving]    = useState(false);

  // Drag-to-reorder
  const dragIdx = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  // Save
  const [saving,     setSaving]     = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saved' | 'error'

  useEffect(() => {
    Promise.all([
      api.get(`/api/hives/${hiveId}`),
      api.get(`/api/hives/${hiveId}/onboarding`),
    ]).then(([hiveData, obData]) => {
      setHive(hiveData.hive);
      setSavedSettings(obData.settings);
      setDraft({ ...obData.settings });
      setSteps(obData.steps ?? []);
    }).catch(() => {
      navigate(`/hive/${hiveId}`);
    }).finally(() => setLoading(false));
  }, [hiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  function setField(key, val) {
    setDraft(p => ({ ...p, [key]: val }));
  }

  const isDirty = useMemo(() => {
    if (!draft || !savedSettings) return false;
    const keys = [
      'join_experience', 'show_welcome_banner', 'show_owner_note', 'send_welcome_notif',
      'require_photo', 'completion_unlocks', 'welcome_message',
      'notify_hive_on_join', 'generate_certificate', 'auto_welcome_post',
      'notify_owner_start', 'show_activity_badge',
      'deadline_days', 'access_mode',
      'trigger_welcome_msg', 'trigger_assign_role', 'trigger_default_role', 'trigger_unlock_access',
    ];
    return keys.some(k => draft[k] !== savedSettings[k]);
  }, [draft, savedSettings]);

  async function handleSave() {
    if (saving) return;
    setSaving(true); setSaveStatus(null);
    try {
      const res = await api.put(`/api/hives/${hiveId}/onboarding`, draft);
      setSavedSettings(res.settings);
      setDraft({ ...res.settings });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 4000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!savedSettings) return;
    setDraft({ ...savedSettings });
    setSaveStatus(null);
  }

  // ── Steps operations ────────────────────────────────────────────────────────
  async function handleStepSave(fields) {
    setStepSaving(true);
    try {
      if (stepModal?.isNew) {
        const res = await api.post(`/api/hives/${hiveId}/onboarding/steps`, fields);
        setSteps(res.steps);
      } else {
        const res = await api.put(`/api/hives/${hiveId}/onboarding/steps/${stepModal.step.step_id}`, fields);
        setSteps(res.steps);
      }
      setStepModal(null);
    } catch (e) {
      console.error('[StepModal save]', e);
    } finally {
      setStepSaving(false);
    }
  }

  async function handleDeleteStep(stepId) {
    const res = await api.delete(`/api/hives/${hiveId}/onboarding/steps/${stepId}`);
    setSteps(res.steps);
  }

  async function handleToggleRequired(stepId, current) {
    const res = await api.put(`/api/hives/${hiveId}/onboarding/steps/${stepId}`, { is_required: !current });
    setSteps(res.steps);
  }

  // HTML5 drag-and-drop reorder
  function onDragStart(e, idx) {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(idx);
  }
  function onDragLeave() { setDragOver(null); }
  async function onDrop(e, idx) {
    e.preventDefault();
    setDragOver(null);
    const from = dragIdx.current;
    dragIdx.current = null;
    if (from === null || from === idx) return;
    const next = [...steps];
    const [moved] = next.splice(from, 1);
    next.splice(idx, 0, moved);
    setSteps(next); // optimistic
    try {
      const res = await api.post(`/api/hives/${hiveId}/onboarding/steps/reorder`, {
        order: next.map(s => s.step_id),
      });
      setSteps(res.steps);
    } catch { /* rollback silently */ }
  }
  function onDragEnd() { dragIdx.current = null; setDragOver(null); }

  if (loading) {
    return (
      <div className="hop-root">
        <div className="hop-sidebar hop-sidebar--loading" />
        <div className="hop-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#8a8070', fontSize: '0.9rem' }}>Loading…</span>
        </div>
      </div>
    );
  }

  if (!hive || !draft) return null;

  // Derived preview data
  const reqSteps = steps.filter(s => s.is_required);
  const optSteps = steps.filter(s => !s.is_required);
  const selectedExp = JOIN_EXPERIENCES.find(e => e.value === draft.join_experience) ?? JOIN_EXPERIENCES[1];

  return (
    <div className="hop-root">
      {/* ── Left management sidebar ── */}
      <HopSidebar hiveId={hiveId} hive={hive} requestCount={null} />

      {/* ── Main content ── */}
      <div className="hop-main">

        {/* Hive identity header card */}
        <div className="hop-hive-header">
          <HexIcon categoryName={hive.category_name} size={40} />
          <div className="hop-hive-header-meta">
            <div className="hop-hive-header-name-row">
              <span className="hop-hive-header-name">{hive.hive_name}</span>
              <span className="hop-owner-badge">OWNER</span>
            </div>
            <div className="hop-hive-header-sub">
              {[hive.category_name, hive.location].filter(Boolean).join(' · ') || 'No location set'}
            </div>
          </div>
          <Link to={`/hive/${hiveId}`} className="hop-view-hive-link">
            View Hive →
          </Link>
        </div>

        {/* Page heading */}
        <div className="hop-page-heading">
          <h1 className="hop-page-title">Member Onboarding</h1>
          <p className="hop-page-desc">
            Configure how new members discover, join, and get started in <strong>{hive.hive_name}</strong>.
          </p>
        </div>

        {/* ── Three-column grid ── */}
        <div className="hop-grid">

          {/* ══ LEFT COLUMN ══ */}
          <div className="hop-col-left">

            {/* ── Section 1: Choose Join Experience ── */}
            <SectionCard number="1" title="Choose Join Experience"
              hint="Select how new members will enter your Hive.">
              <div className="hop-join-exp-grid">
                {JOIN_EXPERIENCES.map(exp => (
                  <button
                    key={exp.value}
                    type="button"
                    className={['hop-join-card', draft.join_experience === exp.value ? 'hop-join-card--active' : ''].filter(Boolean).join(' ')}
                    onClick={() => setField('join_experience', exp.value)}
                  >
                    <div className="hop-join-card-top">
                      <div className="hop-join-radio">
                        {draft.join_experience === exp.value && <div className="hop-join-radio-dot" />}
                      </div>
                      <span className={['hop-join-icon', draft.join_experience === exp.value ? 'hop-join-icon--active' : ''].filter(Boolean).join(' ')}>
                        {exp.icon}
                      </span>
                    </div>
                    <div className={['hop-join-label', draft.join_experience === exp.value ? 'hop-join-label--active' : ''].filter(Boolean).join(' ')}>
                      {exp.label}
                    </div>
                    <div className="hop-join-desc">{exp.desc}</div>
                  </button>
                ))}
              </div>
            </SectionCard>

            {/* ── Section 2: Welcome & Celebration ── */}
            <SectionCard number="2" title="Welcome & Celebration"
              hint="Control the new-member experience from the moment they join.">
              <div className="hop-toggles-grid">
                {WELCOME_TOGGLES.map(t => (
                  <div key={t.key} className="hop-toggle-row">
                    <div className="hop-toggle-text">
                      <div className="hop-toggle-label">{t.label}</div>
                      <div className="hop-toggle-desc">{t.desc}</div>
                    </div>
                    <Toggle on={!!draft[t.key]} onToggle={() => setField(t.key, !draft[t.key])} />
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* ── Section 3: Onboarding Steps Builder ── */}
            <SectionCard
              number="3"
              title="Onboarding Steps"
              hint="Drag to reorder · Click to edit · Toggle required"
              headerRight={
                <button type="button" className="hop-add-step-btn"
                  onClick={() => setStepModal({ isNew: true })}>
                  + Add Step
                </button>
              }
            >
              {steps.length === 0 ? (
                <div className="hop-steps-empty">
                  No steps yet. Click <strong>+ Add Step</strong> to create your first onboarding step.
                </div>
              ) : (
                <div className="hop-steps-list">
                  {steps.map((step, idx) => (
                    <div
                      key={step.step_id}
                      className={['hop-step-row', dragOver === idx ? 'hop-step-row--over' : ''].filter(Boolean).join(' ')}
                      draggable
                      onDragStart={e => onDragStart(e, idx)}
                      onDragOver={e => onDragOver(e, idx)}
                      onDragLeave={onDragLeave}
                      onDrop={e => onDrop(e, idx)}
                      onDragEnd={onDragEnd}
                    >
                      <span className="hop-drag-handle" title="Drag to reorder">⣿</span>
                      <span className="hop-step-num">{idx + 1}</span>
                      <div className="hop-step-body">
                        <span className="hop-step-title">{step.title}</span>
                        {step.description && (
                          <span className="hop-step-subdesc">{step.description}</span>
                        )}
                      </div>
                      <select
                        className="hop-step-req-select"
                        value={step.is_required ? 'required' : 'optional'}
                        onChange={e => handleToggleRequired(step.step_id, step.is_required)}
                      >
                        <option value="required">Required</option>
                        <option value="optional">Optional</option>
                      </select>
                      <div className="hop-step-actions">
                        <button type="button" className="hop-step-action-btn"
                          onClick={() => setStepModal({ step })} title="Edit">✎</button>
                        <button type="button" className="hop-step-action-btn hop-step-action-btn--del"
                          onClick={() => handleDeleteStep(step.step_id)} title="Delete">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

          </div>{/* end left col */}

          {/* ══ MIDDLE COLUMN ══ */}
          <div className="hop-col-mid">

            {/* ── Section 4: Rules & Completion ── */}
            <SectionCard number="4" title="Rules & Completion"
              hint="Define how and when members complete their onboarding.">

              {/* Step requirement */}
              <div className="hop-rules-field">
                <label className="hop-rules-label">Step requirement</label>
                <select className="hop-rules-select" value={draft.completion_unlocks ? 'all' : 'any'}
                  onChange={e => setField('completion_unlocks', e.target.value === 'all')}>
                  <option value="all">All required steps must be completed</option>
                  <option value="any">Members can skip required steps</option>
                </select>
              </div>

              {/* Deadline */}
              <div className="hop-rules-field">
                <label className="hop-rules-label">Completion deadline</label>
                <select
                  className="hop-rules-select"
                  value={draft.deadline_days ?? 'none'}
                  onChange={e => {
                    const v = e.target.value;
                    setField('deadline_days', v === 'none' ? null : Number(v));
                  }}
                >
                  {DEADLINE_OPTS.map(o => (
                    <option key={String(o.value)} value={o.value ?? 'none'}>{o.label}</option>
                  ))}
                </select>
                {draft.deadline_days && (
                  <p className="hop-rules-hint">
                    Members will receive a reminder {draft.deadline_days} day{draft.deadline_days !== 1 ? 's' : ''} after joining if onboarding is incomplete.
                  </p>
                )}
              </div>

              {/* Access before completion — 3-segment */}
              <div className="hop-rules-field">
                <label className="hop-rules-label">Access before completion</label>
                <div className="hop-seg-control">
                  {ACCESS_OPTS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={['hop-seg-btn', (draft.access_mode ?? 'full') === opt.value ? 'hop-seg-btn--active' : ''].filter(Boolean).join(' ')}
                      onClick={() => setField('access_mode', opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="hop-rules-hint">
                  {(draft.access_mode ?? 'full') === 'full'    && 'Members can access all Hive content immediately after joining.'}
                  {(draft.access_mode ?? 'full') === 'limited' && 'Members can view some content but cannot post or interact until onboarding is done.'}
                  {(draft.access_mode ?? 'full') === 'none'    && 'Members see a prompt to complete onboarding before accessing any Hive content.'}
                </p>
              </div>

              {/* Divider */}
              <div className="hop-rules-divider" />

              {/* Trigger when finished */}
              <div className="hop-rules-field">
                <label className="hop-rules-label">Trigger when finished</label>
                <div className="hop-trigger-list">

                  <label className="hop-trigger-row">
                    <input type="checkbox" className="hop-checkbox"
                      checked={!!draft.trigger_welcome_msg}
                      onChange={e => setField('trigger_welcome_msg', e.target.checked)} />
                    <div className="hop-trigger-text">
                      <span className="hop-trigger-label">Send welcome message</span>
                      {draft.trigger_welcome_msg && (
                        <input type="text" className="hop-trigger-input"
                          placeholder="Welcome! You're all set 🎉"
                          value={draft.trigger_welcome_text ?? ''}
                          onChange={e => setField('trigger_welcome_text', e.target.value)} />
                      )}
                    </div>
                  </label>

                  <label className="hop-trigger-row">
                    <input type="checkbox" className="hop-checkbox"
                      checked={!!draft.trigger_assign_role}
                      onChange={e => setField('trigger_assign_role', e.target.checked)} />
                    <div className="hop-trigger-text">
                      <span className="hop-trigger-label">Assign default role</span>
                      {draft.trigger_assign_role && (
                        <select className="hop-trigger-select"
                          value={draft.trigger_default_role ?? 'member'}
                          onChange={e => setField('trigger_default_role', e.target.value)}>
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                    </div>
                  </label>

                  <label className="hop-trigger-row">
                    <input type="checkbox" className="hop-checkbox"
                      checked={!!draft.trigger_unlock_access}
                      onChange={e => setField('trigger_unlock_access', e.target.checked)} />
                    <div className="hop-trigger-text">
                      <span className="hop-trigger-label">Unlock full Hive access</span>
                      <span className="hop-trigger-sub">Grant full access once all steps are complete</span>
                    </div>
                  </label>

                </div>
              </div>

            </SectionCard>

          </div>{/* end mid col */}

          {/* ══ RIGHT COLUMN ══ */}
          <div className="hop-col-right">

            {/* ── Section 5: New Member Preview ── */}
            <SectionCard number="5" title="New Member Preview"
              hint="Live preview of what a new member sees.">

              <div className="hop-preview-card">
                {/* Crest */}
                <div className="hop-preview-crest-wrap">
                  <SmallCrest />
                </div>

                {/* Heading */}
                <div className="hop-preview-heading">
                  Welcome to <span className="hop-preview-hive-name">{hive.hive_name}</span>!
                </div>
                <div className="hop-preview-subline">
                  {selectedExp.icon} {selectedExp.label} — {draft.join_experience === 'simple'
                    ? 'You\'re in! Dive straight in.'
                    : 'Here\'s your onboarding journey.'}
                </div>

                {/* Journey panel — only if not simple */}
                {draft.join_experience !== 'simple' && (
                  <div className="hop-preview-journey">
                    <div className="hop-preview-journey-header">
                      <span className="hop-preview-journey-title">Your Onboarding Journey</span>
                      {steps.length > 0 && (
                        <span className="hop-preview-step-count">
                          Step 1 of {steps.length}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="hop-preview-prog-bar">
                      <div className="hop-preview-prog-fill" style={{ width: steps.length > 0 ? '0%' : '100%' }} />
                    </div>

                    {/* Step list */}
                    {steps.length === 0 ? (
                      <div className="hop-preview-no-steps">
                        No steps configured yet.
                      </div>
                    ) : (
                      <div className="hop-preview-steps">
                        {steps.map((step, idx) => (
                          <div key={step.step_id}
                            className={['hop-preview-step',
                              idx === 0 ? 'hop-preview-step--current' : 'hop-preview-step--locked'
                            ].join(' ')}>
                            <div className={['hop-preview-step-num',
                              idx === 0 ? 'hop-preview-step-num--current' : ''
                            ].join(' ')}>
                              {idx + 1}
                            </div>
                            <div className="hop-preview-step-info">
                              <span className="hop-preview-step-name">{step.title}</span>
                              {!step.is_required && (
                                <span className="hop-preview-step-opt">Optional</span>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Lock line */}
                        {(draft.access_mode === 'none' || draft.join_experience === 'application') && (
                          <div className="hop-preview-lock-line">
                            🔒 Complete all required steps to unlock full Hive access
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Welcome toggles reflected */}
                <div className="hop-preview-flags">
                  {draft.show_welcome_banner && (
                    <span className="hop-preview-flag hop-preview-flag--on">Welcome ceremony</span>
                  )}
                  {draft.generate_certificate && (
                    <span className="hop-preview-flag hop-preview-flag--on">Certificate</span>
                  )}
                  {draft.notify_hive_on_join && (
                    <span className="hop-preview-flag hop-preview-flag--on">Hive notified</span>
                  )}
                </div>
              </div>

              {/* Step summary */}
              {steps.length > 0 && (
                <div className="hop-preview-summary">
                  <span className="hop-preview-summary-item">
                    <span className="hop-preview-summary-num">{reqSteps.length}</span> required
                  </span>
                  <span className="hop-preview-summary-dot">·</span>
                  <span className="hop-preview-summary-item">
                    <span className="hop-preview-summary-num">{optSteps.length}</span> optional
                  </span>
                  <span className="hop-preview-summary-dot">·</span>
                  <span className="hop-preview-summary-item">
                    <span className="hop-preview-summary-num">{steps.length}</span> total
                  </span>
                </div>
              )}

            </SectionCard>

          </div>{/* end right col */}

        </div>{/* end grid */}
      </div>{/* end main */}

      {/* ── Sticky save bar ── */}
      {(isDirty || saveStatus) && (
        <div className={['hop-save-bar', !isDirty && saveStatus === 'saved' ? 'hop-save-bar--quiet' : ''].filter(Boolean).join(' ')}>
          {isDirty ? (
            <span className="hop-save-unsaved">You have unsaved changes</span>
          ) : (
            <span className="hop-save-ok">All changes saved ✓</span>
          )}
          {saveStatus === 'error' && (
            <span className="hop-save-error">Save failed — please try again</span>
          )}
          <div className="hop-save-actions">
            {isDirty && (
              <button type="button" className="hop-save-reset" onClick={handleReset}>
                Reset
              </button>
            )}
            <button type="button" className="hop-save-btn" onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step modal ── */}
      {stepModal && (
        <StepModal
          step={stepModal.isNew ? null : stepModal.step}
          saving={stepSaving}
          onSave={handleStepSave}
          onCancel={() => setStepModal(null)}
        />
      )}

    </div>
  );
}
