import { useState, useEffect, useMemo, useRef } from 'react';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import MemberOnboardingSequence from '../components/MemberOnboardingSequence.jsx';
import '../styles/hive-onboarding-page.css';

// ── Join mode (spec §13) — one selector, but it writes two fields: the
// hive's join_policy (open/request) and hive_onboarding_settings.join_experience.
// Mapping: Open→open/simple, Approval Required→request/standard,
// Guided Entry→open/guided, Application + Orientation→request/application.
const JOIN_MODES = [
  { value: 'simple',      joinPolicy: 'open',    icon: '⚡', label: 'Open',                       desc: 'Anyone can join instantly, no approval or steps.' },
  { value: 'standard',    joinPolicy: 'request', icon: '✅', label: 'Approval Required',           desc: 'You review and approve each member request.' },
  { value: 'guided',      joinPolicy: 'open',    icon: '🗺️', label: 'Guided Entry',               desc: 'Members join instantly, then walk through the 5-screen welcome.' },
  { value: 'application', joinPolicy: 'request', icon: '🎓', label: 'Application + Orientation',   desc: 'You approve first; the welcome sequence and orientation steps are required.' },
];
// Kept as an alias so the rest of this file (which still reads `JOIN_EXPERIENCES`
// in a couple of places below) doesn't need a second rename pass.
const JOIN_EXPERIENCES = JOIN_MODES;

// ── The 5 screens of the guided member sequence (Part 1) ────────────────────
const SEQUENCE_SCREENS = [
  { num: 1, title: "You're in.",            sub: 'Crest, Hive name and category · location · type.' },
  { num: 2, title: 'Get to know the vibe',  sub: "Founder's note and community principles." },
  { num: 3, title: 'Make yourself known',   sub: 'Intro, interests, first rooms, category questions.' },
  { num: 4, title: 'Meet your people',      sub: 'Up to 6 members, say hello, RSVP, browse.' },
  { num: 5, title: 'Welcome home',          sub: 'The dashboard reveal and hand-off.' },
];

// ── Welcome & Celebration toggles ──────────────────────────────────────────
const WELCOME_TOGGLES = [
  { key: 'show_welcome_banner',  label: 'Show first-open welcome takeover', desc: 'Full-screen welcome ceremony when a member first opens the Hive' },
  { key: 'notify_hive_on_join',  label: 'Notify the whole Hive to greet',   desc: 'Send a notification to all members when someone new joins' },
  { key: 'generate_certificate', label: 'Generate membership certificate',   desc: 'Auto-generate a welcome card / certificate for the new member' },
  { key: 'auto_welcome_post',    label: 'Auto-create a welcome post',        desc: 'Automatically post a welcome message in the Introductions channel' },
  { key: 'notify_owner_start',   label: 'Notify owner when onboarding begins', desc: 'Alert the owner when a new member starts their onboarding journey' },
  { key: 'show_activity_badge',  label: 'Show new activity badge',           desc: 'Display a Hive-specific unread badge until onboarding is complete' },
];

// ── Deadline options ─────────────────────────────────────────────────────────
const DEADLINE_OPTS = [
  { value: null, label: 'No deadline' },
  { value: 3,    label: '3 days' },
  { value: 7,    label: '7 days' },
  { value: 14,   label: '14 days' },
  { value: 30,   label: '30 days' },
];

// ── Access mode ──────────────────────────────────────────────────────────────
const ACCESS_OPTS = [
  { value: 'full',    label: 'Full Access' },
  { value: 'limited', label: 'Limited Access' },
  { value: 'none',    label: 'No Access' },
];

