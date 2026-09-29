import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Outlet, useParams, useNavigate, useLocation, Link, NavLink,
} from 'react-router-dom';
import Navbar from './Navbar.jsx';
import Avatar from './Avatar.jsx';
import FollowButton from './FollowButton.jsx';
import CreatePostModal from './CreatePostModal.jsx';
import WelcomeTakeover from './WelcomeTakeover.jsx';
import OwnerCelebrationTakeover from './OwnerCelebrationTakeover.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import '../styles/hive-dashboard-layout.css';
import '../styles/hive-workspace.css';
// PublicHiveView below uses .dhp-*, .hive-page, .hive-inner and .hive-dark-card,
// which all live in hive.css. Without this the non-member view of a Hive renders
// with no styling at all.
import '../styles/hive.css';

// ── Category hex icon ────────────────────────────────────────────────────────
const CAT_CFG = {
  'Social Groups':           { color: '#5dcaa5', icon: '👥' },
  'Professional Networking': { color: '#c49a28', icon: '💼' },
  'Travel Buddies':          { color: '#4db6c4', icon: '✈️' },
  'Project Collaboration':   { color: '#f08a4b', icon: '🚀' },
  'Event Buddies':           { color: '#e86a7c', icon: '🎟️' },
  'Specialized Groups':      { color: '#a59ae8', icon: '⭐' },
};

// ── Hive code chip — copy-to-share, since sharing is the entire point of a code ─
function HiveCodeChip({ code }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button type="button" className="hdl-hive-code" onClick={handleCopy} title="Copy Hive code">
      <span>{code}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {copied
          ? <path d="M20 6L9 17l-5-5" />
          : <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>}
      </svg>
      {copied && <span className="hdl-hive-code-copied">Copied</span>}
    </button>
  );
}

function HexTile({ categoryName, size = 36, logoUrl = null }) {
  const cfg = CAT_CFG[categoryName] ?? { color: '#8a8070', icon: '✦' };
  // A Hive with its own logo should show it rather than the generic category
  // glyph; the hexagon clip keeps the shape consistent either way.
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        style={{
          width: size, height: size, flexShrink: 0, objectFit: 'cover',
          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
        }}
      />
    );
  }
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 36 36" width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        <polygon points="18,2 33,10 33,26 18,34 3,26 3,10"
          fill={cfg.color} fillOpacity="0.22" stroke={cfg.color}
          strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.33 + 'px',
      }}>{cfg.icon}</div>
    </div>
  );
}

