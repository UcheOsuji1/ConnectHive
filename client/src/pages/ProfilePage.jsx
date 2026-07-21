import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar.jsx';
import { getInitials } from '../lib/initials.js';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/profile.css';

// ── Category hex tile ────────────────────────────────────────────────────────

const CAT_CONFIG = {
  'Social Groups':           { color: '#5dcaa5', icon: '👥' },
  'Professional Networking': { color: '#c49a28', icon: '💼' },
  'Travel Buddies':          { color: '#4db6c4', icon: '✈️' },
  'Project Collaboration':   { color: '#f08a4b', icon: '🚀' },
  'Event Buddies':           { color: '#e86a7c', icon: '🎟️' },
  'Specialized Groups':      { color: '#a59ae8', icon: '⭐' },
};

function HexTile({ categoryName, size = 32, muted = false }) {
  const cfg = CAT_CONFIG[categoryName] ?? { color: '#8a8070', icon: '✦' };
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, opacity: muted ? 0.5 : 1 }}>
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

// ── Label maps ───────────────────────────────────────────────────────────────

const PURPOSE_LABELS = {
  social:       '👥 Social Groups',
  professional: '💼 Professional',
  travel:       '✈️ Travel Buddies',
  project:      '🚀 Project Collab',
  events:       '🎟️ Event Buddies',
  specialized:  '⭐ Specialized',
};

const GOAL_LABELS = {
  goals:     '🎯 Shared Goals',
  vibes:     '😂 Good Vibes & Fun',
  growth:    '🌱 Personal Growth',
  account:   '🤝 Real Accountability',
  diversity: '🌍 Diversity of Thought',
  action:    '⚡ Action & Results',
};

const ENERGY_LABELS = {
  introvert: 'Mostly Introverted',
  extrovert: 'Mostly Extroverted',
  ambivert:  'Ambivert',
  online:    'Online Preferred',
};

const COMM_LABELS = {
  always:   'Always in the chat',
  regular:  'Check in regularly',
  matters:  'When it matters',
  inperson: 'In-person over text',
};

const ROLE_LABELS = {
  organizer:  'The Organizer',
  idea:       'The Idea Person',
  builder:    'The Builder',
  connector:  'The Connector',
  researcher: 'The Researcher',
  wildcard:   'The Wildcard',
};

