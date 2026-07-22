import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar.jsx';
import PostCard from '../components/PostCard.jsx';
import CreatePostModal from '../components/CreatePostModal.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/home.css';
import '../styles/post.css';

// ── Helpers (same checks as ProfilePage.computeCompleteness) ─────────────────

function arr(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

function obj(val) {
  if (!val) return {};
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  try { return JSON.parse(val) || {}; } catch { return {}; }
}

function computeCompleteness(profile) {
  const sp = obj(profile.social_preferences);
  const checks = [
    Boolean(profile.full_name),
    Boolean(profile.bio),
    arr(profile.connection_purposes).length > 0,
    arr(profile.interests).length > 0,
    arr(profile.skills).length > 0,
    Boolean(sp.socialEnergy),
    arr(profile.availability).length > 0,
    Boolean(profile.group_size_preference),
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

// ── Category hex tiles ────────────────────────────────────────────────────────

const CAT_CONFIG = {
  'Social Groups':           { color: '#5dcaa5', icon: '👥' },
  'Professional Networking': { color: '#c49a28', icon: '💼' },
  'Travel Buddies':          { color: '#4db6c4', icon: '✈️' },
  'Project Collaboration':   { color: '#f08a4b', icon: '🚀' },
  'Event Buddies':           { color: '#e86a7c', icon: '🎟️' },
  'Specialized Groups':      { color: '#a59ae8', icon: '⭐' },
};

function HexTile({ categoryName }) {
  const cfg = CAT_CONFIG[categoryName] ?? { color: '#8a8070', icon: '✦' };
  return (
    <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
      <svg viewBox="0 0 36 36" width={36} height={36} style={{ position: 'absolute', inset: 0 }}>
        <polygon
          points="18,2 33,10 33,26 18,34 3,26 3,10"
          fill={cfg.color}
          fillOpacity="0.18"
          stroke={cfg.color}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.78rem',
      }}>
        {cfg.icon}
      </div>
    </div>
  );
}

// ── JoinRequestCard (Part 5) — dark, hides at 0 ───────────────────────────────
function JoinRequestCard({ incoming, hives }) {
  const n = incoming.length;
  if (n === 0) return null;

  const topHiveId  = incoming[0]?.hive_id;
  const topHive    = hives.find(h => h.hive_id === topHiveId) ?? incoming[0] ?? {};
  const hiveName   = topHive.hive_name    ?? '';
  const category   = topHive.category_name ?? '';

  return (
    <div className="home-jrc">
      <div className="home-jrc-header">
        <span className="home-jrc-chip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c49a28" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </span>
        <span className="home-jrc-label">JOIN REQUEST</span>
      </div>
      <div className="home-jrc-count">
        {n} {n === 1 ? 'person wants' : 'people want'} to join
      </div>
      {(hiveName || category) && (
        <div className="home-jrc-sub">
          {hiveName}{category ? ` · ${category}` : ''}
        </div>
      )}
      <Link to={`/hive/${topHiveId}`} className="home-jrc-btn">Review →</Link>
    </div>
  );
}

// ── WelcomeCard (Part 6) ────────────────────────────────────────────────────
function WelcomeCard({ firstName, hives, pendingCount }) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const hiveCount     = hives.length;
  const totalNewPosts = hives.reduce((sum, h) => sum + Number(h.new_posts ?? 0), 0);

  return (
    <div className="home-wc">
      <div className="home-wc-name">Welcome back, {firstName}</div>
      <div className="home-wc-date">{today}</div>
      <div className="home-wc-stats">
        <div className="home-wc-stat">
          <span className="home-wc-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c49a28" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
            </svg>
          </span>
          <span className="home-wc-val">{hiveCount}</span>
          <span className="home-wc-lbl">Hive{hiveCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="home-wc-stat">
          <span className="home-wc-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c49a28" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span className="home-wc-val">{totalNewPosts}</span>
          <span className="home-wc-lbl">new post{totalNewPosts !== 1 ? 's' : ''}</span>
        </div>
        <div className="home-wc-stat">
          <span className="home-wc-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c49a28" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </span>
          <span className="home-wc-val">{pendingCount}</span>
          <span className="home-wc-lbl">request{pendingCount !== 1 ? 's' : ''} waiting</span>
        </div>
      </div>
    </div>
  );
}

// ── Post feed skeleton ────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="post-feed--light">
      {[1, 2, 3].map(i => (
        <div key={i} className="post-skeleton--light">
          <div className="post-skel-line--light" style={{ width: '40%' }} />
          <div className="post-skel-line--light" style={{ width: '70%' }} />
          <div className="post-skel-line--light" style={{ width: '55%' }} />
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS = ['For You', 'Following', 'Trending', 'Nearby'];

export default function HomePage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const firstName = user?.fullName?.trim().split(/\s+/)[0] || 'there';

  const [profile,        setProfile]        = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [hives,          setHives]          = useState([]);
  const [hivesLoading,   setHivesLoading]   = useState(true);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [activeTab,      setActiveTab]      = useState('For You');

  // Incoming join requests (lifted from old RequestsPanel)
  const [incomingReqs, setIncomingReqs] = useState([]);
  const [reqsLoading,  setReqsLoading]  = useState(true);

  // Feed state
  const [posts,        setPosts]        = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);

  // Create dropdown + modal
  const [dropdownOpen,  setDropdownOpen]  = useState(false);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Initial data fetch
  useEffect(() => {
    api.get('/api/users/profile')
      .then(data => setProfile(data.profile ?? null))
      .catch(() => setProfile(null))
      .finally(() => setProfileLoading(false));

    api.get('/api/hives/mine')
      .then(data => setHives(data.hives ?? []))
      .catch(() => setHives([]))
      .finally(() => setHivesLoading(false));
  }, []);

  // Fetch incoming join requests for owned/admin hives after hives load
  useEffect(() => {
    if (hivesLoading) return;
    const adminHives = hives.filter(h => ['owner', 'admin'].includes(h.role));
    if (!adminHives.length) { setReqsLoading(false); setIncomingReqs([]); return; }
    setReqsLoading(true);
    Promise.all(
      adminHives.map(h =>
        api.get(`/api/hives/${h.hive_id}/requests`)
          .then(d => (d.requests ?? []).map(r => ({
            ...r, hive_id: h.hive_id, hive_name: h.hive_name, category_name: h.category_name,
          })))
          .catch(() => []),
      ),
    )
      .then(groups => setIncomingReqs(groups.flat()))
      .catch(() => setIncomingReqs([]))
      .finally(() => setReqsLoading(false));
  }, [hives, hivesLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch feed whenever tab changes
  useEffect(() => {
    setPostsLoading(true);
    api.get(`/api/posts/feed?tab=${encodeURIComponent(activeTab)}`)
      .then(data => setPosts(data.posts ?? []))
      .catch(() => setPosts([]))
      .finally(() => setPostsLoading(false));
  }, [activeTab]);

  function handlePostCreated(newPost) {
    setPosts(prev => [newPost, ...prev]);
  }

  const completeness = profile ? computeCompleteness(profile) : 0;
  const showNudge = !profileLoading && !nudgeDismissed && profile && completeness < 100;

  return (
    <>
      <Navbar />
      <div className="home-page">
        <div className="home-inner">

          {/* ── 1. Action bar ── */}
          <div className="home-action-bar">
            <div className="home-search-wrap">
              <span className="home-search-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                className="home-search-input"
                placeholder="Search Hives, people, categories"
                readOnly
              />
            </div>

            {/* Create dropdown */}
            <div className="home-create-wrap" ref={dropdownRef}>
              <button
                type="button"
                className="home-create-btn"
                onClick={() => setDropdownOpen(v => !v)}
              >
                <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span>
                <span className="home-create-label"> Create</span>
              </button>

              {dropdownOpen && (
                <div className="home-create-dropdown">
                  <button
                    type="button"
                    className="home-create-option"
                    onClick={() => {
                      setDropdownOpen(false);
                      setPostModalOpen(true);
                    }}
                  >
                    📝 New Post
                  </button>
                  <button
                    type="button"
                    className="home-create-option"
                    onClick={() => {
                      setDropdownOpen(false);
                      navigate('/create-hive');
                    }}
                  >
                    🐝 New Hive
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── 2. Welcome header ── */}
          <div className="home-welcome">
            <Avatar
              name={user?.fullName}
              email={user?.email}
              src={user?.profilePhotoUrl}
              size={40}
            />
            <div>
              <div className="home-welcome-name">Welcome back, {firstName}.</div>
              <div className="home-welcome-sub">Here&apos;s what&apos;s happening in your Hives today.</div>
            </div>
          </div>

          {/* ── 3. Profile nudge (conditional) ── */}
          {showNudge && (
            <div className="home-nudge">
              <div className="home-nudge-left">
                <div className="home-nudge-pct">{completeness}%</div>
                <div className="home-nudge-text">
                  Complete your profile to improve your matches.
                  <Link to="/profile/edit" className="home-nudge-link">Finish profile →</Link>
                </div>
              </div>
              <button
                className="home-nudge-dismiss"
                type="button"
                onClick={() => setNudgeDismissed(true)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {/* ── 4. Feed tabs ── */}
          <div className="home-tabs" role="tablist">
            {TABS.map(tab => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={`home-tab${activeTab === tab ? ' active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* ── 5. Two-column body ── */}
          <div className="home-body">

            {/* ── Feed column ── */}
            <div className="home-feed-col">
              {postsLoading ? (
                <FeedSkeleton />
              ) : posts.length === 0 ? (
                <div className="home-feed-empty" style={{ background: '#fffdf9', border: '1px solid #e4dccb', borderRadius: 16 }}>
                  <div className="home-feed-empty-icon">
                    <svg viewBox="0 0 56 56" width={52} height={52} xmlns="http://www.w3.org/2000/svg">
                      <polygon
                        points="28,4 50,16 50,40 28,52 6,40 6,16"
                        fill="none"
                        stroke="#d8cdb4"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                      <polygon
                        points="28,10 46,20 46,38 28,48 10,38 10,20"
                        fill="rgba(196,154,40,0.07)"
                        stroke="#c49a28"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="home-feed-empty-title" style={{ color: '#17120a' }}>Your feed is quiet — for now.</div>
                  <div className="home-feed-empty-sub" style={{ color: '#8a7d5e' }}>
                    Follow Hives and their updates, events, and milestones will show up here.
                  </div>
                  <Link to="/find-your-hive" className="home-feed-discover-btn">
                    Discover Hives →
                  </Link>
                </div>
              ) : (
                <div className="post-feed post-feed--light">
                  {posts.map(post => (
                    <PostCard key={post.post_id} post={post} variant="light" />
                  ))}
                </div>
              )}
            </div>

            {/* ── Right sidebar ── */}
            <div className="home-sidebar">

              {/* Welcome card (Part 6) */}
              {!hivesLoading && (
                <WelcomeCard
                  firstName={firstName}
                  hives={hives}
                  pendingCount={reqsLoading ? 0 : incomingReqs.length}
                />
              )}

              {/* Join request card (Part 5) — dark, hidden at 0 pending */}
              {!reqsLoading && (
                <JoinRequestCard incoming={incomingReqs} hives={hives} />
              )}

              {/* Your Hives */}
              <div className="home-light-card home-sidebar-card">
                <div className="home-sidebar-label">Your Hives</div>
                {hivesLoading ? (
                  <>
                    <div className="post-skel-line--light" style={{ width: '75%', marginBottom: 8 }} />
                    <div className="post-skel-line--light" style={{ width: '55%' }} />
                  </>
                ) : hives.length === 0 ? (
                  <div className="home-sidebar-empty">
                    No Hives yet.
                    <br />
                    <Link to="/find-your-hive" className="home-sidebar-empty-link">Find a Hive →</Link>
                  </div>
                ) : (
                  <div className="home-hive-list">
                    {hives.map(hive => {
                      const unread = Number(hive.new_posts ?? 0) + Number(hive.new_members ?? 0);
                      return (
                        <Link
                          key={hive.hive_id}
                          to={`/hive/${hive.hive_id}`}
                          className="home-hive-row"
                        >
                          <div className="home-hive-tile-wrap">
                            <HexTile categoryName={hive.category_name} />
                            {unread > 0 && <span className="home-hive-unread-dot" />}
                          </div>
                          <div className="home-hive-info">
                            <div className="home-hive-name-row">
                              <span className="home-hive-name">{hive.hive_name}</span>
                              {unread > 0 && (
                                <span className="home-hive-unread-badge">{unread} new</span>
                              )}
                            </div>
                            <div className="home-hive-meta">
                              {hive.member_count ?? 1} member{Number(hive.member_count) !== 1 ? 's' : ''} · {hive.role}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Suggested for you */}
              <div className="home-light-card home-sidebar-card">
                <div className="home-sidebar-label">Suggested for you</div>
                <div className="home-suggest-sub">Explore Hives that fit your profile.</div>
                <Link to="/find-your-hive" className="home-suggest-link">Discover Hives →</Link>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* Create Post modal */}
      {postModalOpen && (
        <CreatePostModal
          hives={hives}
          onClose={() => setPostModalOpen(false)}
          onCreated={handlePostCreated}
        />
      )}
    </>
  );
}
