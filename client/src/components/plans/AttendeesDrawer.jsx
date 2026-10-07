import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../Avatar.jsx';
import { api } from '../../lib/api.js';
import { formatDate } from '../../lib/plans.js';

const TABS = [
  { key: 'going',     label: 'Going' },
  { key: 'maybe',     label: 'Maybe' },
  { key: 'not_going', label: "Can't go" },
];

// checkinsOn: whether the Hive's check-in tool is on (Prompt 61 Part 5) — a
// past plan then gets a real "Attended" tab alongside "Went".
export default function AttendeesDrawer({ plan, past = false, checkinsOn = false, onClose }) {
  const [data, setData]       = useState(null);
  const [checkins, setCheckins] = useState(null);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState('going');
  const panelRef = useRef(null);

  // Fetched on open, never preloaded.
  useEffect(() => {
    if (!plan) return;
    setData(null); setError(null); setCheckins(null);
    setTab(past ? 'went' : 'going');
    api.get(`/api/events/${plan.post_id}/attendees`)
      .then(setData)
      .catch(e => setError(e?.data?.error ?? 'Could not load attendees.'));
    if (past && checkinsOn) {
      api.get(`/api/hives/${plan.hive_id}/plans/${plan.post_id}/checkins`)
        .then(d => setCheckins(d.checkins))
        .catch(() => setCheckins([]));
    }
  }, [plan, past, checkinsOn]);

  function retry() {
    if (!plan) return;
    setData(null); setError(null);
    api.get(`/api/events/${plan.post_id}/attendees`)
      .then(setData)
      .catch(e => setError(e?.data?.error ?? 'Could not load attendees.'));
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!plan) return null;

  const tabs = past
    ? [{ key: 'went', label: 'Went' }, ...(checkinsOn ? [{ key: 'attended', label: 'Attended' }] : [])]
    : TABS;
  const isAttendedTab = tab === 'attended';
  const list = isAttendedTab ? (checkins ?? []) : (data?.[tab === 'went' ? 'going' : tab] ?? []);
  const outside = isAttendedTab ? 0 : (data?.outside?.[tab === 'went' ? 'going' : tab] ?? 0);
  const attendedCount = (checkins ?? []).length;

  return (
    <>
      <div className="plans-scrim" onClick={onClose} />
      <aside
        ref={panelRef}
        className="plans-drawer"
        role="dialog"
        aria-label={`Attendees for ${plan.headline}`}
        tabIndex={-1}
      >
        <div className="plans-drawer-head">
          <div>
            <Link to={`/hive/${plan.hive_id}/events/${plan.post_id}`} className="plans-drawer-title plans-card-title-link" onClick={onClose}>
              {plan.headline}
            </Link>
            <div className="plans-drawer-date">{formatDate(plan.event_at)}</div>
          </div>
          <button type="button" className="plans-drawer-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="plans-drawer-tabs" role="tablist">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`plans-drawer-tab${tab === t.key ? ' plans-drawer-tab--on' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label} <span className="plans-pillcount">{t.key === 'attended' ? attendedCount : t.key === 'went' ? (data?.going?.length ?? 0) : (data?.[t.key]?.length ?? 0)}</span>
            </button>
          ))}
        </div>

        <div className="plans-drawer-body">
          {error && (
            <p className="plans-empty-txt">
              {error} <button type="button" className="plans-btn-text" onClick={retry}>Retry</button>
            </p>
          )}
          {!error && !data && <p className="plans-empty-txt">Loading…</p>}
          {!error && isAttendedTab && data && checkins === null && <p className="plans-empty-txt">Loading…</p>}

          {data && (!isAttendedTab || checkins !== null) && list.length === 0 && outside === 0 && (
            <p className="plans-empty-txt">{isAttendedTab ? 'Nobody checked in.' : 'Nobody yet.'}</p>
          )}

          {data && (!isAttendedTab || checkins !== null) && list.map(p => (
            <Link key={p.user_id} to={`/profile/${p.user_id}`} className="plans-att">
              <Avatar name={p.full_name} src={p.profile_photo_url} size={36} />
              <span className="plans-att-txt">
                <span className="plans-att-name">
                  {p.full_name ?? 'Member'}
                  {p.role && p.role !== 'member' && (
                    <span className="plans-role">{p.role}</span>
                  )}
                </span>
                {p.is_host && <span className="plans-att-host">Host</span>}
                {isAttendedTab && p.method === 'host' && <span className="plans-role">marked by host</span>}
              </span>
            </Link>
          ))}

          {/* People outside the Hive are counted but never named. */}
          {data && !isAttendedTab && outside > 0 && (
            <div className="plans-att-outside">
              +{outside} {outside === 1 ? 'person' : 'people'} from outside the Hive
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
