import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../lib/api';
import '../styles/create-hive.css';

// ── Tunable defaults ──────────────────────────────────────────────────────────

const DEFAULT_ACTIVATE_AT = '3'; // members before Hive goes live

// maxMembers value sent to API per size key (null = unlimited)
const MAX_MEMBERS_MAP = { small: 5, medium: 10, large: null };

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_META = {
  social:       { label: 'Social Groups',   icon: '👥' },
  professional: { label: 'Professional',    icon: '💼' },
  travel:       { label: 'Travel Buddy',    icon: '✈️' },
  project:      { label: 'Project Collab',  icon: '🚀' },
  event:        { label: 'Event Buddy',     icon: '🎟️' },
  specialized:  { label: 'Specialized',     icon: '⭐' },
};

const CATEGORY_DESCRIPTIONS = {
  social:       'A group for people looking to build genuine friendships and expand their social circle.',
  professional: 'A group of professionals sharing insights, opportunities, and career support.',
  travel:       'A crew of explorers for planning trips, adventures, and local discoveries together.',
  project:      'A group for people building startups, apps, and creative work together.',
  event:        'A buddy network for concerts, conferences, and events worth experiencing together.',
  specialized:  'A focused group built around one shared goal or interest.',
};

const ALL_CATEGORIES = [
  { key: 'social',       label: 'Social Groups',   icon: '👥' },
  { key: 'professional', label: 'Professional',    icon: '💼' },
  { key: 'travel',       label: 'Travel Buddy',    icon: '✈️' },
  { key: 'project',      label: 'Project Collab',  icon: '🚀' },
  { key: 'event',        label: 'Event Buddy',     icon: '🎟️' },
  { key: 'specialized',  label: 'Specialized',     icon: '⭐' },
];

const SIZE_OPTIONS = [
  { key: 'small',  label: 'Small',  range: '3–5'      },
  { key: 'medium', label: 'Medium', range: '6–10'     },
  { key: 'large',  label: 'Large',  range: '11+'      },
  { key: 'custom', label: 'Custom', range: 'Set limit' },
];

const ACTIVATE_OPTIONS = [
  { key: '3', label: '3 members' },
  { key: '5', label: '5 members' },
  { key: '1', label: 'Right away' },
];

const JOIN_OPTIONS = [
  {
    key:   'open',
    label: 'Open',
    sub:   'Best for fast growth and casual groups. Anyone can join instantly.',
  },
  {
    key:   'request',
    label: 'Request to join',
    sub:   "You review each request before they're in. Recommended for focused groups.",
  },
  {
    key:   'invite',
    label: 'Invite-only',
    sub:   "Won't appear in search. You bring people in directly.",
  },
];

const ONBOARDING_EXP = [
  {
    key:  'simple',
    icon: '⚡',
    label: 'Simple',
    sub:  'Just the welcome ceremony. No checklist.',
  },
  {
    key:  'standard',
    icon: '✅',
    label: 'Standard',
    sub:  'Optional onboarding checklist. Nothing blocked.',
  },
  {
    key:  'guided',
    icon: '🗺️',
    label: 'Guided',
    sub:  'Required steps before members access the Hive.',
  },
];

const MEET_CHIPS    = ['Online', 'Hybrid', 'In-person'];
const CADENCE_CHIPS = ['Daily', 'Weekly', 'Biweekly', 'Monthly', 'Flexible'];

const BANNER_AVATARS = [
  { init: 'M', bg: '#c49a28' },
  { init: 'J', bg: '#8a6510' },
  { init: 'A', bg: '#b8902a' },
];

// ── API calls ────────────────────────────────────────────────────────────────

async function createHive(payload) {
  return api.post('/api/hives', payload);
}

async function saveDraft(payload) {
  try {
    await api.post('/api/hives/draft', payload);
  } catch {
    // Endpoint not built yet — no-op
  }
}

// ── Pre-fill derivation ───────────────────────────────────────────────────────

