import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import { Icon } from './home/HomeBits.jsx';
import RsvpMenu from './plans/RsvpMenu.jsx';
import { api } from '../lib/api.js';
import '../styles/onboarding-sequence.css';

const SCREEN_NUMS = [1, 2, 3, 4, 5];

function parseLines(text) {
  if (!text) return [];
  return text.split('\n').map(l => l.replace(/^(\d+[.)]\s*|[-*]\s*)/, '').trim()).filter(Boolean);
}

function firstName(fullName) {
  return (fullName ?? '').trim().split(/\s+/)[0] || 'there';
}

// ── Progress ───────────────────────────────────────────────────────────────────
function ProgressLine({ screen }) {
  return <div className="mos-topline" aria-hidden="true"><div className="mos-topline-fill" style={{ width: `${(screen / 5) * 100}%` }} /></div>;
}

function ProgressDots({ screen, total = 5, caption }) {
  return (
    <div className="mos-dots-wrap">
      <div className="mos-dots">
        {SCREEN_NUMS.map(n => (
          <div key={n} className={`mos-dot${n === screen ? ' mos-dot--active' : n < screen ? ' mos-dot--done' : ''}`} />
        )).reduce((acc, el, i) => {
          if (i > 0) acc.push(<div key={`l${i}`} className={`mos-dot-line${i < screen - 1 ? ' mos-dot-line--done' : ''}`} />);
          acc.push(el);
          return acc;
        }, [])}
      </div>
      <div className="mos-step-label">Step {screen} of {total}</div>
      {caption && <div className="mos-step-caption">{caption}</div>}
    </div>
  );
}

// ── Screen 1 — You're in ───────────────────────────────────────────────────────
function Screen1({ data, onContinue, headingRef }) {
  const chips = [
    data.hive.category_name && { icon: 'users', text: data.hive.category_name },
    data.hive.location      && { icon: 'pin',   text: data.hive.location },
  ].filter(Boolean);

  return (
    <div className="mos-centered">
      <div className="mos-crest-photo">
        <Avatar name={data.founder?.full_name} src={data.founder?.profile_photo_url} size={110} />
        <span className="mos-crest-badge" aria-hidden="true">👥</span>
      </div>
      <h1 className="mos-h1" ref={headingRef} tabIndex={-1}>You&rsquo;re in.</h1>
      <p className="mos-sub-lg">Welcome to <span className="mos-gold">{data.hive.hive_name}</span></p>
      <p className="mos-sub">You&rsquo;re officially in the Hive.</p>
      {chips.length > 0 && (
        <div className="mos-chips">
          {chips.map(c => <span key={c.icon} className="mos-chip"><Icon name={c.icon} size={14} /> {c.text}</span>)}
        </div>
      )}
      <button type="button" className="mos-btn-primary" onClick={onContinue}>Meet Your Hive →</button>
    </div>
  );
}