const SIZE_LABELS = {
  s: 'Small (3–5)',
  m: 'Medium (6–10)',
  l: 'Large (11+)',
  a: 'No Preference',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [profile,         setProfile]         = useState(undefined); // undefined = loading
  const [error,           setError]           = useState(null);
  const [hives,           setHives]           = useState([]);
  const [hivesLoading,    setHivesLoading]    = useState(true);
  const [requests,        setRequests]        = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  useEffect(() => {
    if (id) return;
    api.get('/api/users/profile')
      .then(data => setProfile(data.profile))
      .catch(err  => setError(err.data?.error ?? 'Failed to load profile.'));
    api.get('/api/hives/mine')
      .then(data => setHives(data.hives ?? []))
      .catch(() => setHives([]))
      .finally(() => setHivesLoading(false));
    api.get('/api/hives/requests/mine')
      .then(data => setRequests(data.requests ?? []))
      .catch(() => setRequests([]))
      .finally(() => setRequestsLoading(false));
  }, [id]);

  // ── Member view (not yet built — keep placeholder) ─────────────────────────
  if (id) {
    return (
      <>
        <Navbar />
        <div className="page-placeholder">
          <div className="page-placeholder-inner">
            <div className="page-placeholder-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M20 21a8 8 0 1 0-16 0"/>
              </svg>
            </div>
            <span className="label" style={{ justifyContent: 'center' }}>Member Profile</span>
            <h1>Member Profile</h1>
            <p>View this member&apos;s interests, Hive history, compatibility scores, and shared connections.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/home" className="btn btn-ghost">Home Feed</Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Own-profile derived values ─────────────────────────────────────────────
  const fullName    = profile?.full_name || user?.fullName || getInitials(null, user?.email) || 'You';
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  const completeness  = profile ? computeCompleteness(profile) : 0;
  const sp            = obj(profile?.social_preferences);
  const purposeArr    = arr(profile?.connection_purposes);
  const interestArr   = arr(profile?.interests);
  const skillArr      = arr(profile?.skills);
  const goalArr       = arr(profile?.goals);
  const locationLine  = [profile?.location, profile?.school_company].filter(Boolean).join(' · ');

  const sevenDaysAgo    = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const pendingRequests = requests.filter(r => r.status === 'pending');
  const rejectedRecent  = requests.filter(r =>
    r.status === 'rejected' &&
    new Date(r.reviewed_at || r.requested_at).getTime() > sevenDaysAgo,
  );

  const styleParts = [
    sp.socialEnergy ? ENERGY_LABELS[sp.socialEnergy] : null,
    sp.commStyle    ? COMM_LABELS[sp.commStyle]       : null,
    sp.energyLevel != null ? `Energy ${sp.energyLevel}/10` : null,
  ].filter(Boolean);

  const prefRows = [
    { label: 'Availability', value: arr(profile?.availability).join(' · ') },
    { label: 'Group size',   value: SIZE_LABELS[profile?.group_size_preference] || profile?.group_size_preference },
    { label: 'Connection',   value: ROLE_LABELS[profile?.connection_preference] || profile?.connection_preference },
    { label: 'Style',        value: styleParts.join(' · ') },
  ].filter(r => r.value);

  return (
    <>
      <Navbar />
      <div className="prof-page">
        <div className="prof-inner">

          {/* ── Page title ── */}
          <div className="prof-title-block">
            <span className="prof-eyebrow">Account</span>
            <h1 className="prof-h1">My Profile</h1>
          </div>

          {/* ── Loading ── */}
          {profile === undefined && !error && (
            <div className="prof-state-card">Loading your profile…</div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="prof-state-card prof-state-error">{error}</div>
          )}

          {/* ── No profile yet ── */}
          {!error && profile === null && (
            <div className="prof-state-card prof-state-empty">
              <p className="prof-state-msg">Your profile isn&apos;t set up yet.</p>
              <p className="prof-state-sub">Complete your questionnaire so we can find your perfect Hives.</p>
              <Link to="/profile-setup" className="btn btn-primary" style={{ marginTop: '16px' }}>
                Complete your profile
              </Link>
            </div>
          )}

          {/* ── Persona layout ── */}
          {profile && (
            <>
              {/* 1 ── HERO card */}
              <div className="prof-card prof-hero-card">
                <div className="prof-cover" />
                <div className="prof-hero-body">
                  <div className="prof-hero-row">
                    <div className="prof-avatar-ring">
                      <Avatar
                        name={fullName}
                        email={user?.email}
                        src={profile.profile_photo_url}
                        size={92}
                      />
                    </div>
                    <Link to="/profile/edit" className="prof-edit-btn">Edit Profile</Link>
                  </div>
                  <div className="prof-hero-name">{fullName}</div>
                  {locationLine && <div className="prof-hero-location">{locationLine}</div>}
                  <div className="prof-badge-row">
                    {user?.memberId && (
                      <span className="prof-badge prof-badge-gold">{user.memberId}</span>
                    )}
                    {memberSince && (
                      <span className="prof-badge">Member since {memberSince}</span>
                    )}
                  </div>
                  {completeness === 100 ? (
                    <div className="prof-complete-pill">✓ Profile Complete</div>
                  ) : (
                    <div className="prof-meter-wrap">
                      <div className="prof-meter-track">
                        <div className="prof-meter-fill" style={{ width: `${completeness}%` }} />
                      </div>
                      <span className="prof-meter-label">
                        Profile {completeness}% complete — add more to improve your matches.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 2 ── BIO */}
              {profile.bio && (
                <div className="prof-card">
                  <div className="prof-section-label">Bio</div>
                  <p className="prof-bio">{profile.bio}</p>
                </div>
              )}

              {/* 3 ── CONNECTION PURPOSES */}
              {purposeArr.length > 0 && (
                <div className="prof-card">
                  <div className="prof-section-label">Looking for</div>
                  <div className="prof-chips">
                    {purposeArr.map(k => (
                      <span key={k} className="ch-gchip">{PURPOSE_LABELS[k] || k}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 4 ── INTERESTS */}
              {interestArr.length > 0 && (
                <div className="prof-card">
                  <div className="prof-section-label">Interests</div>
                  <div className="prof-chips">
                    {interestArr.map((chip, i) => (
                      <span key={chip + i} className="ch-chip">{chip}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 5 ── SKILLS + GOALS (2-col) */}
              {(skillArr.length > 0 || goalArr.length > 0) && (
                <div className="prof-2col">
                  {skillArr.length > 0 && (
                    <div className="prof-card">
                      <div className="prof-section-label">Skills</div>
                      <div className="prof-chips">
                        {skillArr.map((chip, i) => (
                          <span key={chip + i} className="ch-chip">{chip}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {goalArr.length > 0 && (
                    <div className="prof-card">
                      <div className="prof-section-label">What matters most</div>
                      <div className="prof-chips">
                        {goalArr.map(k => (
                          <span key={k} className="ch-gchip">{GOAL_LABELS[k] || k}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 6 ── AVAILABILITY & PREFERENCES */}
              {prefRows.length > 0 && (
                <div className="prof-card">
                  <div className="prof-section-label">Availability &amp; Preferences</div>
                  <dl className="prof-pref-grid">
                    {prefRows.map(({ label, value }) => (
                      <div key={label} className="prof-pref-row">
                        <dt className="prof-pref-label">{label}</dt>
                        <dd className="prof-pref-value">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {/* 7 ── MY HIVES */}
              <div className="prof-card">
                <div className="prof-section-label">My Hives</div>

                {(hivesLoading || requestsLoading) ? (
                  <p className="prof-hives-loading">Loading…</p>
                ) : hives.length === 0 && pendingRequests.length === 0 && rejectedRecent.length === 0 ? (
                  <div className="prof-hives-empty">
                    <span className="prof-hives-icon">
                      <svg width="40" height="40" viewBox="0 0 120 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <polygon points="60,2 88,18 88,48 60,64 32,48 32,18"     stroke="#c49a28" strokeWidth="7" strokeLinejoin="round" opacity="0.35"/>
                        <polygon points="32,46 60,62 60,92 32,108 4,92 4,62"     stroke="#c49a28" strokeWidth="7" strokeLinejoin="round" opacity="0.55"/>
                        <polygon points="88,46 116,62 116,92 88,108 60,92 60,62" stroke="#c49a28" strokeWidth="7" strokeLinejoin="round" opacity="0.55"/>
                      </svg>
                    </span>
                    <p className="prof-hives-msg">No Hives yet</p>
                    <p className="prof-hives-sub">Your Hives will show here once you join or found one.</p>
                    <Link to="/find-your-hive" className="prof-hives-cta">Find Your Hive →</Link>
                  </div>
                ) : (
                  <div className="prof-hives-list">
                    {hives.map(hive => (
                      <Link key={hive.hive_id} to={`/hive/${hive.hive_id}`} className="prof-hive-row">
                        <HexTile categoryName={hive.category_name} size={32} />
                        <div className="prof-hive-info">
                          <div className="prof-hive-name">{hive.hive_name}</div>
                          <div className="prof-hive-meta">
                            {[hive.category_name, hive.role].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </Link>
                    ))}

                    {pendingRequests.map(req => (
                      <Link key={req.request_id} to={`/hive/${req.hive_id}`} className="prof-hive-row prof-hive-row-muted">
                        <HexTile categoryName={req.category_name} size={32} muted />
                        <div className="prof-hive-info">
                          <div className="prof-hive-name">{req.hive_name}</div>
                          {req.category_name && (
                            <div className="prof-hive-meta">{req.category_name}</div>
                          )}
                        </div>
                        <span className="prof-pending-pill">Request pending</span>
                      </Link>
                    ))}

                    {rejectedRecent.map(req => (
                      <div key={req.request_id} className="prof-hive-row prof-hive-row-muted">
                        <HexTile categoryName={req.category_name} size={32} muted />
                        <div className="prof-hive-info">
                          <div className="prof-hive-name">{req.hive_name}</div>
                          {req.category_name && (
                            <div className="prof-hive-meta">{req.category_name}</div>
                          )}
                        </div>
                        <span className="prof-rejected-pill">Not accepted</span>
                      </div>
                    ))}

                    {hives.length === 0 && pendingRequests.length > 0 && (
                      <p className="prof-hives-pending-sub">
                        Your Hives will appear here once you&apos;re accepted.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </>
  );
}
