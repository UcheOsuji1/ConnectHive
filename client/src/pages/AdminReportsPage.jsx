import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import NotFoundPage from './NotFoundPage.jsx';
import '../styles/safety.css';
import '../styles/hive-manage-reports.css';
import '../styles/hive-workspace.css';
import '../styles/admin-reports.css';

const REASON_LABELS = {
  harassment:    'Harassment or bullying',
  safety:        'Safety concern',
  spam:          'Spam or scam',
  sexual:        'Sexual or inappropriate content',
  hate:          'Hate or discrimination',
  fake_or_minor: 'Fake profile or under 18',
  other:         'Something else',
};

function relativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return 'today';
  if (d === 1) return '1d ago';
  return `${d}d ago`;
}

function whereLabel(g) {
  if (g.target_type === 'user') return 'Profile';
  if (g.target_type === 'hive') return 'Hive page';
  if (g.is_private) return 'Private chat';
  return g.hive_name ?? '—';
}

function reportedLabel(g) {
  if (g.target_type === 'user' || g.target_type === 'hive') return g.author_name ?? '—';
  return g.author_name ?? 'Deleted member';
}

function ReviewPanel({ group, onClose, onResolved }) {
  const [note, setNote] = useState('');
  const [confirmingSuspend, setConfirmingSuspend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function resolve(action) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/admin/reports/${group.target_type}/${group.target_id}/resolve`, {
        action, note: note.trim() || undefined,
      });
      onResolved(group);
    } catch (err) {
      setError(err.data?.error ?? 'Could not resolve this report.');
      setBusy(false);
    }
  }

  const canRemove = ['message', 'post', 'comment'].includes(group.target_type);
  const canSuspendPerson = group.target_type !== 'hive';

  return (
    <div className="sf-modal-overlay" onClick={onClose}>
      <div className="sf-modal admrp-panel" onClick={e => e.stopPropagation()}>
        <div className="sf-modal-header">
          <h2>{reportedLabel(group)}</h2>
          <button type="button" className="sf-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sf-modal-body">
          {group.snapshot && (
            <blockquote className="admrp-quote">{group.snapshot}</blockquote>
          )}
          <div className="admrp-meta-row">
            <span>Where: {whereLabel(group)}</span>
            <span>Account age: {group.account_age_days != null ? `${group.account_age_days}d` : '—'}</span>
            <span>Earlier reports: {group.prior_report_count}</span>
          </div>

          <span className="sf-modal-label">Reporters ({group.reporters.length})</span>
          <div className="admrp-reporters">
            {group.reporters.map((r, i) => (
              <div key={i} className="admrp-reporter-row">
                <span className="admrp-reporter-name">{r.name}</span>
                <span className="admrp-reporter-reason">{REASON_LABELS[r.reason] ?? r.reason}</span>
                {r.details && <p className="admrp-reporter-details">{r.details}</p>}
              </div>
            ))}
          </div>

          {error && <p className="sf-modal-error">{error}</p>}
        </div>
        <div className="sf-modal-footer admrp-actions">
          {!confirmingSuspend ? (
            <>
              <button type="button" className="sf-modal-btn sf-modal-btn--cancel" onClick={() => resolve('dismiss')} disabled={busy}>
                Dismiss
              </button>
              {canRemove && (
                <button type="button" className="sf-modal-btn sf-modal-btn--danger" onClick={() => resolve('remove')} disabled={busy}>
                  Remove
                </button>
              )}
              {canSuspendPerson && (
                <button type="button" className="sf-modal-btn sf-modal-btn--danger" onClick={() => setConfirmingSuspend(true)} disabled={busy}>
                  Remove &amp; suspend account
                </button>
              )}
              {group.target_type === 'hive' && (
                <button type="button" className="sf-modal-btn sf-modal-btn--danger" onClick={() => setConfirmingSuspend(true)} disabled={busy}>
                  Suspend owner
                </button>
              )}
            </>
          ) : (
            <div className="admrp-confirm">
              <p>
                {group.target_type === 'hive'
                  ? `Suspend ${group.owner_name ?? "this Hive's owner"}? They'll be signed out everywhere and can't sign back in.`
                  : `Suspend ${reportedLabel(group)}? They'll be signed out everywhere and can't sign back in.`}
              </p>
              <textarea
                className="sf-modal-textarea"
                placeholder="Optional note for the record"
                value={note}
                onChange={e => setNote(e.target.value.slice(0, 500))}
              />
              <div className="admrp-confirm-btns">
                <button type="button" className="sf-modal-btn sf-modal-btn--cancel" onClick={() => setConfirmingSuspend(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="button" className="sf-modal-btn sf-modal-btn--danger"
                        onClick={() => resolve(group.target_type === 'hive' ? 'suspend_owner' : 'remove_and_suspend')}
                        disabled={busy}>
                  {busy ? 'Suspending…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportsTable({ groups, onReview }) {
  return (
    <div className="admrp-table-wrap">
      <table className="admrp-table">
        <thead>
          <tr>
            <th>Reported</th>
            <th>Reason</th>
            <th>Reports</th>
            <th>Where</th>
            <th>Age</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {groups.map(g => (
            <tr key={`${g.target_type}:${g.target_id}`}>
              <td>{reportedLabel(g)}</td>
              <td>{REASON_LABELS[g.reason] ?? g.reason}{g.reason_count > 1 ? ` · ${g.reason_count}` : ''}</td>
              <td>{g.report_count}</td>
              <td>{whereLabel(g)}</td>
              <td>{relativeTime(g.created_at)}</td>
              <td><button type="button" className="hw-action-link" onClick={() => onReview(g)}>Review</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SuspendedTable({ users, onUnsuspend }) {
  return (
    <div className="admrp-table-wrap">
      <table className="admrp-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Suspended</th><th>Note</th><th></th></tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.user_id}>
              <td>{u.full_name ?? 'Member'}</td>
              <td>{u.email}</td>
              <td>{relativeTime(u.suspended_at)}</td>
              <td>{u.suspension_note ?? '—'}</td>
              <td><button type="button" className="hw-action-link" onClick={() => onUnsuspend(u.user_id)}>Unsuspend</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminReportsPage() {
  const [allowed, setAllowed] = useState(null); // null = checking, true/false once known
  const [tab, setTab] = useState('open');
  const [groups, setGroups] = useState(null);
  const [suspended, setSuspended] = useState(null);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(null);

  const loadReports = useCallback((status) => {
    setGroups(null);
    setError(null);
    api.get(`/api/admin/reports?status=${status}`)
      .then(d => { setAllowed(true); setGroups(d.groups ?? []); })
      .catch(e => {
        if (e.status === 404) setAllowed(false);
        else setError(e.data?.error ?? 'Could not load reports.');
      });
  }, []);

  const loadSuspended = useCallback(() => {
    setSuspended(null);
    api.get('/api/admin/suspended')
      .then(d => { setAllowed(true); setSuspended(d.users ?? []); })
      .catch(e => { if (e.status === 404) setAllowed(false); });
  }, []);

  useEffect(() => {
    if (tab === 'suspended') loadSuspended();
    else loadReports(tab);
  }, [tab, loadReports, loadSuspended]);

  function handleResolved(group) {
    setGroups(prev => (prev ?? []).filter(g => !(g.target_type === group.target_type && g.target_id === group.target_id)));
    setReviewing(null);
  }

  async function handleUnsuspend(userId) {
    try {
      await api.post(`/api/admin/users/${userId}/unsuspend`);
      setSuspended(prev => (prev ?? []).filter(u => u.user_id !== userId));
    } catch { /* leave the row — the button can be retried */ }
  }

  if (allowed === false) return <NotFoundPage />;

  return (
    <div className="admrp-wrap">
      <div className="admrp-header">
        <h1>TrueHive Report Queue</h1>
      </div>

      <div className="hmrp-tabs" role="tablist">
        {['open', 'resolved', 'suspended'].map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t}
                  className={['hmrp-tab', tab === t ? 'hmrp-tab--active' : ''].join(' ').trim()}
                  onClick={() => setTab(t)}>
            {t === 'open' ? 'Open' : t === 'resolved' ? 'Resolved' : 'Suspended accounts'}
          </button>
        ))}
      </div>

      {error && <div className="hmv-error">{error}</div>}

      {tab === 'suspended' ? (
        suspended === null ? <div className="hw-feed-skel"><div className="hw-skel-card" style={{ height: 120 }} /></div>
        : suspended.length === 0 ? <div className="hmrp-empty">No suspended accounts.</div>
        : <SuspendedTable users={suspended} onUnsuspend={handleUnsuspend} />
      ) : (
        groups === null && allowed !== false ? <div className="hw-feed-skel"><div className="hw-skel-card" style={{ height: 120 }} /></div>
        : groups && groups.length === 0 ? <div className="hmrp-empty">Nothing here.</div>
        : groups && <ReportsTable groups={groups} onReview={setReviewing} />
      )}

      {reviewing && (
        <ReviewPanel group={reviewing} onClose={() => setReviewing(null)} onResolved={handleResolved} />
      )}
    </div>
  );
}
