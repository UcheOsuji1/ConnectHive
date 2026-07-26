import { useState, useEffect } from 'react';
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

// ── Category hex icon ────────────────────────────────────────────────────────
const CAT_CFG = {
  'Social Groups':           { color: '#5dcaa5', icon: '👥' },
  'Professional Networking': { color: '#c49a28', icon: '💼' },
  'Travel Buddies':          { color: '#4db6c4', icon: '✈️' },
  'Project Collaboration':   { color: '#f08a4b', icon: '🚀' },
  'Event Buddies':           { color: '#e86a7c', icon: '🎟️' },
  'Specialized Groups':      { color: '#a59ae8', icon: '⭐' },
};

function HexTile({ categoryName, size = 36 }) {
  const cfg = CAT_CFG[categoryName] ?? { color: '#8a8070', icon: '✦' };
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

// ── Management sidebar (role-aware) ──────────────────────────────────────────
function HiveSidebar({ hiveId, isOwner, requestCount }) {
  const { pathname } = useLocation();

  const base = `/hive/${hiveId}`;
  const active = (sub) => {
    if (sub === '') return pathname === base || pathname === `${base}/`;
    return pathname === `${base}/${sub}` || pathname.startsWith(`${base}/${sub}/`);
  };

  const NavItem = ({ label, sub, badge, soon }) => {
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
        <span className="hdl-nav-label">{label}</span>
        {badge != null && Number(badge) > 0 && (
          <span className="hdl-nav-badge">{badge}</span>
        )}
      </NavLink>
    );
  };

  return (
    <aside className="hdl-sidebar">
      <div className="hdl-nav-group">
        <div className="hdl-nav-section-label">Hive</div>
        <NavItem label="Overview"  sub="" />
        <NavItem label="Feed"      sub="feed" />
        <NavItem label="Chat"      sub="chat"    soon />
        <NavItem label="Events"    sub="events"  soon />
        <NavItem label="Members"   sub="members" />
        {isOwner && <NavItem label="Requests" sub="requests" badge={requestCount} />}
        {!isOwner && <NavItem label="About"   sub="about" />}
      </div>

      {isOwner && (
        <>
          <div className="hdl-nav-group">
            <div className="hdl-nav-section-label">Insights</div>
            <NavItem label="Analytics" sub="analytics" soon />
          </div>

          <div className="hdl-nav-group">
            <div className="hdl-nav-section-label">Settings</div>
            <NavItem label="General"                sub="settings" />
            <NavItem label="Roles & Permissions"    sub="roles"         soon />
            <NavItem label="Member Onboarding"      sub="onboarding" />
            <NavItem label="Integrations"           sub="integrations"  soon />
            <NavItem label="Billing"                sub="billing"       soon />
          </div>

          <div className="hdl-pro-tip">
            <div className="hdl-pro-tip-head">💡 Pro Tip</div>
            <p className="hdl-pro-tip-body">
              Use <strong>Guided Onboarding</strong> to make sure every new member completes your key steps before joining the conversation.
            </p>
          </div>
        </>
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
            <HexTile categoryName={hive.category_name} size={56} />
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

  useEffect(() => {
    setLoading(true);
    setHiveError(null);
    api.get(`/api/hives/${hiveId}`)
      .then(data => {
        setHive(data.hive);
        if (data.hive?.my_role) {
          api.post(`/api/hives/${hiveId}/seen`, {}).catch(() => {});
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
  const meta = [hive.category_name, hive.location, hive.location_type]
    .filter(Boolean).join(' · ');

  const outletCtx = {
    hive,
    hiveId,
    isOwner,
    requestCount,
    setRequestCount,
    refreshHive,
    onMemberAccepted: setCelebrationMember,
    openPostModal: () => setPostModalOpen(true),
    newPost,       // feed page watches this to prepend without refetch
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

        {/* Dark identity header */}
        <div className="hdl-header">
          <HexTile categoryName={hive.category_name} size={36} />
          <div className="hdl-header-identity">
            <span className="hdl-hive-name">{hive.hive_name}</span>
            <RoleBadge role={hive.my_role} />
          </div>
          {meta && <span className="hdl-header-meta">{meta}</span>}
          <div className="hdl-header-spacer" />
          <div className="hdl-header-actions">
            <button type="button" className="hdl-btn-invite" disabled title="Coming soon">
              Invite
            </button>
            {isOwner && (
              <button type="button" className="hdl-btn-create" onClick={() => setPostModalOpen(true)}>
                + Create
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="hdl-body">
          <HiveSidebar hiveId={hiveId} isOwner={isOwner} requestCount={requestCount} />

          <main className="hdl-content">
            {/* Onboarding gate for pending members */}
            {!isOwner && hive.onboarding_status === 'pending' && (
              <div className="hdl-ob-gate">
                <div className="hdl-ob-gate-icon">🗺️</div>
                <div className="hdl-ob-gate-body">
                  <div className="hdl-ob-gate-title">Complete your onboarding</div>
                  <div className="hdl-ob-gate-sub">
                    Finish the required steps to unlock full access to {hive.hive_name}.
                  </div>
                </div>
                <Link to={`/welcome/hive/${hiveId}`} className="hdl-ob-gate-btn">
                  View steps →
                </Link>
              </div>
            )}
            <Outlet context={outletCtx} />
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
            navigate(`/hive/${hiveId}/feed`);
          }}
        />
      )}
    </>
  );
}