// ── Screen 2 — Meet the vibe ───────────────────────────────────────────────────
function Screen2({ data, agreed, setAgreed, onBack, onContinue, canSkip, onSkip, headingRef }) {
  const note = data.hive.founder_note || data.welcomeMessage || "We're a welcoming community — don't hesitate to introduce yourself and dive in.";
  const principles = (Array.isArray(data.hive.hive_values) && data.hive.hive_values.length > 0)
    ? data.hive.hive_values.map(String)
    : parseLines(data.hive.ground_rules);
  const blocked = data.rulesAcceptanceRequired && !agreed;

  return (
    <div className="mos-card">
      <div className="mos-card-eyebrow">{data.hive.hive_name?.toUpperCase()}</div>
      <h1 className="mos-h2" ref={headingRef} tabIndex={-1}>Get to know the vibe</h1>

      <div className="mos-note-row">
        <Avatar name={data.founder?.full_name} src={data.founder?.profile_photo_url} size={64} />
        <div className="mos-note-body">
          <div className="mos-note-title">A note from {data.founder?.full_name ? firstName(data.founder.full_name) : 'the founder'}</div>
          <p className="mos-note-text">{note}</p>
          {data.founder?.full_name && <div className="mos-note-sign">— {data.founder.full_name}{data.founder.role === 'owner' ? ', Founder' : ''}</div>}
        </div>
      </div>

      {principles.length > 0 && (
        <>
          <div className="mos-divider-label">OUR COMMUNITY PRINCIPLES</div>
          <div className="mos-principles">
            {principles.slice(0, 3).map((p, i) => (
              <div key={i} className="mos-principle">
                <span className="mos-principle-icon" aria-hidden="true">✦</span>
                <span>{p}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {data.rulesAcceptanceRequired && (
        <label className="mos-agree-row">
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
          <span>I agree to follow this Hive&rsquo;s community principles.</span>
        </label>
      )}

      <ProgressDots screen={2} caption="Learn about the vibe and what makes this Hive special." />
      <div className="mos-actions">
        <button type="button" className="mos-btn-primary" onClick={onContinue} disabled={blocked}>Continue →</button>
        <div className="mos-actions-row">
          <button type="button" className="mos-btn-link" onClick={onBack}>Back</button>
          {canSkip && <button type="button" className="mos-btn-link" onClick={onSkip}>Skip for now</button>}
        </div>
      </div>
    </div>
  );
}

// ── Screen 3 — Make yourself known ────────────────────────────────────────────
function Screen3({ data, draft, setDraft, onBack, onContinue, canSkip, onSkip, headingRef }) {
  const toggleInterest = (name) => {
    setDraft(d => ({ ...d, interests: d.interests.includes(name) ? d.interests.filter(i => i !== name) : [...d.interests, name] }));
  };
  const toggleRoom = (id) => {
    setDraft(d => ({ ...d, rooms: d.rooms.includes(id) ? d.rooms.filter(r => r !== id) : [...d.rooms, id] }));
  };
  const setAnswer = (qid, val) => setDraft(d => ({ ...d, answers: { ...d.answers, [qid]: val } }));

  const existingInterestPool = useMemo(() => {
    const fromProfile = Array.isArray(data.me.interests) ? data.me.interests.map(String) : [];
    const extra = draft.interests.filter(i => !fromProfile.includes(i));
    return [...fromProfile, ...extra];
  }, [data.me.interests, draft.interests]);

  return (
    <div className="mos-centered mos-wide">
      <div className="mos-crest-photo mos-crest-photo--sm">
        <Avatar name={data.founder?.full_name} src={data.founder?.profile_photo_url} size={64} />
        <span className="mos-crest-badge" aria-hidden="true">👥</span>
      </div>
      <div className="mos-card-eyebrow">{data.hive.hive_name?.toUpperCase()}</div>
      <h1 className="mos-h1" ref={headingRef} tabIndex={-1}>Make yourself <span className="mos-gold">known</span>.</h1>
      <p className="mos-sub">Tell the Hive a little about yourself.</p>

      <textarea
        className="mos-intro-textarea"
        rows={3}
        maxLength={280}
        value={draft.intro}
        onChange={e => setDraft(d => ({ ...d, intro: e.target.value }))}
        placeholder={`Hey everyone, I'm ${firstName(data.me.full_name)}...`}
      />
      <div className="mos-charcount">{draft.intro.length}/280</div>

      {existingInterestPool.length > 0 && (
        <div className="mos-field-block">
          <div className="mos-field-label">Pick a few interests <span className="mos-optional">(optional)</span></div>
          <div className="mos-pill-row">
            {existingInterestPool.map(i => (
              <button key={i} type="button" className={`mos-pill${draft.interests.includes(i) ? ' mos-pill--on' : ''}`} onClick={() => toggleInterest(i)}>
                {i} {draft.interests.includes(i) && '✓'}
              </button>
            ))}
          </div>
        </div>
      )}

      {data.channels.length > 0 && (
        <div className="mos-field-block">
          <div className="mos-field-label">Choose your first rooms <span className="mos-optional">(optional)</span></div>
          <div className="mos-room-row">
            {data.channels.map(c => (
              <button key={c.channel_id} type="button" className={`mos-room${draft.rooms.includes(c.channel_id) ? ' mos-room--on' : ''}`} onClick={() => toggleRoom(c.channel_id)}>
                <span className="mos-room-name">#{c.name}</span>
                {draft.rooms.includes(c.channel_id) && <span className="mos-room-check">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {data.categoryQuestionsEnabled && data.introQuestions.length > 0 && (
        <div className="mos-field-block">
          {data.introQuestions.map(q => (
            <div key={q.id} className="mos-question">
              <div className="mos-field-label">{q.prompt}</div>
              {q.type === 'choice' && Array.isArray(q.options) ? (
                <div className="mos-pill-row">
                  {q.options.map(opt => (
                    <button key={opt} type="button" className={`mos-pill${draft.answers[q.id] === opt ? ' mos-pill--on' : ''}`} onClick={() => setAnswer(q.id, opt)}>
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <input type="text" className="mos-text-input" value={draft.answers[q.id] ?? ''} onChange={e => setAnswer(q.id, e.target.value)} />
              )}
            </div>
          ))}
        </div>
      )}

      <ProgressDots screen={3} caption="A little about you. A long way to go." />
      <div className="mos-actions">
        <button type="button" className="mos-btn-primary" onClick={onContinue}>Continue →</button>
        <div className="mos-actions-row">
          <button type="button" className="mos-btn-link" onClick={onBack}>Back</button>
          {canSkip && <button type="button" className="mos-btn-link" onClick={onSkip}>Skip for now</button>}
        </div>
      </div>
    </div>
  );
}

// ── Screen 4 — Meet your people ───────────────────────────────────────────────
function Screen4({ data, hiveId, draft, previewMode, onBack, onContinue, canSkip, onSkip, headingRef }) {
  const navigate = useNavigate();
  const [rsvp, setRsvp] = useState(data.nextPlan?.viewer_rsvp ?? null);

  function sayHello() {
    if (previewMode) return onContinue();
    const roomId = draft.rooms[0];
    navigate(roomId ? `/hive/${hiveId}/chat/${roomId}` : `/hive/${hiveId}/chat`);
  }

  async function changeRsvp(status) {
    if (previewMode) { setRsvp(status); return; }
    const r = await api.post(`/api/events/${data.nextPlan.post_id}/rsvp`, { status: status ?? 'clear' });
    setRsvp(r.status ?? null);
    return r;
  }

  return (
    <div className="mos-centered mos-wide">
      <h1 className="mos-h1" ref={headingRef} tabIndex={-1}>Meet your people.</h1>
      <p className="mos-sub">A few people you might click with.</p>

      {data.peopleToMeet.length > 0 && (
        <div className="mos-people-grid">
          {data.peopleToMeet.map(p => (
            <div key={p.user_id} className="mos-person-card">
              <Avatar name={p.full_name} src={p.profile_photo_url} size={56} />
              <span className="mos-person-name">{p.full_name ?? 'Member'}</span>
              {p.shared_interest_count > 0 && (
                <span className="mos-person-shared">{p.shared_interest_count} shared interest{p.shared_interest_count !== 1 ? 's' : ''}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mos-first-actions">
        <button type="button" className="mos-action-tile" onClick={sayHello}>
          <span className="mos-action-icon" aria-hidden="true">👋</span>
          <span className="mos-action-title">Say hello</span>
          <span className="mos-action-desc">Open the room and introduce yourself</span>
        </button>
        {data.nextPlan && (
          <div className="mos-action-tile mos-action-tile--rsvp">
            <span className="mos-action-icon" aria-hidden="true">📅</span>
            <span className="mos-action-title">RSVP to {data.nextPlan.headline}</span>
            <RsvpMenu value={rsvp} onChange={changeRsvp} />
          </div>
        )}
        <button type="button" className="mos-action-tile" onClick={onContinue}>
          <span className="mos-action-icon" aria-hidden="true">🧭</span>
          <span className="mos-action-title">Browse the Hive</span>
          <span className="mos-action-desc">Explore at your own pace</span>
        </button>
      </div>

      <ProgressDots screen={4} caption="Say hello whenever you're ready." />
      <div className="mos-actions">
        <button type="button" className="mos-btn-primary" onClick={onContinue}>Continue →</button>
        <div className="mos-actions-row">
          <button type="button" className="mos-btn-link" onClick={onBack}>Back</button>
          {canSkip && <button type="button" className="mos-btn-link" onClick={onSkip}>Skip for now</button>}
        </div>
      </div>
    </div>
  );
}

// ── Screen 5 — Welcome home ────────────────────────────────────────────────────
function Screen5({ data, hiveId, onEnter, entering, headingRef }) {
  // peopleToMeet excludes the viewer but not the founder, who is already
  // shown separately above — drop them here so the name line and avatar
  // stack never repeat the same person.
  const others = data.peopleToMeet.filter(p => p.user_id !== data.founder?.user_id).slice(0, 5);
  const names = [data.founder?.full_name, ...others.map(o => o.full_name)].filter(Boolean);
  const nameLine = names.length > 1
    ? `${names.slice(0, 2).join(', ')}${names.length > 2 ? `, and ${names.length - 2} others` : ''} are waiting to meet you.`
    : 'Your Hive is ready for you.';

  const tiles = [
    { icon: 'chat',    title: 'Chat',    desc: 'Stay connected in real time', to: `/hive/${hiveId}/chat` },
    { icon: 'plans',   title: 'Plans',   desc: 'Make and manage hive plans',  to: `/hive/${hiveId}/events` },
    { icon: 'members', title: 'Members', desc: 'Meet your hive crew',        to: `/hive/${hiveId}/members` },
    { icon: 'image',   title: 'Photos',  desc: 'Share and relive moments',   to: `/hive/${hiveId}/media` },
  ];

  return (
    <div className="mos-centered">
      <div className="mos-crest-photo">
        <Avatar name={data.founder?.full_name} src={data.founder?.profile_photo_url} size={110} />
        <span className="mos-crest-badge" aria-hidden="true">👥</span>
      </div>
      <h1 className="mos-h1" ref={headingRef} tabIndex={-1}>Welcome <span className="mos-gold">home</span>.</h1>
      <p className="mos-sub-lg">You&rsquo;re all set, <span className="mos-gold">{firstName(data.me.full_name)}</span>.</p>
      <p className="mos-sub">{names.length > 1 ? 'Your Hive is ready for you.' : nameLine}</p>

      {others.length > 0 && (
        <div className="mos-avatar-stack">
          {[data.founder, ...others].filter(Boolean).slice(0, 5).map((p, i) => (
            <Avatar key={p.user_id ?? i} name={p.full_name} src={p.profile_photo_url} size={40} className="mos-stack-avatar" />
          ))}
        </div>
      )}
      {names.length > 1 && <p className="mos-sub-sm">{nameLine}</p>}

      <div className="mos-tiles">
        {tiles.map(t => (
          <div key={t.icon} className="mos-tile">
            <Icon name={t.icon} size={18} />
            <span className="mos-tile-title">{t.title}</span>
            <span className="mos-tile-desc">{t.desc}</span>
          </div>
        ))}
      </div>

      <ProgressDots screen={5} caption="Your Hive is ready!" />
      <button type="button" className="mos-btn-primary" onClick={onEnter} disabled={entering}>
        {entering ? 'Entering…' : 'Enter the Hive →'}
      </button>
    </div>
  );
}

// ── Main sequence ──────────────────────────────────────────────────────────────
export default function MemberOnboardingSequence({ hiveId, previewMode = false, onComplete, onClose }) {
  const [data, setData]       = useState(null);
  const [error, setError]     = useState(null);
  const [screen, setScreen]   = useState(1);
  const [agreed, setAgreed]   = useState(false);
  const [draft, setDraft]     = useState({ intro: '', interests: [], rooms: [], answers: {} });
  const [entering, setEntering] = useState(false);
  const headingRef = useRef(null);
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches).current;

  useEffect(() => {
    const qs = previewMode ? '?preview=1' : '';
    api.get(`/api/hives/${hiveId}/onboarding/sequence${qs}`)
      .then(d => {
        setData(d);
        setScreen(d.resumeScreen ?? 1);
        if (d.existingIntro) {
          setDraft({
            intro: d.existingIntro.intro ?? '',
            interests: Array.isArray(d.existingIntro.interests) ? d.existingIntro.interests : [],
            rooms: Array.isArray(d.existingIntro.answers?.rooms) ? d.existingIntro.answers.rooms : [],
            answers: d.existingIntro.answers ?? {},
          });
        } else {
          setDraft(dr => ({ ...dr, interests: Array.isArray(d.me.interests) ? d.me.interests.map(String) : [] }));
        }
      })
      .catch(e => setError(e?.data?.error ?? 'Could not load your Hive.'));
  }, [hiveId, previewMode]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [screen]);

  const enabledScreens = useMemo(() => {
    if (!data) return SCREEN_NUMS;
    return SCREEN_NUMS.filter(n => n === 1 || data.screenConfig?.[n]?.enabled !== false);
  }, [data]);

  const goTo = useCallback((n) => {
    setScreen(n);
    if (!previewMode) api.post(`/api/hives/${hiveId}/onboarding/sequence/screen`, { screen: n }).catch(() => {});
  }, [hiveId, previewMode]);

  function nextScreen() {
    const idx = enabledScreens.indexOf(screen);
    const next = enabledScreens[idx + 1];
    if (next) goTo(next); else finish();
  }
  function prevScreen() {
    const idx = enabledScreens.indexOf(screen);
    const prev = enabledScreens[idx - 1];
    if (prev) goTo(prev);
  }

  async function saveIntroAndContinue() {
    if (!previewMode) {
      try {
        await api.post(`/api/hives/${hiveId}/onboarding/intro`, {
          intro: draft.intro, interests: draft.interests, answers: draft.answers, roomChannelIds: draft.rooms,
        });
      } catch { /* non-fatal — don't block the member's progress on a save hiccup */ }
    }
    nextScreen();
  }

  async function finish() {
    setEntering(true);
    if (!previewMode) {
      try { await api.post(`/api/hives/${hiveId}/welcome-seen`, {}); } catch { /* noop */ }
    }
    onComplete?.();
  }

  if (error) {
    return (
      <div className="mos-overlay"><div className="mos-error-box">{error}</div></div>
    );
  }
  if (!data) {
    return <div className="mos-overlay"><div className="mos-loading">Loading…</div></div>;
  }

  const screenCfg = (n) => data.screenConfig?.[n] ?? { enabled: true, required: false };
  const canSkip = (n) => screenCfg(n).required !== true && !(n === 2 && data.rulesAcceptanceRequired);

  const banner = data.hive.banner_url;

  return (
    <div className={`mos-overlay${reducedMotion ? ' mos-reduced-motion' : ''}`} role="dialog" aria-modal="true" aria-label="Welcome sequence">
      <div className="mos-backdrop" style={banner ? { backgroundImage: `url(${banner})` } : undefined} />
      <div className="mos-scrim" />
      {previewMode && (
        <button type="button" className="mos-preview-close" onClick={onClose}>✕ Exit preview</button>
      )}
      <ProgressLine screen={screen} />
      <div className="mos-viewport">
        <div key={screen} className="mos-screen-anim">
          {screen === 1 && <Screen1 data={data} onContinue={nextScreen} headingRef={headingRef} />}
          {screen === 2 && (
            <Screen2 data={data} agreed={agreed} setAgreed={setAgreed} onBack={prevScreen} onContinue={nextScreen}
              canSkip={canSkip(2)} onSkip={nextScreen} headingRef={headingRef} />
          )}
          {screen === 3 && (
            <Screen3 data={data} draft={draft} setDraft={setDraft} onBack={prevScreen} onContinue={saveIntroAndContinue}
              canSkip={canSkip(3)} onSkip={nextScreen} headingRef={headingRef} />
          )}
          {screen === 4 && (
            <Screen4 data={data} hiveId={hiveId} draft={draft} previewMode={previewMode} onBack={prevScreen} onContinue={nextScreen}
              canSkip={canSkip(4)} onSkip={nextScreen} headingRef={headingRef} />
          )}
          {screen === 5 && <Screen5 data={data} hiveId={hiveId} onEnter={finish} entering={entering} headingRef={headingRef} />}
        </div>
      </div>
    </div>
  );
}
