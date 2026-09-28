import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar.jsx';
import HoneycombBg from '../components/HoneycombBg.jsx';
import { api } from '../lib/api.js';
import '../styles/profile.css';
import '../styles/memberprofile.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function arr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

function obj(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v) || {}; } catch { return {}; } }
  return {};
}

// Emoji is stripped everywhere chips are rendered, per the Prompt 37 rule.
function stripEmoji(str) {
  return String(str).replace(/^[\p{Emoji_Presentation}\p{Emoji}️‍]+\s*/u, '').trim();
}

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const GROUP_SIZE = { s: 'Small groups (3–10)', m: 'Medium groups (11–30)', l: 'Large groups (30+)' };
const CONNECTION = { idea: 'Idea partners', accountability: 'Accountability', social: 'Social first', mentor: 'Mentorship' };

// ── Icons ─────────────────────────────────────────────────────────────────────

const PeopleIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const PinIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const ClockIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const LockIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

// ── Compatibility card ────────────────────────────────────────────────────────

const FACTOR_LABELS = {
  interests:    'Interests',
  goals:        'Goals',
  availability: 'Availability',
  personality:  'Personality',
  age:          'Age range',
};

function CompatibilityCard({ compat, name }) {
  if (!compat) return null;

  // A sparse profile still scores ~13 because personality and age fall back to
  // a flat 50. Showing that as a percentage would read as signal, so it doesn't.
  if (!compat.enoughData) {
    return (
      <div className="pf-card mp-compat mp-compat--thin reveal">
        <div className="mp-compat-head">
          <div className="pf-card-title">Compatibility</div>
        </div>
        <div className="mp-thin-body">
          <div className="mp-thin-icon" aria-hidden="true"><PeopleIcon size={22} /></div>
          <div>
            <div className="mp-thin-title">Not enough profile data yet</div>
            <p className="mp-thin-sub">
              A score needs interests or goals on both sides. Once
              {name ? ` ${name.split(' ')[0]}` : ' they'} and you have both filled
              those in, the match will appear here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { total, factors, sharedInterests, sharedSkills } = compat;

  return (
    <div className="pf-card mp-compat reveal">
      <div className="mp-compat-head">
        <div className="pf-card-title">Compatibility</div>
        <span className="mp-compat-src">Same score used across TrueHive</span>
      </div>

      <div className="mp-compat-body">
        <div className="mp-score">
          <div className="mp-score-num">{total}<span>%</span></div>
          <div className="mp-score-label">match with you</div>
        </div>

        <ul className="mp-factors" role="list">
          {Object.entries(FACTOR_LABELS).map(([k, label]) => (
            <li key={k} className="mp-factor">
              <div className="mp-factor-top">
                <span>{label}</span>
                <span className="mp-factor-val">{Math.round(factors[k] ?? 0)}</span>
              </div>
              <div className="mp-bar" aria-hidden="true">
                <div className="mp-bar-fill" style={{ width: `${Math.max(0, Math.min(100, factors[k] ?? 0))}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Literal readout of what the score is based on — no generated prose. */}
      {(sharedInterests.length > 0 || sharedSkills.length > 0) && (
        <div className="mp-shared">
          {sharedInterests.length > 0 && (
            <div className="mp-shared-row">
              <div className="mp-shared-label">
                Interests you both listed ({sharedInterests.length})
              </div>
              <div className="pf-chips" role="list">
                {sharedInterests.slice(0, 8).map((c, i) => (
                  <span key={i} className="pf-chip" role="listitem">{stripEmoji(c)}</span>
                ))}
              </div>
            </div>
          )}
          {sharedSkills.length > 0 && (
            <div className="mp-shared-row">
              <div className="mp-shared-label">
                Skills you both listed ({sharedSkills.length})
              </div>
              <div className="pf-chips" role="list">
                {sharedSkills.slice(0, 8).map((c, i) => (
                  <span key={i} className="pf-chip" role="listitem">{stripEmoji(c)}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MemberProfilePage() {
  const { id } = useParams();
  const [data,     setData]     = useState(undefined);
  const [activity, setActivity] = useState([]);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    if (!id) return;
    setData(undefined); setError(null);
    api.get(`/api/users/${id}/profile`)
      .then(setData)
      .catch(e => setError(e?.data?.error ?? 'Failed to load this member.'));
    api.get(`/api/users/${id}/activity`)
      .then(d => setActivity(d.activity ?? []))
      .catch(() => setActivity([]));
  }, [id]);

  useEffect(() => {
    if (!data) return;
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rm) { document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [data]);

  if (error) {
    return (
      <>
        <Navbar />
        <div className="mp-state"><p>{error}</p><Link to="/home" className="mp-state-btn">Home</Link></div>
      </>
    );
  }
  if (data === undefined) {
    return (<><Navbar /><div className="mp-state"><p>Loading…</p></div></>);
  }

  const { profile: p, compatibility, sharedHives, hiveHistory } = data;
  const interests = arr(p.interests);
  const skills    = arr(p.skills);
  const goals     = arr(p.goals);
  const avail     = arr(p.availability);
  const purposes  = arr(p.connection_purposes);
  const social    = obj(p.social_preferences);
  const lastSeen  = timeAgo(p.last_login);
  const firstName = p.full_name?.split(' ')[0] ?? 'This member';

  return (
    <>
      <Navbar />
      <div className="prof-page">
        <div className="mp-wrap">

          {/* ── Identity ─────────────────────────────────────────────── */}
          <div className="pf-card prof-hero">
            <div className="prof-cover">
              <HoneycombBg className="prof-cover-hc" id="mp-cover" />
            </div>
            <div className="prof-avatar-wrap">
              <Avatar name={p.full_name} src={p.profile_photo_url} size={130} className="prof-avatar" />
            </div>
            <div className="prof-hero-body">
              <h1 className="prof-name">{p.full_name ?? 'Member'}</h1>
              <div className="mp-meta">
                {p.location && <span><PinIcon /> {p.location}</span>}
                {p.school_company && <span>{p.school_company}</span>}
                {lastSeen && <span><ClockIcon /> Active {lastSeen}</span>}
              </div>
              {p.bio && <p className="prof-bio">{p.bio}</p>}

              {interests.length > 0 && (
                <div className="pf-chips mp-hero-chips" role="list">
                  {interests.slice(0, 6).map((c, i) => (
                    <span key={i} className="pf-chip" role="listitem">{stripEmoji(c)}</span>
                  ))}
                </div>
              )}

              {/* Action is a real destination only — no Message button, because
                  no direct-message system exists. */}
              {sharedHives.length > 0 && (
                <Link to={`/hive/${sharedHives[0].hive_id}`} className="mp-cta">
                  View shared Hive →
                </Link>
              )}
            </div>
          </div>

          <div className="mp-grid">
            <div className="mp-main">
              <CompatibilityCard compat={compatibility} name={p.full_name} />

              {/* ── Shared Hives ───────────────────────────────────── */}
              <div className="pf-card reveal">
                <div className="pf-card-title">
                  Shared Hives {sharedHives.length > 0 && <span className="mp-count">{sharedHives.length}</span>}
                </div>
                {sharedHives.length === 0 ? (
                  <p className="mp-empty">You and {firstName} aren’t in any of the same Hives yet.</p>
                ) : (
                  <ul className="mp-hive-list" role="list">
                    {sharedHives.map(h => (
                      <li key={h.hive_id}>
                        <Link to={`/hive/${h.hive_id}`} className="mp-hive-row">
                          <span className="mp-hive-thumb" aria-hidden="true">
                            {h.logo_url || h.banner_url
                              ? <img src={h.logo_url || h.banner_url} alt="" />
                              : <HoneycombBg className="mp-hive-hc" id={`mph-${h.hive_id}`} />}
                          </span>
                          <span className="mp-hive-body">
                            <span className="mp-hive-name">{h.hive_name}</span>
                            <span className="mp-hive-meta">
                              {[h.category_name, h.location_type].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── Recent activity ────────────────────────────────── */}
              <div className="pf-card reveal">
                <div className="pf-card-title">Recent Activity</div>
                {activity.length === 0 ? (
                  <p className="mp-empty">
                    Nothing {firstName} has posted is visible to you.
                  </p>
                ) : (
                  <ul className="mp-act-list" role="list">
                    {activity.map(a => (
                      <li key={a.post_id} className="mp-act">
                        <span className="mp-act-dot" aria-hidden="true" />
                        <span className="mp-act-body">
                          <span className="mp-act-head">{a.headline}</span>
                          <span className="mp-act-meta">
                            {a.hive_name} · {timeAgo(a.created_at)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* ── Right rail ──────────────────────────────────────── */}
            <div className="mp-rail">

              <div className="pf-card reveal">
                <div className="pf-card-title">Hive History</div>
                {hiveHistory.length === 0 ? (
                  <p className="mp-empty">No Hives visible to you.</p>
                ) : (
                  <ul className="mp-hist-list" role="list">
                    {hiveHistory.map(h => (
                      <li key={h.hive_id} className="mp-hist">
                        <span className="mp-hist-name">{h.hive_name}</span>
                        <span className="mp-hist-meta">
                          {h.category_name ?? 'Hive'}
                          {h.role === 'owner' ? ' · Owner' : ''}
                          {!h.discoverable && h.viewer_is_member && (
                            <span className="mp-private" title="Private Hive you are both in">
                              <LockIcon /> Private
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {(goals.length > 0 || purposes.length > 0) && (
                <div className="pf-card reveal">
                  <div className="pf-card-title">What {firstName} Is Looking For</div>
                  {purposes.length > 0 && (
                    <div className="pf-chips" role="list">
                      {purposes.map((c, i) => (
                        <span key={i} className="pf-chip" role="listitem">{stripEmoji(c)}</span>
                      ))}
                    </div>
                  )}
                  {goals.length > 0 && (
                    <div className="pf-chips" role="list" style={{ marginTop: 8 }}>
                      {goals.map((c, i) => (
                        <span key={i} className="pf-chip" role="listitem">{stripEmoji(c)}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {skills.length > 0 && (
                <div className="pf-card reveal">
                  <div className="pf-card-title">Skills</div>
                  <div className="pf-chips" role="list">
                    {skills.slice(0, 12).map((c, i) => (
                      <span key={i} className="pf-chip" role="listitem">{stripEmoji(c)}</span>
                    ))}
                  </div>
                </div>
              )}

              {(avail.length > 0 || p.group_size_preference || p.connection_preference || social.socialEnergy) && (
                <div className="pf-card reveal">
                  <div className="pf-card-title">Availability & Style</div>
                  <dl className="mp-dl">
                    {avail.length > 0 && (
                      <><dt>Available</dt><dd>{avail.map(stripEmoji).join(', ')}</dd></>
                    )}
                    {p.group_size_preference && (
                      <><dt>Group size</dt><dd>{GROUP_SIZE[p.group_size_preference] ?? p.group_size_preference}</dd></>
                    )}
                    {p.connection_preference && (
                      <><dt>Connection</dt><dd>{CONNECTION[p.connection_preference] ?? p.connection_preference}</dd></>
                    )}
                    {social.socialEnergy && (
                      <><dt>Social energy</dt><dd>{String(social.socialEnergy)}</dd></>
                    )}
                  </dl>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
