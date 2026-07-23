import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PostCard from './PostCard.jsx';
import CreatePostModal from './CreatePostModal.jsx';
import HiveRequestsTab from './HiveRequestsTab.jsx';
import HiveOverview from './HiveOverview.jsx';
import HiveSettings from './HiveSettings.jsx';
import HiveMembersView from './HiveMembersView.jsx';
import OwnerCelebrationTakeover from './OwnerCelebrationTakeover.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import '../styles/hive-workspace.css';

// ── Shared config (duplicated here so workspace is self-contained) ────────────
const CAT_CONFIG = {
  'Social Groups':           { color: '#5dcaa5', icon: '👥' },
  'Professional Networking': { color: '#c49a28', icon: '💼' },
  'Travel Buddies':          { color: '#4db6c4', icon: '✈️' },
  'Project Collaboration':   { color: '#f08a4b', icon: '🚀' },
  'Event Buddies':           { color: '#e86a7c', icon: '🎟️' },
  'Specialized Groups':      { color: '#a59ae8', icon: '⭐' },
};

function HexTile({ categoryName, size = 36 }) {
  const cfg = CAT_CONFIG[categoryName] ?? { color: '#8a8070', icon: '✦' };
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 36 36" width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        <polygon
          points="18,2 33,10 33,26 18,34 3,26 3,10"
          fill={cfg.color} fillOpacity="0.25" stroke={cfg.color}
          strokeWidth="1.5" strokeLinejoin="round"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.33 + 'px',
      }}>
        {cfg.icon}
      </div>
    </div>
  );
}

function RoleBadge({ role }) {
  if (!role) return null;
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  return <span className={`hw-role-badge hw-role-${role}`}>{label}</span>;
}

function NavItem({ label, active, onClick, badge, soon }) {
  return (
    <button
      type="button"
      className={['hw-nav-item', active ? 'active' : '', soon ? 'hw-nav-soon' : ''].filter(Boolean).join(' ')}
      onClick={soon ? undefined : onClick}
      disabled={soon}
    >
      <span className="hw-nav-label">{label}</span>
      {badge != null && Number(badge) > 0 && (
        <span className="hw-nav-badge">{badge}</span>
      )}
      {soon && <span className="hw-nav-soon-pill">Soon</span>}
    </button>
  );
}

// ── Feed skeleton ─────────────────────────────────────────────────────────────
function FeedSkeleton() {
  return (
    <div className="hw-feed-skel">
      {[1, 2].map(i => (
        <div key={i} className="hw-skel-card">
          <div className="hw-skel-line" style={{ width: '40%' }} />
          <div className="hw-skel-line" style={{ width: '70%' }} />
          <div className="hw-skel-line" style={{ width: '55%' }} />
        </div>
      ))}
    </div>
  );
}

// ── Feed view ─────────────────────────────────────────────────────────────────
function FeedView({ hive, isOwner, posts, postsLoading, onOpenModal }) {
  return (
    <div className="hw-feed">
      {isOwner && (
        <button type="button" className="hw-composer-strip" onClick={onOpenModal}>
          <span className="hw-composer-placeholder">Post an update as {hive.hive_name}…</span>
          <span className="hw-composer-btn">Post</span>
        </button>
      )}
      {postsLoading ? (
        <FeedSkeleton />
      ) : posts.length === 0 ? (
        <div className="hw-empty-state">
          <div className="hw-empty-title">No posts yet.</div>
          {isOwner && <div className="hw-empty-sub">Share the first update with your Hive.</div>}
        </div>
      ) : (
        <div className="post-feed">
          {posts.map(post => <PostCard key={post.post_id} post={post} />)}
        </div>
      )}
    </div>
  );
}

