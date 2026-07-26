import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import '../styles/hive-overview.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MILESTONE_THRESHOLDS = [2, 5, 10, 25, 50, 100, 250, 500, 1000];

const ACTION_NAV   = { requests: 'requests', profiles: 'members', description: 'settings', onboarding: 'onboarding' };
const ACTION_ICONS = { requests: '📋', profiles: '👤', description: '✏️', onboarding: '🗺️' };

// ── Welcome banner ────────────────────────────────────────────────────────────
function WelcomeBanner({ post, hiveName, onWave, waved, waving, waveCount, firstName }) {
  return (
    <div className="hw-welcome-banner">
      <div className="hw-wb-header">
        <div className="hw-wb-avatar">
          {post.author_photo
            ? <img src={post.author_photo} alt="" />
            : <span>{initials(post.author_name)}</span>}
        </div>
        <div className="hw-wb-text">
          <div className="hw-wb-headline">
            <span className="hw-wb-name">{post.author_name ?? 'A new member'}</span>
            {' '}just joined {hiveName}
          </div>
          <div className="hw-wb-sub">Give them a warm welcome.</div>
        </div>
      </div>
      <div className="hw-wb-actions">
        <button
          type="button"
          className={['hw-wb-wave-btn', waved ? 'hw-wb-wave-btn--done' : ''].filter(Boolean).join(' ')}
          onClick={onWave}
          disabled={waved || waving}
        >
          {waved ? '👋 Waved!' : waving ? 'Waving…' : `Welcome ${firstName} 👋`}
        </button>
        <Link to={`/profile/${post.author_user_id}`} className="hw-wb-profile-btn">
          View profile →
        </Link>
      </div>
      {waveCount > 0 && (
        <div className="hw-wb-count">
          {waveCount} member{waveCount !== 1 ? 's' : ''} welcomed {firstName}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HiveOverview({
  hiveId, hive, isOwner,
  onRequestCount, onNavigate, onSaved,
  posts = [], postsLoading = false,
}) {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [loading,  setLoading]  = useState(isOwner);

  // Banner wave state
  const [waved,     setWaved]     = useState(false);
  const [waveCount, setWaveCount] = useState(0);
  const [waving,    setWaving]    = useState(false);
  const waveInitRef = useRef(null);

  // Per-post wave state (New Members card)
  const [userWaved, setUserWaved] = useState(new Set());

  // Org info edit state
  const [editMode,    setEditMode]    = useState(false);
  const [editValues,  setEditValues]  = useState({
    pinned_goal:   hive.pinned_goal   ?? '',
    ground_rules:  hive.ground_rules  ?? '',
    icebreaker:    hive.icebreaker    ?? '',
    cadence:       hive.cadence       ?? '',
    location_type: hive.location_type ?? '',
  });
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Welcome post detection
  const welcomePost = postsLoading ? null :
    (posts.find(p => p.post_type === 'welcome' && Date.now() - new Date(p.created_at).getTime() < WEEK_MS) ?? null);

  useEffect(() => {
    if (welcomePost && waveInitRef.current !== welcomePost.post_id) {
      waveInitRef.current = welcomePost.post_id;
      setWaved(Boolean(welcomePost.reacted));
      setWaveCount(Number(welcomePost.reaction_count ?? 0));
    }
  }, [welcomePost]);

  // Fetch overview data (owner only)
  useEffect(() => {
    if (!isOwner) return;
    setLoading(true);
    api.get(`/api/hives/${hiveId}/overview`)
      .then(d => {
        setOverview(d);
        if (onRequestCount && d.pending_count != null) onRequestCount(d.pending_count);
      })
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  }, [hiveId, isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived metrics
  const memberCount  = overview?.member_count  ?? Number(hive.member_count ?? 0);
  const maxMembers   = overview?.max_members   ?? (hive.max_members ? Number(hive.max_members) : null);
  const hiveStatus   = overview?.hive_status   ?? hive.hive_status ?? 'active';
  const spotsLeft    = maxMembers != null ? maxMembers - memberCount : null;
  const pendingCount = overview?.pending_count ?? 0;

  const showBanner = !postsLoading && welcomePost && welcomePost.author_user_id !== user?.userId;

  // Recent members: prefer welcome posts (have photos), fall back to join events
  const recentMemberPosts = useMemo(() => posts
    .filter(p => p.post_type === 'welcome')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5),
  [posts]);

  const recentJoins = useMemo(() => {
    if (!overview?.recent_activity) return [];
    return overview.recent_activity
      .filter(a => /\s+joined\s*$/i.test(a.label))
      .slice(0, 5)
      .map(a => ({
        name: a.label.replace(/\s+joined\s*$/i, '').trim(),
        timestamp: a.timestamp,
        photo: null,
        post_id: null,
        reacted: false,
      }));
  }, [overview]);

  const recentMembersList = recentMemberPosts.length > 0
    ? recentMemberPosts.map(p => ({
        name:      p.author_name,
        photo:     p.author_photo,
        userId:    p.author_user_id,
        timestamp: p.created_at,
        post_id:   p.post_id,
        reacted:   Boolean(p.reacted),
      }))
    : recentJoins;

  // Milestone: highest threshold reached
  const milestone = [...MILESTONE_THRESHOLDS].reverse().find(t => memberCount >= t) ?? null;

  // Action items: API items + synthetic 'description' if hive has no info at all
  const allActionItems = useMemo(() => {
    if (!overview) return [];
    const items = [...overview.action_items];
    const hasDesc = hive.pinned_goal || hive.ground_rules || hive.icebreaker || hive.description;
    if (!hasDesc) {
      items.push({ type: 'description', count: null, label: 'Add a description to your Hive' });
    }
    return items;
  }, [overview, hive]);

  // Handlers
  async function handleWave() {
    if (!welcomePost || waved || waving) return;
    setWaving(true);
    try {
      const result = await api.post(`/api/posts/${welcomePost.post_id}/react`, { reaction: 'wave' });
      setWaved(result.reacted);
      setWaveCount(result.reaction_count);
    } catch {}
    setWaving(false);
  }

  async function handleWaveMember(postId) {
    if (!postId || userWaved.has(postId)) return;
    try {
      await api.post(`/api/posts/${postId}/react`, { reaction: 'wave' });
      setUserWaved(prev => new Set([...prev, postId]));
    } catch {}
  }

  async function handleSave() {
    setSaving(true); setSaveError(null); setSaveSuccess(false);
    try {
      const result = await api.patch(`/api/hives/${hiveId}`, editValues);
      setEditMode(false);
      setSaveSuccess(true);
      if (onSaved) onSaved(result.hive);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.data?.error ?? 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditValues({
      pinned_goal:   hive.pinned_goal   ?? '',
      ground_rules:  hive.ground_rules  ?? '',
      icebreaker:    hive.icebreaker    ?? '',
      cadence:       hive.cadence       ?? '',
      location_type: hive.location_type ?? '',
    });
    setEditMode(false);
    setSaveError(null);
  }

  const statusLabel = hiveStatus.charAt(0).toUpperCase() + hiveStatus.slice(1);

  return (
    <div className="hw-overview">

      {/* ── Welcome banner ── */}
      {showBanner && (
        <WelcomeBanner
          post={welcomePost}
          hiveName={hive.hive_name}
          onWave={handleWave}
          waved={waved}
          waving={waving}
          waveCount={waveCount}
          firstName={welcomePost.author_name?.split(' ')[0] ?? 'them'}
        />
      )}

      {/* ── Heading ── */}
      <div className="hw-ov2-heading">
        <h2 className="hw-ov2-title">Overview</h2>
        <p className="hw-ov2-sub">
          {isOwner ? "Here's what needs your attention." : "Here's what's happening."}
        </p>
      </div>

      {/* ── Metrics row ── */}
      <div className="hw-ov2-metrics">

        <div className="hw-ov2-metric">
          <div className="hw-ov2-metric-top">
            <span className="hw-ov2-metric-label">Members</span>
            <span className="hw-ov2-metric-icon">👥</span>
          </div>
          <div className="hw-ov2-metric-value">
            {maxMembers != null ? `${memberCount}/${maxMembers}` : memberCount}
          </div>
        </div>

        {isOwner && (
          <div className={['hw-ov2-metric hw-ov2-metric--pending', pendingCount > 0 ? 'hw-ov2-metric--alert' : ''].filter(Boolean).join(' ')}>
            <div className="hw-ov2-metric-top">
              <span className="hw-ov2-metric-label">Pending</span>
              <span className="hw-ov2-metric-icon">🕐</span>
            </div>
            <div className="hw-ov2-metric-value">{pendingCount}</div>
          </div>
        )}

        {spotsLeft != null && (
          <div className="hw-ov2-metric">
            <div className="hw-ov2-metric-top">
              <span className="hw-ov2-metric-label">Spots Left</span>
              <span className="hw-ov2-metric-icon">🎫</span>
            </div>
            <div className="hw-ov2-metric-value">{spotsLeft}</div>
          </div>
        )}

        <div className="hw-ov2-metric hw-ov2-metric--status">
          <div className="hw-ov2-metric-top">
            <span className="hw-ov2-metric-label">Status</span>
            <span className="hw-ov2-metric-icon">●</span>
          </div>
          <div className="hw-ov2-metric-value">{statusLabel}</div>
        </div>

      </div>

      {/* ── Two-column body (owner + data loaded) ── */}
      {isOwner && !loading && overview && (
        <div className="hw-ov2-body">

          {/* Left: Action Center + Recent Activity */}
          <div className="hw-ov2-left">

            {/* Action Center */}
            <div className="hw-ov2-card">
              <div className="hw-ov2-card-header">
                <div className="hw-ov2-card-label">Action Center</div>
              </div>
              <div className="hw-ov2-card-body">
                {allActionItems.length > 0 ? (
                  allActionItems.map(item => {
                    const dest = ACTION_NAV[item.type];
                    return (
                      <button
                        key={item.type}
                        type="button"
                        className="hw-ov2-action-row"
                        onClick={() => dest && onNavigate(dest)}
                        style={{ cursor: dest ? 'pointer' : 'default' }}
                      >
                        <span className="hw-ov2-action-icon">
                          {ACTION_ICONS[item.type] ?? '→'}
                        </span>
                        <span className="hw-ov2-action-text">
                          {item.count != null ? `${item.count} ` : ''}{item.label}
                        </span>
                        {dest && <span className="hw-ov2-action-arrow">→</span>}
                      </button>
                    );
                  })
                ) : (
                  <div className="hw-ov2-empty">You're all caught up.</div>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            {overview.recent_activity?.length > 0 && (
              <div className="hw-ov2-card">
                <div className="hw-ov2-card-header">
                  <div className="hw-ov2-card-label">Recent Activity</div>
                </div>
                <div className="hw-ov2-card-body" style={{ gap: 0, padding: '8px 20px 14px' }}>
                  {overview.recent_activity.map((item, i) => (
                    <div key={i} className="hw-ov2-activity-row">
                      <span className="hw-ov2-activity-icon">
                        {/posted/i.test(item.label) ? '📝' : '👤'}
                      </span>
                      <span className="hw-ov2-activity-label">{item.label}</span>
                      <span className="hw-ov2-activity-time">{timeAgo(item.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Right: New Members + Milestone */}
          <div className="hw-ov2-right">

            {/* New Members */}
            {recentMembersList.length > 0 && (
              <div className="hw-ov2-card">
                <div className="hw-ov2-card-header">
                  <div className="hw-ov2-card-label">New Members</div>
                </div>
                <div className="hw-ov2-card-body" style={{ gap: 0, padding: '8px 20px 14px' }}>
                  {recentMembersList.map((m, i) => {
                    const hasWaved = m.reacted || userWaved.has(m.post_id);
                    return (
                      <div key={i} className="hw-ov2-member-row">
                        <div className="hw-ov2-member-avatar">
                          {m.photo
                            ? <img src={m.photo} alt="" />
                            : initials(m.name)}
                        </div>
                        <div className="hw-ov2-member-info">
                          <div className="hw-ov2-member-name">{m.name}</div>
                          <div className="hw-ov2-member-time">Joined {timeAgo(m.timestamp)}</div>
                        </div>
                        {m.post_id && (
                          <button
                            type="button"
                            className="hw-ov2-wave-btn"
                            disabled={hasWaved}
                            onClick={() => handleWaveMember(m.post_id)}
                            title={hasWaved ? 'Already waved!' : 'Send a wave'}
                          >
                            {hasWaved ? '👋' : '👋 Wave'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Milestone */}
            {milestone != null && (
              <div className="hw-ov2-milestone">
                <div className="hw-ov2-ms-icon">🏆</div>
                <div className="hw-ov2-ms-body">
                  <div className="hw-ov2-ms-label">Milestone</div>
                  <div className="hw-ov2-ms-title">
                    Reached {milestone} member{milestone !== 1 ? 's' : ''}
                  </div>
                  <div className="hw-ov2-ms-sub">Your Hive is growing.</div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Hive Details (org info) — below main body ── */}
      <div className="hw-ov2-org-card">
        <div className="hw-ov2-org-header">
          <div className="hw-ov2-card-label">Hive Details</div>
          {isOwner && !editMode && (
            <button type="button" className="hw-org-edit-btn" onClick={() => setEditMode(true)}>
              Edit
            </button>
          )}
        </div>
        <div className="hw-ov2-org-body">
          {editMode ? (
            <div className="hw-org-edit-form">
              {[
                { key: 'pinned_goal',   label: 'Pinned Goal',   placeholder: 'What is this Hive working toward?' },
                { key: 'ground_rules',  label: 'Ground Rules',  placeholder: 'How members should interact…' },
                { key: 'icebreaker',    label: 'Icebreaker',    placeholder: 'A question to get members talking…' },
                { key: 'cadence',       label: 'Meets',         placeholder: 'e.g. Weekly, Monthly…' },
                { key: 'location_type', label: 'Location type', placeholder: 'online / in-person / hybrid' },
              ].map(field => (
                <div key={field.key} className="hw-org-field">
                  <label className="hw-org-field-label">{field.label}</label>
                  <input
                    type="text"
                    className="hw-org-input"
                    value={editValues[field.key]}
                    placeholder={field.placeholder}
                    onChange={e => setEditValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  />
                </div>
              ))}
              {saveError && <div className="hw-org-save-error">{saveError}</div>}
              <div className="hw-org-form-actions">
                <button type="button" className="hw-org-cancel-btn" onClick={handleCancel} disabled={saving}>Cancel</button>
                <button type="button" className="hw-org-save-btn"   onClick={handleSave}   disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="hw-org-fields-read">
              {[
                { label: 'Pinned Goal',  value: hive.pinned_goal },
                { label: 'Ground Rules', value: hive.ground_rules },
                { label: 'Icebreaker',   value: hive.icebreaker },
                { label: 'Meets',        value: [hive.cadence, hive.location_type].filter(Boolean).join(' · ') || null },
              ].filter(f => f.value).map(f => (
                <div key={f.label} className="hw-org-field-read">
                  <div className="hw-org-field-label">{f.label}</div>
                  <div className="hw-org-field-value">{f.value}</div>
                </div>
              ))}
              {!hive.pinned_goal && !hive.ground_rules && !hive.icebreaker && !hive.cadence && (
                <div className="hw-org-empty">
                  {isOwner ? 'No details yet — click Edit to add.' : 'No details added yet.'}
                </div>
              )}
              {saveSuccess && <div className="hw-org-save-success">Saved!</div>}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
