import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { validateUrl as validateUrlClient } from '../../lib/validateUrl.js';
import '../../styles/apply-role-sheet.css';

const MESSAGE_LIMIT = 500;

// Used from discovery cards, the public Hive page header button, and every
// per-role Apply button (which pass preselectedRoleId). One component, one
// request flow — Prompt 82.
export default function ApplyForRoleSheet({ hiveId, hiveName, preselectedRoleId = null, onClose, onSuccess }) {
  const [phase, setPhase] = useState('loading'); // 'loading' | 'ready' | 'retry'
  const [collab, setCollab] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState(undefined); // undefined = not yet defaulted
  const [message, setMessage] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [portfolioError, setPortfolioError] = useState(null);
  const [sendState, setSendState] = useState('idle'); // 'idle' | 'sending' | 'error'
  const [sendError, setSendError] = useState(null);

  const sheetRef = useRef(null);
  const titleId = 'ars-title';
  const previouslyFocused = useRef(null);

  async function load() {
    setPhase('loading');
    try {
      const [collabData, profileData] = await Promise.all([
        api.get(`/api/hives/${hiveId}/collab`),
        api.get('/api/users/profile').catch(() => ({ profile: null })),
      ]);
      setCollab(collabData);
      const firstLink = profileData?.profile?.links?.[0]?.url ?? '';
      setPortfolioUrl(prev => prev || firstLink);
      setPhase('ready');
      // Default selection: preselected role (if still open), else
      // viewerBestRoleId, else nothing — Send stays disabled until chosen.
      setSelectedRoleId(prev => {
        if (prev !== undefined) return prev; // a retry after Send — keep the pick
        const roles = collabData.roles ?? [];
        const isPickable = id => {
          const r = roles.find(x => x.role_id === id);
          return r && r.status === 'open' && r.filled < r.slots;
        };
        if (preselectedRoleId && isPickable(preselectedRoleId)) return preselectedRoleId;
        if (collabData.viewerBestRoleId && isPickable(collabData.viewerBestRoleId)) return collabData.viewerBestRoleId;
        return null; // null = "No specific role" is a real, distinct pick from "nothing chosen yet"
      });
    } catch {
      setPhase('retry');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiveId]);

  // ── Accessibility: focus in, trap Tab, Esc closes, focus returns ────────
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const node = sheetRef.current;
    node?.focus();

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !sheetRef.current) return;
      const focusables = sheetRef.current.querySelectorAll(
        'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  function handlePortfolioChange(v) {
    setPortfolioUrl(v);
    const { error } = validateUrlClient(v);
    setPortfolioError(error ?? null);
  }

  async function handleSend() {
    if (selectedRoleId === undefined || sendState === 'sending') return;
    const { url, error: urlErr } = validateUrlClient(portfolioUrl);
    if (urlErr) { setPortfolioError(urlErr); return; }
    setSendState('sending');
    setSendError(null);
    try {
      const result = await api.post(`/api/hives/${hiveId}/request`, {
        message: message.trim() || undefined,
        role_id: selectedRoleId,
        portfolioUrl: url,
      });
      onSuccess(result);
    } catch (err) {
      if (err.status === 400) {
        // Role filled between opening and sending — show inline, refresh the
        // role list, keep the message and link exactly as typed.
        setSendError(err.data?.error ?? 'That role is no longer open.');
        setSendState('idle');
        load();
      } else {
        setSendError(err.data?.error ?? 'Something went wrong. Please try again.');
        setSendState('idle');
      }
    }
  }

  const roles = collab?.roles ?? [];

  return (
    <div className="ars-dim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="ars-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="ars-head">
          <h2 id={titleId} className="ars-title">Apply to {hiveName}</h2>
          <button type="button" className="ars-close" aria-label="Close" onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        <p className="ars-sub">Pick the role you want. The owner sees it with your request.</p>

        {phase === 'loading' && <p className="ars-loading">Loading roles…</p>}

        {phase === 'retry' && (
          <div className="ars-retry">
            <p>Couldn't load this Hive's roles.</p>
            <button type="button" className="ars-btn ars-btn-gold" onClick={load}>Try again</button>
          </div>
        )}

        {phase === 'ready' && (
          <>
            <span className="ars-lbl">Which role?</span>
            <div className="ars-pick" role="radiogroup" aria-label="Which role?">
              {roles.map(role => {
                const open = role.slots - role.filled;
                const full = role.status !== 'open' || open <= 0;
                const fit = role.viewerFit;
                const selected = selectedRoleId === role.role_id;
                return (
                  <button
                    key={role.role_id}
                    type="button"
                    className={`ars-pick-row${selected ? ' ars-pick-row--selected' : ''}${full ? ' ars-pick-row--disabled' : ''}`}
                    role="radio"
                    aria-checked={selected}
                    disabled={full}
                    onClick={() => !full && setSelectedRoleId(role.role_id)}
                  >
                    <span className="ars-radio" aria-hidden="true">{selected && <i />}</span>
                    <span className="ars-pick-main">
                      <span className="ars-pick-title">
                        {role.title}
                        {full
                          ? <span className="ars-full-pill">Full</span>
                          : (fit && fit.total > 0 && fit.matched > 0 && <span className="ars-fit-pill">{fit.matched} of {fit.total} skills</span>)}
                      </span>
                      <span className="ars-pick-meta">
                        {full ? 'Filled' : `${open} of ${role.slots} spots open`}
                        {role.experience_level ? ` · ${EXPERIENCE_LABELS[role.experience_level] ?? 'Any level'}` : ' · Any level'}
                      </span>
                      {role.skills?.length > 0 && (
                        <span className="ars-pick-skills">
                          {role.skills.map(skill => {
                            const have = fit?.have?.includes(skill);
                            const near = !have && fit?.near?.includes(skill);
                            return (
                              <span key={skill} className={`ars-sk${have ? ' ars-sk--have' : near ? ' ars-sk--near' : ''}`}>
                                {skill}
                              </span>
                            );
                          })}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                className={`ars-pick-row${selectedRoleId === null ? ' ars-pick-row--selected' : ''}`}
                role="radio"
                aria-checked={selectedRoleId === null}
                onClick={() => setSelectedRoleId(null)}
              >
                <span className="ars-radio" aria-hidden="true">{selectedRoleId === null && <i />}</span>
                <span className="ars-pick-main">
                  <span className="ars-pick-title">No specific role</span>
                  <span className="ars-pick-meta">Join as a general member. The owner decides where you fit.</span>
                </span>
              </button>
            </div>

            <div className="ars-legend">
              <span><i className="ars-dot ars-dot--have" />You have this skill</span>
              <span><i className="ars-dot ars-dot--near" />You have a related skill</span>
            </div>

            <label className="ars-lbl" htmlFor="ars-pitch">Why you're a fit <span className="ars-opt">(optional)</span></label>
            <textarea
              id="ars-pitch" className="ars-ta" maxLength={MESSAGE_LIMIT}
              value={message} onChange={e => setMessage(e.target.value)}
            />
            <p className="ars-hint">Up to {MESSAGE_LIMIT} characters.</p>

            <label className="ars-lbl" htmlFor="ars-portfolio">Portfolio or reel link <span className="ars-opt">(optional)</span></label>
            <input
              id="ars-portfolio" className="ars-inp" type="url"
              value={portfolioUrl} onChange={e => handlePortfolioChange(e.target.value)}
            />
            {portfolioError
              ? <p className="ars-hint ars-hint--error">{portfolioError}</p>
              : <p className="ars-hint">Pre-filled from the first link on your profile. Change it for this request.</p>}

            {sendError && <p className="ars-hint ars-hint--error" role="alert">{sendError}</p>}

            <div className="ars-foot">
              <button type="button" className="ars-btn ars-btn-ghost" onClick={onClose}>Cancel</button>
              <button
                type="button" className="ars-btn ars-btn-gold"
                disabled={selectedRoleId === undefined || !!portfolioError || sendState === 'sending'}
                onClick={handleSend}
              >
                {sendState === 'sending' ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const EXPERIENCE_LABELS = {
  learning: 'Still learning', some: 'Some experience', experienced: 'Experienced', expert: 'Expert',
};
