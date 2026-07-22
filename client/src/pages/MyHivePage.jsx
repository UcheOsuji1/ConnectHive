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
          fill={cfg.color} fillOpacity="0.18"
          stroke={cfg.color} strokeWidth="1.5" strokeLinejoin="round"
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

function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ── Part 1: Summary strip ─────────────────────────────────────────────────────

function SummaryStrip({ hives, pending }) {
  const totalUnread = hives.reduce((s, h) => s + Number(h.new_posts ?? 0), 0);
  const ownedCount  = hives.filter(h => h.role === 'owner').length;

  return (
    <div className="mh-summary-strip">
      <span className="mh-sum-item">{hives.length} Active</span>
      <span className="mh-sum-dot">·</span>
      <span className="mh-sum-item">{ownedCount} Owned</span>
      <span className="mh-sum-dot">·</span>
      <span className={`mh-sum-item${totalUnread > 0 ? ' mh-sum-gold' : ''}`}>
        {totalUnread} Unread updates
      </span>
      {pending > 0 && (
        <>
          <span className="mh-sum-dot">·</span>
          <span className="mh-sum-item mh-sum-gold">
            {pending} Pending request{pending !== 1 ? 's' : ''}
          </span>
        </>
      )}
    </div>
  );
}

// ── Part 2: Attention strip ───────────────────────────────────────────────────