// ── Toggle component ──────────────────────────────────────────────────────────
function Toggle({ on, onToggle }) {
  return (
    <button type="button"
      className={['hop-toggle', on ? 'hop-toggle--on' : ''].filter(Boolean).join(' ')}
      onClick={onToggle} aria-pressed={on}>
      <span className="hop-toggle-thumb" />
    </button>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ number, title, hint, headerRight, children }) {
  return (
    <div className="hop-section">
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

// ── Step edit modal ───────────────────────────────────────────────────────────
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

// ── Preview crest SVG ─────────────────────────────────────────────────────────
function SmallCrest() {
  return (
    <svg viewBox="0 0 180 52" className="hop-preview-crest" aria-hidden="true">
      <g fill="#c49a28">
        {[
          [62,16,8,3.5,-22],[50,11,7.5,3,-38],[40,9,7,2.5,-54],[32,10,6.5,2,-68],
          [62,36,8,3.5,22],[50,41,7.5,3,38],[40,43,7,2.5,54],[32,42,6.5,2,68],
        ].map(([cx,cy,rx,ry,rot],i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
            transform={`rotate(${rot},${cx},${cy})`} opacity={1 - i * 0.04} />
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
            transform={`rotate(${rot},${cx},${cy})`} opacity={1 - i * 0.04} />
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

// ── Main onboarding settings page ────────────────────────────────────────────
export default function HiveOnboardingPage() {
  const ctx    = useOutletContext?.() ?? {};
  const params = useParams();
  const hiveId = ctx.hiveId ?? params.id;
  const hive   = ctx.hive ?? null;
  const navigate = useNavigate();

  const [loading,       setLoading]       = useState(true);
  const [savedSettings, setSavedSettings] = useState(null);
  const [draft,         setDraft]         = useState(null);
  const [steps,         setSteps]         = useState([]);
  const [stepModal,     setStepModal]     = useState(null);
  const [stepSaving,    setStepSaving]    = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [saveStatus,    setSaveStatus]    = useState(null);
  const [previewOpen,   setPreviewOpen]   = useState(false);
  // True only once the owner has actually clicked a join-mode card this
  // session. An invite-only Hive's draft carries join_policy:'invite' just
  // from loading the page — echoing that back unexamined is how saving used
  // to break for those Hives (Prompt 57 only ever wrote 'open'/'request').
  const [joinPolicyTouched, setJoinPolicyTouched] = useState(false);

  const dragIdx  = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/onboarding`)
      .then(obData => {
        setSavedSettings(obData.settings);
        setDraft({ ...obData.settings });
        setSteps(obData.steps ?? []);
      })
      .catch(() => navigate(`/hive/${hiveId}`))
      .finally(() => setLoading(false));
  }, [hiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  function setField(key, val) { setDraft(p => ({ ...p, [key]: val })); }

  // The join-mode selector writes two underlying fields at once so they can
  // never drift apart (spec §13.1: "write both underlying fields consistently").
  function setJoinMode(mode) {
    setJoinPolicyTouched(true);
    setDraft(p => ({ ...p, join_experience: mode.value, join_policy: mode.joinPolicy }));
  }

  function setScreenConfig(screenNum, patch) {
    setDraft(p => ({
      ...p,
      screen_config: { ...p.screen_config, [screenNum]: { ...p.screen_config?.[screenNum], ...patch } },
    }));
  }

  const isDirty = useMemo(() => {
    if (!draft || !savedSettings) return false;
    const keys = [
      'join_experience', 'join_policy', 'show_welcome_banner', 'show_owner_note', 'send_welcome_notif',
      'require_photo', 'completion_unlocks', 'welcome_message',
      'notify_hive_on_join', 'generate_certificate', 'auto_welcome_post',
      'notify_owner_start', 'show_activity_badge', 'deadline_days', 'access_mode',
      'trigger_welcome_msg', 'trigger_assign_role', 'trigger_default_role', 'trigger_unlock_access',
      'rules_acceptance_required', 'category_questions_enabled',
    ];
    if (JSON.stringify(draft.screen_config) !== JSON.stringify(savedSettings.screen_config)) return true;
    if (JSON.stringify(draft.intro_questions) !== JSON.stringify(savedSettings.intro_questions)) return true;
    return keys.some(k => draft[k] !== savedSettings[k]);
  }, [draft, savedSettings]);

  async function handleSave() {
    if (saving) return;
    setSaving(true); setSaveStatus(null);
    try {
      // Only send join_policy when the owner actually picked a card this
      // session — never echo back whatever the Hive's policy happened to be
      // when the page loaded (see joinPolicyTouched above).
      const { join_policy, ...rest } = draft;
      const payload = joinPolicyTouched ? draft : rest;
      const res = await api.put(`/api/hives/${hiveId}/onboarding`, payload);
      setSavedSettings(res.settings);
      setDraft({ ...res.settings });
      setJoinPolicyTouched(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 4000);
    } catch { setSaveStatus('error'); }
    finally { setSaving(false); }
  }

  function handleReset() {
    if (!savedSettings) return;
    setDraft({ ...savedSettings });
    setJoinPolicyTouched(false);
    setSaveStatus(null);
  }

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
    } catch (e) { console.error(e); }
    finally { setStepSaving(false); }
  }

  async function handleDeleteStep(stepId) {
    const res = await api.delete(`/api/hives/${hiveId}/onboarding/steps/${stepId}`);
    setSteps(res.steps);
  }

  async function handleToggleRequired(stepId, current) {
    const res = await api.put(`/api/hives/${hiveId}/onboarding/steps/${stepId}`, { is_required: !current });
    setSteps(res.steps);
  }

  function onDragStart(e, idx)  { dragIdx.current = idx; e.dataTransfer.effectAllowed = 'move'; }
  function onDragOver(e, idx)   { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(idx); }
  function onDragLeave()        { setDragOver(null); }
  async function onDrop(e, idx) {
    e.preventDefault(); setDragOver(null);
    const from = dragIdx.current; dragIdx.current = null;
    if (from === null || from === idx) return;
    const next = [...steps];
    const [moved] = next.splice(from, 1);
    next.splice(idx, 0, moved);
    setSteps(next);
    try {
      const res = await api.post(`/api/hives/${hiveId}/onboarding/steps/reorder`, { order: next.map(s => s.step_id) });
      setSteps(res.steps);
    } catch { /* rollback silently */ }
  }
  function onDragEnd() { dragIdx.current = null; setDragOver(null); }

  if (loading) {
    return (
      <div style={{ padding: 40, color: '#8a8070', fontSize: '0.9rem' }}>Loading onboarding settings…</div>
    );
  }
  if (!draft) return null;

  const reqSteps    = steps.filter(s => s.is_required);
  const optSteps    = steps.filter(s => !s.is_required);
  const selectedExp = JOIN_EXPERIENCES.find(e => e.value === draft.join_experience) ?? JOIN_EXPERIENCES[1];
  const hiveName    = hive?.hive_name ?? '';
  // None of the 4 cards represent 'invite' — until the owner picks one, show
  // the Hive's real state instead of letting some unrelated card look active.
  const isInviteOnly = draft.join_policy === 'invite' && !joinPolicyTouched;

  return (
    <div className="hop-page">

      {/* Page heading */}
      <div className="hop-page-heading">
        <h1 className="hop-page-title">Member Onboarding</h1>
        {hiveName && (
          <p className="hop-page-desc">
            Configure how new members join and get started in <strong>{hiveName}</strong>.
          </p>
        )}
      </div>

      {/* ── Three-column grid ── */}
      <div className="hop-grid">

        {/* ══ LEFT COLUMN ══ */}
        <div className="hop-col-left">

          {/* Section 1 */}
          <SectionCard number="1" title="Choose Join Experience"
            hint="Select how new members will enter your Hive.">
            {isInviteOnly && (
              <div className="hop-invite-banner">
                🔒 Invite-only: people join only when you bring them in.
              </div>
            )}
            <div className="hop-join-exp-grid">
              {JOIN_EXPERIENCES.map(exp => {
                const active = !isInviteOnly && draft.join_experience === exp.value && draft.join_policy === exp.joinPolicy;
                return (
                  <button key={exp.value} type="button"
                    className={['hop-join-card', active ? 'hop-join-card--active' : ''].filter(Boolean).join(' ')}
                    onClick={() => setJoinMode(exp)}>
                    <div className="hop-join-card-top">
                      <div className="hop-join-radio">
                        {active && <div className="hop-join-radio-dot" />}
                      </div>
                      <span className={['hop-join-icon', active ? 'hop-join-icon--active' : ''].filter(Boolean).join(' ')}>
                        {exp.icon}
                      </span>
                    </div>
                    <div className={['hop-join-label', active ? 'hop-join-label--active' : ''].filter(Boolean).join(' ')}>
                      {exp.label}
                    </div>
                    <div className="hop-join-desc">{exp.desc}</div>
                  </button>
                );
              })}
            </div>
            {savedSettings?.join_policy === 'invite' && joinPolicyTouched && (
              <p className="hop-invite-confirm">
                This will make your Hive joinable by {JOIN_MODES.find(m => m.value === draft.join_experience)?.label.toLowerCase()}.
                It's currently invite-only.
              </p>
            )}
          </SectionCard>

          {/* Section 2 — the 5-screen guided sequence (Prompt 57, Part 2.2/2.3) */}
          <SectionCard number="2" title="Guided Welcome Sequence"
            hint="The five full-screen steps a new member sees on first open. Screen 1 is always on.">
            <div className="hop-screens-list">
              {SEQUENCE_SCREENS.map(s => {
                const cfg = s.num === 1 ? { enabled: true, required: true } : (draft.screen_config?.[s.num] ?? { enabled: true, required: false });
                return (
                  <div key={s.num} className={['hop-screen-row', s.num === 1 ? 'hop-screen-row--locked' : ''].filter(Boolean).join(' ')}>
                    <span className="hop-screen-num">{s.num}</span>
                    <div className="hop-screen-body">
                      <span className="hop-screen-title">{s.title}</span>
                      <span className="hop-screen-sub">{s.sub}</span>
                    </div>
                    {s.num === 1 ? (
                      <span className="hop-screen-always-on">Always on</span>
                    ) : (
                      <>
                        <Toggle on={cfg.enabled !== false} onToggle={() => setScreenConfig(s.num, { enabled: !(cfg.enabled !== false) })} />
                        <select className="hop-screen-req-select"
                          value={cfg.required ? 'required' : 'optional'}
                          disabled={cfg.enabled === false}
                          onChange={e => setScreenConfig(s.num, { required: e.target.value === 'required' })}>
                          <option value="optional">Optional</option>
                          <option value="required">Required</option>
                        </select>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="hop-rules-divider" />

            <div className="hop-toggle-row">
              <div className="hop-toggle-text">
                <div className="hop-toggle-label">Require rules acceptance</div>
                <div className="hop-toggle-desc">Screen 2 shows an "I agree" checkbox that blocks Continue until checked</div>
              </div>
              <Toggle on={!!draft.rules_acceptance_required} onToggle={() => setField('rules_acceptance_required', !draft.rules_acceptance_required)} />
            </div>
            <div className="hop-toggle-row">
              <div className="hop-toggle-text">
                <div className="hop-toggle-label">Show category questions</div>
                <div className="hop-toggle-desc">Screen 3 includes the questions below, prefilled for your Hive's category</div>
              </div>
              <Toggle on={draft.category_questions_enabled !== false} onToggle={() => setField('category_questions_enabled', draft.category_questions_enabled === false)} />
            </div>

            <div className="hop-questions-editor">
              <div className="hop-questions-header">
                <span className="hop-field-label" style={{ margin: 0 }}>Intro questions ({(draft.intro_questions ?? []).length}/6)</span>
                {(draft.intro_questions ?? []).length < 6 && (
                  <button type="button" className="hop-add-step-btn" onClick={() => {
                    const qs = draft.intro_questions ?? [];
                    setField('intro_questions', [...qs, { id: `q${Date.now()}`, prompt: '', type: 'text' }]);
                  }}>+ Add question</button>
                )}
              </div>
              {(draft.intro_questions ?? []).map((q, idx) => (
                <div key={q.id} className="hop-question-row">
                  <input className="hop-field-input" value={q.prompt} placeholder="Question prompt"
                    onChange={e => {
                      const qs = [...draft.intro_questions];
                      qs[idx] = { ...qs[idx], prompt: e.target.value };
                      setField('intro_questions', qs);
                    }} />
                  <select className="hop-step-req-select" value={q.type}
                    onChange={e => {
                      const qs = [...draft.intro_questions];
                      const type = e.target.value;
                      qs[idx] = { ...qs[idx], type, options: type === 'choice' ? (qs[idx].options ?? ['', '']) : undefined };
                      setField('intro_questions', qs);
                    }}>
                    <option value="text">Text</option>
                    <option value="choice">Choice</option>
                  </select>
                  <div className="hop-question-move">
                    <button type="button" className="hop-step-action-btn" disabled={idx === 0}
                      onClick={() => {
                        const qs = [...draft.intro_questions];
                        [qs[idx - 1], qs[idx]] = [qs[idx], qs[idx - 1]];
                        setField('intro_questions', qs);
                      }}>↑</button>
                    <button type="button" className="hop-step-action-btn" disabled={idx === draft.intro_questions.length - 1}
                      onClick={() => {
                        const qs = [...draft.intro_questions];
                        [qs[idx + 1], qs[idx]] = [qs[idx], qs[idx + 1]];
                        setField('intro_questions', qs);
                      }}>↓</button>
                    <button type="button" className="hop-step-action-btn hop-step-action-btn--del"
                      onClick={() => setField('intro_questions', draft.intro_questions.filter((_, i) => i !== idx))}>✕</button>
                  </div>
                  {q.type === 'choice' && (
                    <input className="hop-field-input hop-question-options" value={(q.options ?? []).join(', ')}
                      placeholder="Options, comma-separated"
                      onChange={e => {
                        const qs = [...draft.intro_questions];
                        qs[idx] = { ...qs[idx], options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) };
                        setField('intro_questions', qs);
                      }} />
                  )}
                </div>
              ))}
              {(draft.intro_questions ?? []).length === 0 && (
                <div className="hop-steps-empty">No questions yet — add up to 6, or leave empty to skip this part of screen 3.</div>
              )}
            </div>
          </SectionCard>

          {/* Section 3 */}
          <SectionCard number="3" title="Welcome & Celebration"
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

          {/* Section 4 */}
          <SectionCard number="4" title="Onboarding Steps"
            hint="Drag to reorder · Click to edit · Toggle required"
            headerRight={
              <button type="button" className="hop-add-step-btn"
                onClick={() => setStepModal({ isNew: true })}>+ Add Step</button>
            }>
            {steps.length === 0 ? (
              <div className="hop-steps-empty">
                No steps yet. Click <strong>+ Add Step</strong> to create your first step.
              </div>
            ) : (
              <div className="hop-steps-list">
                {steps.map((step, idx) => (
                  <div key={step.step_id}
                    className={['hop-step-row', dragOver === idx ? 'hop-step-row--over' : ''].filter(Boolean).join(' ')}
                    draggable onDragStart={e => onDragStart(e, idx)}
                    onDragOver={e => onDragOver(e, idx)} onDragLeave={onDragLeave}
                    onDrop={e => onDrop(e, idx)} onDragEnd={onDragEnd}>
                    <span className="hop-drag-handle" title="Drag to reorder">⣿</span>
                    <span className="hop-step-num">{idx + 1}</span>
                    <div className="hop-step-body">
                      <span className="hop-step-title">{step.title}</span>
                      {step.description && <span className="hop-step-subdesc">{step.description}</span>}
                    </div>
                    <select className="hop-step-req-select"
                      value={step.is_required ? 'required' : 'optional'}
                      onChange={() => handleToggleRequired(step.step_id, step.is_required)}>
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
        </div>

        {/* ══ MIDDLE COLUMN ══ */}
        <div className="hop-col-mid">
          <SectionCard number="5" title="Rules & Completion"
            hint="Define how and when members complete onboarding.">

            <div className="hop-rules-field">
              <label className="hop-rules-label">Step requirement</label>
              <select className="hop-rules-select" value={draft.completion_unlocks ? 'all' : 'any'}
                onChange={e => setField('completion_unlocks', e.target.value === 'all')}>
                <option value="all">All required steps must be completed</option>
                <option value="any">Members can skip required steps</option>
              </select>
            </div>

            <div className="hop-rules-field">
              <label className="hop-rules-label">Completion deadline</label>
              <select className="hop-rules-select"
                value={draft.deadline_days ?? 'none'}
                onChange={e => { const v = e.target.value; setField('deadline_days', v === 'none' ? null : Number(v)); }}>
                {DEADLINE_OPTS.map(o => (
                  <option key={String(o.value)} value={o.value ?? 'none'}>{o.label}</option>
                ))}
              </select>
              {draft.deadline_days && (
                <p className="hop-rules-hint">
                  Members get a reminder {draft.deadline_days} day{draft.deadline_days !== 1 ? 's' : ''} after joining if onboarding is incomplete.
                </p>
              )}
            </div>

            <div className="hop-rules-field">
              <label className="hop-rules-label">Access before completion</label>
              <div className="hop-seg-control">
                {ACCESS_OPTS.map(opt => (
                  <button key={opt.value} type="button"
                    className={['hop-seg-btn', (draft.access_mode ?? 'full') === opt.value ? 'hop-seg-btn--active' : ''].filter(Boolean).join(' ')}
                    onClick={() => setField('access_mode', opt.value)}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="hop-rules-hint">
                {(draft.access_mode ?? 'full') === 'full'    && 'Members can access all Hive content immediately.'}
                {(draft.access_mode ?? 'full') === 'limited' && 'Members can view but cannot post until onboarding is done.'}
                {(draft.access_mode ?? 'full') === 'none'    && 'Members must complete onboarding before accessing any content.'}
              </p>
            </div>

            <div className="hop-rules-divider" />

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
        </div>

        {/* ══ RIGHT COLUMN ══ */}
        <div className="hop-col-right">
          <SectionCard number="6" title="New Member Preview"
            hint="Live preview of what a new member sees.">

            <button type="button" className="hop-preview-run-btn" onClick={() => setPreviewOpen(true)}>
              ▶ Preview as a new member
            </button>
            <p className="hop-preview-run-hint">
              Runs the real 5-screen sequence with your own profile. Nothing is saved — no intro row, no
              screen progress, no post.
            </p>

            <div className="hop-preview-card">
              <div className="hop-preview-crest-wrap">
                <SmallCrest />
              </div>
              <div className="hop-preview-heading">
                Welcome to <span className="hop-preview-hive-name">{hiveName || 'your Hive'}</span>!
              </div>
              <div className="hop-preview-subline">
                {selectedExp.icon} {selectedExp.label} — {draft.join_experience === 'simple'
                  ? "You're in! Dive straight in."
                  : "Here's your onboarding journey."}
              </div>

              {draft.join_experience !== 'simple' && (
                <div className="hop-preview-journey">
                  <div className="hop-preview-journey-header">
                    <span className="hop-preview-journey-title">Your Onboarding Journey</span>
                    {steps.length > 0 && (
                      <span className="hop-preview-step-count">Step 1 of {steps.length}</span>
                    )}
                  </div>
                  <div className="hop-preview-prog-bar">
                    <div className="hop-preview-prog-fill" style={{ width: steps.length > 0 ? '0%' : '100%' }} />
                  </div>
                  {steps.length === 0 ? (
                    <div className="hop-preview-no-steps">No steps configured yet.</div>
                  ) : (
                    <div className="hop-preview-steps">
                      {steps.map((step, idx) => (
                        <div key={step.step_id}
                          className={['hop-preview-step',
                            idx === 0 ? 'hop-preview-step--current' : 'hop-preview-step--locked'
                          ].join(' ')}>
                          <div className={['hop-preview-step-num',
                            idx === 0 ? 'hop-preview-step-num--current' : ''
                          ].join(' ')}>{idx + 1}</div>
                          <div className="hop-preview-step-info">
                            <span className="hop-preview-step-name">{step.title}</span>
                            {!step.is_required && (
                              <span className="hop-preview-step-opt">Optional</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {(draft.access_mode === 'none' || draft.join_experience === 'application') && (
                        <div className="hop-preview-lock-line">
                          🔒 Complete all required steps to unlock full Hive access
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

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
        </div>

      </div>{/* end grid */}

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
              <button type="button" className="hop-save-reset" onClick={handleReset}>Reset</button>
            )}
            <button type="button" className="hop-save-btn" onClick={handleSave}
              disabled={saving || !isDirty}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Step modal */}
      {stepModal && (
        <StepModal
          step={stepModal.isNew ? null : stepModal.step}
          saving={stepSaving}
          onSave={handleStepSave}
          onCancel={() => setStepModal(null)}
        />
      )}

      {/* Preview as a new member — real sequence, owner's own profile, 0 writes */}
      {previewOpen && (
        <MemberOnboardingSequence
          hiveId={hiveId}
          previewMode
          onClose={() => setPreviewOpen(false)}
          onComplete={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
