import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import { Icon } from './home/HomeBits.jsx';
import { api } from '../lib/api.js';
import { socket, joinHive, leaveHive, onHiveJoinAck } from '../lib/socket.js';
import '../styles/hive-members.css';

const SKILL_CATEGORIES = new Set(['Professional Networking', 'Project Collaboration']);
const CHIP_CAP = 4;

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

function monthYear(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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

// Mirrors server/src/lib/compatibility.js norm()/flatten() so the "shared
// interests" count and the search/filter facets agree with how the rest of
// the app compares interests and skills — case-insensitive, JSON-array-aware.
function norm(s) { return String(s ?? '').toLowerCase().trim(); }

function flattenRaw(v) {
  if (!v) return [];
  if (typeof v === 'string') {
    try { return flattenRaw(JSON.parse(v)); } catch { return [v].filter(Boolean); }
  }
  if (Array.isArray(v)) {
    return v.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))).filter(Boolean);
  }
  if (typeof v === 'object') return Object.values(v).map(String).filter(Boolean);
  return [String(v)].filter(Boolean);
}

function dedupe(list) {
  return [...new Map(list.map(t => [norm(t), t])).values()];
}

function sharedCount(aRaw, bRaw) {
  const aSet = new Set(flattenRaw(aRaw).map(norm));
  const bSet = new Set(flattenRaw(bRaw).map(norm));
  let n = 0;
  for (const x of bSet) if (aSet.has(x)) n++;
  return n;
}

function matchesSearch(m, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (m.full_name?.toLowerCase().includes(needle)) return true;
  if (flattenRaw(m.interests).some(x => x.toLowerCase().includes(needle))) return true;
  if (flattenRaw(m.skills).some(x => x.toLowerCase().includes(needle))) return true;
  return false;
}

function matchesFilters(m, f, onlineSet) {
  if (f.roles.size > 0 && !f.roles.has(m.role)) return false;
  if (f.onlineOnly) {
    if (m.presence_status === 'invisible' || !onlineSet.has(m.user_id)) return false;
  }
  if (f.recentOnly) {
    const days = (Date.now() - new Date(m.joined_at).getTime()) / 86400000;
    if (!(days <= 30)) return false;
  }
  if (f.interests.size > 0) {
    const mine = new Set(flattenRaw(m.interests).map(norm));
    if (![...f.interests].some(sel => mine.has(sel))) return false;
  }
  if (f.skills.size > 0) {
    const mine = new Set(flattenRaw(m.skills).map(norm));
    if (![...f.skills].some(sel => mine.has(sel))) return false;
  }
  return true;
}

// Online = live socket presence; invisible members never reveal any state.
function presenceFor(m, statusMap, onlineSet) {
  if (m.presence_status === 'invisible') return null;
  if (!onlineSet.has(m.user_id)) return 'offline';
  const raw = statusMap[m.user_id] ?? 'online';
  return raw === 'busy' ? 'away' : raw;
}

function presenceColor(status) {
  if (status === 'online') return '#5dcaa5';
  if (status === 'away')   return '#c49a28';
  return '#b4b2a9';
}

function presenceLabel(status) {
  if (status === 'online') return 'Online';
  if (status === 'away')   return 'Away';
  return 'Offline';
}

// ── Role chip ─────────────────────────────────────────────────────────────────
function RoleChip({ role }) {
  const label = role === 'owner' ? 'Founder' : role === 'admin' ? 'Admin' : 'Member';
  return <span className={`hmv2-rolechip hmv2-rolechip--${role}`}>{label}</span>;
}

// ── Card "…" menu ─────────────────────────────────────────────────────────────
// Reuses the existing promote/demote/remove/notify endpoints and permission
// rules exactly as hivesController enforces them.
function canManage(viewerRole, viewerId, member) {
  const out = { promote: false, demote: false, remove: false, notify: false };
  if (!(viewerRole === 'owner' || viewerRole === 'admin')) return out;
  if (member.user_id === viewerId) return out;
  if (member.role === 'owner') { out.notify = true; return out; }
  if (viewerRole === 'owner') {
    if (member.role === 'member') out.promote = true;
    if (member.role === 'admin')  out.demote  = true;
    out.remove = true;
    out.notify = true;
  } else {
    if (member.role === 'member') { out.promote = true; out.remove = true; }
    out.notify = true;
  }
  return out;
}

