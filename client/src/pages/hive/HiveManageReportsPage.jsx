import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import '../../styles/hive-workspace.css';
import '../../styles/hive-manage-reports.css';

// Same 7 reasons as ReportModal.jsx's R2 list — label lookup only, no copy
// duplicated beyond what a reason chip needs.
const REASON_LABELS = {
  harassment:    'Harassment or bullying',
  safety:        'Safety concern',
  spam:          'Spam or scam',
  sexual:        'Sexual or inappropriate content',
  hate:          'Hate or discrimination',
  fake_or_minor: 'Fake profile or under 18',
  other:         'Something else',
};

const KIND_LABEL = { message: 'message', post: 'post', comment: 'comment' };

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function ReportCard({ group, hiveId, onResolved }) {
  const [busy, setBusy] = useState(false);
  const [confirmingRemoveMember, setConfirmingRemoveMember] = useState(false);
  const kind = KIND_LABEL[group.target_type] ?? group.target_type;

  async function resolve(action) {
    setBusy(true);
    try {
      await api.post(`/api/hives/${hiveId}/reports/${group.target_type}/${group.target_id}/resolve`, { action });
      onResolved(group);
    } catch {
      setBusy(false);
    }
  }

  const contextLink = group.target_type === 'message' && group.channel_id
    ? `/hive/${hiveId}/chat/${group.channel_id}`
    : group.target_type === 'comment' && group.post_id
    ? `/hive/${hiveId}` // posts live on the feed; no dedicated post page to deep-link to
    : group.target_type === 'post' ? `/hive/${hiveId}` : null;

  return (
    <div className="hmrp-card">
      <div className="hmrp-card-top">
        <span className="hmrp-kind">{kind}</span>
        <span className="hmrp-time">{relativeTime(group.created_at)}</span>
      </div>
      <blockquote className="hmrp-quote">
        {group.snapshot || <em>No text — attachments or media only.</em>}
      </blockquote>
      <div className="hmrp-meta">
        <span className="hmrp-author">By {group.author_name ?? 'Member'}</span>
        {contextLink && <Link to={contextLink} className="hmrp-context-link">View in context →</Link>}
      </div>
      <div className="hmrp-chips">
        <span className="hmrp-reason-chip">
          {REASON_LABELS[group.reason] ?? group.reason} · {group.reason_count}
        </span>
        {group.hidden === 'auto' && (
          <span className="hmrp-auto-chip">Hidden automatically after 2 reports</span>
        )}
      </div>

      {onResolved && (
        <div className="hmrp-actions">
          {!confirmingRemoveMember ? (
            <>
              <button type="button" className="hmrp-btn hmrp-btn--danger" disabled={busy}
                      onClick={() => resolve('remove')}>
                Remove {kind}
              </button>
              <button type="button" className="hmrp-btn hmrp-btn--danger" disabled={busy}
                      onClick={() => setConfirmingRemoveMember(true)}>
                Remove {group.author_name?.split(' ')[0] ?? 'member'} from Hive
              </button>
              <button type="button" className="hmrp-btn" disabled={busy}
                      onClick={() => resolve('keep')}>
                Keep it
              </button>
            </>
          ) : (
            <div className="hmrp-confirm">
              <span>Remove {group.author_name?.split(' ')[0] ?? 'this member'} from this Hive?</span>
              <button type="button" className="hmrp-btn" onClick={() => setConfirmingRemoveMember(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="hmrp-btn hmrp-btn--danger" onClick={() => resolve('remove_member')} disabled={busy}>
                {busy ? 'Removing…' : 'Remove'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HiveManageReportsPage() {
  const { hiveId, setReportCount } = useOutletContext();
  const [tab, setTab] = useState('open');
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback((status) => {
    setGroups(null);
    setError(null);
    api.get(`/api/hives/${hiveId}/reports?status=${status}`)
      .then(d => {
        setGroups(d.groups ?? []);
        if (status === 'open') setReportCount?.((d.groups ?? []).length);
      })
      .catch(e => setError(e?.data?.error ?? 'Could not load reports.'));
  }, [hiveId, setReportCount]);

  useEffect(() => { load(tab); }, [load, tab]);

  function handleResolved(group) {
    setGroups(prev => (prev ?? []).filter(g => !(g.target_type === group.target_type && g.target_id === group.target_id)));
    setReportCount?.(prev => (tab === 'open' ? Math.max(0, (prev ?? 1) - 1) : prev));
  }

  return (
    <div className="hmrp-wrap">
      <div className="hw-overview-header">
        <h2 className="hw-overview-title">Reports</h2>
        <p className="hw-overview-sub">Messages, posts and comments reported in your Hive's rooms.</p>
      </div>

      <div className="hmrp-tabs" role="tablist">
        {['open', 'resolved'].map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t}
                  className={['hmrp-tab', tab === t ? 'hmrp-tab--active' : ''].join(' ').trim()}
                  onClick={() => setTab(t)}>
            {t === 'open' ? 'Open' : 'Resolved'}
          </button>
        ))}
      </div>

      {error && (
        <div className="hmv-error">
          {error} <button type="button" className="hw-action-link" onClick={() => load(tab)}>Retry</button>
        </div>
      )}

      {groups === null && !error ? (
        <div className="hw-feed-skel">
          {[1, 2, 3].map(i => <div key={i} className="hw-skel-card" style={{ height: 120 }} />)}
        </div>
      ) : groups && groups.length === 0 ? (
        <div className="hmrp-empty">
          {tab === 'open'
            ? 'Nothing to review. Reports about your Hive will show up here.'
            : 'No resolved reports yet.'}
        </div>
      ) : (
        <div className="hmrp-list">
          {(groups ?? []).map(g => (
            <ReportCard
              key={`${g.target_type}:${g.target_id}`}
              group={g}
              hiveId={hiveId}
              onResolved={tab === 'open' ? handleResolved : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
