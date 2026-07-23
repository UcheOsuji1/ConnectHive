import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar.jsx';
import PostCard from '../components/PostCard.jsx';
import FollowButton from '../components/FollowButton.jsx';
import HiveWorkspace from '../components/HiveWorkspace.jsx';
import WelcomeTakeover from '../components/WelcomeTakeover.jsx';
import { api } from '../lib/api.js';
import '../styles/hive.css';
import '../styles/post.css';

// ── Category config ───────────────────────────────────────────────────────────
const CAT_CONFIG = {
  'Social Groups':           { color: '#5dcaa5', icon: '👥' },
  'Professional Networking': { color: '#c49a28', icon: '💼' },
  'Travel Buddies':          { color: '#4db6c4', icon: '✈️' },
  'Project Collaboration':   { color: '#f08a4b', icon: '🚀' },
  'Event Buddies':           { color: '#e86a7c', icon: '🎟️' },
  'Specialized Groups':      { color: '#a59ae8', icon: '⭐' },
};

function HexTile({ categoryName, size = 48 }) {
  const cfg = CAT_CONFIG[categoryName] ?? { color: '#8a8070', icon: '✦' };
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 36 36" width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        <polygon
          points="18,2 33,10 33,26 18,34 3,26 3,10"
          fill={cfg.color} fillOpacity="0.2" stroke={cfg.color}
          strokeWidth="1.5" strokeLinejoin="round"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.32 + 'px',
      }}>
        {cfg.icon}
      </div>
    </div>
  );
}

function safeTags(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val) || []; } catch { return []; }
}

function buildMeta(hive) {
  return [
    hive.category_name ?? null,
    hive.member_count != null
      ? `${hive.member_count}${hive.max_members ? ` / ${hive.max_members}` : ''} members`
      : null,
    hive.location_type ?? null,
    hive.location      ?? null,
    hive.cadence       ?? null,
  ].filter(Boolean).join(' · ');
}

// ── Skeletons ─────────────────────────────────────────────────────────────────
function PostSkeleton() {
  return (
    <>
      {[1, 2].map(i => (
        <div key={i} className="post-skeleton">
          <div className="post-skel-line" style={{ width: '40%' }} />
          <div className="post-skel-line" style={{ width: '65%' }} />
          <div className="post-skel-line" style={{ width: '50%' }} />
        </div>
      ))}
    </>
  );
}

