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

export default function AttendeesDrawer({ plan, past = false, onClose }) {
  const [data, setData]   = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab]     = useState('going');
  const panelRef = useRef(null);

  // Fetched on open, never preloaded.
  useEffect(() => {
    if (!plan) return;
    setData(null); setError(null); setTab('going');
    api.get(`/api/events/${plan.post_id}/attendees`)
      .then(setData)
      .catch(e => setError(e?.data?.error ?? 'Could not load attendees.'));
  }, [plan]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!plan) return null;

  const tabs = past ? [{ key: 'going', label: 'Went' }] : TABS;
  const list = data?.[tab] ?? [];
  const outside = data?.outside?.[tab] ?? 0;

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
            <div className="plans-drawer-title">{plan.headline}</div>
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
              {t.label} <span className="plans-pillcount">{data?.[t.key]?.length ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="plans-drawer-body">
          {error && <p className="plans-empty-txt">{error}</p>}
          {!error && !data && <p className="plans-empty-txt">Loading…</p>}

          {data && list.length === 0 && outside === 0 && (
            <p className="plans-empty-txt">Nobody yet.</p>
          )}

          {data && list.map(p => (
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
              </span>
            </Link>
          ))}

          {/* People outside the Hive are counted but never named. */}
          {data && outside > 0 && (
            <div className="plans-att-outside">
              +{outside} {outside === 1 ? 'person' : 'people'} from outside the Hive
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