function derivePrefills(category, prefillData) {
  const chips      = prefillData?.chips      ?? {};
  const cards      = prefillData?.cards      ?? {};
  const textValues = prefillData?.textValues ?? {};

  const tags        = chips['types'] ?? [];
  const city        = (textValues['social-city'] || textValues['event-city'] || '').trim();
  const whoFor      = (textValues['social-notes'] || textValues['spec-notes'] || '').trim();
  const descDefault = CATEGORY_DESCRIPTIONS[category] ?? '';

  // Size card → size key
  const sizeRaw = (cards['social-size'] || cards['spec-size'] || '').toLowerCase();
  let sizeKey = '';
  if      (sizeRaw.includes('very small') || (sizeRaw.includes('small') && /[23]/.test(sizeRaw))) sizeKey = 'small';
  else if (sizeRaw.includes('small'))   sizeKey = 'small';
  else if (sizeRaw.includes('medium'))  sizeKey = 'medium';
  else if (sizeRaw.includes('large'))   sizeKey = 'large';

  // Meeting type
  const locationChip = (chips['social-location'] ?? [])[0] ?? '';
  let meetType = '';
  if (locationChip.includes('Online')) meetType = 'Online';
  else if (chips['spec-format']) {
    const fmts = chips['spec-format'];
    if      (fmts.some(f => f === 'In-person'))                    meetType = 'In-person';
    else if (fmts.some(f => ['Video','Text','Voice'].includes(f))) meetType = 'Online';
  }

  // Cadence
  const freqRaw = (cards['freq'] ?? '').toLowerCase();
  let cadence = '';
  if      (freqRaw.includes('multiple') || freqRaw.includes('daily'))     cadence = 'Daily';
  else if (freqRaw.includes('weekly'))                                     cadence = 'Weekly';
  else if (freqRaw.includes('few times') || freqRaw.includes('biweekly')) cadence = 'Biweekly';
  else if (freqRaw.includes('monthly'))                                    cadence = 'Monthly';
  else if (freqRaw.includes('casual') || freqRaw.includes('flexible'))    cadence = 'Flexible';

  return { tags, city, whoFor, descDefault, sizeKey, meetType, cadence };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PreTag() {
  return <span className="ch-pretag">Pre-filled</span>;
}

function SectionCard({ number, title, desc, children, disabled = false }) {
  return (
    <div className="ch-section">
      {disabled && (
        <div className="ch-disabled-overlay">
          <span className="ch-coming-soon-pill">Coming Soon</span>
        </div>
      )}
      <div className="ch-section-header">
        <div className="ch-section-num">{number}</div>
        <div>
          <div className="ch-section-title">{title}</div>
          {desc && <div className="ch-section-desc">{desc}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CreateHivePage() {
  const location    = useLocation();
  const navigate    = useNavigate();
  const routeState  = location.state ?? {};
  const category    = routeState.category     ?? '';
  const prefillData = routeState.prefillData  ?? {};
  const waitingCount = routeState.waitingCount ?? 0;
  const hasPrefill  = !!(routeState.category || routeState.prefillData);

  const meta = CATEGORY_META[category] ?? null;

  const {
    tags:        prefillTags,
    city:        prefillCity,
    whoFor:      prefillWhoFor,
    descDefault,
    sizeKey:     prefillSizeKey,
    meetType:    prefillMeetType,
    cadence:     prefillCadence,
  } = derivePrefills(category, prefillData);

  // ── Section 1 ──────────────────────────────────────────────────
  const [hiveName,     setHiveName]     = useState('');
  const [selectedCat,  setSelectedCat]  = useState(category);
  const [description,  setDescription]  = useState(descDefault);
  const [tags,         setTags]         = useState(prefillTags);
  const [whoFor,       setWhoFor]       = useState(prefillWhoFor);
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [tagInputVal,  setTagInputVal]  = useState('');

  // ── Section 2 ──────────────────────────────────────────────────
  const [joinMode,     setJoinMode]     = useState('request');
  const [showInSearch, setShowInSearch] = useState(true);

  // ── Section 3 ──────────────────────────────────────────────────
  const [sizeKey,    setSizeKey]    = useState(prefillSizeKey || 'medium');
  const [customMax,  setCustomMax]  = useState('');
  const [activateAt, setActivateAt] = useState(DEFAULT_ACTIVATE_AT);

  // ── Section 4 ──────────────────────────────────────────────────
  const [meetType,    setMeetType]    = useState(prefillMeetType || '');
  const [locationVal, setLocationVal] = useState(prefillCity);
  const [cadence,     setCadence]     = useState(prefillCadence || '');

  // ── Section 5 ──────────────────────────────────────────────────
  const [pinnedGoal,  setPinnedGoal]  = useState('');
  const [groundRules, setGroundRules] = useState('');
  const [icebreaker,  setIcebreaker]  = useState('');

  // ── Section 6: Onboarding ──────────────────────────────────────
  const [obJoinExp,    setObJoinExp]    = useState('standard');
  const [obWelcome,    setObWelcome]    = useState(true);
  const [obOwnerNote,  setObOwnerNote]  = useState(true);
  const [obNotif,      setObNotif]      = useState(true);
  const [obTemplate,   setObTemplate]   = useState('default'); // 'default' | 'blank'

  // ── Submit & draft state ───────────────────────────────────────
  const [errors,      setErrors]      = useState({});
  const [submitState, setSubmitState] = useState('idle');   // 'idle' | 'submitting' | 'error'
  const [draftState,  setDraftState]  = useState('idle');   // 'idle' | 'saving' | 'saved'

  // ── Refs ───────────────────────────────────────────────────────
  const hiveNameRef  = useRef(null);
  const catFieldRef  = useRef(null);
  const descRef      = useRef(null);
  const draftTimerRef = useRef(null);

  // Clear draft reset timer on unmount
  useEffect(() => {
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, []);

  // ── Helpers ────────────────────────────────────────────────────
  const removeTag = (tag) => setTags(prev => prev.filter(t => t !== tag));
  const commitTag = () => {
    const val = tagInputVal.trim();
    if (val && !tags.includes(val)) setTags(prev => [...prev, val]);
    setTagInputVal('');
    setTagInputOpen(false);
  };
  const toggleChip = (val, getter, setter) => setter(getter === val ? '' : val);

  const buildPayload = () => ({
    name:                hiveName.trim(),
    category:            selectedCat,
    description:         description.trim(),
    tags,
    idealMembers:        whoFor.trim(),
    joinPolicy:          joinMode,
    discoverable:        showInSearch,
    maxMembers:          sizeKey === 'custom'
                           ? (Number(customMax) || null)
                           : (MAX_MEMBERS_MAP[sizeKey] ?? null),
    activationThreshold: Number(activateAt),
    meetingType:         meetType,
    location:            locationVal.trim(),
    cadence,
    pinnedGoal:          pinnedGoal.trim(),
    groundRules:         groundRules.trim(),
    icebreaker:          icebreaker.trim(),
    creatorUserId:       null, // wired in when auth is live
    onboarding: {
      join_experience:    obJoinExp,
      show_welcome_banner: obWelcome,
      show_owner_note:    obOwnerNote,
      send_welcome_notif: obNotif,
      // 'blank' means skip default steps; otherwise lazy-seed on first load
      skip_default_steps: obTemplate === 'blank',
    },
  });

  const validate = () => {
    const errs = {};
    if (!hiveName.trim())    errs.hiveName    = 'Please enter a name for your Hive.';
    if (!selectedCat)        errs.selectedCat = 'Please select a category.';
    if (!description.trim()) errs.description = 'Please add a description.';
    return Object.keys(errs).length ? errs : null;
  };

  const handleLaunch = async () => {
    const errs = validate();
    if (errs) {
      setErrors(errs);
      const firstRef = errs.hiveName    ? hiveNameRef
                     : errs.selectedCat ? catFieldRef
                     : errs.description ? descRef
                     : null;
      firstRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setErrors({});
    setSubmitState('submitting');
    try {
      const result = await createHive(buildPayload());
      const hiveId = result?.id;
      navigate(hiveId ? `/hive/${hiveId}` : '/my-hive');
    } catch (err) {
      console.error('[CreateHive] launch failed:', err);
      setSubmitState('error');
    }
  };

  const handleDraft = async () => {
    if (draftState === 'saving' || draftState === 'saved') return;
    setDraftState('saving');
    await saveDraft(buildPayload());
    setDraftState('saved');
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => setDraftState('idle'), 3000);
  };

  // ── Pre-fill flags ─────────────────────────────────────────────
  const flagDesc    = hasPrefill && !!descDefault;
  const flagTags    = hasPrefill && prefillTags.length > 0;
  const flagWhoFor  = hasPrefill && !!prefillWhoFor;
  const flagSize    = hasPrefill && !!prefillSizeKey;
  const flagMeet    = hasPrefill && !!prefillMeetType;
  const flagCadence = hasPrefill && !!prefillCadence;
  const flagCity    = hasPrefill && !!prefillCity;

  // ── Banner copy ────────────────────────────────────────────────
  const displayCity = prefillCity || 'nearby';
  const catLabel    = meta?.label ?? 'this category';
  const plural      = waitingCount === 1 ? 'person' : 'people';
  const verb        = waitingCount === 1 ? 'is' : 'are';

  // ── Bar copy ───────────────────────────────────────────────────
  const barMeta = waitingCount === 0
    ? 'Be the first — invites go out as people join.'
    : `${waitingCount} ${plural} will be invited on launch.`;

  return (
    <div className="ch-root">
      <Navbar />
      <div className="ch-page">

        {/* ── Page header ── */}
        <div className="ch-eyebrow">
          <div className="ch-eyebrow-line" />
          <span className="ch-eyebrow-text">Build Your Community</span>
        </div>
        <h1 className="ch-header-title">Create your Hive</h1>
        {hasPrefill && (
          <p className="ch-header-sub">
            Most of this is already filled in from your preferences — just review, name it, and launch.
          </p>
        )}

        {/* ── Cold-start banner ── */}
        <div className="ch-banner">
          {waitingCount === 0 ? (
            <>
              <div className="ch-banner-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1.5 L9.54 4.65 L13.02 5.13 L10.51 7.58 L11.07 11.04 L8 9.42 L4.93 11.04 L5.49 7.58 L2.98 5.13 L6.46 4.65 Z" fill="#c49a28"/>
                </svg>
              </div>
              <p className="ch-banner-text">
                You&apos;d be the first to start a Hive like this nearby. As people join, we&apos;ll match them straight to you.
              </p>
            </>
          ) : (
            <>
              <div className="ch-banner-avatars">
                {BANNER_AVATARS.map((av, i) => (
                  <div
                    key={i}
                    className="ch-banner-avatar"
                    style={{ background: av.bg, marginLeft: i > 0 ? '-7px' : 0 }}
                  >
                    {av.init}
                  </div>
                ))}
              </div>
              <p className="ch-banner-text">
                <strong>{waitingCount} {plural} near {displayCity}</strong>{' '}
                {verb} waiting for a {catLabel} Hive. They&apos;ll be matched and invited
                automatically the moment you launch.
              </p>
            </>
          )}
        </div>

        {/* ── Pre-fill note ── */}
        {hasPrefill && (
          <p className="ch-prefill-note">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="0.6" y="0.6" width="10.8" height="10.8" rx="2.5" stroke="#c49a28" strokeWidth="0.9"/>
              <path d="M3.5 6.2l1.9 1.9 3.2-3.8" stroke="#c49a28" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Fields marked <PreTag /> came from your deep-dive answers. Edit anything you like.
          </p>
        )}

        {/* ══════════════════════════════════════════════════════════
            Section 1 — Hive identity
        ════════════════════════════════════════════════════════════ */}
        <SectionCard number="1" title="Hive identity" desc="What it is and who it's for">

          {/* Hive name */}
          <div className="ch-field">
            <div className="ch-field-label">Hive name</div>
            <input
              ref={hiveNameRef}
              className={`ch-input${errors.hiveName ? ' ch-input-error' : ''}`}
              placeholder="e.g. LA Startup Builders"
              value={hiveName}
              onChange={e => { setHiveName(e.target.value); if (errors.hiveName) setErrors(p => ({ ...p, hiveName: null })); }}
            />
            {errors.hiveName && <p className="ch-field-error">{errors.hiveName}</p>}
          </div>

          {/* Category */}
          <div className="ch-field" ref={catFieldRef}>
            <div className="ch-field-label">
              Category
              {category && <span className="ch-sub-label">— SET FROM YOUR SEARCH</span>}
            </div>
            {category ? (
              <div className="ch-locked-field">
                <div className="ch-locked-field-left">
                  <span>{meta?.icon}</span>
                  <span>{meta?.label ?? category}</span>
                </div>
                <span className="ch-locked-badge">LOCKED</span>
              </div>
            ) : (
              <>
                <div className={`ch-cat-grid${errors.selectedCat ? ' ch-grid-error' : ''}`}>
                  {ALL_CATEGORIES.map(c => (
                    <div
                      key={c.key}
                      className={`ch-cat-card${selectedCat === c.key ? ' selected' : ''}`}
                      onClick={() => { setSelectedCat(c.key); setErrors(p => ({ ...p, selectedCat: null })); }}
                    >
                      <div className="ch-cat-icon">{c.icon}</div>
                      <div className="ch-cat-name">{c.label}</div>
                    </div>
                  ))}
                </div>
                {errors.selectedCat && <p className="ch-field-error">{errors.selectedCat}</p>}
              </>
            )}
          </div>

          {/* Description */}
          <div className="ch-field">
            <div className="ch-field-label">
              Description / purpose
              {flagDesc && <PreTag />}
            </div>
            <textarea
              ref={descRef}
              className={`ch-textarea${errors.description ? ' ch-textarea-error' : ''}`}
              rows={3}
              placeholder="What is this Hive about? What brings people together?"
              value={description}
              onChange={e => { setDescription(e.target.value); if (errors.description) setErrors(p => ({ ...p, description: null })); }}
            />
            {errors.description && <p className="ch-field-error">{errors.description}</p>}
          </div>

          {/* Tags */}
          <div className="ch-field">
            <div className="ch-field-label">
              Tags
              {flagTags && <PreTag />}
            </div>
            <div className="ch-tags-row">
              {tags.map(tag => (
                <span key={tag} className="ch-tag-chip">
                  {tag}
                  <span className="ch-tag-x" onClick={() => removeTag(tag)}>×</span>
                </span>
              ))}
              {tagInputOpen ? (
                <input
                  className="ch-tag-inline-input"
                  autoFocus
                  placeholder="Add tag..."
                  value={tagInputVal}
                  onChange={e => setTagInputVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitTag(); }
                    if (e.key === 'Escape') setTagInputOpen(false);
                  }}
                  onBlur={commitTag}
                />
              ) : (
                <button type="button" className="ch-add-chip" onClick={() => setTagInputOpen(true)}>
                  + Add tag
                </button>
              )}
            </div>
          </div>

          {/* Who this Hive is for */}
          <div className="ch-field">
            <div className="ch-field-label">
              Who this Hive is for
              {flagWhoFor && <PreTag />}
            </div>
            <textarea
              className="ch-textarea"
              rows={2}
              placeholder="Describe your ideal member — experience level, commitment, what they're working on..."
              value={whoFor}
              onChange={e => setWhoFor(e.target.value)}
            />
          </div>

        </SectionCard>

        {/* ══════════════════════════════════════════════════════════
            Section 2 — Access & privacy
        ════════════════════════════════════════════════════════════ */}
        <SectionCard number="2" title="Access & privacy" desc="Who can join and how you'll appear">

          <div className="ch-field">
            <div className="ch-field-label">How do people join?</div>
            <div className="ch-join-cards">
              {JOIN_OPTIONS.map(opt => (
                <div
                  key={opt.key}
                  className={`ch-join-card${joinMode === opt.key ? ' selected' : ''}`}
                  onClick={() => setJoinMode(opt.key)}
                >
                  <div className="ch-join-card-radio">
                    {joinMode === opt.key && <div className="ch-join-card-radio-dot" />}
                  </div>
                  <div>
                    <div className="ch-join-card-label">{opt.label}</div>
                    <div className="ch-join-card-sub">{opt.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ch-toggle-row">
            <div>
              <div className="ch-toggle-row-label">Show in Hive discovery &amp; search</div>
              <div className="ch-toggle-row-sub">Let matched users find this Hive automatically</div>
            </div>
            <label className="ch-toggle-label">
              <input
                type="checkbox"
                className="ch-toggle-input"
                checked={showInSearch}
                onChange={e => setShowInSearch(e.target.checked)}
              />
              <span className="ch-toggle-track">
                <span className="ch-toggle-thumb" />
              </span>
            </label>
          </div>

        </SectionCard>

        {/* ══════════════════════════════════════════════════════════
            Section 3 — Membership & size
        ════════════════════════════════════════════════════════════ */}
        <SectionCard number="3" title="Membership & size" desc="How many, and when does it go live">

          <div className="ch-field">
            <div className="ch-field-label">
              Maximum members
              {flagSize && <PreTag />}
            </div>
            <div className="ch-size-cards">
              {SIZE_OPTIONS.map(opt => (
                <div
                  key={opt.key}
                  className={`ch-size-card${sizeKey === opt.key ? ' selected' : ''}`}
                  onClick={() => setSizeKey(opt.key)}
                >
                  <div className="ch-size-card-label">{opt.label}</div>
                  <div className="ch-size-card-range">{opt.range}</div>
                </div>
              ))}
            </div>
            {sizeKey === 'custom' && (
              <div className="ch-custom-input-wrap">
                <input
                  type="number"
                  className="ch-narrow-input"
                  placeholder="20"
                  value={customMax}
                  onChange={e => setCustomMax(e.target.value)}
                  min={2}
                />
                <span className="ch-custom-unit">max members</span>
              </div>
            )}
          </div>

          <div className="ch-field">
            <div className="ch-field-label">Activate this Hive once it reaches</div>
            <div className="ch-activate-cards">
              {ACTIVATE_OPTIONS.map(opt => (
                <div
                  key={opt.key}
                  className={`ch-activate-card${activateAt === opt.key ? ' selected' : ''}`}
                  onClick={() => setActivateAt(opt.key)}
                >
                  {opt.label}
                </div>
              ))}
            </div>
          </div>

        </SectionCard>

        {/* ══════════════════════════════════════════════════════════
            Section 4 — Format & logistics
        ════════════════════════════════════════════════════════════ */}
        <SectionCard number="4" title="Format & logistics" desc="Where and how often you'll connect">

          <div className="ch-field">
            <div className="ch-field-label">
              How does this Hive meet?
              {flagMeet && <PreTag />}
            </div>
            <div className="ch-chips-row">
              {MEET_CHIPS.map(chip => (
                <div
                  key={chip}
                  className={`ch-chip${meetType === chip ? ' selected' : ''}`}
                  onClick={() => toggleChip(chip, meetType, setMeetType)}
                >
                  {chip}
                </div>
              ))}
            </div>
          </div>

          {meetType !== 'Online' && (
            <div className="ch-field">
              <div className="ch-field-label">
                Location
                {flagCity && <PreTag />}
              </div>
              <input
                className="ch-input"
                placeholder="e.g. Austin, TX"
                value={locationVal}
                onChange={e => setLocationVal(e.target.value)}
              />
            </div>
          )}

          <div className="ch-field">
            <div className="ch-field-label">
              Meeting cadence
              {flagCadence && <PreTag />}
            </div>
            <div className="ch-chips-row">
              {CADENCE_CHIPS.map(chip => (
                <div
                  key={chip}
                  className={`ch-chip${cadence === chip ? ' selected' : ''}`}
                  onClick={() => toggleChip(chip, cadence, setCadence)}
                >
                  {chip}
                </div>
              ))}
            </div>
          </div>

        </SectionCard>

        {/* ══════════════════════════════════════════════════════════
            Section 5 — Set the tone (optional)
        ════════════════════════════════════════════════════════════ */}
        <SectionCard number="5" title="Set the tone" desc="Optional — gives your Hive a head start">

          <div className="ch-field">
            <div className="ch-field-label">Pinned goal</div>
            <input
              className="ch-input"
              placeholder="e.g. Build and present a working MVP within 30 days"
              value={pinnedGoal}
              onChange={e => setPinnedGoal(e.target.value)}
            />
          </div>

          <div className="ch-field">
            <div className="ch-field-label">Ground rules / expectations</div>
            <textarea
              className="ch-textarea"
              rows={2}
              placeholder="e.g. Be respectful, show up consistently, no self-promotion without permission."
              value={groundRules}
              onChange={e => setGroundRules(e.target.value)}
            />
          </div>

          <div className="ch-field">
            <div className="ch-field-label">Icebreaker for new members</div>
            <input
              className="ch-input"
              placeholder="e.g. What's the one thing you hope to build or do through this Hive?"
              value={icebreaker}
              onChange={e => setIcebreaker(e.target.value)}
            />
          </div>

        </SectionCard>

        {/* ══════════════════════════════════════════════════════════
            Section 6 — Member onboarding
        ════════════════════════════════════════════════════════════ */}
        <SectionCard number="6" title="Member onboarding" desc="How new members get started in your Hive">

          {/* Join experience */}
          <div className="ch-field">
            <div className="ch-field-label">Join experience</div>
            <div className="ch-join-cards">
              {ONBOARDING_EXP.map(opt => (
                <div
                  key={opt.key}
                  className={`ch-join-card${obJoinExp === opt.key ? ' selected' : ''}`}
                  onClick={() => setObJoinExp(opt.key)}
                >
                  <div className="ch-join-card-radio">
                    {obJoinExp === opt.key && <div className="ch-join-card-radio-dot" />}
                  </div>
                  <div>
                    <div className="ch-join-card-label">{opt.icon} {opt.label}</div>
                    <div className="ch-join-card-sub">{opt.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Welcome toggles */}
          <div className="ch-field">
            <div className="ch-field-label">Welcome ceremony</div>
            {[
              { key: 'obWelcome',   val: obWelcome,   set: setObWelcome,   label: 'Show welcome ceremony', sub: 'Full-screen welcome when members first open the Hive' },
              { key: 'obOwnerNote', val: obOwnerNote,  set: setObOwnerNote,  label: 'Show owner note',        sub: 'Display your personal message to new members' },
              { key: 'obNotif',     val: obNotif,      set: setObNotif,      label: 'Send welcome notification', sub: 'Notify the member when they\'re accepted' },
            ].map(({ key, val, set, label, sub }) => (
              <div key={key} className="ch-toggle-row">
                <div>
                  <div className="ch-toggle-row-label">{label}</div>
                  <div className="ch-toggle-row-sub">{sub}</div>
                </div>
                <label className="ch-toggle-label">
                  <input type="checkbox" className="ch-toggle-input" checked={val} onChange={e => set(e.target.checked)} />
                  <span className="ch-toggle-track"><span className="ch-toggle-thumb" /></span>
                </label>
              </div>
            ))}
          </div>

          {/* Step template — only relevant for standard/guided */}
          {obJoinExp !== 'simple' && (
            <div className="ch-field">
              <div className="ch-field-label">Step template</div>
              <div className="ch-join-cards">
                <div
                  className={`ch-join-card${obTemplate === 'default' ? ' selected' : ''}`}
                  onClick={() => setObTemplate('default')}
                >
                  <div className="ch-join-card-radio">
                    {obTemplate === 'default' && <div className="ch-join-card-radio-dot" />}
                  </div>
                  <div>
                    <div className="ch-join-card-label">Default template</div>
                    <div className="ch-join-card-sub">6 curated steps to get members up to speed quickly</div>
                  </div>
                </div>
                <div
                  className={`ch-join-card${obTemplate === 'blank' ? ' selected' : ''}`}
                  onClick={() => setObTemplate('blank')}
                >
                  <div className="ch-join-card-radio">
                    {obTemplate === 'blank' && <div className="ch-join-card-radio-dot" />}
                  </div>
                  <div>
                    <div className="ch-join-card-label">Start blank</div>
                    <div className="ch-join-card-sub">Add your own custom steps after launch</div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </SectionCard>

        {/* ══════════════════════════════════════════════════════════
            Section 7 — Membership cost (Coming Soon)
        ════════════════════════════════════════════════════════════ */}
        <SectionCard number="7" title="Membership cost" desc="How members will pay to join" disabled>

          <div className="ch-field">
            <div className="ch-field-label">Pricing model</div>
            <div className="ch-cost-cards">
              {[
                { key: 'free', icon: '✓',  label: 'Free',         sub: 'Anyone can join at no cost' },
                { key: 'once', icon: '💳', label: 'One-time fee', sub: 'A single payment to join the Hive' },
                { key: 'sub',  icon: '🔄', label: 'Subscription', sub: 'Recurring monthly or annual fee' },
              ].map(opt => (
                <div key={opt.key} className="ch-cost-card">
                  <div className="ch-cost-card-icon">{opt.icon}</div>
                  <div className="ch-cost-card-label">{opt.label}</div>
                  <div className="ch-cost-card-sub">{opt.sub}</div>
                </div>
              ))}
            </div>
          </div>

        </SectionCard>

      </div>

      {/* ── Fixed launch bar ───────────────────────────────────── */}
      <div className="ch-launch-bar">
        <div className="ch-launch-bar-inner">
          <div className="ch-launch-bar-left">
            <p className="ch-launch-meta">{barMeta}</p>
            {submitState === 'error' && (
              <p className="ch-launch-error">Something went wrong — please try again.</p>
            )}
          </div>
          <div className="ch-launch-actions">
            <button
              type="button"
              className={`ch-btn-draft${draftState === 'saved' ? ' saved' : ''}`}
              onClick={handleDraft}
              disabled={draftState === 'saving' || submitState === 'submitting'}
            >
              {draftState === 'saving' ? 'Saving…'
                : draftState === 'saved' ? 'Draft Saved ✓'
                : 'Save Draft'}
            </button>
            <button
              type="button"
              className="ch-btn-launch"
              onClick={handleLaunch}
              disabled={submitState === 'submitting'}
            >
              {submitState === 'submitting' ? 'Launching…' : 'Launch Hive →'}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