function AttentionStrip({ reqs }) {
  if (!reqs.length) return null;
  const sorted = [...reqs].sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));
  return (
    <div className="mh-attention">
      <div className="mh-attention-label">Needs your attention</div>
      <div className="mh-attention-list">
        {sorted.map(req => (
          <div key={req.request_id} className="mh-attention-item">
            <div className="mh-att-avatar">{initials(req.full_name)}</div>
            <div className="mh-att-body">
              <div className="mh-att-title">
                <strong>{req.full_name ?? 'Someone'}</strong>{' '}
                requested to join <strong>{req.hive_name}</strong>
              </div>
              <div className="mh-att-sub">Requested {timeAgo(req.requested_at)}</div>
            </div>
            <Link to={`/hive/${req.hive_id}`} className="mh-att-review">Review →</Link>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Part 3: Hive card (light, two-column grid) ────────────────────────────────

function HiveCard({ hive, pendingForHive }) {
  const newPosts    = Number(hive.new_posts ?? 0);
  const memberCount = Number(hive.member_count ?? 0);
  const isOwner     = hive.role === 'owner';
  const isSoloOwner = isOwner && memberCount <= 1;

  const meta = [
    hive.category_name,
    hive.location_type || hive.location || null,
  ].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' · ');

  return (
    <div className="mh-card2">
      {/* Header */}
      <div className="mh-card2-header">
        <HexTile categoryName={hive.category_name} size={40} />
        <div className="mh-card2-title-area">
          <div className="mh-card2-name">{hive.hive_name}</div>
          <div className="mh-card2-badges">
            {isOwner
              ? <span className="mh-badge-owner">Owner</span>
              : <span className="mh-badge-member">Member</span>}
          </div>
        </div>
        <button type="button" className="mh-card2-dots" aria-label="More options">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </div>

      {/* Meta */}
      {meta && <div className="mh-card2-meta">{meta}</div>}

      {/* Signals */}
      <div className="mh-card2-signals">
        {isSoloOwner ? (
          <>
            <div className="mh-signal-row">
              <span className="mh-signal-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                </svg>
              </span>
              <span className="mh-solo-main">Only you are here</span>
            </div>
            <div className="mh-signal-row mh-signal-row-muted" style={{ paddingLeft: 20 }}>
              Invite members or explore suggested matches
            </div>
          </>
        ) : (
          <>
            <div className="mh-signal-row mh-signal-row-muted">
              <span className="mh-signal-icon-muted">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
            </div>

            {newPosts > 0 ? (
              <div className="mh-signal-row mh-signal-row-gold">
                <span className="mh-signal-icon">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <span>{newPosts} unread post{newPosts !== 1 ? 's' : ''}</span>
              </div>
            ) : (
              <div className="mh-signal-row mh-signal-row-muted">
                <span className="mh-signal-icon-muted">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span>All caught up</span>
              </div>
            )}
          </>
        )}

        {hive.last_activity_at && (
          <div className="mh-signal-row mh-signal-row-muted">
            <span className="mh-signal-icon-muted">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <span>Last active {timeAgo(hive.last_activity_at)}</span>
          </div>
        )}

        {isOwner && pendingForHive > 0 && (
          <div className="mh-signal-row mh-signal-row-gold">
            <span className="mh-signal-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </span>
            <span>{pendingForHive} pending request{pendingForHive !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mh-card2-actions">
        {isOwner && (
          <Link to={`/hive/${hive.hive_id}`} className="mh-btn-secondary">
            {isSoloOwner ? 'Invite' : 'Manage'}
          </Link>
        )}
        <Link to={`/hive/${hive.hive_id}`} className="mh-btn-open">Open Hive →</Link>
      </div>
    </div>
  );
}

// ── Skeleton grid ─────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="mh-grid">
      {[1, 2].map(i => (
        <div key={i} className="mh-grid-skel">
          <div className="hive-skel" style={{ height: 40, width: 40, borderRadius: 8 }} />
          <div className="hive-skel" style={{ height: 14, width: '60%', borderRadius: 6 }} />
          <div className="hive-skel" style={{ height: 10, width: '45%', borderRadius: 6 }} />
          <div className="hive-skel" style={{ height: 10, width: '70%', borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MyHivePage() {
  const [hives,        setHives]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [incomingReqs, setIncomingReqs] = useState([]);
  const [reqsLoading,  setReqsLoading]  = useState(true);

  useEffect(() => {
    api.get('/api/hives/mine')
      .then(data => setHives(data.hives ?? []))
      .catch(() => setHives([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    const ownerHives = hives.filter(h => h.role === 'owner');
    if (!ownerHives.length) { setReqsLoading(false); return; }
    Promise.all(
      ownerHives.map(h =>
        api.get(`/api/hives/${h.hive_id}/requests`)
          .then(d => (d.requests ?? []).map(r => ({
            ...r, hive_id: h.hive_id, hive_name: h.hive_name, category_name: h.category_name,
          })))
          .catch(() => [])
      )
    )
      .then(groups => setIncomingReqs(groups.flat()))
      .catch(() => setIncomingReqs([]))
      .finally(() => setReqsLoading(false));
  }, [hives, loading]);

  const pendingTotal = incomingReqs.length;

  const pendingByHive = {};
  for (const r of incomingReqs) {
    pendingByHive[r.hive_id] = (pendingByHive[r.hive_id] ?? 0) + 1;
  }

  return (
    <>
      <Navbar />
      <div className="hive-page">
        <div className="hive-inner">

          {/* Part 1 — Header */}
          <div className="mh-page-header">
            <div>
              <div className="hive-eyebrow">My Hives</div>
              <h1 className="hive-page-title">Your spaces.</h1>
              <p className="hive-page-sub">
                Manage the Hives you own and stay connected to the ones you join.
              </p>
            </div>
            <Link to="/create-hive" className="mh-create-btn">+ Create a Hive</Link>
          </div>

          {/* Part 1 — Summary strip */}
          {!loading && (
            <SummaryStrip
              hives={hives}
              pending={reqsLoading ? 0 : pendingTotal}
            />
          )}

          {/* Part 2 — Attention strip */}
          {!reqsLoading && <AttentionStrip reqs={incomingReqs} />}

          {/* Part 3 — Hive grid */}
          {loading ? (
            <SkeletonGrid />
          ) : (
            <div className="mh-grid">
              {hives.map(hive => (
                <HiveCard
                  key={hive.hive_id}
                  hive={hive}
                  pendingForHive={pendingByHive[hive.hive_id] ?? 0}
                />
              ))}
            </div>
          )}

          {/* Part 4 — Grow banner */}
          <div className="mh-grow-banner">
            <span className="mh-grow-text">
              Find another community that fits your goals.
            </span>
            <div className="mh-grow-actions">
              <Link to="/find-your-hive" className="mh-grow-explore">Explore Hives</Link>
              <Link to="/create-hive"    className="mh-grow-create">+ Create a Hive</Link>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