// ── About view ────────────────────────────────────────────────────────────────
function AboutView({ hive }) {
  const sections = [
    { label: 'Pinned Goal',  value: hive.pinned_goal },
    { label: 'Ground Rules', value: hive.ground_rules },
    { label: 'Icebreaker',   value: hive.icebreaker },
    { label: 'Meets',        value: [hive.cadence, hive.location_type].filter(Boolean).join(' · ') || null },
    { label: 'Activation',   value: hive.activation_threshold ? `Activates at ${hive.activation_threshold} members` : null },
  ].filter(s => s.value);

  if (!sections.length) {
    return <div className="hw-empty-state"><div className="hw-empty-title">No details added yet.</div></div>;
  }
  return (
    <div className="hw-about-grid">
      {sections.map(s => (
        <div key={s.label} className="hw-about-card">
          <div className="hw-about-label">{s.label}</div>
          <div className="hw-about-body">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Workspace shell ───────────────────────────────────────────────────────────
export default function HiveWorkspace({ hive: initialHive, hiveId, isOwner, onHiveUpdated, initialNewPosts = 0 }) {
  const { user } = useAuth();
  const [hive,          setHive]          = useState(initialHive);
  const [activeView,    setActiveView]    = useState(isOwner ? 'overview' : 'feed');
  const [posts,         setPosts]         = useState([]);
  const [postsLoading,  setPostsLoading]  = useState(true);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [requestCount,  setRequestCount]  = useState(null);
  const [feedUnread,         setFeedUnread]         = useState(initialNewPosts);
  const [celebrationMember, setCelebrationMember]   = useState(null);
  // membersKey forces HiveMembersView to remount/refetch when overview needs refreshing
  const [membersKey,    setMembersKey]    = useState(0);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/posts`)
      .then(d => setPosts(d.posts ?? []))
      .catch(() => setPosts([]))
      .finally(() => setPostsLoading(false));
  }, [hiveId]);

  function handleNavTo(view) {
    setActiveView(view);
    if (view === 'feed') setFeedUnread(0);
  }

  function handleMembersChanged() {
    setMembersKey(k => k + 1);
  }

  function handleMemberAccepted(memberData) {
    setCelebrationMember(memberData);
    setMembersKey(k => k + 1);
  }

  function handleHiveSaved(updatedHive) {
    setHive(updatedHive);
    if (onHiveUpdated) onHiveUpdated(updatedHive);
  }

  const modalHives = isOwner
    ? [{ hive_id: hive.hive_id, hive_name: hive.hive_name, role: hive.my_role }]
    : [];

  return (
    <div className="hw-shell">
      {celebrationMember && (
        <OwnerCelebrationTakeover
          hive={hive}
          hiveId={hiveId}
          member={celebrationMember}
          onDone={() => setCelebrationMember(null)}
        />
      )}

      {/* Breadcrumb */}
      <div className="hw-crumb">
        <Link to="/my-hive" className="hw-crumb-link">My Hives</Link>
        <span className="hw-crumb-sep">›</span>
        <span className="hw-crumb-current">{hive.hive_name}</span>
      </div>

      {/* Dark header bar */}
      <div className="hw-header">
        <HexTile categoryName={hive.category_name} size={36} />
        <div className="hw-header-identity">
          <span className="hw-hive-name">{hive.hive_name}</span>
          <RoleBadge role={hive.my_role} />
        </div>
        {(hive.category_name || hive.location || hive.location_type) && (
          <span className="hw-header-meta">
            {[hive.category_name, hive.location, hive.location_type].filter(Boolean).join(' · ')}
          </span>
        )}
        <div className="hw-header-spacer" />
        <div className="hw-header-actions">
          <button type="button" className="hw-btn-invite" disabled title="Coming soon">
            Invite
          </button>
          <button type="button" className="hw-btn-create" onClick={() => setPostModalOpen(true)}>
            + Create
          </button>
        </div>
      </div>

      {/* Body: sidebar + main */}
      <div className="hw-body">

        {/* Left nav sidebar */}
        <nav className="hw-sidebar" aria-label="Hive navigation">
          <div className="hw-nav-group">
            <NavItem label="Overview" active={activeView === 'overview'} onClick={() => handleNavTo('overview')} />
            <NavItem label="Feed"     active={activeView === 'feed'}     onClick={() => handleNavTo('feed')} badge={feedUnread || null} />
            <NavItem label="Members"  active={activeView === 'members'}  onClick={() => handleNavTo('members')} />
            <NavItem label="Events"   soon />
            <NavItem label="About"    active={activeView === 'about'}    onClick={() => handleNavTo('about')} />
          </div>

          {isOwner && (
            <div className="hw-nav-group">
              <div className="hw-nav-divider">Management</div>
              <NavItem
                label="Requests"
                active={activeView === 'requests'}
                onClick={() => setActiveView('requests')}
                badge={requestCount}
              />
              <NavItem
                label="Settings"
                active={activeView === 'settings'}
                onClick={() => setActiveView('settings')}
              />
            </div>
          )}
        </nav>

        {/* Main content */}
        <main className="hw-main">
          {activeView === 'overview' && (
            <HiveOverview
              hiveId={hiveId}
              hive={hive}
              isOwner={isOwner}
              posts={posts}
              postsLoading={postsLoading}
              onRequestCount={setRequestCount}
              onNavigate={view => handleNavTo(view)}
              onSaved={handleHiveSaved}
            />
          )}

          {activeView === 'feed' && (
            <FeedView
              hive={hive}
              isOwner={isOwner}
              posts={posts}
              postsLoading={postsLoading}
              onOpenModal={() => setPostModalOpen(true)}
            />
          )}

          {activeView === 'members' && (
            <HiveMembersView
              key={membersKey}
              hiveId={hiveId}
              isOwner={isOwner}
              myRole={hive.my_role}
              myUserId={user?.user_id}
              onMembersChanged={handleMembersChanged}
            />
          )}

          {activeView === 'about' && (
            <AboutView hive={hive} />
          )}

          {activeView === 'requests' && isOwner && (
            <HiveRequestsTab
              hiveId={hiveId}
              onReviewed={handleMembersChanged}
              onCountChange={setRequestCount}
              onMemberAccepted={handleMemberAccepted}
            />
          )}

          {activeView === 'settings' && isOwner && (
            <HiveSettings
              hive={hive}
              hiveId={hiveId}
              onSaved={handleHiveSaved}
            />
          )}
        </main>
      </div>

      {postModalOpen && (
        <CreatePostModal
          hives={modalHives}
          defaultHiveId={hive.hive_id}
          onClose={() => setPostModalOpen(false)}
          onCreated={newPost => {
            setPosts(prev => [newPost, ...prev]);
            setActiveView('feed');
          }}
        />
      )}
    </div>
  );
}