function RoleBadge({ role }) {
  if (!role) return null;
  const cls = { owner: 'hdl-badge-owner', admin: 'hdl-badge-admin', member: 'hdl-badge-member' }[role] ?? '';
  return (
    <span className={`hdl-role-badge ${cls}`}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

// ── Rail icons ───────────────────────────────────────────────────────────────
const I = {
  home:     <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  chat:     <><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.6-.7L3 21l1.9-5A8.2 8.2 0 0 1 4 11.5a8.4 8.4 0 0 1 8.5-8.4 8.4 8.4 0 0 1 8.5 8.4z" /></>,
  plans:    <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
  members:  <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 20v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>,
  about:    <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  category: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 20v-2a4 4 0 0 0-3-3.9" /></>,
  pin:      <><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  globe:    <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" /></>,
  pencil:   <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
};

function Ico({ name, size = 16, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true">
      {I[name]}
    </svg>
  );
}

// ── Identity rail + nav (role-aware) ─────────────────────────────────────────
// Replaces the old wide cover banner: the Hive's identity now lives at the top
// of the rail, so every page gets the full content width.
function HiveSidebar({
  hive, hiveId, isOwner, requestCount, chatUnread,
  uploading, uploadError, onEditCover, onEditLogo,
}) {
  const { pathname } = useLocation();

  const base = `/hive/${hiveId}`;
  const active = (sub) => {
    if (sub === '') return pathname === base || pathname === `${base}/`;
    return pathname === `${base}/${sub}` || pathname.startsWith(`${base}/${sub}/`);
  };

  const NavItem = ({ label, sub, badge, soon, icon }) => {
    if (soon) {
      return (
        <div className="hdl-nav-item hdl-nav-soon">
          <span className="hdl-nav-label">{label}</span>
          <span className="hdl-soon-pill">Soon</span>
        </div>
      );
    }
    return (
      <NavLink
        to={sub === '' ? base : `${base}/${sub}`}
        end={sub === ''}
        className={({ isActive: ra }) =>
          ['hdl-nav-item', (ra || active(sub)) ? 'hdl-nav-active' : ''].filter(Boolean).join(' ')
        }
      >
        {icon && <Ico name={icon} className="hdl-nav-ico" />}
        <span className="hdl-nav-label">{label}</span>
        {badge != null && Number(badge) > 0 && (
          <span className="hdl-nav-badge">{badge}</span>
        )}
      </NavLink>
    );
  };

  // Owner/admin sections that used to sit as separate top-level sidebar items.
  // Routes are unchanged, so existing deep links (HiveCard's Requests pill and
  // Manage button, HiveWorkspace's onboarding jump) keep resolving.
  const MANAGE_SECTIONS = [
    { label: 'Join Requests',        sub: 'requests',     badge: requestCount },
    { label: 'General Settings',     sub: 'settings' },
    { label: 'Member Onboarding',    sub: 'onboarding' },
    { label: 'Analytics',            sub: 'analytics',    soon: true },
    { label: 'Roles & Permissions',  sub: 'roles',        soon: true },
    { label: 'Integrations',         sub: 'integrations', soon: true },
    { label: 'Billing',              sub: 'billing',      soon: true },
  ];

  const inManage = MANAGE_SECTIONS.some(s => active(s.sub));
  const [manageOpen, setManageOpen] = useState(inManage);

  // A deep link straight into a management section should land with the group
  // already open rather than looking like it navigated nowhere.
  useEffect(() => { if (inManage) setManageOpen(true); }, [inManage]);

  // Sentence case, not `text-transform: capitalize` — that renders the stored
  // 'in-person' as "In-Person".
  const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const metaLines = [
    hive.category_name && { icon: 'category', text: hive.category_name },
    hive.location      && { icon: 'pin',      text: hive.location },
    hive.location_type && { icon: 'globe',    text: sentence(hive.location_type) },
  ].filter(Boolean);

  return (
    <aside className="hdl-sidebar">
      {/* ── Identity ── */}
      <div className="hdl-ident">
        <div className="hdl-ident-coverwrap">
          <div
            className={`hdl-ident-cover${hive.banner_url ? '' : ' hdl-ident-cover--fallback'}`}
            style={hive.banner_url ? { backgroundImage: `url(${hive.banner_url})` } : undefined}
          >
            {isOwner && (
              <button type="button" className="hdl-ident-edit" disabled={uploading !== null}
                      onClick={onEditCover} title="Change cover image"
                      aria-label="Change cover image">
                {uploading === 'banner'
                  ? <span className="hdl-ident-edit-wait" aria-hidden="true" />
                  : <Ico name="pencil" size={13} />}
              </button>
            )}
          </div>

          <div className={`hdl-ident-crest${isOwner ? ' hdl-ident-crest--editable' : ''}`}
               onClick={isOwner ? onEditLogo : undefined}
               title={isOwner ? 'Change logo' : undefined}>
            {hive.logo_url
              ? <img src={hive.logo_url} className="hdl-ident-crest-img" alt={hive.hive_name} />
              : <HexTile categoryName={hive.category_name} size={40} />}
            {isOwner && (
              <span className="hdl-ident-crest-edit" aria-hidden="true">
                {uploading === 'logo'
                  ? <span className="hdl-ident-edit-wait" />
                  : <Ico name="pencil" size={11} />}
              </span>
            )}
          </div>
        </div>

        {uploadError && <div className="hdl-ident-error">{uploadError}</div>}

        <h1 className="hdl-ident-name">{hive.hive_name}</h1>

        {metaLines.length > 0 && (
          <div className="hdl-ident-meta">
            {metaLines.map(m => (
              <div key={m.icon} className="hdl-ident-meta-row">
                <Ico name={m.icon} size={13} />
                <span>{m.text}</span>
              </div>
            ))}
          </div>
        )}

        <div className="hdl-ident-chips">
          <RoleBadge role={hive.my_role} />
          <HiveCodeChip code={hive.hive_code} />
        </div>
      </div>

      <div className="hdl-nav-group">
        <div className="hdl-nav-section-label">Hive</div>
        <NavItem label="Hive Home" sub=""        icon="home" />
        <NavItem label="Chat"      sub="chat"    icon="chat"
                 badge={chatUnread > 0 ? (chatUnread > 99 ? '99+' : chatUnread) : null} />
        <NavItem label="Plans"     sub="events"  icon="plans" />
        <NavItem label="Members"   sub="members" icon="members" />
        {/* About was gated behind !isOwner, so owners and admins could not
            reach their own Hive's About page from the nav. Now shown to all. */}
        <NavItem label="About"     sub="about"   icon="about" />
      </div>

      {isOwner && (
        <div className="hdl-nav-group hdl-nav-group--manage">
          <button
            type="button"
            className={['hdl-manage-toggle', inManage ? 'hdl-manage-toggle--active' : ''].filter(Boolean).join(' ')}
            aria-expanded={manageOpen}
            aria-controls="hdl-manage-sections"
            onClick={() => setManageOpen(o => !o)}
          >
            <span className="hdl-nav-label">Manage Hive</span>
            {!manageOpen && requestCount > 0 && (
              <span className="hdl-nav-badge">{requestCount}</span>
            )}
            <svg className={`hdl-manage-chev${manageOpen ? ' hdl-manage-chev--open' : ''}`}
                 width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          <div id="hdl-manage-sections" className="hdl-manage-list" hidden={!manageOpen}>
            {MANAGE_SECTIONS.map(s => (
              <NavItem key={s.sub} label={s.label} sub={s.sub} badge={s.badge} soon={s.soon} />
            ))}
          </div>
        </div>
      )}

      {/* Fills the rail's empty tail with a heavily darkened cover rather than
          flat charcoal. Decorative only. */}
      {hive.banner_url && (
        <div className="hdl-rail-wash" aria-hidden="true"
             style={{ backgroundImage: `url(${hive.banner_url})` }} />
      )}
    </aside>
  );
}

// ── Non-member public view ────────────────────────────────────────────────────
function safeTags(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val) || []; } catch { return []; }
}

