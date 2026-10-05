import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import '../../styles/hive-workspace.css';

function relTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function HiveManageOverviewPage() {
  const { hiveId, isOwner } = useOutletContext();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get(`/api/hives/${hiveId}/overview`)
      .then(setData)
      .catch(e => setError(e?.data?.error ?? 'Could not load the overview.'))
      .finally(() => setLoading(false));
  }, [hiveId]);

  useEffect(() => { load(); }, [load]);

  if (!isOwner) {
    return (
      <div className="hw-overview">
        <div className="hw-overview-header">
          <h2 className="hw-overview-title">Overview</h2>
          <p className="hw-overview-sub">Only owners and admins can view this.</p>
        </div>
        <Link to={`/hive/${hiveId}`} className="hw-action-link">← Back to Hive</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="hw-overview">
        <div className="hw-metric-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="hw-metric-card" style={{ opacity: 0.5 }}>
              <div className="hw-metric-value">—</div>
              <div className="hw-metric-label">Loading…</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hw-overview">
        <div className="hw-overview-header">
          <h2 className="hw-overview-title">Overview</h2>
        </div>
        <div className="hw-action-center">
          <p className="hw-action-text">{error}</p>
          <button type="button" className="hw-action-link" onClick={load}>Retry</button>
        </div>
      </div>
    );
  }

  const metrics = [
    {
      label: 'Members', value: data.member_count + (data.max_members ? ` / ${data.max_members}` : ''),
      to: `/hive/${hiveId}/members-roles`,
    },
    { label: 'Pending Requests', value: data.pending_count, to: `/hive/${hiveId}/requests`, highlight: data.pending_count > 0 },
    { label: 'Joined (30d)', value: data.members_last_30d, to: `/hive/${hiveId}/members-roles` },
    { label: 'Messages (7d)', value: data.messages_last_7d, to: `/hive/${hiveId}/chat` },
    { label: 'Upcoming Plans', value: data.upcoming_plans, to: `/hive/${hiveId}/events` },
    {
      label: 'Onboarding Complete',
      value: data.onboarding_completion_rate == null ? '—' : `${data.onboarding_completion_rate}%`,
      to: `/hive/${hiveId}/onboarding`,
    },
  ];

  return (
    <div className="hw-overview">
      <div className="hw-overview-header">
        <h2 className="hw-overview-title">Overview</h2>
        <p className="hw-overview-sub">How this Hive is doing, at a glance.</p>
      </div>

      <div className="hw-metric-grid">
        {metrics.map(m => (
          <Link key={m.label} to={m.to}
                className={['hw-metric-card', m.highlight ? 'hw-metric-highlight' : ''].filter(Boolean).join(' ')}
                style={{ textDecoration: 'none' }}>
            <div className="hw-metric-value">{m.value}</div>
            <div className="hw-metric-label">{m.label}</div>
          </Link>
        ))}
      </div>

      <div className="hw-action-center">
        <div className="hw-action-title">Needs attention</div>
        {data.action_items.length === 0 ? (
          <div className="hw-action-empty">Nothing needs your attention right now.</div>
        ) : data.action_items.map(item => (
          <div key={item.type} className="hw-action-row">
            <span className="hw-action-text">{item.count} {item.label}</span>
            <Link className="hw-action-link"
                  to={item.type === 'requests' ? `/hive/${hiveId}/requests` : `/hive/${hiveId}/members-roles`}>
              Review →
            </Link>
          </div>
        ))}
      </div>

      <div className="hw-overview-card">
        <div className="hw-card-label">Recent Activity</div>
        {data.recent_activity.length === 0 ? (
          <div className="hw-action-empty">Nothing yet.</div>
        ) : (
          <div className="hw-activity-list">
            {data.recent_activity.map((a, i) => (
              <div key={i} className="hw-activity-row">
                <span className="hw-activity-label">{a.label}</span>
                <span className="hw-activity-time">{relTime(a.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
