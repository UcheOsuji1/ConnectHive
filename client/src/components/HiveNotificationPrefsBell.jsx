import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api.js';

const PREF_ROWS = [
  { key: 'mentions',       label: 'Mentions',        desc: 'When someone @mentions you' },
  { key: 'plans',          label: 'New plans',        desc: 'When a new plan is posted' },
  { key: 'rsvp_reminders', label: 'RSVP reminders',   desc: '24 hours before a plan you RSVP’d to' },
  { key: 'new_members',    label: 'New members',      desc: 'Owners and admins always get these; for members it stays off by default.' },
  { key: 'posts',          label: 'New posts',        desc: 'When an owner or admin posts in this Hive.' },
  { key: 'announcements',  label: 'Announcements',    desc: 'Messages sent to you by an owner or admin' },
  { key: 'all_messages',   label: 'Chat activity',    desc: 'One running count per room while you’re away.' },
  { key: 'costs',          label: 'Split costs',      desc: 'Added to an expense, a settlement, or owing money' },
  { key: 'matches',        label: 'Matches',          desc: 'Meet someone new pairings and mentorship requests' },
  { key: 'opportunities',  label: 'Opportunities',    desc: 'New posts (daily digest), interest in your post, and saved posts closing soon' },
  { key: 'tasks',          label: 'Tasks',            desc: 'You were assigned, a task is due tomorrow, and comments on your tasks' },
];

export default function HiveNotificationPrefsBell({ hiveId }) {
  const [open, setOpen]     = useState(false);
  const [prefs, setPrefs]   = useState(null);
  const [error, setError]   = useState(null);
  const [coords, setCoords] = useState(null); // { top, left } for the portal panel
  const wrapRef  = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open || prefs) return;
    api.get(`/api/hives/${hiveId}/notification-prefs`)
      .then(d => setPrefs(d.prefs))
      .catch(() => setError('Could not load your notification settings.'));
  }, [open, hiveId, prefs]);

  // The bell sits inside the sidebar rail, which scrolls its own content and
  // so clips any CSS-absolute child that would otherwise escape it — a
  // position:fixed panel rendered through a portal, placed from the bell's
  // own measured position, sidesteps that clipping entirely.
  useEffect(() => {
    if (!open) return;
    const PANEL_W = 280;
    const MARGIN  = 12;
    function place() {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const maxLeft = window.innerWidth - PANEL_W - MARGIN;
      setCoords({ top: r.bottom + 8, left: Math.max(MARGIN, Math.min(r.left, maxLeft)) });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function h(e) {
      if (wrapRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    }
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

  const panel = open && coords && createPortal(
    <div
      ref={panelRef}
      className="hnp-panel hnp-panel--portal"
      style={{ top: coords.top, left: coords.left }}
      role="dialog"
      aria-label="Notification preferences for this Hive"
    >
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
    </div>,
    document.body,
  );

  return (
    <div className="hnp-wrap" ref={wrapRef}>
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
      {panel}
    </div>
  );
}
