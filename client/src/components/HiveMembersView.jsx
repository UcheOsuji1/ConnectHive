import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import '../styles/hive-members.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function memberSort(a, b) {
  const rank = r => r === 'owner' ? 1 : r === 'admin' ? 2 : 3;
  if (rank(a.role) !== rank(b.role)) return rank(a.role) - rank(b.role);
  return new Date(a.joined_at) - new Date(b.joined_at);
}

function isActive(m) {
  return !m.onboarding_status || m.onboarding_status === 'completed';
}

function lastActiveSrc(m) {
  return m.last_seen_at ?? m.joined_at;
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Av({ name, photo, size = 38, className = 'hmv2-avatar' }) {
  return (
    <div className={className} style={size !== 38 ? { width: size, height: size, fontSize: size * 0.185 + 'rem' } : undefined}>
      {photo ? <img src={photo} alt="" /> : initials(name)}
    </div>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  return (
    <span className={`hmv2-role-badge hmv2-badge-${role}`}>
      {role.toUpperCase()}
    </span>
  );
}

// ── Status cell ───────────────────────────────────────────────────────────────
function StatusCell({ member }) {
  const active = isActive(member);
  return (
    <div className={`hmv2-status hmv2-status--${active ? 'active' : 'boarding'}`}>
      <span className="hmv2-status-dot" />
      <span className="hmv2-status-label">{active ? 'Active' : 'Onboarding'}</span>
    </div>
  );
}

// ── Dots menu (on table row) ──────────────────────────────────────────────────
function DotsMenu({ member, myRole, myUserId, onAction }) {
  const [open,    setOpen]    = useState(false);
  const [openUp,  setOpenUp]  = useState(false);
  const [confirm, setConfirm] = useState(false);
  const wrapRef    = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function h(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const canRemove = myRole === 'owner' || (myRole === 'admin' && member.role === 'member');
  if (!canRemove) return null;

  function toggle(e) {
    e.stopPropagation();
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setOpenUp(window.innerHeight - rect.bottom < 100);
    }
    setOpen(o => !o);
  }

  if (confirm) {
    return (
      <div className="hmv2-confirm-row" onClick={e => e.stopPropagation()}>
        <span className="hmv2-confirm-text">Remove {member.full_name?.split(' ')[0]}?</span>
        <button type="button" className="hmv2-confirm-cancel" onClick={() => setConfirm(false)}>Cancel</button>
        <button type="button" className="hmv2-confirm-remove"
          onClick={() => { setConfirm(false); onAction('remove', member); }}>Remove</button>
      </div>
    );
  }

  return (
    <div className="hmv2-dots-wrap" ref={wrapRef}>
      <button ref={triggerRef} type="button" className="hmv2-dots-btn"
        onClick={toggle} aria-label="Member actions">···</button>
      {open && (
        <div className={`hmv2-dropdown${openUp ? ' hmv2-dropdown--up' : ''}`}>
          <button type="button" className="hmv2-dropdown-item hmv2-dropdown-danger"
            onClick={e => { e.stopPropagation(); setOpen(false); setConfirm(true); }}>
            Remove from Hive
          </button>
        </div>
      )}
    </div>
  );
}

// ── Profile drawer ────────────────────────────────────────────────────────────
const TAG_CAP = 8;

function ProfileDrawer({ member, myRole, myUserId, hiveId, onClose, onRoleChange, onRemove }) {
  const [pickerOpen,    setPickerOpen]    = useState(false);
  const [pickerRole,    setPickerRole]    = useState(member?.role ?? 'member');
  const [applying,      setApplying]      = useState(false);
  const [confirmRm,     setConfirmRm]     = useState(false);
  const [tagsExpanded,  setTagsExpanded]  = useState(false);

  useEffect(() => {
    setPickerOpen(false);
    setPickerRole(member?.role ?? 'member');
    setConfirmRm(false);
    setTagsExpanded(false);
  }, [member?.user_id]);

  if (!member) return null;

  const isMe          = member.user_id === myUserId;
  const isOwnerMember = member.role === 'owner';
  const canChangeRole = myRole === 'owner' && !isMe && !isOwnerMember;
  const canRemove     = (myRole === 'owner' || (myRole === 'admin' && member.role === 'member')) && !isMe && !isOwnerMember;

  const rawInterests = Array.isArray(member.interests) ? member.interests
    : (member.interests ? JSON.parse(member.interests) : []);
  // Deduplicate by normalised lowercase name
  const interests = [...new Map(rawInterests.map(t => [String(t).toLowerCase().trim(), t])).values()];
  const visibleTags = tagsExpanded ? interests : interests.slice(0, TAG_CAP);
  const hiddenCount = interests.length - TAG_CAP;

  const showOnboarding = !isActive(member) && member.total_steps > 0;

  async function applyRole() {
    if (pickerRole === member.role) { setPickerOpen(false); return; }
    setApplying(true);
    await onRoleChange(member.user_id, pickerRole);
    setApplying(false);
    setPickerOpen(false);
  }

  return (
    <>
      <div className="hmv2-backdrop" onClick={onClose} />
      <div className={`hmv2-drawer hmv2-drawer--open`}>

        {/* Top: close button */}
        <div className="hmv2-drawer-top">
          <button type="button" className="hmv2-drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* Identity */}
        <div className="hmv2-drawer-identity">
          <Av name={member.full_name} photo={member.profile_photo_url} size={64} className="hmv2-drawer-avatar" />
          <div className="hmv2-drawer-name">{member.full_name ?? 'Member'}</div>
          <div className="hmv2-drawer-id-row">
            <RoleBadge role={member.role} />
            {member.member_id && <span className="hmv2-drawer-chvid">{member.member_id}</span>}
          </div>
        </div>

        {/* Scrollable body — bio, tags, details */}
        <div className="hmv2-drawer-body">

          {/* Bio */}
          {member.bio && <p className="hmv2-drawer-bio">{member.bio}</p>}

          {/* Interest tags — deduped, capped */}
          {interests.length > 0 && (
            <div className="hmv2-drawer-tags">
              {visibleTags.map(tag => (
                <span key={String(tag).toLowerCase().trim()} className="hmv2-drawer-tag">{tag}</span>
              ))}
              {!tagsExpanded && hiddenCount > 0 && (
                <button type="button" className="hmv2-drawer-tag hmv2-drawer-tag--more"
                  onClick={() => setTagsExpanded(true)}>
                  +{hiddenCount} more
                </button>
              )}
              {tagsExpanded && interests.length > TAG_CAP && (
                <button type="button" className="hmv2-drawer-tag hmv2-drawer-tag--more"
                  onClick={() => setTagsExpanded(false)}>
                  Show less
                </button>
              )}
            </div>
          )}

          {/* Details */}
          <div className="hmv2-drawer-details">
            <div className="hmv2-detail-row">
              <span className="hmv2-detail-label">Joined</span>
              <span className="hmv2-detail-value">{formatDate(member.joined_at)}</span>
            </div>
            {showOnboarding && (
              <div className="hmv2-detail-row">
                <span className="hmv2-detail-label">Onboarding</span>
                <span className="hmv2-detail-value hmv2-detail-value--ob">
                  {member.completed_steps} of {member.total_steps} step{member.total_steps !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            <div className="hmv2-detail-row">
              <span className="hmv2-detail-label">Last active</span>
              <span className="hmv2-detail-value">{timeAgo(lastActiveSrc(member))}</span>
            </div>
          </div>

        </div>

        {/* Sticky footer — actions always visible */}
        <div className="hmv2-drawer-footer">

          {/* Role picker */}
          {canChangeRole && (
            pickerOpen ? (
              <div className="hmv2-role-picker">
                <select
                  className="hmv2-role-picker-select"
                  value={pickerRole}
                  onChange={e => setPickerRole(e.target.value)}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <div className="hmv2-role-picker-btns">
                  <button type="button" className="hmv2-role-cancel-btn"
                    onClick={() => setPickerOpen(false)}>Cancel</button>
                  <button type="button" className="hmv2-role-apply-btn"
                    disabled={applying || pickerRole === member.role}
                    onClick={applyRole}>
                    {applying ? 'Saving…' : 'Apply'}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="hmv2-drawer-change-role"
                onClick={() => { setPickerRole(member.role); setPickerOpen(true); }}>
                Change role
              </button>
            )
          )}

          {/* View full profile */}
          <Link
            to={`/profile/${member.user_id}`}
            className="hmv2-drawer-profile-link"
            onClick={onClose}
          >
            View full profile
          </Link>

          {/* Remove */}
          {canRemove && !confirmRm && (
            <button type="button" className="hmv2-drawer-remove-btn"
              onClick={() => setConfirmRm(true)}>
              Remove from Hive
            </button>
          )}
          {canRemove && confirmRm && (
            <div className="hmv2-drawer-confirm-remove">
              <div className="hmv2-drawer-confirm-text">
                Remove {member.full_name?.split(' ')[0]} from this Hive?
              </div>
              <div className="hmv2-drawer-confirm-btns">
                <button type="button" className="hmv2-drawer-confirm-cancel"
                  onClick={() => setConfirmRm(false)}>Cancel</button>
                <button type="button" className="hmv2-drawer-confirm-do"
                  onClick={() => { setConfirmRm(false); onRemove(member); onClose(); }}>Remove</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
function SkeletonRows() {
  return [1, 2, 3].map(i => (
    <tr key={i} className="hmv2-skel-row">
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="hw-skel hw-skel-circle" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="hw-skel" style={{ width: 120, height: 12, borderRadius: 6 }} />
            <div className="hw-skel" style={{ width: 80, height: 10, borderRadius: 6 }} />
          </div>
        </div>
      </td>
      <td><div className="hw-skel" style={{ width: 60, height: 20, borderRadius: 6 }} /></td>
      <td><div className="hw-skel" style={{ width: 70, height: 12, borderRadius: 6 }} /></td>
      <td><div className="hw-skel" style={{ width: 55, height: 12, borderRadius: 6 }} /></td>
      <td />
    </tr>
  ));
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function HiveMembersView({ hiveId, isOwner, myRole, myUserId, maxMembers, onMembersChanged }) {
  const [members,  setMembers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [search,   setSearch]   = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/hives/${hiveId}/members`)
      .then(d => setMembers(d.members ?? []))
      .catch(() => setError('Failed to load members.'))
      .finally(() => setLoading(false));
  }, [hiveId]);

  async function handleAction(action, member) {
    try {
      if (action === 'remove') {
        const result = await api.delete(`/api/hives/${hiveId}/members/${member.user_id}`);
        setMembers(prev => prev.filter(m => m.user_id !== result.user_id));
        if (onMembersChanged) onMembersChanged(result.member_count);
      }
    } catch (err) {
      setError(err.data?.error ?? 'Action failed. Try again.');
      setTimeout(() => setError(null), 4000);
    }
  }

  async function handleRoleChange(userId, newRole) {
    try {
      const result = await api.patch(`/api/hives/${hiveId}/members/${userId}/role`, { role: newRole });
      setMembers(prev => prev.map(m =>
        m.user_id === result.user_id ? { ...m, role: result.role } : m
      ).sort(memberSort));
      setSelected(prev => prev?.user_id === result.user_id ? { ...prev, role: result.role } : prev);
    } catch (err) {
      setError(err.data?.error ?? 'Role change failed.');
      setTimeout(() => setError(null), 4000);
    }
  }

  const filtered = members
    .filter(m => roleFilter === 'all' || m.role === roleFilter)
    .filter(m => !search.trim() || m.full_name?.toLowerCase().includes(search.toLowerCase()));

  const memberCount = members.length;
  const spotsLeft   = maxMembers != null ? maxMembers - memberCount : null;

  return (
    <div className="hmv2-page">

      {/* ── Header ── */}
      <div className="hmv2-header">
        <div className="hmv2-header-left">
          <h2 className="hmv2-title">Members</h2>
          <div className="hmv2-count-sub">
            {memberCount} member{memberCount !== 1 ? 's' : ''}
            {spotsLeft != null && ` · ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}
          </div>
        </div>
        <div className="hmv2-header-right">
          <div className="hmv2-search-wrap">
            <span className="hmv2-search-icon">🔍</span>
            <input
              type="text"
              className="hmv2-search"
              placeholder="Search members"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="hmv2-role-select"
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
          >
            <option value="all">All roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
          </select>
          {isOwner && (
            <button type="button" className="hmv2-invite-btn" title="Coming soon">
              👤 Invite
            </button>
          )}
        </div>
      </div>

      {error && <div className="hmv2-error">{error}</div>}

      {/* ── Table ── */}
      <div className="hmv2-table-card">
        <table className="hmv2-table">
          <thead className="hmv2-thead">
            <tr>
              <th className="hmv2-th">Member</th>
              <th className="hmv2-th">Role</th>
              <th className="hmv2-th">Status</th>
              <th className="hmv2-th">Last Active</th>
              <th className="hmv2-th" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="hmv2-empty">
                    {search || roleFilter !== 'all'
                      ? 'No members match that filter.'
                      : 'No members yet.'}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map(member => {
                const isMe       = member.user_id === myUserId;
                const isOwnerRow = member.role === 'owner';
                const showDots   = (myRole === 'owner' || myRole === 'admin') && !isMe && !isOwnerRow;

                return (
                  <tr
                    key={member.user_id}
                    className={[
                      'hmv2-tr',
                      isOwnerRow ? 'hmv2-tr--owner' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setSelected(member)}
                  >
                    {/* Member */}
                    <td className="hmv2-td">
                      <div className="hmv2-avatar-wrap">
                        <Av name={member.full_name} photo={member.profile_photo_url} />
                        <div className="hmv2-member-info">
                          <span className="hmv2-member-name">
                            {member.full_name ?? 'Member'}
                          </span>
                          {member.member_id && (
                            <span className="hmv2-member-id">{member.member_id}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Role */}
                    <td className="hmv2-td">
                      <RoleBadge role={member.role} />
                    </td>
                    {/* Status */}
                    <td className="hmv2-td">
                      <StatusCell member={member} />
                    </td>
                    {/* Last Active */}
                    <td className="hmv2-td">
                      <span className="hmv2-last-active">{timeAgo(lastActiveSrc(member))}</span>
                    </td>
                    {/* Actions */}
                    <td className="hmv2-td" style={{ width: 48 }}>
                      {showDots && (
                        <DotsMenu
                          member={member}
                          myRole={myRole}
                          myUserId={myUserId}
                          onAction={handleAction}
                        />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Profile drawer ── */}
      {selected && (
        <ProfileDrawer
          member={selected}
          myRole={myRole}
          myUserId={myUserId}
          hiveId={hiveId}
          onClose={() => setSelected(null)}
          onRoleChange={handleRoleChange}
          onRemove={m => handleAction('remove', m)}
        />
      )}

    </div>
  );
}
