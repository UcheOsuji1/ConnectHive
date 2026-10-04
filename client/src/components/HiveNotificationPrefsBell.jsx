import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';

const PREF_ROWS = [
  { key: 'mentions',       label: 'Mentions',        desc: 'When someone @mentions you' },
  { key: 'plans',          label: 'New plans',        desc: 'When a new plan is posted' },
  { key: 'rsvp_reminders', label: 'RSVP reminders',   desc: '24 hours before a plan you RSVP’d to' },
  { key: 'new_members',    label: 'New members',      desc: 'When someone joins or introduces themselves' },
  { key: 'announcements',  label: 'Announcements',    desc: 'Messages sent to you by an owner or admin' },
  { key: 'all_messages',   label: 'All chat messages', desc: 'Every message in every room — noisy' },
];

export default function HiveNotificationPrefsBell({ hiveId }) {
  const [open, setOpen]     = useState(false);
  const [prefs, setPrefs]   = useState(null);
  const [error, setError]   = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open || prefs) return;
    api.get(`/api/hives/${hiveId}/notification-prefs`)
      .then(d => setPrefs(d.prefs))
      .catch(() => setError('Could not load your notification settings.'));
  }, [open, hiveId, prefs]);

  useEffect(() => {
    if (!open) return;
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', onKey); };
  }, [open]);

  async function toggle(key) {
    const prev = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setError(null);
    try {
      await api.put(`/api/hives/${hiveId}/notification-prefs`, { [key]: next[key] });
    } catch {
      setPrefs(prev);
      setError('Could not save — try again.');
    }
  }

  return (
    <div className="hnp-wrap" ref={ref}>
      <button
        type="button"
        className="hnp-bell"
        onClick={() => setOpen(o => !o)}
        aria-label="Notification preferences for this Hive"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </button>

      {open && (
        <div className="hnp-panel" role="dialog" aria-label="Notification preferences for this Hive">
          <div className="hnp-panel-title">Notifications for this Hive</div>
          {error && <div className="hnp-error">{error}</div>}
          {!prefs ? (
            <div className="hnp-loading">Loading…</div>
          ) : (
            <div className="hnp-list">
              {PREF_ROWS.map(r => (
                <label key={r.key} className="hnp-row">
                  <div className="hnp-row-text">
                    <span className="hnp-row-label">{r.label}</span>
                    <span className="hnp-row-desc">{r.desc}</span>
                  </div>
                  <input type="checkbox" checked={!!prefs[r.key]} onChange={() => toggle(r.key)} />
                </label>
              ))}
            </div>
          )}
          <p className="hnp-hint">Changes save immediately. Safety and access notifications always come through.</p>
        </div>
      )}
    </div>
  );
}