function CardMenu({ member, actions, onPromote, onDemote, onRemove, onNotify }) {
  const [open, setOpen]   = useState(false);
  const [mode, setMode]   = useState(null); // null | 'confirm-remove' | 'notify'
  const [text, setText]   = useState('');
  const [busy, setBusy]   = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function h(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setMode(null); } }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  if (!actions.promote && !actions.demote && !actions.remove && !actions.notify) return null;

  function trigger(e) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(o => !o);
    setMode(null);
  }

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    await onNotify(member, text.trim());
    setBusy(false);
    setText('');
    setMode(null);
    setOpen(false);
  }

  return (
    <div className="hmv2-cardmenu" ref={wrapRef} onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
      <button type="button" className="hmv2-cardmenu-btn" onClick={trigger} aria-label="Member actions">⋯</button>
      {open && mode === null && (
        <div className="hmv2-cardmenu-dropdown">
          {actions.promote && (
            <button type="button" className="hmv2-cardmenu-item"
              onClick={() => { setOpen(false); onPromote(member); }}>Promote to Admin</button>
          )}
          {actions.demote && (
            <button type="button" className="hmv2-cardmenu-item"
              onClick={() => { setOpen(false); onDemote(member); }}>Demote to Member</button>
          )}
          {actions.notify && (
            <button type="button" className="hmv2-cardmenu-item"
              onClick={() => setMode('notify')}>Send a message</button>
          )}
          {actions.remove && (
            <button type="button" className="hmv2-cardmenu-item hmv2-cardmenu-item--danger"
              onClick={() => setMode('confirm-remove')}>Remove from Hive</button>
          )}
        </div>
      )}
      {open && mode === 'confirm-remove' && (
        <div className="hmv2-cardmenu-dropdown hmv2-cardmenu-confirm">
          <p className="hmv2-cardmenu-confirm-text">Remove {member.full_name?.split(' ')[0] ?? 'this member'} from this Hive?</p>
          <div className="hmv2-cardmenu-confirm-btns">
            <button type="button" className="hmv2-cardmenu-cancel" onClick={() => { setMode(null); setOpen(false); }}>Cancel</button>
            <button type="button" className="hmv2-cardmenu-danger-btn"
              onClick={() => { setMode(null); setOpen(false); onRemove(member); }}>Remove</button>
          </div>
        </div>
      )}
      {open && mode === 'notify' && (
        <div className="hmv2-cardmenu-dropdown hmv2-cardmenu-notify">
          <textarea
            className="hmv2-cardmenu-textarea"
            rows={3}
            autoFocus
            placeholder={`Message ${member.full_name?.split(' ')[0] ?? 'this member'}…`}
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className="hmv2-cardmenu-confirm-btns">
            <button type="button" className="hmv2-cardmenu-cancel" onClick={() => { setMode(null); setOpen(false); setText(''); }}>Cancel</button>
            <button type="button" className="hmv2-cardmenu-send-btn" disabled={busy || !text.trim()} onClick={send}>
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Presence pill ─────────────────────────────────────────────────────────────
function PresenceTag({ status }) {
  if (!status) return null;
  return (
    <span className="hmv2-presence">
      <span className="hmv2-presence-dot" style={{ background: presenceColor(status) }} />
      {presenceLabel(status)}
    </span>
  );
}

// ── Founder card ───────────────────────────────────────────────────────────────
function FounderCard({ member, viewerRole, viewerId, viewerInterests, canSeeOps, status, onPromote, onDemote, onRemove, onNotify }) {
  const isMe = member.user_id === viewerId;
  const bioLines = (member.bio ?? '').split('\n').map(s => s.trim()).filter(Boolean);
  const subtitle = bioLines.length > 1 ? bioLines[0] : null;
  const restBio   = bioLines.length > 1 ? bioLines.slice(1).join(' ') : bioLines[0] ?? null;
  const interests = dedupe(flattenRaw(member.interests)).slice(0, CHIP_CAP);
  const shared = isMe ? 0 : sharedCount(viewerInterests, member.interests);
  const actions = canManage(viewerRole, viewerId, member);

  return (
    <Link to={`/profile/${member.user_id}`} className="hmv2-founder-card">
      <div className="hmv2-founder-top">
        <div className="hmv2-founder-avatar-wrap">
          <Avatar name={member.full_name} src={member.profile_photo_url} size={72} />
          {member.role === 'owner' && <span className="hmv2-crown" aria-label="Owner">👑</span>}
          {status && <span className="hmv2-presence-dot hmv2-presence-dot--corner" style={{ background: presenceColor(status) }} />}
        </div>
        <div className="hmv2-founder-identity">
          <div className="hmv2-founder-namerow">
            <span className="hmv2-founder-name">{member.full_name ?? 'Member'}</span>
            {isMe && <span className="hmv2-you-chip">You</span>}
          </div>
          <div className="hmv2-founder-metarow">
            <RoleChip role={member.role} />
            {status && <PresenceTag status={status} />}
          </div>
          {member.member_id && <span className="hmv2-member-id">{member.member_id}</span>}
        </div>
        <CardMenu member={member} actions={actions} onPromote={onPromote} onDemote={onDemote} onRemove={onRemove} onNotify={onNotify} />
      </div>

      {subtitle && <p className="hmv2-founder-subtitle">{subtitle}</p>}
      {restBio && <p className="hmv2-founder-bio">{restBio}</p>}

      {interests.length > 0 && (
        <div className="hmv2-chips">
          {interests.map(tag => <span key={norm(tag)} className="hmv2-chip">{tag}</span>)}
        </div>
      )}

      {!isMe && shared > 0 && (
        <div className="hmv2-shared">{shared} shared interest{shared !== 1 ? 's' : ''}</div>
      )}

      <div className="hmv2-card-foot">
        <span className="hmv2-joined">Joined {monthYear(member.joined_at)}</span>
        {canSeeOps && <OpsInfo member={member} />}
      </div>
    </Link>
  );
}

// Onboarding status + last-seen — owners/admins only, per the prompt's
// explicit instruction to keep these visible to owners/admins alone.
function OpsInfo({ member }) {
  const active = isActive(member);
  return (
    <span className="hmv2-ops">
      {!active && (
        <span className="hmv2-ob-pill">
          Onboarding{member.total_steps > 0 ? ` · ${member.completed_steps}/${member.total_steps}` : ''}
        </span>
      )}
      <span className="hmv2-last-seen">Last active {timeAgo(lastActiveSrc(member))}</span>
    </span>
  );
}

// ── Member card ──────────────────────────────────────────────────────────────
function MemberCard({ member, viewerRole, viewerId, viewerInterests, showSkills, canSeeOps, status, onPromote, onDemote, onRemove, onNotify }) {
  const isMe = member.user_id === viewerId;
  const interestChips = dedupe(flattenRaw(member.interests));
  const skillChips    = showSkills ? dedupe(flattenRaw(member.skills)) : [];
  const chips = [...interestChips, ...skillChips].slice(0, CHIP_CAP);
  const shared = isMe ? 0 : sharedCount(viewerInterests, member.interests);
  const actions = canManage(viewerRole, viewerId, member);

  return (
    <Link to={`/profile/${member.user_id}`} className="hmv2-member-card">
      <div className="hmv2-member-top">
        <div className="hmv2-member-avatar-wrap">
          <Avatar name={member.full_name} src={member.profile_photo_url} size={52} />
          {status && <span className="hmv2-presence-dot hmv2-presence-dot--corner" style={{ background: presenceColor(status) }} />}
        </div>
        <CardMenu member={member} actions={actions} onPromote={onPromote} onDemote={onDemote} onRemove={onRemove} onNotify={onNotify} />
      </div>

      <div className="hmv2-member-namerow">
        <span className="hmv2-member-name">{member.full_name ?? 'Member'}</span>
        {isMe && <span className="hmv2-you-chip">You</span>}
      </div>
      <div className="hmv2-member-rolerow">
        <span className="hmv2-member-role-icon" aria-hidden="true">👤</span> Member
        {status && <PresenceTag status={status} />}
      </div>
      {member.member_id && <span className="hmv2-member-id">{member.member_id}</span>}

      {member.bio && <p className="hmv2-member-bio">{member.bio}</p>}

      {chips.length > 0 && (
        <div className="hmv2-chips">
          {chips.map(tag => <span key={norm(tag)} className="hmv2-chip">{tag}</span>)}
        </div>
      )}

      {!isMe && shared > 0 && (
        <div className="hmv2-shared">{shared} shared interest{shared !== 1 ? 's' : ''}</div>
      )}

      <div className="hmv2-card-foot">
        <span className="hmv2-joined">Joined {monthYear(member.joined_at)}</span>
        {canSeeOps && <OpsInfo member={member} />}
      </div>
    </Link>
  );
}

// ── Skeletons ─────────────────────────────────────────────────────────────────
function SkeletonCards({ n = 4 }) {
  return (
    <div className="hmv2-members-grid">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="hmv2-member-card hmv2-skel-card">
          <div className="hw-skel hw-skel-circle" style={{ width: 52, height: 52, borderRadius: '50%' }} />
          <div className="hw-skel" style={{ width: '70%', height: 14, borderRadius: 6, marginTop: 10 }} />
          <div className="hw-skel" style={{ width: '45%', height: 11, borderRadius: 6, marginTop: 8 }} />
          <div className="hw-skel" style={{ width: '100%', height: 32, borderRadius: 6, marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}

// ── Filter menu ───────────────────────────────────────────────────────────────
function FilterMenu({ open, onClose, roleCounts, onlineCount, recentCount, interestFacets, skillFacets, filters, setFilters }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function h(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onClose]);

  if (!open) return null;

  function toggleSet(key, value) {
    setFilters(prev => {
      const next = new Set(prev[key]);
      if (next.has(value)) next.delete(value); else next.add(value);
      return { ...prev, [key]: next };
    });
  }

  return (
    <div className="hmv2-filter-panel" ref={wrapRef}>
      <div className="hmv2-filter-group">
        <div className="hmv2-filter-label">Role</div>
        {['owner', 'admin', 'member'].map(r => (
          <label key={r} className="hmv2-filter-row">
            <input type="checkbox" checked={filters.roles.has(r)} onChange={() => toggleSet('roles', r)} />
            <span>{r === 'owner' ? 'Owner' : r === 'admin' ? 'Admin' : 'Member'}</span>
            <span className="hmv2-filter-count">{roleCounts[r] ?? 0}</span>
          </label>
        ))}
      </div>

      <div className="hmv2-filter-group">
        <label className="hmv2-filter-row">
          <input type="checkbox" checked={filters.onlineOnly}
            onChange={() => setFilters(prev => ({ ...prev, onlineOnly: !prev.onlineOnly }))} />
          <span>Online now</span>
          <span className="hmv2-filter-count">{onlineCount}</span>
        </label>
        <label className="hmv2-filter-row">
          <input type="checkbox" checked={filters.recentOnly}
            onChange={() => setFilters(prev => ({ ...prev, recentOnly: !prev.recentOnly }))} />
          <span>Recently joined</span>
          <span className="hmv2-filter-count">{recentCount}</span>
        </label>
      </div>

      {interestFacets.length > 0 && (
        <div className="hmv2-filter-group">
          <div className="hmv2-filter-label">Interests</div>
          {interestFacets.map(f => (
            <label key={f.key} className="hmv2-filter-row">
              <input type="checkbox" checked={filters.interests.has(f.key)} onChange={() => toggleSet('interests', f.key)} />
              <span>{f.label}</span>
              <span className="hmv2-filter-count">{f.count}</span>
            </label>
          ))}
        </div>
      )}

      {skillFacets.length > 0 && (
        <div className="hmv2-filter-group">
          <div className="hmv2-filter-label">Skills</div>
          {skillFacets.map(f => (
            <label key={f.key} className="hmv2-filter-row">
              <input type="checkbox" checked={filters.skills.has(f.key)} onChange={() => toggleSet('skills', f.key)} />
              <span>{f.label}</span>
              <span className="hmv2-filter-count">{f.count}</span>
            </label>
          ))}
        </div>
      )}

      <button type="button" className="hmv2-filter-clear"
        onClick={() => setFilters({ roles: new Set(), onlineOnly: false, recentOnly: false, interests: new Set(), skills: new Set() })}>
        Clear filters
      </button>
    </div>
  );
}

const EMPTY_FILTERS = { roles: new Set(), onlineOnly: false, recentOnly: false, interests: new Set(), skills: new Set() };

// ── Main export ───────────────────────────────────────────────────────────────
export default function HiveMembersView({ hive, hiveId, isOwner, myRole, myUserId, maxMembers, onMembersChanged }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [toast,   setToast]   = useState(null);
  const [search,  setSearch]  = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  // Live presence — identical approach to Hive Home: shared socket singleton,
  // reference-counted join, rejoin handled centrally in lib/socket.js.
  const [onlineIds, setOnlineIds] = useState([]);
  const [presenceList, setPresenceList] = useState([]); // [{ user_id, status }]
  const toastTimer = useRef(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/hives/${hiveId}/members`)
      .then(d => setMembers(d.members ?? []))
      .catch(() => setError('Failed to load members.'))
      .finally(() => setLoading(false));
  }, [hiveId]);

  useEffect(() => {
    if (!hiveId) return;
    const offAck = onHiveJoinAck(hiveId, (ack) => {
      if (ack?.ok) { setOnlineIds(ack.online_user_ids ?? []); setPresenceList(ack.presence ?? []); }
    });
    joinHive(hiveId);
    const onPresence = ({ online_user_ids, presence }) => {
      setOnlineIds(online_user_ids ?? []);
      setPresenceList(presence ?? []);
    };
    socket.on('presence_update', onPresence);
    return () => {
      socket.off('presence_update', onPresence);
      offAck();
      leaveHive(hiveId);
    };
  }, [hiveId]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  async function handleRemove(member) {
    try {
      const result = await api.delete(`/api/hives/${hiveId}/members/${member.user_id}`);
      setMembers(prev => prev.filter(m => m.user_id !== result.user_id));
      if (onMembersChanged) onMembersChanged(result.member_count);
      flash(`${member.full_name?.split(' ')[0] ?? 'Member'} removed.`);
    } catch (err) {
      flash(err.data?.error ?? 'Could not remove that member.');
    }
  }

  async function handleRoleChange(member, newRole) {
    try {
      const result = await api.patch(`/api/hives/${hiveId}/members/${member.user_id}/role`, { role: newRole });
      setMembers(prev => prev.map(m =>
        m.user_id === result.user_id ? { ...m, role: result.role } : m
      ).sort(memberSort));
      flash(newRole === 'admin' ? `${member.full_name?.split(' ')[0] ?? 'Member'} promoted to Admin.` : `${member.full_name?.split(' ')[0] ?? 'Member'} demoted to Member.`);
    } catch (err) {
      flash(err.data?.error ?? 'Role change failed.');
    }
  }

  async function handleNotify(member, message) {
    try {
      await api.post(`/api/hives/${hiveId}/members/${member.user_id}/notify`, { message });
      flash(`Message sent to ${member.full_name?.split(' ')[0] ?? 'member'}.`);
    } catch (err) {
      flash(err.data?.error ?? 'Could not send that message.');
    }
  }

  const onlineSet = useMemo(() => new Set(onlineIds), [onlineIds]);
  const statusMap = useMemo(() => Object.fromEntries(presenceList.map(p => [p.user_id, p.status])), [presenceList]);
  const canSeeOps = myRole === 'owner' || myRole === 'admin';
  const showSkills = SKILL_CATEGORIES.has(hive?.category_name);
  const viewerMember = members.find(m => m.user_id === myUserId);
  const viewerInterests = viewerMember?.interests ?? [];

  const roleCounts = useMemo(() => {
    const c = { owner: 0, admin: 0, member: 0 };
    for (const m of members) c[m.role] = (c[m.role] ?? 0) + 1;
    return c;
  }, [members]);

  const onlineCount = useMemo(() =>
    members.filter(m => m.presence_status !== 'invisible' && onlineSet.has(m.user_id)).length,
    [members, onlineSet]);

  const recentCount = useMemo(() =>
    members.filter(m => (Date.now() - new Date(m.joined_at).getTime()) / 86400000 <= 30).length,
    [members]);

  const facets = useMemo(() => {
    const interestMap = new Map();
    const skillMap = new Map();
    for (const m of members) {
      for (const raw of dedupe(flattenRaw(m.interests))) {
        const k = norm(raw);
        const e = interestMap.get(k) ?? { key: k, label: raw, count: 0 };
        e.count += 1; interestMap.set(k, e);
      }
      for (const raw of dedupe(flattenRaw(m.skills))) {
        const k = norm(raw);
        const e = skillMap.get(k) ?? { key: k, label: raw, count: 0 };
        e.count += 1; skillMap.set(k, e);
      }
    }
    return {
      interests: [...interestMap.values()].sort((a, b) => b.count - a.count),
      skills: [...skillMap.values()].sort((a, b) => b.count - a.count),
    };
  }, [members]);

  const isFiltering = Boolean(
    search.trim() || filters.roles.size || filters.onlineOnly || filters.recentOnly ||
    filters.interests.size || filters.skills.size,
  );

  const filtered = members.filter(m => matchesSearch(m, search.trim()) && matchesFilters(m, filters, onlineSet));
  const founders  = filtered.filter(m => m.role === 'owner' || m.role === 'admin');
  const regulars  = filtered.filter(m => m.role === 'member');

  const totalMembers = members.length;
  const spotsLeft = maxMembers != null ? maxMembers - totalMembers : null;

  const chips = [
    hive?.category_name && { icon: 'users', text: hive.category_name },
    hive?.location      && { icon: 'pin',   text: hive.location },
    hive?.location_type && { icon: 'globe',
      text: hive.location_type.charAt(0).toUpperCase() + hive.location_type.slice(1) },
  ].filter(Boolean);

  return (
    <div className="hmv2-page">

      {/* ── Hero ── */}
      <header
        className={`hmv2-hero${hive?.banner_url ? '' : ' hmv2-hero--fallback'}`}
        style={hive?.banner_url ? { backgroundImage: `url(${hive.banner_url})` } : undefined}
      >
        <div className="hmv2-hero-scrim" />
        <div className="hmv2-hero-inner">
          <div className="hmv2-eyebrow">MEMBERS</div>
          <h1 className="hmv2-hero-title">Our People</h1>
          <p className="hmv2-hero-desc">{hive?.tagline || `The people of ${hive?.hive_name ?? 'this Hive'}.`}</p>
          {chips.length > 0 && (
            <div className="hmv2-hero-chips">
              {chips.map(c => (
                <span key={c.icon} className="hmv2-herochip">
                  <Icon name={c.icon} size={14} /> {c.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      {toast && <div className="hmv2-toast">{toast}</div>}
      {error && <div className="hmv2-error">{error}</div>}

      {/* ── Stats bar ── */}
      <div className="hmv2-stats-bar">
        <div className="hmv2-stat">
          <span className="hmv2-stat-num">{totalMembers}</span> Member{totalMembers !== 1 ? 's' : ''}
          {spotsLeft != null && <span className="hmv2-stat-sub"> · {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</span>}
        </div>
        <div className="hmv2-stat hmv2-stat--online">
          <span className="hmv2-stat-dot" />
          <span className="hmv2-stat-num">{onlineCount}</span> Active Now
        </div>
        <div className="hmv2-search-wrap">
          <span className="hmv2-search-icon">🔍</span>
          <input
            type="text"
            className="hmv2-search"
            placeholder="Search members by name, interest, or skill…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="hmv2-filter-wrap">
          <button type="button" className="hmv2-filter-btn" onClick={() => setFilterOpen(o => !o)}>
            Filter ▾
          </button>
          <FilterMenu
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            roleCounts={roleCounts}
            onlineCount={onlineCount}
            recentCount={recentCount}
            interestFacets={facets.interests}
            skillFacets={facets.skills}
            filters={filters}
            setFilters={setFilters}
          />
        </div>
        {isFiltering && (
          <div className="hmv2-filtered-count">{filtered.length} of {totalMembers}</div>
        )}
      </div>

      {/* ── Roster ── */}
      {loading ? (
        <SkeletonCards />
      ) : totalMembers === 1 ? (
        <div className="hmv2-empty-banner">It's just you so far — invite people from Hive Home.</div>
      ) : filtered.length === 0 ? (
        <div className="hmv2-empty-banner">No members match that filter.</div>
      ) : (
        <>
          {founders.length > 0 && (
            <section className="hmv2-section">
              <h2 className="hmv2-section-title">Founders ({founders.length})</h2>
              <div className="hmv2-founders-grid">
                {founders.map(m => (
                  <FounderCard
                    key={m.user_id}
                    member={m}
                    viewerRole={myRole}
                    viewerId={myUserId}
                    viewerInterests={viewerInterests}
                    canSeeOps={canSeeOps}
                    status={presenceFor(m, statusMap, onlineSet)}
                    onPromote={m2 => handleRoleChange(m2, 'admin')}
                    onDemote={m2 => handleRoleChange(m2, 'member')}
                    onRemove={handleRemove}
                    onNotify={handleNotify}
                  />
                ))}
              </div>
            </section>
          )}

          {regulars.length > 0 && (
            <section className="hmv2-section">
              <h2 className="hmv2-section-title">Members ({regulars.length})</h2>
              <div className="hmv2-members-grid">
                {regulars.map(m => (
                  <MemberCard
                    key={m.user_id}
                    member={m}
                    viewerRole={myRole}
                    viewerId={myUserId}
                    viewerInterests={viewerInterests}
                    showSkills={showSkills}
                    canSeeOps={canSeeOps}
                    status={presenceFor(m, statusMap, onlineSet)}
                    onPromote={m2 => handleRoleChange(m2, 'admin')}
                    onDemote={m2 => handleRoleChange(m2, 'member')}
                    onRemove={handleRemove}
                    onNotify={handleNotify}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

    </div>
  );
}
