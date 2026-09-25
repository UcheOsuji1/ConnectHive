import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import HoneycombBg from '../components/HoneycombBg.jsx';
import { api } from '../lib/api.js';
import '../styles/myhives.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return null;
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

function formatMeta(hive) {
  return [hive.category_name, hive.location_type]
    .filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' · ');
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PeopleIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function CrownIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 18h20l-2-9-5 4-3-7-3 7-5-4z"/>
    </svg>
  );
}

function MessageIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function CalendarIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

function InboxIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  );
}

function StarIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
    </svg>
  );
}

function ClockIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function CheckIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function ChevronRight({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function HexOutlineIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 21,7 21,17 12,22 3,17 3,7"/>
    </svg>
  );
}

function PlusIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

// ── Page-edge hex watermark (large, faint) ────────────────────────────────────

function HexWatermark({ side }) {
  return (
    <svg
      className={`mhp-watermark mhp-watermark--${side}`}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <polygon points="100,10 170,50 170,130 100,170 30,130 30,50"
        fill="none" stroke="#c49a28" strokeWidth="2"/>
      <polygon points="100,42 142,66 142,114 100,138 58,114 58,66"
        fill="none" stroke="#c49a28" strokeWidth="2"/>
      <polygon points="30,130 72,154 72,202 30,226 -12,202 -12,154"
        fill="none" stroke="#c49a28" strokeWidth="2"/>
    </svg>
  );
}

// ── Stat rail ─────────────────────────────────────────────────────────────────

