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

// ── Post feed skeleton ────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <>
      {[1, 2, 3].map(i => (
        <div key={i} className="post-skeleton">
          <div className="post-skel-line" style={{ width: '40%' }} />
          <div className="post-skel-line" style={{ width: '70%' }} />
          <div className="post-skel-line" style={{ width: '55%' }} />
        </div>
      ))}
    </>
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

            <button className="home-bell-btn" type="button" aria-label="Notifications">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6b6057" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="home-bell-badge" />
            </button>

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
            <div className="home-dark-card">
              {postsLoading ? (
                <FeedSkeleton />
              ) : posts.length === 0 ? (
                <div className="home-feed-empty">
                  <div className="home-feed-empty-icon">
                    <svg viewBox="0 0 56 56" width={52} height={52} xmlns="http://www.w3.org/2000/svg">
                      <polygon
                        points="28,4 50,16 50,40 28,52 6,40 6,16"
                        fill="none"
                        stroke="rgba(51,41,21,0.5)"
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
                  <div className="home-feed-empty-title">Your feed is quiet — for now.</div>
                  <div className="home-feed-empty-sub">
                    Follow Hives and their updates, events, and milestones will show up here.
                  </div>
                  <Link to="/find-your-hive" className="home-feed-discover-btn">
                    Discover Hives →
                  </Link>
                </div>
              ) : (
                <div className="post-feed">
                  {posts.map(post => (
                    <PostCard key={post.post_id} post={post} />
                  ))}
                </div>
              )}
            </div>

            {/* ── Right sidebar ── */}
            <div className="home-sidebar">

              {/* Your Hives */}
              <div className="home-dark-card home-sidebar-card">
                <div className="home-sidebar-label">Your Hives</div>
                {hivesLoading ? (
                  <>
                    <div className="home-skeleton-line" style={{ width: '75%' }} />
                    <div className="home-skeleton-line" style={{ width: '55%' }} />
                  </>
                ) : hives.length === 0 ? (
                  <div className="home-sidebar-empty">
                    No Hives yet.
                    <br />
                    <Link to="/find-your-hive" className="home-sidebar-empty-link">Find a Hive →</Link>
                  </div>
                ) : (
                  <div className="home-hive-list">
                    {hives.map(hive => (
                      <Link
                        key={hive.hive_id}
                        to={`/hive/${hive.hive_id}`}
                        className="home-hive-row"
                      >
                        <HexTile categoryName={hive.category_name} />
                        <div className="home-hive-info">
                          <div className="home-hive-name">{hive.hive_name}</div>
                          <div className="home-hive-meta">
                            {hive.member_count ?? 1} member{Number(hive.member_count) !== 1 ? 's' : ''} · {hive.role}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Requests */}
              <div className="home-dark-card home-sidebar-card">
                <div className="home-sidebar-label">Requests</div>
                <div className="home-sidebar-empty">No pending requests.</div>
              </div>

              {/* Suggested for you */}
              <div className="home-dark-card home-sidebar-card">
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