function HeaderSkeleton() {
  return (
    <div className="hive-dark-card dhp-header-card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 18 }}>
        <div className="hive-skel-dark" style={{ width: 56, height: 56, borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="hive-skel-dark" style={{ height: 20, width: '45%', borderRadius: 6, marginBottom: 10 }} />
          <div className="hive-skel-dark" style={{ height: 11, width: '65%', borderRadius: 6, marginBottom: 8 }} />
          <div className="hive-skel-dark" style={{ height: 11, width: '80%', borderRadius: 6 }} />
        </div>
      </div>
    </div>
  );
}

// ── Public view sub-components (non-member only) ──────────────────────────────
function MembersTab({ members, loading }) {
  if (loading) {
    return (
      <div className="dhp-members-grid">
        {[1, 2, 3].map(i => (
          <div key={i} className="dhp-member-card">
            <div className="hive-skel-dark" style={{ width: 48, height: 48, borderRadius: '50%', marginBottom: 6 }} />
            <div className="hive-skel-dark" style={{ height: 11, width: '70%', borderRadius: 6 }} />
          </div>
        ))}
      </div>
    );
  }
  if (!members.length) return <div className="dhp-posts-empty"><div className="dhp-posts-empty-title">No members found.</div></div>;
  return (
    <div className="dhp-members-grid">
      {members.map(m => (
        <div key={m.user_id} className="dhp-member-card">
          <Avatar name={m.full_name} size={48} />
          <div className="dhp-member-name">{m.full_name ?? 'Member'}</div>
        </div>
      ))}
    </div>
  );
}

function AboutTab({ hive }) {
  const sections = [
    { label: 'Pinned Goal',  value: hive.pinned_goal },
    { label: 'Ground Rules', value: hive.ground_rules },
    { label: 'Icebreaker',   value: hive.icebreaker },
    { label: 'Meets',        value: [hive.cadence, hive.location_type].filter(Boolean).join(' · ') || null },
  ].filter(s => s.value);

  if (!sections.length) return <div className="dhp-posts-empty"><div className="dhp-posts-empty-title">No details added yet.</div></div>;
  return (
    <div className="dhp-about-grid">
      {sections.map(s => (
        <div key={s.label} className="dhp-about-card">
          <div className="dhp-about-label">{s.label}</div>
          <div className="dhp-about-body">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function JoinButton({ hiveId, initialPending }) {
  const [joinState, setJoinState] = useState(initialPending ? 'pending' : 'idle');
  const [joinError, setJoinError] = useState(null);

  async function handleJoin() {
    if (joinState !== 'idle') return;
    setJoinState('loading');
    setJoinError(null);
    try {
      const result = await api.post(`/api/hives/${hiveId}/request`, {});
      setJoinState(result.joined ? 'joined' : 'pending');
    } catch (err) {
      setJoinError(err.data?.error ?? 'Something went wrong.');
      setJoinState('idle');
    }
  }

  if (joinState === 'joined') return <div className="dhp-join-joined">Joined ✓</div>;
  if (joinState === 'pending') return <div className="dhp-join-disabled">Request pending</div>;
  return (
    <div>
      <button type="button" className="dhp-join-btn" disabled={joinState === 'loading'} onClick={handleJoin}>
        {joinState === 'loading' ? 'Requesting…' : 'Request to Join'}
      </button>
      {joinError && <div className="dhp-join-error">{joinError}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DirectHivePage() {
  const { id } = useParams();

  const [hive,           setHive]           = useState(null);
  const [hiveLoading,    setHiveLoading]    = useState(true);
  const [hiveError,      setHiveError]      = useState(null);

  // Only needed for the non-member public view:
  const [posts,          setPosts]          = useState([]);
  const [postsLoading,   setPostsLoading]   = useState(true);
  const [members,        setMembers]        = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [activeTab,      setActiveTab]      = useState('Posts');

  useEffect(() => {
    setHiveLoading(true);
    api.get(`/api/hives/${id}`)
      .then(data => {
        setHive(data.hive);
        const isMem = Boolean(data.hive?.my_role);
        // Mark this hive seen for the member (clears unread indicators)
        if (isMem) api.post(`/api/hives/${id}/seen`, {}).catch(() => {});
        // Only prefetch posts+members for the non-member public view
        if (!data.hive?.private && !isMem) {
          api.get(`/api/hives/${id}/posts`)
            .then(d => setPosts(d.posts ?? []))
            .catch(() => setPosts([]))
            .finally(() => setPostsLoading(false));
          api.get(`/api/hives/${id}/members`)
            .then(d => setMembers(d.members ?? []))
            .catch(() => setMembers([]))
            .finally(() => setMembersLoading(false));
        } else {
          setPostsLoading(false);
          setMembersLoading(false);
        }
      })
      .catch(err => {
        setHiveError(err.status === 404 ? 'not_found' : 'error');
        setPostsLoading(false);
        setMembersLoading(false);
      })
      .finally(() => setHiveLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwner  = ['owner', 'admin'].includes(hive?.my_role);
  const isMember = Boolean(hive?.my_role);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (hiveLoading) {
    return (
      <>
        <Navbar />
        <div className="hive-page">
          <div className="hive-inner">
            <div className="hive-skel" style={{ height: 14, width: 200, borderRadius: 6, marginBottom: 18 }} />
            <HeaderSkeleton />
          </div>
        </div>
      </>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (hiveError === 'not_found' || !hive) {
    return (
      <>
        <Navbar />
        <div className="hive-page">
          <div className="hive-inner">
            <div className="dhp-not-found">
              <div className="dhp-not-found-title">Hive not found.</div>
              <Link to="/my-hive" className="dhp-not-found-link">← Back to My Hives</Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Private gate ─────────────────────────────────────────────────────────────
  if (hive.private) {
    return (
      <>
        <Navbar />
        <div className="hive-page">
          <div className="hive-inner">
            <div className="hive-dark-card dhp-private-gate">
              <HexTile categoryName={hive.category_name} size={52} />
              <div className="dhp-private-title">{hive.hive_name}</div>
              <div className="dhp-private-sub">
                This Hive is private. Only members can see its posts and members.
              </div>
              <FollowButton hiveId={hive.hive_id} initialFollowing={hive.is_following} />
              <Link to="/my-hive" className="dhp-private-back">← Back to My Hives</Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Member view: full workspace ──────────────────────────────────────────────
  if (isMember) {
    const showWelcome = hive.my_role === 'member' && !hive.welcome_seen_at;
    return (
      <>
        <Navbar />
        {showWelcome && (
          <WelcomeTakeover
            hive={hive}
            hiveId={id}
            onEnter={() => setHive(prev => ({ ...prev, welcome_seen_at: new Date().toISOString() }))}
          />
        )}
        <HiveWorkspace
          hive={hive}
          hiveId={id}
          isOwner={isOwner}
          initialNewPosts={Number(hive.new_posts ?? 0)}
          onHiveUpdated={updatedHive => setHive(prev => ({ ...prev, ...updatedHive }))}
        />
      </>
    );
  }

  // ── Non-member public view ───────────────────────────────────────────────────
  const tags = safeTags(hive.tags);
  const PUB_TABS = ['Posts', 'Members', 'About'];
  const sidebarAbout = [
    { key: 'Pinned goal',  val: hive.pinned_goal },
    { key: 'Meets',        val: [hive.cadence, hive.location_type].filter(Boolean).join(' · ') || null },
    { key: 'Ground rules', val: hive.ground_rules },
  ].filter(a => a.val);

  return (
    <>
      <Navbar />
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
                <div className="dhp-meta">{buildMeta(hive)}</div>
                {hive.description && <div className="dhp-description">{hive.description}</div>}
                {(tags.length > 0 || hive.join_policy) && (
                  <div className="dhp-tags">
                    {tags.map((tag, i) => <span key={i} className="dhp-tag-chip">{tag}</span>)}
                    {hive.join_policy && <span className="dhp-policy-chip">{hive.join_policy}</span>}
                  </div>
                )}
              </div>
              <div className="dhp-header-actions">
                <FollowButton hiveId={hive.hive_id} initialFollowing={hive.is_following} />
                <JoinButton hiveId={hive.hive_id} initialPending={Boolean(hive.request_pending)} />
              </div>
            </div>
          </div>

          <div className="dhp-tabs" role="tablist">
            {PUB_TABS.map(tab => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={['dhp-tab', activeTab === tab ? 'active' : ''].join(' ').trim()}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="dhp-body">
            <div>
              {activeTab === 'Posts' && (
                <div className="hive-dark-card">
                  {postsLoading ? <PostSkeleton /> : posts.length === 0 ? (
                    <div className="dhp-posts-empty">
                      <div className="dhp-posts-empty-title">No posts yet.</div>
                    </div>
                  ) : (
                    <div className="post-feed">
                      {posts.map(post => <PostCard key={post.post_id} post={post} />)}
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'Members' && (
                <div className="hive-dark-card">
                  <MembersTab members={members} loading={membersLoading} />
                </div>
              )}
              {activeTab === 'About' && (
                <div className="hive-dark-card">
                  <AboutTab hive={hive} />
                </div>
              )}
            </div>

            <div className="dhp-sidebar">
              <div className="hive-dark-card dhp-sidebar-card">
                <div className="dhp-sidebar-label">Members · {Number(hive.member_count ?? 0)}</div>
                {membersLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[1, 2, 3].map(i => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div className="hive-skel-dark" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
                        <div className="hive-skel-dark" style={{ height: 10, width: '60%', borderRadius: 5 }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="dhp-sidebar-member-list">
                      {members.slice(0, 5).map(m => (
                        <div key={m.user_id} className="dhp-sidebar-member-row">
                          <Avatar name={m.full_name} size={28} />
                          <span className="dhp-sidebar-member-name">{m.full_name ?? 'Member'}</span>
                          <span className="dhp-sidebar-member-role">{m.role}</span>
                        </div>
                      ))}
                    </div>
                    {members.length > 5 && (
                      <button type="button" className="dhp-see-all" onClick={() => setActiveTab('Members')}>
                        See all {members.length} members
                      </button>
                    )}
                    {hive.max_members && (
                      <div className="dhp-sidebar-footer-meta">
                        {Number(hive.max_members) - Number(hive.member_count ?? 0)} spots left
                      </div>
                    )}
                  </>
                )}
              </div>

              {sidebarAbout.length > 0 && (
                <div className="hive-dark-card dhp-sidebar-card">
                  <div className="dhp-sidebar-label">About this Hive</div>
                  {sidebarAbout.map(a => (
                    <div key={a.key} className="dhp-sidebar-about-item">
                      <div className="dhp-sidebar-about-key">{a.key}</div>
                      <div className="dhp-sidebar-about-val">{a.val}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