function StatRail({ stats }) {
  return (
    <div className="mhp-rail-wrap">
      <div className="mhp-rail">
        {stats.map(s => (
          <div key={s.label} className="mhp-stat">
            <div className="mhp-stat-hex" aria-hidden="true">
              <s.Icon />
            </div>
            {/* Number + label read as one string to a screen reader */}
            <div className="mhp-stat-text">
              <div className="mhp-stat-num" aria-hidden="true">{s.value}</div>
              <div className="mhp-stat-label" aria-hidden="true">{s.label}</div>
              <span className="sr-only">{s.value} {s.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Badge grid (2×2 on the owned card) ────────────────────────────────────────

function BadgeGrid({ badges }) {
  return (
    <div className="mhp-card-badges">
      {badges.map(b => (
        <div key={b.label} className="mhp-badge-item">
          <div className="mhp-badge-hex" aria-hidden="true"><b.Icon size={15} /></div>
          <div>
            <div className="mhp-badge-num" aria-hidden="true">{b.value}</div>
            <div className="mhp-badge-lbl" aria-hidden="true">{b.label}</div>
            <span className="sr-only">{b.value} {b.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Owned Hive card ───────────────────────────────────────────────────────────

function OwnedHiveCard({ hive }) {
  const memberCount = Number(hive.member_count ?? 0);
  const newPosts    = Number(hive.new_posts ?? 0);
  const events      = Number(hive.upcoming_events ?? 0);
  const requests    = Number(hive.pending_requests ?? 0);
  const isSolo      = memberCount <= 1;
  const lastActive  = timeAgo(hive.last_activity_at);
  const meta        = formatMeta(hive);

  const badges = [
    { label: 'Member',   value: memberCount, Icon: PeopleIcon },
    { label: 'Updates',  value: newPosts,    Icon: MessageIcon },
    { label: 'Events',   value: events,      Icon: CalendarIcon },
    { label: 'Requests', value: requests,    Icon: InboxIcon },
  ];

  return (
    <div className="mhp-owned-card">
      {/* Left — cover */}
      <div className="mhp-card-cover">
        {hive.banner_url
          ? <img src={hive.banner_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <HoneycombBg className="mhp-card-cover-hc" id={`hc-cover-${hive.hive_id}`} />}
        <div className="mhp-card-avatar" aria-hidden="true">{initials(hive.hive_name)}</div>
      </div>

      {/* Middle — content */}
      <div className="mhp-card-body">
        <div className="mhp-card-top-row">
          <h3 className="mhp-card-name">{hive.hive_name}</h3>
          <button
            type="button"
            className="mhp-dots-btn"
            aria-label={`More options for ${hive.hive_name}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
            </svg>
          </button>
        </div>

        <span className="mhp-owner-pill">Owner</span>
        {meta && <div className="mhp-card-meta">{meta}</div>}
        <div className="mhp-card-divider" />

        <div className="mhp-status-block">
          {isSolo ? (
            <>
              <div className="mhp-signal">
                <span className="mhp-signal-icon" style={{ color: '#c49a28' }}><StarIcon /></span>
                <span className="mhp-solo-main">Only you are here</span>
              </div>
              <div className="mhp-solo-sub">Invite members or explore suggested matches</div>
            </>
          ) : (
            <>
              <div className="mhp-signal mhp-signal--muted">
                <span className="mhp-signal-icon"><PeopleIcon size={14} /></span>
                <span>{memberCount} members</span>
              </div>
              {newPosts > 0 ? (
                <div className="mhp-signal mhp-signal--gold">
                  <span className="mhp-signal-icon"><MessageIcon size={14} /></span>
                  <span>{newPosts} unread update{newPosts !== 1 ? 's' : ''}</span>
                </div>
              ) : (
                <div className="mhp-signal mhp-signal--muted">
                  <span className="mhp-signal-icon"><CheckIcon /></span>
                  <span>All caught up</span>
                </div>
              )}
            </>
          )}

          {lastActive && (
            <div className="mhp-signal mhp-signal--muted">
              <span className="mhp-signal-icon"><ClockIcon /></span>
              <span>Last active {lastActive}</span>
            </div>
          )}
        </div>

        <div className="mhp-card-actions">
          <Link to={`/hive/${hive.hive_id}/members`} className="mhp-btn-invite">
            <PlusIcon size={13} /> Invite
          </Link>
          <Link to={`/hive/${hive.hive_id}`} className="mhp-btn-open">Open Hive →</Link>
        </div>
      </div>

      {/* Right — badges */}
      <BadgeGrid badges={badges} />
    </div>
  );
}

// ── Member Of card ────────────────────────────────────────────────────────────

function MemberHiveCard({ hive }) {
  const memberCount = Number(hive.member_count ?? 0);
  const lastActive  = timeAgo(hive.last_activity_at);
  const meta        = formatMeta(hive);

  return (
    <Link to={`/hive/${hive.hive_id}`} className="mhp-member-card">
      <div className="mhp-mc-img">
        {hive.banner_url
          ? <img src={hive.banner_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <HoneycombBg className="mhp-mc-hc" id={`hc-mc-${hive.hive_id}`} />}
      </div>
      <div className="mhp-mc-body">
        <div className="mhp-mc-name">{hive.hive_name}</div>
        <span className="mhp-mc-pill">Member</span>
        <div className="mhp-mc-meta">
          {meta}
          {meta && ' · '}
          {memberCount} member{memberCount !== 1 ? 's' : ''}
          {lastActive && ` · ${lastActive}`}
        </div>
      </div>
      <span className="mhp-mc-chevron" aria-hidden="true"><ChevronRight /></span>
    </Link>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHead({ title, sub, link, linkLabel }) {
  return (
    <div className="mhp-section-head">
      <div className="mhp-section-left">
        <div className="mhp-section-hex" aria-hidden="true"><HexOutlineIcon /></div>
        <div>
          <h2 className="mhp-section-title">{title}</h2>
          <p className="mhp-section-sub">{sub}</p>
        </div>
      </div>
      {link && <Link to={link} className="mhp-section-link">{linkLabel}</Link>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MyHivePage() {
  const [hives, setHives]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/hives/mine')
      .then(d => setHives(d.hives ?? []))
      .catch(() => setHives([]))
      .finally(() => setLoading(false));
  }, []);

  const owned    = hives.filter(h => h.role === 'owner');
  const memberOf = hives.filter(h => h.role !== 'owner');

  const totalUnread = hives.reduce((s, h) => s + Number(h.new_posts ?? 0), 0);
  const totalEvents = hives.reduce((s, h) => s + Number(h.upcoming_events ?? 0), 0);

  const stats = [
    { label: 'Active Hives',    value: hives.length,  Icon: PeopleIcon },
    { label: 'Owned by You',    value: owned.length,  Icon: CrownIcon },
    { label: 'Unread Updates',  value: totalUnread,   Icon: MessageIcon },
    { label: 'Upcoming Events', value: totalEvents,   Icon: CalendarIcon },
  ];

  const hasNothing = !loading && hives.length === 0;

  return (
    <>
      <Navbar />
      <div className="mhp-page">
        <HexWatermark side="left" />
        <HexWatermark side="right" />

        <div className="mhp-inner">

          {/* Part 1 — Header */}
          <header className="mhp-header">
            <div>
              <div className="mhp-eyebrow">My Hives</div>
              <h1 className="mhp-title">Your spaces.</h1>
              <p className="mhp-subtitle">
                Manage the Hives you lead and stay close to the ones you joined.
              </p>
            </div>
            <Link to="/create-hive" className="mhp-create-btn">
              <PlusIcon /> Create a Hive
            </Link>
          </header>

          {/* Part 2 — Stat rail, or the zero-state line that replaces it */}
          {loading ? null : hasNothing ? (
            <div className="mhp-rail-zero">
              <span className="mhp-rail-zero-text">
                You're not in any Hives yet — nothing to count up.
              </span>
              <Link to="/find-your-hive" className="mhp-section-link">Explore Hives →</Link>
            </div>
          ) : (
            <StatRail stats={stats} />
          )}

          {/* Empty state 1 — no Hives at all */}
          {hasNothing && (
            <div className="mhp-empty-full">
              <div className="mhp-empty-icon" aria-hidden="true"><HexOutlineIcon size={26} /></div>
              <h2 className="mhp-empty-title">No Hives yet</h2>
              <p className="mhp-empty-sub">
                A Hive is a small group built around something you care about.
                Start one and invite people, or look through what already exists.
              </p>
              <div className="mhp-empty-actions">
                <Link to="/create-hive" className="mhp-empty-primary">
                  <PlusIcon /> Create a Hive
                </Link>
                <Link to="/find-your-hive" className="mhp-empty-secondary">Explore Hives</Link>
              </div>
            </div>
          )}

          {/* Part 3 — Owned by You */}
          {!loading && !hasNothing && (
            <section className="mhp-section">
              <SectionHead
                title="Owned by You"
                sub="Spaces you create and lead."
              />
              {owned.length > 0 ? (
                owned.map(h => <OwnedHiveCard key={h.hive_id} hive={h} />)
              ) : (
                <div className="mhp-section-empty">
                  <div className="mhp-se-icon" aria-hidden="true"><CrownIcon size={18} /></div>
                  <div className="mhp-se-text">
                    <div className="mhp-se-title">You don't lead a Hive yet</div>
                    <div className="mhp-se-sub">
                      Create one and you decide the purpose, the rules and who joins.
                    </div>
                  </div>
                  <Link to="/create-hive" className="mhp-se-btn">
                    <PlusIcon size={13} /> Create a Hive
                  </Link>
                </div>
              )}
            </section>
          )}

          {/* Part 4 — Member Of */}
          {!loading && !hasNothing && (
            <section className="mhp-section">
              <SectionHead
                title="Member Of"
                sub="Spaces you joined."
                link="/find-your-hive"
                linkLabel="Explore more Hives →"
              />
              {memberOf.length > 0 ? (
                <div className="mhp-member-grid">
                  {memberOf.map(h => <MemberHiveCard key={h.hive_id} hive={h} />)}
                </div>
              ) : (
                <div className="mhp-section-empty">
                  <div className="mhp-se-icon" aria-hidden="true"><PeopleIcon size={18} /></div>
                  <div className="mhp-se-text">
                    <div className="mhp-se-title">You haven't joined anyone else's Hive</div>
                    <div className="mhp-se-sub">
                      Browse Hives that match your interests and ask to join.
                    </div>
                  </div>
                  <Link to="/find-your-hive" className="mhp-se-btn">Explore Hives</Link>
                </div>
              )}
            </section>
          )}

        </div>
      </div>
    </>
  );
}
