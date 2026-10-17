import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import NotFoundPage from './NotFoundPage.jsx';
import '../styles/admin-reports.css';
import '../styles/admin-funnel.css';

const RANGES = [
  { key: '7d',  label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
];

const STUCK_TITLES = {
  verified: "Stuck before verifying their email",
  profile_finished: 'Stuck before finishing their profile',
  joined_hive: 'Stuck before joining a Hive',
  sent_message: 'Stuck before sending a first message',
};

function rangeToDates(key) {
  const to = new Date();
  if (key === 'all') return { from: new Date('2020-01-01').toISOString(), to: to.toISOString() };
  const days = key === '7d' ? 7 : 30;
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMedian(hours) {
  if (hours == null) return null;
  if (hours < 48) return `median ${Math.round(hours)}h`;
  return `median ${Math.round(hours / 24)}d`;
}

function StuckGroup({ stepKey, people }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="admfn-stuck-group">
      <button type="button" className="admfn-stuck-toggle" onClick={() => setOpen(o => !o)}>
        <span>{STUCK_TITLES[stepKey]} <span className="admfn-stuck-count">({people.length})</span></span>
        <span className="admfn-stuck-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="admfn-stuck-list">
          {people.length === 0 ? (
            <p className="admfn-stuck-empty">Nobody's stuck here.</p>
          ) : (
            people.map(p => (
              <div className="admfn-stuck-row" key={p.id}>
                <span className="admfn-stuck-name">{p.name}</span>
                <span className="admfn-stuck-meta">Signed up {formatDate(p.signedUpAt)}</span>
                <span className="admfn-stuck-meta">Last active {formatDate(p.lastActiveAt)}</span>
                <Link to={p.profileLink} className="hw-action-link">View profile</Link>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminFunnelPage() {
  const [allowed, setAllowed] = useState(null);
  const [range, setRange] = useState('30d');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback((rangeKey) => {
    setData(null);
    setError(null);
    const { from, to } = rangeToDates(rangeKey);
    api.get(`/api/admin/funnel?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(d => { setAllowed(true); setData(d); })
      .catch(e => {
        if (e.status === 404) setAllowed(false);
        else setError(e.data?.error ?? 'Could not load the funnel.');
      });
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  if (allowed === false) return <NotFoundPage />;

  const maxCount = data?.steps?.[0]?.count ?? 0;

  return (
    <div className="admrp-wrap">
      <div className="admrp-header" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1>Signup Funnel</h1>
        <div style={{ display: 'flex', gap: 14 }}>
          <Link to="/admin/reports" className="hw-action-link">Reports →</Link>
          <Link to="/admin/newsletter" className="hw-action-link">Newsletter →</Link>
        </div>
      </div>

      <div className="admfn-range-row">
        {RANGES.map(r => (
          <button
            key={r.key}
            type="button"
            className={`admfn-range-btn${range === r.key ? ' admfn-range-btn--active' : ''}`}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && <div className="hmv-error">{error}</div>}

      {data === null && !error ? (
        <div className="hw-feed-skel"><div className="hw-skel-card" style={{ height: 200 }} /></div>
      ) : data && data.totalSignups === 0 ? (
        <div className="admfn-empty">No signups in this period yet.</div>
      ) : data ? (
        <>
          <div className="admfn-bars">
            {data.steps.map((step, i) => {
              const widthPct = maxCount ? Math.max((step.count / maxCount) * 100, step.count > 0 ? 2 : 0) : 0;
              const prev = i > 0 ? data.steps[i - 1] : null;
              const drop = prev ? prev.count - step.count : null;
              const medianText = formatMedian(step.medianHours);
              return (
                <div key={step.key}>
                  {i > 0 && drop != null && (
                    <div className="admfn-gap">
                      {drop >= 0 ? `−${drop}` : `+${Math.abs(drop)} more reached this step than the one before it`}
                      {drop >= 0 && step.pctOfPrevious != null && ` (${step.pctOfPrevious}% continued)`}
                    </div>
                  )}
                  <div className="admfn-bar-row">
                    <div className="admfn-bar-label-row">
                      <span className="admfn-bar-step-name">{step.label}</span>
                      <span className="admfn-bar-count">{step.count}</span>
                      <span className="admfn-bar-pct">{step.pctOfSignups}% of signups</span>
                      {step.pctOfPrevious != null && (
                        <span className="admfn-bar-pct">· {step.pctOfPrevious}% from previous step</span>
                      )}
                      {medianText && <span className="admfn-median">· {medianText} to reach</span>}
                    </div>
                    <div className="admfn-bar-track">
                      <div className="admfn-bar-fill" style={{ width: `${widthPct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="admfn-stuck-section">
            <h2 className="admfn-stuck-title">Stuck at…</h2>
            {['verified', 'profile_finished', 'joined_hive', 'sent_message'].map(key => (
              <StuckGroup key={key} stepKey={key} people={data.stuck[key] ?? []} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
