import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../lib/api.js';
import '../styles/hive.css';

const CAT_CONFIG = {
  'Social Groups':           { color: '#5dcaa5', icon: '👥' },
  'Professional Networking': { color: '#c49a28', icon: '💼' },
  'Travel Buddies':          { color: '#4db6c4', icon: '✈️' },
  'Project Collaboration':   { color: '#f08a4b', icon: '🚀' },
  'Event Buddies':           { color: '#e86a7c', icon: '🎟️' },
  'Specialized Groups':      { color: '#a59ae8', icon: '⭐' },
};

function HexTile({ categoryName, size = 44 }) {
  const cfg = CAT_CONFIG[categoryName] ?? { color: '#8a8070', icon: '✦' };
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 36 36" width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
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
        fontSize: size * 0.33 + 'px',
      }}>
        {cfg.icon}
      </div>
    </div>
  );
}

function RoleBadge({ role }) {
  const cls = role === 'owner' ? 'hive-badge-owner'
            : role === 'admin' ? 'hive-badge-admin'
            : 'hive-badge-member';
  return <span className={`hive-badge ${cls}`}>{role}</span>;
}

function timeAgo(dateStr) {
  if (!dateStr) return 'a while ago';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function buildActivitySummary(hive) {
  const parts = [];
  const newMembers = Number(hive.new_members ?? 0);
  const newPosts   = Number(hive.new_posts   ?? 0);
  if (newMembers > 0) {
    parts.push(hive.newest_member_name
      ? `👋 ${hive.newest_member_name} joined`
      : `👋 ${newMembers} new member${newMembers > 1 ? 's' : ''}`);
  }
  if (newPosts > 0) {
    parts.push(`💬 ${newPosts} new post${newPosts > 1 ? 's' : ''}`);
  }
  return parts.join(' · ') || 'New activity in your Hive';
}

function HiveCard({ hive }) {
  const newPosts   = Number(hive.new_posts   ?? 0);
  const newMembers = Number(hive.new_members ?? 0);
  const unread     = newPosts + newMembers;

  const meta = [
    hive.category_name,
    hive.member_count != null
      ? `${hive.member_count} member${Number(hive.member_count) !== 1 ? 's' : ''}`
      : null,
    hive.location_type || hive.location || null,
  ].filter(Boolean).join(' · ');

  return (
    <Link
      to={`/hive/${hive.hive_id}`}
      className={`mh-card${unread > 0 ? ' mh-card-unread' : ''}`}
    >
      {/* Tile with unread dot */}
      <div className="mh-tile-wrap">
        <HexTile categoryName={hive.category_name} size={44} />
        {unread > 0 && <span className="mh-unread-dot" />}
      </div>

      {/* Card body */}
      <div className="mh-card-body">
        <div className="mh-name-row">
          <span className="mh-hive-name">{hive.hive_name}</span>
          <RoleBadge role={hive.role} />
          {unread > 0 && (
            <span className="mh-unread-pill">{unread} new</span>
          )}
        </div>

        {meta && <div className="mh-hive-meta">{meta}</div>}

        <div className="mh-activity-line">
          {unread > 0
            ? buildActivitySummary(hive)
            : `All caught up · last active ${timeAgo(hive.last_activity_at)}`}
        </div>
      </div>

      <svg
        className="mh-chevron"
        width="18" height="18" viewBox="0 0 24 24"
        fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}

function SkeletonCards() {
  return (
    <>
      {[1, 2].map(i => (
        <div key={i} className="mh-skel-row">
          <div className="hive-skel-dark mh-skel-hex" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="hive-skel-dark" style={{ height: 14, width: '52%', borderRadius: 6 }} />
            <div className="hive-skel-dark" style={{ height: 10, width: '38%', borderRadius: 6 }} />
            <div className="hive-skel-dark" style={{ height: 10, width: '65%', borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </>
  );
}

export default function MyHivePage() {
  const [hives,    setHives]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    api.get('/api/hives/mine')
      .then(data => setHives(data.hives ?? []))
      .catch(() => setHives([]))
      .finally(() => setLoading(false));
    api.get('/api/hives/requests/mine')
      .then(data => setRequests((data.requests ?? []).filter(r => r.status === 'pending')))
      .catch(() => setRequests([]));
  }, []);

  return (
    <>
      <Navbar />
      <div className="hive-page">
        <div className="hive-inner">

          <div className="hive-page-header">
            <div className="hive-eyebrow">My Hives</div>
            <h1 className="hive-page-title">Your spaces.</h1>
            <p className="hive-page-sub">
              The Hives you belong to. Open one to post, see members, and connect.
            </p>
          </div>

          <div className="mh-list">
            {loading ? (
              <SkeletonCards />
            ) : (
              hives.map(hive => <HiveCard key={hive.hive_id} hive={hive} />)
            )}

            {/* Pending requests */}
            {!loading && requests.length > 0 && (
              <>
                <div className="mh-section-label">Pending Requests</div>
                {requests.map(req => (
                  <Link key={req.request_id} to={`/hive/${req.hive_id}`} className="mh-row mh-row-pending">
                    <div className="mh-row-left">
                      <div style={{ opacity: 0.5 }}>
                        <HexTile categoryName={req.category_name} size={40} />
                      </div>
                      <div className="mh-row-info">
                        <div className="mh-hive-name">{req.hive_name}</div>
                        <div className="mh-row-chips">
                          {req.category_name && (
                            <span className="mh-cat-chip">{req.category_name}</span>
                          )}
                          <span className="mh-pending-pill">Request pending</span>
                        </div>
                      </div>
                    </div>
                    <svg className="mh-chevron" width="18" height="18" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" strokeWidth="2"
                         strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                ))}
              </>
            )}
          </div>

          {/* Dashed card */}
          <div className="mh-dashed">
            <div className="mh-dashed-title">
              {hives.length === 0 && requests.length === 0 && !loading
                ? "You haven't joined a Hive yet."
                : 'Room for more.'}
            </div>
            <div className="mh-dashed-btns">
              <Link to="/find-your-hive" className="mh-dashed-btn-primary">Find Your Hive</Link>
              <Link to="/create-hive"    className="mh-dashed-btn-ghost">Create a Hive</Link>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
