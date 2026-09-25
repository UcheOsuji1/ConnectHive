import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar.jsx';
import { getInitials } from '../lib/initials.js';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { INTEREST_CATS } from '../data/interestTaxonomy.js';
import '../styles/profile.css';

// ── Reverse lookup: chip string → INTEREST_CAT ───────────────────────────────
const chipToCat = {};
INTEREST_CATS.forEach(cat => cat.chips.forEach(chip => { chipToCat[chip] = cat; }));

function groupInterests(arr) {
  const groups = {};
  arr.forEach(chip => {
    const cat = chipToCat[chip];
    if (cat) {
      if (!groups[cat.key]) groups[cat.key] = { ...cat, selected: [] };
      groups[cat.key].selected.push(chip);
    }
  });
  return Object.values(groups);
}

function stripEmoji(str) {
  return str.replace(/^[\p{Emoji_Presentation}\p{Emoji}️‍]+\s*/u, '').trim();
}

function relativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const w = Math.floor(d / 7);
  if (w >= 52) return `${Math.floor(w / 52)} year${Math.floor(w / 52) > 1 ? 's' : ''} ago`;
  if (w > 0) return `${w} week${w > 1 ? 's' : ''} ago`;
  if (d > 0) return `${d} day${d > 1 ? 's' : ''} ago`;
  if (h > 0) return `${h} hour${h > 1 ? 's' : ''} ago`;
  if (m > 0) return `${m} minute${m > 1 ? 's' : ''} ago`;
  return 'just now';
}

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

// ── Constants ────────────────────────────────────────────────────────────────

const PURPOSE_DATA = {
  social:       { name: 'Social Groups',           desc: 'Find my community',              icon: PeopleIcon    },
  professional: { name: 'Professional Networking', desc: 'Meet talented, like-minded people', icon: BriefcaseIcon },
  travel:       { name: 'Travel Buddies',          desc: 'Find people to explore with',    icon: PlaneIcon     },
  project:      { name: 'Project Collaboration',   desc: 'Build and create together',      icon: RocketIcon    },
  events:       { name: 'Event Buddies',           desc: 'Attend shows & gatherings',      icon: TicketIcon    },
  specialized:  { name: 'Specialized Groups',      desc: 'Niche groups for specific goals', icon: StarIcon      },
};

const MATTERS_DATA = {
  goals:     { name: 'Shared Goals',          emoji: '🎯' },
  vibes:     { name: 'Good Vibes & Fun',      emoji: '😂' },
  growth:    { name: 'Learning & Growth',     emoji: '🌱' },
  account:   { name: 'Real Accountability',   emoji: '🤝' },
  diversity: { name: 'Diversity of Thought',  emoji: '🌍' },
  action:    { name: 'Action & Results',      emoji: '⚡' },
};

const SIZE_LABELS = { s: 'Small (3–5)', m: 'Medium (6–10)', l: 'Large (11+)', a: 'No Preference' };
const ENERGY_LABELS = { introvert: 'Mostly Introverted', extrovert: 'Mostly Extroverted', ambivert: 'Ambivert', online: 'Online Preferred' };
const COMM_LABELS   = { always: 'Always in the chat', regular: 'Check in regularly', matters: 'When it matters', inperson: 'In-person over text' };
const ROLE_LABELS   = { organizer: 'The Organizer', idea: 'The Idea Person', builder: 'The Builder', connector: 'The Connector', researcher: 'The Researcher', wildcard: 'The Wildcard' };

// ── Inline SVG icons ─────────────────────────────────────────────────────────

function PeopleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function BriefcaseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="12"/>
    </svg>
  );
}
function PlaneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    </svg>
  );
}
function RocketIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
    </svg>
  );
}
function TicketIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
    </svg>
  );
}
function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}
function ChevronRight({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

// Honeycomb SVG background — rendered into cover and rail cards
function HoneycombBg({ className = 'hc-bg' }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <pattern id="hc-pat" x="0" y="0" width="34.64" height="60" patternUnits="userSpaceOnUse">
          <polygon points="17.32,2 32.64,11 32.64,29 17.32,38 2,29 2,11"
            fill="none" stroke="#c49a28" strokeWidth="1.5"/>
          <polygon points="0,29 15.32,38 15.32,56 0,65 -15.32,56 -15.32,38"
            fill="none" stroke="#c49a28" strokeWidth="1.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hc-pat)"/>
    </svg>
  );
}

// Curved SVG divider between cover and card body
function CurveDivider() {
  return (
    <svg className="prof-curve" viewBox="0 0 1200 56" preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M0,56 L0,32 Q180,4 360,20 Q600,42 800,12 Q1020,2 1200,24 L1200,56 Z" fill="#fff"/>
    </svg>
  );
}

// ── Journey tile derivations ──────────────────────────────────────────────────

function journeyTiles(hives, profile, interestCount) {
  const completeness = profile ? computeCompleteness(profile) : 0;
  const purposes = arr(profile?.connection_purposes);
  const firstPurpose = purposes[0] ? (PURPOSE_DATA[purposes[0]]?.name ?? purposes[0]) : null;

  let potential = 'Building';
  if (completeness === 100 && interestCount >= 5) potential = 'High';
  else if (completeness >= 70 || interestCount >= 3) potential = 'Medium';

  return [
    {
      value: String(hives.length || '0'),
      label: hives.length === 1 ? 'Active Hive' : 'Active Hives',
      sub: hives.length === 1 ? 'You own 1 hive' : `You're in ${hives.length} hives`,
      Icon: PeopleIcon,
    },
    {
      value: firstPurpose ?? '—',
      label: 'Your Focus',
      sub: 'What you selected at signup',
      Icon: StarIcon,
    },
    {
      value: completeness === 100 ? 'Ready' : `${completeness}%`,
      label: 'For Discovery',
      sub: completeness === 100 ? 'Your profile is complete' : 'Complete your profile',
      Icon: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
      ),
    },
    {
      value: potential,
      label: 'Connection Potential',
      sub: interestCount > 0 ? `${interestCount} interests tagged` : 'Add interests to improve',
      Icon: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      ),
    },
  ];
}

// ── Activity icons ────────────────────────────────────────────────────────────

function activityIcon(type) {
  if (type === 'hive') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
  if (type === 'profile') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
  // joined
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  );
}

// ── Member placeholder (for /profile/:id) ────────────────────────────────────

