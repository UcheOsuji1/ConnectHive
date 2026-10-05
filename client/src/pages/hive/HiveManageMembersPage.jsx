import { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import '../../styles/hive-workspace.css';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtLastSeen(iso) {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 2) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(iso);
}

function RowMenu({ member, viewerRole, viewerId, onPromote, onDemote, onRemove }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (member.user_id === viewerId || member.role === 'owner') return null;
  const canPromote = viewerRole === 'owner' && member.role === 'member';
  const canDemote  = viewerRole === 'owner' && member.role === 'admin';
  const canRemove  = viewerRole === 'owner' || member.role === 'member';

  if (confirming) {
    return (
      <div className="hmv-inline-confirm">
        <span className="hmv-confirm-text">Remove {member.full_name?.split(' ')[0] ?? 'member'}?</span>
        <button type="button" className="hmv-confirm-cancel" onClick={() => setConfirming(false)}>Cancel</button>
        <button type="button" className="hmv-confirm-remove" onClick={() => { setConfirming(false); onRemove(member); }}>Remove</button>
      </div>
    );
  }

  return (
    <div className="hmv-menu-wrap" ref={wrapRef}>
      <button type="button" className="hmv-menu-trigger" aria-haspopup="menu" aria-expanded={open}
              aria-label={`Actions for ${member.full_name ?? 'this member'}`}
              onClick={() => setOpen(o => !o)}>⋯</button>
      {open && (
        <div className="hmv-dropdown" role="menu">
          {canPromote && (
            <button type="button" role="menuitem" className="hmv-dropdown-item"
                    onClick={() => { setOpen(false); onPromote(member); }}>Promote to Admin</button>
          )}
          {canDemote && (
            <button type="button" role="menuitem" className="hmv-dropdown-item"
                    onClick={() => { setOpen(false); onDemote(member); }}>Demote to Member</button>
          )}
          {canRemove && (
            <button type="button" role="menuitem" className="hmv-dropdown-item hmv-dropdown-danger"
                    onClick={() => { setOpen(false); setConfirming(true); }}>Remove from Hive</button>
          )}
        </div>
      )}
    </div>
  );
}

export default function HiveManageMembersPage() {
  const { hiveId, isOwner, hive } = useOutletContext();
  const { user } = useAuth();
  const viewerRole = hive?.my_role;
  const viewerId = user?.userId;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [q, setQ]             = useState('');
  const [toast, setToast]     = useState(null);
  const toastTimer = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get(`/api/hives/${hiveId}/members`)
      .then(d => setMembers(d.members ?? []))
      .catch(e => setError(e?.data?.error ?? 'Could not load members.'))
      .finally(() => setLoading(false));
  }, [hiveId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  async function handlePromote(member) {
    try {
      const r = await api.patch(`/api/hives/${hiveId}/members/${member.user_id}/role`, { role: 'admin' });
      setMembers(prev => prev.map(m => m.user_id === r.user_id ? { ...m, role: r.role } : m));
      flash(`${member.full_name?.split(' ')[0] ?? 'Member'} promoted to Admin.`);
    } catch (e) { flash(e?.data?.error ?? 'Could not promote.'); }
  }
  async function handleDemote(member) {
    try {
      const r = await api.patch(`/api/hives/${hiveId}/members/${member.user_id}/role`, { role: 'member' });
      setMembers(prev => prev.map(m => m.user_id === r.user_id ? { ...m, role: r.role } : m));
      flash(`${member.full_name?.split(' ')[0] ?? 'Member'} demoted to Member.`);
    } catch (e) { flash(e?.data?.error ?? 'Could not demote.'); }
  }
  async function handleRemove(member) {
    try {
      const r = await api.delete(`/api/hives/${hiveId}/members/${member.user_id}`);
      setMembers(prev => prev.filter(m => m.user_id !== r.user_id));
      flash(`${member.full_name?.split(' ')[0] ?? 'Member'} removed.`);
    } catch (e) { flash(e?.data?.error ?? 'Could not remove that member.'); }
  }

  if (!isOwner) {
    return (
      <div className="hmv-wrap">
        <h2 className="hmv-title">Members &amp; Roles</h2>
        <p className="hw-overview-sub">Only owners and admins can view this.</p>
        <Link to={`/hive/${hiveId}`} className="hw-action-link">← Back to Hive</Link>
      </div>
    );
  }

  const filtered = q.trim()
    ? members.filter(m => (m.full_name ?? '').toLowerCase().includes(q.trim().toLowerCase()))
    : members;

  return (
    <div className="hmv-wrap">
      <div className="hmv-header-row">
        <h2 className="hmv-title">Members &amp; Roles</h2>
        <span className="hmv-count">{members.length} member{members.length === 1 ? '' : 's'}</span>
      </div>

      <div className="hmv-search-wrap">
        <input type="search" className="hmv-search" placeholder="Search members…"
               value={q} onChange={e => setQ(e.target.value)} aria-label="Search members by name" />
      </div>

      {toast && <div className="hw-settings-success" role="status">{toast}</div>}

      {loading ? (
        <div className="hmv-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="hmv-row hmv-skel-row">
              <div className="hw-skel hw-skel-circle" style={{ width: 40, height: 40 }} />
              <div style={{ flex: 1 }}><div className="hw-skel-line" style={{ width: '40%', height: 12 }} /></div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="hmv-error">
          {error} <button type="button" className="hw-action-link" onClick={load}>Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="hw-empty-state">
          <div className="hw-empty-title">{q ? 'No members match that search.' : 'No members yet.'}</div>
        </div>
      ) : (
        <div className="hmv-list">
          {filtered.map(m => (
            <div key={m.user_id} className="hmv-row">
              <div className="hmv-identity">
                <div className="hmv-name-row">
                  <span className="hmv-name">{m.full_name ?? 'Member'}</span>
                  <span className={`hmv-role hmv-role-${m.role}`}>{m.role}</span>
                  {!m.profile_complete && <span className="hmv-incomplete-chip">Incomplete profile</span>}
                </div>
                <span className="hmv-member-id">
                  Joined {fmtDate(m.joined_at)} · Onboarding: {m.onboarding_status ?? 'completed'} · Last seen {fmtLastSeen(m.last_seen_at)}
                </span>
              </div>
              <div className="hmv-right">
                <RowMenu member={m} viewerRole={viewerRole} viewerId={viewerId}
                         onPromote={handlePromote} onDemote={handleDemote} onRemove={handleRemove} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
