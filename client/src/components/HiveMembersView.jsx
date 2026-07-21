import { useState, useEffect, useRef } from 'react';
import Avatar from './Avatar.jsx';
import { api } from '../lib/api.js';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function RoleBadge({ role }) {
  return <span className={`hmv-role hmv-role-${role}`}>{role.toUpperCase()}</span>;
}

function ActionMenu({ member, callerRole, callerId, onAction }) {
  const [open,    setOpen]    = useState(false);
  const [openUp,  setOpenUp]  = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref        = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleToggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setOpenUp(window.innerHeight - rect.bottom < 160);
    }
    setOpen(o => !o);
  }

  // Determine available actions based on guard rules
  const canPromote = callerRole === 'owner' && member.role === 'member';
  const canDemote  = callerRole === 'owner' && member.role === 'admin';
  const canRemove  = callerRole === 'owner' ||
                     (callerRole === 'admin' && member.role === 'member');

  if (!canPromote && !canDemote && !canRemove) return null;

  if (confirm) {
    return (
      <div className="hmv-inline-confirm">
        <span className="hmv-confirm-text">Remove {member.full_name?.split(' ')[0]}?</span>
        <button
          type="button"
          className="hmv-confirm-cancel"
          onClick={() => setConfirm(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="hmv-confirm-remove"
          onClick={() => { setConfirm(false); onAction('remove', member); }}
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="hmv-menu-wrap" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="hmv-menu-trigger"
        onClick={handleToggle}
        aria-label="Member actions"
      >
        ···
      </button>
      {open && (
        <div className={`hmv-dropdown${openUp ? ' hmv-dropdown-up' : ''}`}>
          {canPromote && (
            <button
              type="button"
              className="hmv-dropdown-item"
              onClick={() => { setOpen(false); onAction('promote', member); }}
            >
              Promote to Admin
            </button>
          )}
          {canDemote && (
            <button
              type="button"
              className="hmv-dropdown-item"
              onClick={() => { setOpen(false); onAction('demote', member); }}
            >
              Remove from Admin
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              className="hmv-dropdown-item hmv-dropdown-danger"
              onClick={() => { setOpen(false); setConfirm(true); }}
            >
              Remove from Hive
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function HiveMembersView({ hiveId, isOwner, myRole, myUserId, onMembersChanged }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [error,   setError]   = useState(null);

  const canManage = ['owner', 'admin'].includes(myRole);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/hives/${hiveId}/members`)
      .then(d => setMembers(d.members ?? []))
      .catch(() => setError('Failed to load members.'))
      .finally(() => setLoading(false));
  }, [hiveId]);

  async function handleAction(action, member) {
    try {
      if (action === 'promote') {
        const result = await api.patch(`/api/hives/${hiveId}/members/${member.user_id}/role`, { role: 'admin' });
        setMembers(prev => prev.map(m =>
          m.user_id === result.user_id ? { ...m, role: result.role } : m
        ).sort(memberSort));
      } else if (action === 'demote') {
        const result = await api.patch(`/api/hives/${hiveId}/members/${member.user_id}/role`, { role: 'member' });
        setMembers(prev => prev.map(m =>
          m.user_id === result.user_id ? { ...m, role: result.role } : m
        ).sort(memberSort));
      } else if (action === 'remove') {
        const result = await api.delete(`/api/hives/${hiveId}/members/${member.user_id}`);
        setMembers(prev => prev.filter(m => m.user_id !== result.user_id));
        if (onMembersChanged) onMembersChanged(result.member_count);
      }
    } catch (err) {
      // Surface the server's guard message if present
      setError(err.data?.error ?? 'Action failed. Try again.');
      setTimeout(() => setError(null), 4000);
    }
  }

  const filtered = search.trim()
    ? members.filter(m => m.full_name?.toLowerCase().includes(search.toLowerCase()))
    : members;

  const maxMembers   = null; // not returned by /members — shown from hive prop in workspace
  const memberCount  = members.length;

  if (loading) {
    return (
      <div className="hmv-wrap">
        <div className="hmv-header-row">
          <h2 className="hmv-title">Members</h2>
        </div>
        <div className="hmv-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="hmv-row hmv-skel-row">
              <div className="hw-skel hw-skel-circle" style={{ width: 40, height: 40, flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="hw-skel" style={{ height: 12, width: '45%', borderRadius: 6 }} />
                <div className="hw-skel" style={{ height: 10, width: '28%', borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="hmv-wrap">

      <div className="hmv-header-row">
        <h2 className="hmv-title">Members</h2>
        <span className="hmv-count">{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
      </div>

      {memberCount > 8 && (
        <div className="hmv-search-wrap">
          <input
            type="text"
            className="hmv-search"
            placeholder="Search members…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {error && <div className="hmv-error">{error}</div>}

      {filtered.length === 0 ? (
        <div className="hw-empty-state">
          <div className="hw-empty-title">
            {search ? 'No members match that search.' : 'No members yet.'}
          </div>
        </div>
      ) : (
        <div className="hmv-list">
          {filtered.map(member => {
            const isMe    = member.user_id === myUserId;
            const isOwnerRow = member.role === 'owner';
            const showMenu = canManage && !isMe && !isOwnerRow;

            return (
              <div key={member.user_id} className="hmv-row">
                <Avatar name={member.full_name} size={40} photoUrl={member.profile_photo_url} />

                <div className="hmv-identity">
                  <div className="hmv-name-row">
                    <span className="hmv-name">{member.full_name ?? 'Member'}</span>
                    <RoleBadge role={member.role} />
                    {!member.profile_complete && (
                      <span className="hmv-incomplete-chip">Profile incomplete</span>
                    )}
                  </div>
                  {member.member_id && (
                    <span className="hmv-member-id">{member.member_id}</span>
                  )}
                </div>

                <div className="hmv-right">
                  <span className="hmv-joined">Joined {formatDate(member.joined_at)}</span>
                  {showMenu && (
                    <ActionMenu
                      member={member}
                      callerRole={myRole}
                      callerId={myUserId}
                      onAction={handleAction}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function memberSort(a, b) {
  const rank = r => r === 'owner' ? 1 : r === 'admin' ? 2 : 3;
  if (rank(a.role) !== rank(b.role)) return rank(a.role) - rank(b.role);
  return new Date(a.joined_at) - new Date(b.joined_at);
}