function MemberPlaceholder() {
  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 480, margin: '120px auto', padding: '0 24px', textAlign: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(196,154,40,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#c49a28' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>
          </svg>
        </div>
        <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1e1b18', marginBottom: 6 }}>Member Profile</p>
        <p style={{ fontSize: 13, color: '#8a7a5e', marginBottom: 20 }}>View this member's interests, Hive history, compatibility scores, and shared connections.</p>
        <Link to="/home" style={{ display: 'inline-block', padding: '10px 22px', background: 'rgba(196,154,40,.12)', borderRadius: 50, fontSize: 13, fontWeight: 600, color: '#c49a28', textDecoration: 'none' }}>Home Feed</Link>
      </div>
    </>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [profile,     setProfile]     = useState(undefined);
  const [hives,       setHives]       = useState([]);
  const [activity,    setActivity]    = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [error,       setError]       = useState(null);

  const pageRef = useRef(null);

  // Fetch data
  useEffect(() => {
    if (id) return;
    Promise.all([
      api.get('/api/users/profile').then(d => setProfile(d.profile)).catch(() => setProfile(null)),
      api.get('/api/hives/mine').then(d => setHives(d.hives ?? [])).catch(() => setHives([])),
      api.get('/api/users/activity').then(d => setActivity(d.activity ?? [])).catch(() => setActivity([])),
      api.get('/api/users/suggestions').then(d => setSuggestions(d.suggestions ?? [])).catch(() => setSuggestions([])),
    ]).catch(err => setError(err?.data?.error ?? 'Failed to load profile.'));
  }, [id]);

  // Scroll-reveal observer (not for hero — it's above the fold)
  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rm) {
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
      return;
    }
    const els = pageRef.current?.querySelectorAll('.reveal') ?? [];
    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.1, rootMargin: '0px 0px -32px 0px' },
    );
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [profile, hives, activity]);

  if (id) return <MemberPlaceholder />;

  // ── Derived values ────────────────────────────────────────────────────────

  const fullName    = profile?.full_name || user?.fullName || getInitials(null, user?.email) || 'You';
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;
  const completeness  = profile ? computeCompleteness(profile) : 0;
  const sp            = obj(profile?.social_preferences);
  const purposeKeys   = arr(profile?.connection_purposes);
  const interestArr   = arr(profile?.interests);
  const skillArr      = arr(profile?.skills);
  const goalArr       = arr(profile?.goals);
  const availArr      = arr(profile?.availability);
  const locationLine  = [profile?.location, profile?.school_company].filter(Boolean).join(' · ');
  const interestGroups = groupInterests(interestArr);
  const topInterests   = interestGroups.slice(0, 5);
  const tiles = journeyTiles(hives, profile, interestArr.length);

  const styleParts = [
    sp.socialEnergy ? ENERGY_LABELS[sp.socialEnergy] : null,
    sp.commStyle    ? COMM_LABELS[sp.commStyle]       : null,
    sp.energyLevel != null ? `Energy ${sp.energyLevel}/10` : null,
  ].filter(Boolean).join(' · ');

  // ── Loading ───────────────────────────────────────────────────────────────

  if (profile === undefined && !error) {
    return (
      <>
        <Navbar />
        <div className="prof-page">
          <div className="prof-state">
            <p className="prof-state-msg">Loading your profile…</p>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navbar />
        <div className="prof-page">
          <div className="prof-state">
            <p className="prof-state-msg">Couldn't load your profile</p>
            <p className="prof-state-sub">{error}</p>
          </div>
        </div>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Navbar />
        <div className="prof-page">
          <div className="prof-state">
            <p className="prof-state-msg">Your profile isn't set up yet.</p>
            <p className="prof-state-sub">Complete your questionnaire so we can find your perfect Hives.</p>
            <Link to="/profile-setup" style={{ display: 'inline-block', marginTop: 16, padding: '10px 22px', background: '#c49a28', color: '#fff', borderRadius: 50, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              Complete your profile
            </Link>
          </div>
        </div>
      </>
    );
  }

  // ── Full profile render ───────────────────────────────────────────────────

  return (
    <>
      <Navbar />
      <div className="prof-page" ref={pageRef}>
        <div className="prof-content">

          {/* ══ LEFT COLUMN ══ */}
          <div className="prof-left">

            {/* ── 1. HERO CARD ── */}
            <div className="pf-card prof-hero">

              {/* Cover */}
              <div className="prof-cover">
                <HoneycombBg />
                <Link to="/profile-setup" className="prof-edit-btn" aria-label="Edit Profile">
                  <EditIcon /> Edit Profile
                </Link>
                <CurveDivider />
              </div>

              {/* Floating avatar — overlaps cover/body boundary */}
              <div className="prof-avatar-wrap" role="img" aria-label={`${fullName} avatar`}>
                <Avatar
                  name={fullName}
                  email={user?.email}
                  src={profile.profile_photo_url}
                  size={122}
                  style={{ borderRadius: '50%' }}
                />
              </div>

              {/* Card body */}
              <div className="prof-hero-body">
                <div className="prof-hero-inner">

                  {/* Main column */}
                  <div className="prof-hero-main">

                    <h1 className="prof-hero-name">{fullName}</h1>

                    {locationLine && (
                      <div className="prof-hero-loc">
                        <div className="prof-loc-dot" aria-hidden="true" />
                        <span>{locationLine} · TrueHive</span>
                      </div>
                    )}

                    {/* Badges */}
                    <div className="prof-badge-row">
                      {user?.memberId && (
                        <span className="prof-badge prof-badge-id">{user.memberId}</span>
                      )}
                      {memberSince && (
                        <span className="prof-badge prof-badge-date">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                          Member since {memberSince}
                        </span>
                      )}
                      {completeness === 100 ? (
                        <span className="prof-badge prof-badge-ok">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          Profile Complete
                        </span>
                      ) : (
                        <span className="prof-badge prof-badge-date" style={{ flexDirection: 'column', height: 'auto', paddingTop: 6, paddingBottom: 6, gap: 4, minWidth: 140 }}>
                          <div className="prof-badge-bar">
                            <div className="prof-badge-fill" style={{ width: `${completeness}%` }} />
                          </div>
                          <span className="prof-progress-label">Profile {completeness}% — add more to improve matches</span>
                        </span>
                      )}
                    </div>

                    {/* Bio */}
                    {profile.bio && <p className="prof-bio">{profile.bio}</p>}

                    {/* I'M HERE FOR */}
                    {purposeKeys.length > 0 && (
                      <>
                        <p className="prof-here-label" aria-label="I'm here for">I'M HERE FOR</p>
                        <div className="prof-purposes" role="list">
                          {purposeKeys.map(key => {
                            const pd = PURPOSE_DATA[key];
                            if (!pd) return null;
                            const IconComp = pd.icon;
                            return (
                              <div key={key} className="prof-purpose-card" role="listitem">
                                <div className="prof-purpose-icon" aria-hidden="true">
                                  <IconComp />
                                </div>
                                <div>
                                  <div className="prof-purpose-name">{pd.name}</div>
                                  <div className="prof-purpose-desc">{pd.desc}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Pull-quote (right column) */}
                  <aside className="prof-quote" aria-label="TrueHive tagline">
                    <p className="prof-quote-text">"Good people.<br/>Bold ideas.<br/>Brighter together."</p>
                    <div className="prof-quote-rule" aria-hidden="true" />
                  </aside>
                </div>
              </div>
            </div>

            {/* ── 2. TOP INTERESTS ── */}
            {topInterests.length > 0 && (
              <div className="pf-card reveal reveal-delay-1">
                <div className="pf-section-head">
                  <div>
                    <div className="pf-section-title-row">
                      <span className="pf-section-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#c49a28" stroke="none">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                      </span>
                      <span className="pf-section-title">Top Interests</span>
                    </div>
                    <p className="pf-section-sub">A glimpse into what you love. Explore all your interests below.</p>
                  </div>
                  {interestArr.length > 0 && (
                    <Link to="/profile-setup" className="pf-view-all">
                      Edit Interests ({interestArr.length > 60 ? '60+' : interestArr.length}) →
                    </Link>
                  )}
                </div>

                <div className="ic-strip" role="list">
                  {topInterests.map(cat => {
                    const subtext = cat.selected.slice(0, 3).map(c => stripEmoji(c)).join(' · ');
                    return (
                      <div key={cat.key} className="ic-card" role="listitem">
                        <div className="ic-img" aria-label={cat.name} />
                        <div className="ic-body">
                          <div className="ic-icon-name">
                            <span className="ic-cat-icon" aria-hidden="true">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                              </svg>
                            </span>
                            <span className="ic-cat-name">{cat.name}</span>
                          </div>
                          {subtext && <p className="ic-chips">{subtext}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 3. SKILLS + WHAT MATTERS ── */}
            {(skillArr.length > 0 || goalArr.length > 0) && (
              <div className="prof-two-col">

                {skillArr.length > 0 && (
                  <div className="pf-card reveal reveal-delay-1">
                    <div className="pf-card-inner">
                      <div className="pf-section-title-row">
                        <span className="pf-section-icon" aria-hidden="true">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c49a28" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                          </svg>
                        </span>
                        <div>
                          <div className="pf-section-title" style={{ fontSize: '1rem' }}>Skills</div>
                          <p className="pf-section-sub">Skills &amp; tools I work with.</p>
                        </div>
                      </div>
                      <div className="pf-chips" role="list">
                        {skillArr.map((chip, i) => (
                          <span key={chip + i} className="pf-chip" role="listitem">{stripEmoji(chip)}</span>
                        ))}
                      </div>
                      <Link to="/profile-setup" className="pf-view-skills">Edit Skills →</Link>
                    </div>
                  </div>
                )}

                {goalArr.length > 0 && (
                  <div className="pf-card reveal reveal-delay-2">
                    <div className="pf-card-inner">
                      <div className="pf-section-title-row">
                        <span className="pf-section-icon" aria-hidden="true">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c49a28" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                          </svg>
                        </span>
                        <div>
                          <div className="pf-section-title" style={{ fontSize: '1rem' }}>What Matters Most</div>
                          <p className="pf-section-sub">The things that keep me inspired and grounded.</p>
                        </div>
                      </div>
                      <div className="pf-chips" role="list">
                        {goalArr.map(key => {
                          const m = MATTERS_DATA[key];
                          if (!m) return null;
                          return (
                            <span key={key} className="pf-chip pf-chip-gold" role="listitem">
                              <span className="pf-chip-emoji" aria-hidden="true">{m.emoji}</span>
                              {m.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── 4. AVAILABILITY & PREFERENCES ── */}
            {(availArr.length > 0 || profile?.group_size_preference || profile?.connection_preference || sp.socialEnergy) && (
              <div className="pf-card reveal reveal-delay-1">
                <div className="pf-section-head" style={{ paddingBottom: 12 }}>
                  <div className="pf-section-title-row">
                    <span className="pf-section-icon" aria-hidden="true">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c49a28" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                    </span>
                    <div>
                      <div className="pf-section-title" style={{ fontSize: '1rem' }}>Availability &amp; Preferences</div>
                      <p className="pf-section-sub">How I like to connect and collaborate.</p>
                    </div>
                  </div>
                  <Link to="/profile-setup" className="pf-view-all" aria-label="Edit availability and preferences">Edit</Link>
                </div>

                <div className="prof-avail-body">
                  {availArr.length > 0 && (
                    <div className="prof-avail-col">
                      <div className="prof-avail-icon" aria-hidden="true">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                      </div>
                      <div className="prof-avail-lbl">Availability</div>
                      <div className="prof-avail-val">{availArr[0]}</div>
                      <div className="prof-avail-desc">
                        {availArr.length > 1 ? `Most active on ${availArr.slice(0, 2).join(' & ')}` : `Most active on ${availArr[0]}`}
                      </div>
                    </div>
                  )}
                  {profile?.group_size_preference && (
                    <div className="prof-avail-col">
                      <div className="prof-avail-icon" aria-hidden="true">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                      </div>
                      <div className="prof-avail-lbl">Group Size</div>
                      <div className="prof-avail-val">{SIZE_LABELS[profile.group_size_preference] ?? profile.group_size_preference}</div>
                      <div className="prof-avail-desc">Prefer small to medium groups</div>
                    </div>
                  )}
                  {profile?.connection_preference && (
                    <div className="prof-avail-col">
                      <div className="prof-avail-icon" aria-hidden="true">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                        </svg>
                      </div>
                      <div className="prof-avail-lbl">Connection Style</div>
                      <div className="prof-avail-val">{ROLE_LABELS[profile.connection_preference] ?? profile.connection_preference}</div>
                      <div className="prof-avail-desc">How I show up in groups</div>
                    </div>
                  )}
                  {(sp.socialEnergy || sp.commStyle || sp.energyLevel != null) && (
                    <div className="prof-avail-col">
                      <div className="prof-avail-icon" aria-hidden="true">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                        </svg>
                      </div>
                      <div className="prof-avail-lbl">Vibe &amp; Style</div>
                      <div className="prof-avail-val">{sp.socialEnergy ? ENERGY_LABELS[sp.socialEnergy] : '—'}</div>
                      <div className="prof-avail-desc">{styleParts || 'Flexible and intentional'}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── 5. MY HIVES ── */}
            <div className="pf-card reveal reveal-delay-1">
              <div className="pf-section-head" style={{ paddingBottom: 12 }}>
                <div className="pf-section-title-row">
                  <span className="pf-section-icon" aria-hidden="true">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c49a28" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </span>
                  <div>
                    <div className="pf-section-title" style={{ fontSize: '1rem' }}>My Hives</div>
                    <p className="pf-section-sub">The communities you create and belong to.</p>
                  </div>
                </div>
                <Link to="/find-your-hive" className="pf-view-all">Explore Hives →</Link>
              </div>

              {hives.length === 0 ? (
                <div className="prof-hives-empty" style={{ padding: '8px 24px 24px' }}>
                  <p style={{ marginBottom: 8, fontWeight: 600, color: '#3a3228' }}>No Hives yet</p>
                  <p style={{ fontSize: 12, color: '#8a7a5e', marginBottom: 12 }}>Your Hives will appear here once you join or found one.</p>
                  <Link to="/find-your-hive" style={{ fontSize: 13, fontWeight: 600, color: '#c49a28', textDecoration: 'none' }}>Find Your Hive →</Link>
                </div>
              ) : (
                <div className="prof-hive-list" role="list">
                  {hives.map(hive => (
                    <Link key={hive.hive_id} to={`/hive/${hive.hive_id}`} className="prof-hive-row" role="listitem">
                      <div className="prof-hive-hex" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c49a28" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                        </svg>
                      </div>
                      <div className="prof-hive-info">
                        <div className="prof-hive-name">{hive.hive_name}</div>
                        <div className="prof-hive-meta">
                          {[hive.category_name, hive.role ? (hive.role.charAt(0).toUpperCase() + hive.role.slice(1)) : null].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="prof-hive-chevron" aria-hidden="true"><ChevronRight /></div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ══ RIGHT RAIL ══ */}
          <div className="prof-rail">

            {/* ── Journey ── */}
            <div className="pf-card" style={{ overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: '50%', height: '50%', opacity: .05, pointerEvents: 'none' }}>
                <HoneycombBg className="hc-bg" />
              </div>
              <div className="rail-head">
                <div>
                  <div className="rail-title">My Hive Journey</div>
                  <div className="rail-title-sub">A snapshot of your TrueHive experience.</div>
                </div>
              </div>
              <div className="journey-grid" role="list">
                {tiles.map((tile, i) => {
                  const IconComp = tile.Icon;
                  return (
                    <div key={i} className="journey-tile" role="listitem">
                      <div className="journey-badge" aria-hidden="true"><IconComp /></div>
                      <div className="journey-value">{tile.value}</div>
                      <div className="journey-label">{tile.label}</div>
                      <div className="journey-sub">{tile.sub}</div>
                      <div className="journey-chevron" aria-hidden="true"><ChevronRight size={12} /></div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Recent Activity ── */}
            <div className="pf-card reveal reveal-delay-2">
              <div className="rail-head">
                <div className="rail-title">Recent Activity</div>
                <span className="rail-view-all" aria-hidden="true">View All</span>
              </div>
              {activity.length === 0 ? (
                <p style={{ padding: '0 20px 20px', fontSize: 13, color: '#8a7a5e', fontFamily: "'DM Sans', sans-serif" }}>No activity yet.</p>
              ) : (
                <div className="activity-list" role="list">
                  {activity.map((item, i) => (
                    <div key={i} className="activity-row" role="listitem">
                      <div className="activity-icon" aria-hidden="true">{activityIcon(item.type)}</div>
                      <div>
                        <div className="activity-label">{item.label}</div>
                        <div className="activity-time">{relativeTime(item.ts)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── People You Might Connect With ── */}
            <div className="pf-card reveal reveal-delay-3">
              <div className="suggest-head">
                <div className="suggest-title">People You Might Connect With</div>
                <div className="suggest-sub">Based on your interests and goals.</div>
              </div>
              {suggestions.length === 0 ? (
                <p style={{ padding: '14px 20px 20px', fontSize: 13, color: '#8a7a5e', fontFamily: "'DM Sans', sans-serif" }}>
                  No suggestions yet — they'll appear as more people join TrueHive.
                </p>
              ) : (
                <div className="suggest-list" role="list">
                  {suggestions.map(person => {
                    const initials = getInitials(person.full_name, null);
                    const interests = arr(person.interests).slice(0, 3).map(c => stripEmoji(c));
                    return (
                      <div key={person.user_id} className="suggest-row" role="listitem">
                        {person.profile_photo_url ? (
                          <img
                            src={person.profile_photo_url}
                            alt={person.full_name}
                            className="suggest-avatar"
                            style={{ objectFit: 'cover' }}
                            onError={e => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="suggest-avatar" aria-hidden="true">{initials}</div>
                        )}
                        <div className="suggest-info">
                          <div className="suggest-name">{person.full_name}</div>
                          {person.location && <div className="suggest-loc">{person.location}</div>}
                          {interests.length > 0 && (
                            <div className="suggest-chips" role="list">
                              {interests.map((c, j) => (
                                <span key={j} className="suggest-chip" role="listitem">{c}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <Link
                          to={`/profile/${person.user_id}`}
                          className="suggest-cta"
                          aria-label={`View ${person.full_name}'s profile`}
                        >
                          View
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
