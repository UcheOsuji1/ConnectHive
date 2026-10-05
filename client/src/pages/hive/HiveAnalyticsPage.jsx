import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import '../../styles/hive-workspace.css';
import '../../styles/hive-analytics.css';

// Simple CSS bar charts — no charting library in this app yet, and these
// four series don't need one (spec §10: "a simple SVG/CSS chart... no new
// heavy dependency without saying why").
function BarChart({ points, valueKey, formatLabel, ariaLabel, barClassName = '' }) {
  const max = Math.max(1, ...points.map(p => p[valueKey]));
  return (
    <div className="han-chart" role="img" aria-label={ariaLabel}>
      {points.map((p, i) => (
        <div key={i} className="han-bar-col">
          <div className="han-bar-track">
            <div className={`han-bar ${barClassName}`} style={{ height: `${(p[valueKey] / max) * 100}%` }} />
          </div>
          <span className="han-bar-value">{p[valueKey]}</span>
          <span className="han-bar-label">{formatLabel(p)}</span>
        </div>
      ))}
    </div>
  );
}

function weekLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function monthLabel(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short' });
}

export default function HiveAnalyticsPage() {
  const { hiveId, isOwner } = useOutletContext();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get(`/api/hives/${hiveId}/analytics?days=${days}`)
      .then(setData)
      .catch(e => setError(e?.data?.error ?? 'Could not load analytics.'))
      .finally(() => setLoading(false));
  }, [hiveId, days]);

  useEffect(() => { load(); }, [load]);

  if (!isOwner) {
    return (
      <div className="han-wrap">
        <h2 className="hw-overview-title">Analytics</h2>
        <p className="hw-overview-sub">Only owners and admins can view this.</p>
        <Link to={`/hive/${hiveId}`} className="hw-action-link">← Back to Hive</Link>
      </div>
    );
  }

  return (
    <div className="han-wrap">
      <div className="han-header">
        <div className="hw-overview-header">
          <h2 className="hw-overview-title">Analytics</h2>
          <p className="hw-overview-sub">Real activity over time — no estimates.</p>
        </div>
        <div className="han-toggle" role="group" aria-label="Date range">
          <button type="button" className={`han-toggle-btn${days === 30 ? ' han-toggle-btn--on' : ''}`}
                  aria-pressed={days === 30} onClick={() => setDays(30)}>30 days</button>
          <button type="button" className={`han-toggle-btn${days === 90 ? ' han-toggle-btn--on' : ''}`}
                  aria-pressed={days === 90} onClick={() => setDays(90)}>90 days</button>
        </div>
      </div>

      {error ? (
        <div className="hmv-error">
          {error} <button type="button" className="hw-action-link" onClick={load}>Retry</button>
        </div>
      ) : loading || !data ? (
        <div className="hw-feed-skel">
          {[1, 2, 3, 4].map(i => <div key={i} className="hw-skel-card" style={{ height: 160 }} />)}
        </div>
      ) : (
        <>
          <div className="han-card">
            <div className="hw-card-label">Member Count by Week</div>
            <p className="han-caption">
              Running total of active members. Members who left can't be subtracted back out of
              earlier weeks — this line can only go up, even if the Hive is smaller today.
            </p>
            {data.memberCountByWeek.every(p => p.count === 0) ? (
              <div className="hw-action-empty">No members yet.</div>
            ) : (
              <BarChart points={data.memberCountByWeek} valueKey="count" formatLabel={p => weekLabel(p.week)}
                        ariaLabel="Member count by week" />
            )}
          </div>

          <div className="han-card">
            <div className="hw-card-label">Messages per Week</div>
            {data.messagesByWeek.every(p => p.count === 0) ? (
              <div className="hw-action-empty">No messages in this window.</div>
            ) : (
              <BarChart points={data.messagesByWeek} valueKey="count" formatLabel={p => weekLabel(p.week)}
                        ariaLabel="Messages per week" />
            )}
          </div>

          <div className="han-card">
            <div className="hw-card-label">Plans &amp; RSVPs per Month</div>
            {data.plansByMonth.every(p => p.plans === 0 && p.rsvps === 0) ? (
              <div className="hw-action-empty">No plans in this window.</div>
            ) : (
              <div className="han-dual-chart">
                <BarChart points={data.plansByMonth} valueKey="plans" formatLabel={p => monthLabel(p.month)}
                          ariaLabel="Plans per month" />
                <BarChart points={data.plansByMonth} valueKey="rsvps" formatLabel={p => monthLabel(p.month)}
                          ariaLabel="Going RSVPs per month" barClassName="han-bar--rsvps" />
              </div>
            )}
            <div className="han-legend">
              <span><span className="han-legend-dot han-legend-dot--plans" /> Plans</span>
              <span><span className="han-legend-dot han-legend-dot--rsvps" /> Going RSVPs</span>
            </div>
          </div>

          <div className="han-card">
            <div className="hw-card-label">Most Active Rooms</div>
            {data.activeRooms.length === 0 || data.activeRooms.every(r => r.messageCount === 0) ? (
              <div className="hw-action-empty">No messages in this window.</div>
            ) : (
              <ul className="han-room-list">
                {data.activeRooms.map(r => {
                  const max = Math.max(1, ...data.activeRooms.map(x => x.messageCount));
                  return (
                    <li key={r.channel_id} className="han-room-row">
                      <span className="han-room-name">#{r.name}</span>
                      <div className="han-room-bar-track">
                        <div className="han-room-bar" style={{ width: `${(r.messageCount / max) * 100}%` }} />
                      </div>
                      <span className="han-room-count">{r.messageCount}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