function JoinBtn({ hiveId, initialPending }) {
  const [state, setState] = useState(initialPending ? 'pending' : 'idle');
  const [err, setErr] = useState(null);

  async function handle() {
    if (state !== 'idle') return;
    setState('loading'); setErr(null);
    try {
      const r = await api.post(`/api/hives/${hiveId}/request`, {});
      setState(r.joined ? 'joined' : 'pending');
    } catch (e) {
      setErr(e.data?.error ?? 'Something went wrong.');
      setState('idle');
    }
  }

  if (state === 'joined')  return <div className="dhp-join-joined">Joined ✓</div>;
  if (state === 'pending') return <div className="dhp-join-disabled">Request pending</div>;
  return (
    <div>
      <button type="button" className="dhp-join-btn" disabled={state === 'loading'} onClick={handle}>
        {state === 'loading' ? 'Requesting…' : 'Request to Join'}
      </button>
      {err && <div className="dhp-join-error">{err}</div>}
    </div>
  );
}

function PublicHiveView({ hive, hiveId }) {
  const [posts,  setPosts]  = useState([]);
  const [postsL, setPostsL] = useState(true);
  const [members, setMems]  = useState([]);
  const [memsL,  setMemsL]  = useState(true);
  const [tab,    setTab]    = useState('Posts');

  useEffect(() => {
    if (hive.private) { setPostsL(false); setMemsL(false); return; }
    api.get(`/api/hives/${hiveId}/posts`).then(d => setPosts(d.posts ?? [])).catch(() => {}).finally(() => setPostsL(false));
    api.get(`/api/hives/${hiveId}/members`).then(d => setMems(d.members ?? [])).catch(() => {}).finally(() => setMemsL(false));
  }, [hiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tags = safeTags(hive.tags);
  const meta = [hive.category_name, hive.member_count != null ? `${hive.member_count}${hive.max_members ? ` / ${hive.max_members}` : ''} members` : null, hive.location_type, hive.location].filter(Boolean).join(' · ');

  if (hive.private) {
    return (
      <div className="hive-page">
        <div className="hive-inner">
          <div className="hive-dark-card dhp-private-gate">
            <HexTile categoryName={hive.category_name} size={52} />
            <div className="dhp-private-title">{hive.hive_name}</div>
            <div className="dhp-private-sub">This Hive is private. Only members can see its content.</div>
            <FollowButton hiveId={hive.hive_id} initialFollowing={hive.is_following} />
            <Link to="/my-hive" className="dhp-private-back">← Back to My Hives</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hive-page">
      <div className="hive-inner">
        <div className="dhp-breadcrumb">
          <Link to="/my-hive">My Hives</Link>
          <span className="dhp-breadcrumb-sep">›</span>
          <span className="dhp-breadcrumb-current">{hive.hive_name}</span>
        </div>
        <div className="hive-dark-card dhp-header-card">
          <div className="dhp-header-top">
            <HexTile categoryName={hive.category_name} size={56} logoUrl={hive.logo_url} />
            <div className="dhp-header-content">
              <div className="dhp-hive-name-row">
                <span className="dhp-hive-name">{hive.hive_name}</span>
              </div>
              <div className="dhp-meta">{meta}</div>
              {hive.description && <div className="dhp-description">{hive.description}</div>}
              {tags.length > 0 && (
                <div className="dhp-tags">
                  {tags.map((t, i) => <span key={i} className="dhp-tag-chip">{t}</span>)}
                  {hive.join_policy && <span className="dhp-policy-chip">{hive.join_policy}</span>}
                </div>
              )}
            </div>
            <div className="dhp-header-actions">
              <FollowButton hiveId={hive.hive_id} initialFollowing={hive.is_following} />
              <JoinBtn hiveId={hive.hive_id} initialPending={Boolean(hive.request_pending)} />
            </div>
          </div>
        </div>
        <div className="dhp-tabs" role="tablist">
          {['Posts', 'Members', 'About'].map(t => (
            <button key={t} type="button" role="tab" aria-selected={tab === t}
              className={['dhp-tab', tab === t ? 'active' : ''].join(' ').trim()}
              onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <div className="dhp-body">
          <div>
            {tab === 'Posts' && (
              <div className="hive-dark-card">
                {postsL ? <div style={{ padding: 20, color: '#8a8070' }}>Loading…</div>
                  : posts.length === 0 ? <div className="dhp-posts-empty"><div className="dhp-posts-empty-title">No posts yet.</div></div>
                  : posts.map(p => <div key={p.post_id} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(140,127,108,0.15)' }}>{p.headline}</div>)}
              </div>
            )}
            {tab === 'Members' && (
              <div className="hive-dark-card">
                {memsL ? <div style={{ padding: 20, color: '#8a8070' }}>Loading…</div> : (
                  <div className="dhp-members-grid">
                    {members.map(m => (
                      <div key={m.user_id} className="dhp-member-card">
                        <Avatar name={m.full_name} size={48} />
                        <div className="dhp-member-name">{m.full_name ?? 'Member'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {tab === 'About' && (
              <div className="hive-dark-card" style={{ padding: 20 }}>
                {[{ label: 'Pinned Goal', value: hive.pinned_goal }, { label: 'Ground Rules', value: hive.ground_rules }, { label: 'Icebreaker', value: hive.icebreaker }]
                  .filter(s => s.value).map(s => (
                    <div key={s.label} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8a8070', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: '0.9rem', color: '#f0e8d8' }}>{s.value}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>
          <div className="dhp-sidebar">
            <div className="hive-dark-card dhp-sidebar-card">
              <div className="dhp-sidebar-label">Members · {Number(hive.member_count ?? 0)}</div>
              {memsL ? null : members.slice(0, 5).map(m => (
                <div key={m.user_id} className="dhp-sidebar-member-row">
                  <Avatar name={m.full_name} size={28} />
                  <span className="dhp-sidebar-member-name">{m.full_name ?? 'Member'}</span>
                  <span className="dhp-sidebar-member-role">{m.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────
export default function HiveDashboardLayout() {
  const { id: hiveId } = useParams();
  const navigate       = useNavigate();
  const { user }       = useAuth();

  const [hive,              setHive]              = useState(null);
  const [loading,           setLoading]           = useState(true);
  const [hiveError,         setHiveError]         = useState(null);
  const [requestCount,      setRequestCount]      = useState(null);
  const [celebrationMember, setCelebrationMember] = useState(null);
  const [postModalOpen,     setPostModalOpen]     = useState(false);
  const [newPost,           setNewPost]           = useState(null);
  const [uploading,         setUploading]         = useState(null); // 'banner' | 'logo' | null
  const [uploadError,       setUploadError]       = useState(null);
  const [chatUnread,        setChatUnread]        = useState(0);

  const bannerInputRef = useRef(null);
  const logoInputRef   = useRef(null);

  const handleFileSelected = useCallback(async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.type)) {
      setUploadError('Only JPEG, PNG, WebP, or GIF images are allowed.');
      setTimeout(() => setUploadError(null), 5000);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Image must be under 10 MB.');
      setTimeout(() => setUploadError(null), 5000);
      return;
    }

    setUploading(type);
    setUploadError(null);
    try {
      const sigData = await api.post(`/api/hives/${hiveId}/upload-signature`, { type });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key',   sigData.api_key);
      formData.append('timestamp', String(sigData.timestamp));
      formData.append('signature', sigData.signature);
      formData.append('folder',    sigData.folder);

      const cloudRes  = await fetch(
        `https://api.cloudinary.com/v1_1/${sigData.cloud_name}/image/upload`,
        { method: 'POST', body: formData },
      );
      const cloudData = await cloudRes.json();
      if (!cloudData.secure_url) {
        throw new Error(cloudData.error?.message ?? 'Cloudinary upload failed.');
      }

      const update = type === 'banner'
        ? { banner_url: cloudData.secure_url }
        : { logo_url:   cloudData.secure_url };

      await api.patch(`/api/hives/${hiveId}/media`, update);
      refreshHive(update);
    } catch (err) {
      setUploadError(err.message ?? 'Upload failed — please try again.');
      setTimeout(() => setUploadError(null), 6000);
    } finally {
      setUploading(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiveId]);

  useEffect(() => {
    setLoading(true);
    setHiveError(null);
    api.get(`/api/hives/${hiveId}`)
      .then(data => {
        setHive(data.hive);
        if (data.hive?.my_role) {
          api.post(`/api/hives/${hiveId}/seen`, {}).catch(() => {});
          // Fetch chat unread count for badge
          api.get(`/api/hives/${hiveId}/messages/unread-count`)
            .then(d => setChatUnread(d.count ?? 0))
            .catch(() => {});
        }
      })
      .catch(err => setHiveError(err.status === 404 ? 'not_found' : 'error'))
      .finally(() => setLoading(false));
  }, [hiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwner  = ['owner', 'admin'].includes(hive?.my_role);
  const isMember = Boolean(hive?.my_role);

  function refreshHive(updates) {
    setHive(prev => ({ ...prev, ...updates }));
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <Navbar />
        <div className="hdl-wrapper">
          <div className="hdl-loading">
            <div className="hdl-skel" style={{ height: 14, width: 200, marginBottom: 20 }} />
            <div className="hdl-skel" style={{ height: 70, marginBottom: 8 }} />
            <div className="hdl-skel" style={{ height: 400 }} />
          </div>
        </div>
      </>
    );
  }

  // ── Not found / error ────────────────────────────────────────────────────────
  if (hiveError || !hive) {
    return (
      <>
        <Navbar />
        <div className="hdl-wrapper">
          <div className="hdl-loading">
            <div className="hdl-error-title">{hiveError === 'not_found' ? 'Hive not found.' : 'Something went wrong.'}</div>
            <Link to="/my-hive" className="hdl-error-link">← Back to My Hives</Link>
          </div>
        </div>
      </>
    );
  }

  // ── Non-member public view ───────────────────────────────────────────────────
  if (!isMember) {
    return (
      <>
        <Navbar />
        <PublicHiveView hive={hive} hiveId={hiveId} />
      </>
    );
  }

  // ── Member dashboard ─────────────────────────────────────────────────────────
  const showWelcome = hive.my_role === 'member' && !hive.welcome_seen_at;

  // Access gating: owners/admins always have full access
  const isInOnboarding = !isOwner && hive.onboarding_status && hive.onboarding_status !== 'completed';
  const accessMode     = isInOnboarding ? (hive.onboarding_access_mode ?? 'full') : 'full';
  // canPost: owners always can; members blocked by 'limited' or 'none' access during onboarding
  const canPost = isOwner || accessMode === 'full';

  const outletCtx = {
    hive,
    hiveId,
    isOwner,
    requestCount,
    setRequestCount,
    refreshHive,
    onMemberAccepted: setCelebrationMember,
    openPostModal: isOwner ? () => setPostModalOpen(true) : null,
    newPost,
    accessMode,
    canPost,
    setChatUnread,
  };

  return (
    <>
      <Navbar />

      {showWelcome && (
        <WelcomeTakeover
          hive={hive}
          hiveId={hiveId}
          onEnter={() => refreshHive({ welcome_seen_at: new Date().toISOString() })}
        />
      )}

      {celebrationMember && (
        <OwnerCelebrationTakeover
          hive={hive}
          hiveId={hiveId}
          member={celebrationMember}
          onDone={() => setCelebrationMember(null)}
        />
      )}

      <div className="hdl-wrapper">

        {/* Breadcrumb */}
        <div className="hdl-crumb">
          <Link to="/my-hive" className="hdl-crumb-link">My Hives</Link>
          <span className="hdl-crumb-sep">›</span>
          <span className="hdl-crumb-current">{hive.hive_name}</span>
        </div>

        {/* Hidden file inputs — the cover and logo controls now live in the rail */}
        {isOwner && (
          <>
            <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }} onChange={e => handleFileSelected(e, 'banner')} />
            <input ref={logoInputRef}   type="file" accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }} onChange={e => handleFileSelected(e, 'logo')} />
          </>
        )}

        {/* Body */}
        <div className="hdl-body">
          <HiveSidebar
            hive={hive}
            hiveId={hiveId}
            isOwner={isOwner}
            requestCount={requestCount}
            chatUnread={chatUnread}
            uploading={uploading}
            uploadError={uploadError}
            onEditCover={() => bannerInputRef.current?.click()}
            onEditLogo={() => logoInputRef.current?.click()}
          />

          <main className="hdl-content">
            {/* Full block: 'none' access mode — replace outlet entirely */}
            {accessMode === 'none' ? (
              <div className="hdl-ob-block">
                <div className="hdl-ob-block-icon">🔒</div>
                <div className="hdl-ob-block-title">Complete onboarding to unlock access</div>
                <div className="hdl-ob-block-sub">
                  You must finish all required steps before you can access{' '}
                  <strong>{hive.hive_name}</strong>.
                </div>
                <Link to={`/welcome/hive/${hiveId}`} className="hdl-ob-gate-btn">
                  View onboarding steps →
                </Link>
              </div>
            ) : (
              <>
                {/* Onboarding gate banner */}
                {isInOnboarding && (
                  <div className="hdl-ob-gate">
                    <div className="hdl-ob-gate-icon">🗺️</div>
                    <div className="hdl-ob-gate-body">
                      <div className="hdl-ob-gate-title">
                        {accessMode === 'limited'
                          ? 'Limited access — complete onboarding to post'
                          : 'Complete your onboarding'}
                      </div>
                      <div className="hdl-ob-gate-sub">
                        {accessMode === 'limited'
                          ? `You can view content but cannot post until onboarding is complete.`
                          : `Finish the required steps to unlock full access to ${hive.hive_name}.`}
                      </div>
                    </div>
                    <Link to={`/welcome/hive/${hiveId}`} className="hdl-ob-gate-btn">
                      View steps →
                    </Link>
                  </div>
                )}
                <Outlet context={outletCtx} />
              </>
            )}
          </main>
        </div>
      </div>

      {postModalOpen && (
        <CreatePostModal
          hives={isOwner ? [{ hive_id: hive.hive_id, hive_name: hive.hive_name, role: hive.my_role }] : []}
          defaultHiveId={hive.hive_id}
          onClose={() => setPostModalOpen(false)}
          onCreated={post => {
            setNewPost(post);
            setPostModalOpen(false);
            // Updates now live on Hive Home; /feed only redirects here anyway.
            navigate(`/hive/${hiveId}`);
          }}
        />
      )}
    </>
  );
}
