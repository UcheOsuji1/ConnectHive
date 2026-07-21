import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../lib/api.js';
import '../styles/hive.css';

// ── Category config ───────────────────────────────────────────────────────────
const CAT_CONFIG = {
  'Social Groups':           { color: '#5dcaa5', icon: '👥' },
  'Professional Networking': { color: '#c49a28', icon: '💼' },
  'Travel Buddies':          { color: '#4db6c4', icon: '✈️' },
  'Project Collaboration':   { color: '#f08a4b', icon: '🚀' },
  'Event Buddies':           { color: '#e86a7c', icon: '🎟️' },
  'Specialized Groups':      { color: '#a59ae8', icon: '⭐' },
};

function HexTile({ categoryName, size = 40 }) {
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

function SkeletonRows() {
  return (
    <>
      {[1, 2].map(i => (
        <div key={i} className="mh-skel-row">
          <div className="hive-skel-dark mh-skel-hex" style={{ width: 40, height: 40, borderRadius: 8 }} />
          <div style={{ flex: 1 }}>
            <div className="hive-skel-dark" style={{ height: 14, width: '55%', borderRadius: 6, marginBottom: 8 }} />
            <div className="hive-skel-dark" style={{ height: 10, width: '35%', borderRadius: 6 }} />
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

          {/* Page header */}
          <div className="hive-page-header">
            <div className="hive-eyebrow">My Hives</div>
            <h1 className="hive-page-title">Your spaces.</h1>
            <p className="hive-page-sub">
              The Hives you belong to. Open one to post, see members, and chat.
            </p>
          </div>

          {/* Hive list */}
          <div className="mh-list">
            {loading ? (
              <SkeletonRows />
            ) : hives.length === 0 ? null : (
              hives.map(hive => (
                <Link key={hive.hive_id} to={`/hive/${hive.hive_id}`} className="mh-row">
                  <div className="mh-row-left">
                    <HexTile categoryName={hive.category_name} size={40} />
                    <div className="mh-row-info">
                      <div className="mh-hive-name">{hive.hive_name}</div>
                      <div className="mh-row-chips">
                        {hive.category_name && (
                          <span className="mh-cat-chip">{hive.category_name}</span>
                        )}
                        <RoleBadge role={hive.role} />
                      </div>
                      <div className="mh-hive-meta">
                        {[
                          hive.member_count != null
                            ? `${hive.member_count} member${Number(hive.member_count) !== 1 ? 's' : ''}`
                            : null,
                          hive.location_type,
                        ].filter(Boolean).join(' · ')}
                      </div>
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
              ))
            )}

            {/* Pending requests section */}
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
                    <svg
                      className="mh-chevron"
                      width="18" height="18" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                ))}
              </>
            )}
          </div>

          {/* Dashed "Room for more" card */}
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
