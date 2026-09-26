import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import HoneycombBg from './HoneycombBg.jsx';

// ── Icons ─────────────────────────────────────────────────────────────────────

const CrownIcon = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 18h20l-2-9-5 4-3-7-3 7-5-4z"/>
  </svg>
);

const PeopleIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const ClockIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const GearIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const InboxIcon = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
  </svg>
);

const UserPlusIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
  </svg>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
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

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ── Card ──────────────────────────────────────────────────────────────────────
//
// One component for both "Owned by You" and "Member Of". Role pill and the
// owner-only Manage action are the only differences.
//
export default function HiveCard({ hive, index = 0 }) {
  // Decided synchronously so a reduced-motion user never sees the clipped frame.
  const [reduced] = useState(prefersReduced);
  const [unfolded, setUnfolded] = useState(reduced);
  const ref = useRef(null);

  // A clipped-away button is invisible but still focusable and still in the
  // a11y tree, so the card is inert until the unfold finishes.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!unfolded) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [unfolded]);

  // Safety net: if the animation never fires (tab backgrounded on mount,
  // animation stripped), un-inert the card anyway rather than trapping it.
  useEffect(() => {
    if (unfolded) return;
    const t = setTimeout(() => setUnfolded(true), index * 90 + 520 + 400);
    return () => clearTimeout(t);
  }, [unfolded, index]);

  const isOwner     = hive.role === 'owner';
  // Matches the server, which gates request review on ['owner','admin'].
  const canReview   = isOwner || hive.role === 'admin';
  const requests    = Number(hive.pending_requests ?? 0);
  const memberCount = Number(hive.member_count ?? 0);
  const newPosts    = Number(hive.new_posts ?? 0);
  const isSolo      = memberCount <= 1;
  const lastActive  = timeAgo(hive.last_activity_at);
  const meta = [hive.category_name, hive.location_type]
    .filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' · ');

  return (
    <article
      ref={ref}
      className={`hc${reduced ? '' : ' hc--anim'}${unfolded ? ' hc--done' : ''}`}
      style={{ '--i': index }}
      onAnimationEnd={e => { if (e.animationName === 'hc-unfold') setUnfolded(true); }}
    >
      {/* Inset by the hairline width. The cover lives INSIDE this, so the gold
          border passes in front of the image and wraps the whole silhouette. */}
      <div className="hc-inner">

        {/* Cover. The <img> is absolutely positioned so the image can never
            contribute to the card's height, whatever its aspect ratio. */}
        <div className="hc-media">
          {hive.banner_url
            ? <img className="hc-media-img" src={hive.banner_url} alt="" />
            : <HoneycombBg className="hc-media-hc" id={`hc-bg-${hive.hive_id}`} />}
          <span className="hc-avatar" aria-hidden="true">
            {hive.logo_url
              ? <img className="hc-avatar-img" src={hive.logo_url} alt="" />
              : initials(hive.hive_name)}
          </span>
        </div>

        <div className="hc-content">

          {/* Row 1 — name + role pill, with the pills and menu at the far right */}
          <div className="hc-head">
            <h3 className="hc-name">
              {hive.hive_name}
              <span className={`hc-pill${isOwner ? ' hc-pill--owner' : ''}`}>
                {isOwner && <CrownIcon />}
                {isOwner ? 'Owner' : 'Member'}
              </span>
            </h3>

            <div className="hc-topright">
              {/* Only surfaces when there is something to act on, and only for
                  the roles the server lets review. Invisible otherwise. */}
              {canReview && requests > 0 && (
                <Link
                  to={`/hive/${hive.hive_id}/requests`}
                  className="hc-requests"
                  aria-label={`Review ${requests} pending join request${requests === 1 ? '' : 's'} for ${hive.hive_name}`}
                >
                  <InboxIcon />
                  {requests} request{requests === 1 ? '' : 's'}
                </Link>
              )}
              <span className={`hc-unread${newPosts > 0 ? ' hc-unread--on' : ''}`}>
                <span className="hc-dot" aria-hidden="true" />
                {newPosts} unread update{newPosts === 1 ? '' : 's'}
              </span>
              <button type="button" className="hc-dots" aria-label={`More options for ${hive.hive_name}`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Row 2 */}
          {meta && <p className="hc-meta">{meta}</p>}

          {/* Row 3 — members and last-active side by side, no rule between */}
          <div className="hc-status">
            <div className="hc-members">
              {isSolo && isOwner ? (
                <>
                  <span className="hc-status-row hc-status-row--gold">
                    <PeopleIcon /> <strong>Only you are here</strong>
                  </span>
                  <span className="hc-status-sub">Invite members or explore suggested matches</span>
                </>
              ) : (
                <span className="hc-status-row">
                  <PeopleIcon /> {memberCount} member{memberCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {lastActive && (
              <span className="hc-status-row hc-status-row--muted hc-last">
                <ClockIcon /> Last active {lastActive}
              </span>
            )}
          </div>

          {/* Row 4 — DOM order matches the design (Invite, Manage, Open Hive).
              Below 760px the solid button is lifted to the top with order:-1. */}
          <div className="hc-actions">
            <Link to={`/hive/${hive.hive_id}/members`} className="hc-btn hc-btn--ghost">
              <UserPlusIcon /> Invite
            </Link>
            {canReview && (
              <Link to={`/hive/${hive.hive_id}/settings`} className="hc-btn hc-btn--ghost">
                <GearIcon /> Manage
              </Link>
            )}
            <Link to={`/hive/${hive.hive_id}`} className="hc-btn hc-btn--solid">Open Hive →</Link>
          </div>

        </div>
      </div>
    </article>
  );
}
