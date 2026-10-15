import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../lib/api';
import TrueHiveMark from '../components/TrueHiveMark.jsx';
import '../styles/hive-discovery.css';

const CATEGORY_LABELS = {
  social:       'Social Groups',
  professional: 'Professional',
  travel:       'Travel Buddy',
  project:      'Project Collab',
  event:        'Event Buddy',
  specialized:  'Specialized Groups',
};

const TIPS = [
  'Looking for available Hives matching your preferences near you...',
  'Always meet new Hive members in public spaces for your first few hangouts.',
  'The more specific your answers, the stronger your first match — accuracy beats speed.',
  'Great groups form around shared rhythms, not just shared interests.',
  'Checking compatibility scores across active Hives in your selected category...',
  "You can always create your own Hive if you don't find the perfect fit.",
];

const BAR_CONFIG = [
  { label: 'Category',     target: 25 },
  { label: 'Interests',    target: 18 },
  { label: 'Goals',        target: 19 },
  { label: 'Skills',       target: 12 },
  { label: 'Availability', target: 5  },
];

const BG_HEXES = [
  { left: '7%',  top: '16%', size: 52 },
  { left: '3%',  top: '54%', size: 36 },
  { left: '87%', top: '11%', size: 58 },
  { left: '90%', top: '42%', size: 42 },
  { left: '82%', top: '70%', size: 40 },
  { left: '12%', top: '74%', size: 46 },
];

// Tune these to change animation feel or protect against slow AI calls
const MATCH_FLOOR_MS   = 2500;
const MATCH_CEILING_MS = 25000;

// Every category's "What city or area are you in?" question id — only one
// is ever populated per search, since only one category's deep-dive runs.
const LOCATION_IDS = ['social-location', 'event-location', 'professional-location', 'travel-location', 'project-location', 'spec-location'];

// An old saved cards[id] may still be a plain string (from before ages went
// multi-select) — read it as a one-item array either way.
function asArray(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

// Derives the new area-search fields from whichever *-location question the
// user actually answered. "Online community only" wins outright; otherwise
// a resolved metro_key (from current-location or autocomplete) is used.
function deriveSearchFields(chips, metroKeys, placeLabels) {
  for (const id of LOCATION_IDS) {
    if (chips?.[id]?.[0] === '💻 Online community only') {
      return { searchMode: 'online', searchMetroKey: null, searchPlaceLabel: null };
    }
  }
  for (const id of LOCATION_IDS) {
    if (metroKeys?.[id]) {
      return { searchMode: 'area', searchMetroKey: metroKeys[id], searchPlaceLabel: placeLabels?.[id] ?? null };
    }
  }
  return { searchMode: 'area', searchMetroKey: null, searchPlaceLabel: null };
}

function HexOutline({ size }) {
  const pad = 2;
  const r = (size - pad * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const points = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <polygon points={points} stroke="#c49a28" strokeWidth="1" fill="none" />
    </svg>
  );
}

// ── Matching ──────────────────────────────────────────────────────────────────
// Swap ONLY this function body when AI re-ranking is added (STAGE 2).
// Must return { hives: Array, waitingCount: number, needsProfile?: boolean }.
async function runMatching(category, prefillData) {
  try {
    return await api.post('/api/hives/match', { category, ...prefillData });
  } catch {
    return { hives: [], waitingCount: 0 };
  }
}
// ──────────────────────────────────────────────────────────────────────────────

// ── HiveMatchCard ─────────────────────────────────────────────────────────────
function MemberAvatar({ member, size = 32 }) {
  const initial = (member.full_name ?? '?')[0].toUpperCase();
  return (
    <div className="hmd-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {member.profile_photo_url
        ? <img src={member.profile_photo_url} alt={member.full_name} className="hmd-avatar-img" />
        : <span>{initial}</span>}
    </div>
  );
}

function HiveMatchCard({ hive, autoFetch = false }) {
  const [membersOpen, setMembersOpen] = useState(false);
  const [joinState,   setJoinState]   = useState(hive.request_pending ? 'pending' : 'idle');
  const [joinError,   setJoinError]   = useState(null);
  const [aiStatus,    setAiStatus]    = useState('idle'); // 'idle' | 'loading' | 'done'
  const [aiData,      setAiData]      = useState(null);
  const fetchedRef = useRef(false);
  const tags = Array.isArray(hive.tags) ? hive.tags : [];

  async function fetchAiMatch() {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setAiStatus('loading');
    try {
      const result = await api.get(`/api/hives/${hive.hive_id}/ai-match`);
      setAiData(result);
    } catch { /* silent — fall back to rules chips */ }
    setAiStatus('done');
  }

  useEffect(() => {
    if (autoFetch) fetchAiMatch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleJoin() {
    if (joinState !== 'idle') return;
    setJoinState('loading');
    setJoinError(null);
    try {
      const result = await api.post(`/api/hives/${hive.hive_id}/request`, {});
      setJoinState(result.joined ? 'joined' : 'pending');
    } catch (err) {
      setJoinError(err.data?.error ?? 'Something went wrong. Try again.');
      setJoinState('idle');
    }
  }

  return (
    <div className="hmd-card">

      {/* ── Header ── */}
      <div className="hmd-card-head">
        <div className="hmd-card-title-row">
          <span className="hmd-hive-name">{hive.hive_name}</span>
          {hive.category_name && <span className="hmd-cat-badge">{hive.category_name}</span>}
        </div>
        <div className="hmd-score-pill">{Math.round(hive.match_score)}% Hive fit</div>
      </div>

      {/* ── Description ── */}
      {hive.description && <p className="hmd-description">{hive.description}</p>}

      {/* ── Tags ── */}
      {tags.length > 0 && (
        <div className="hmd-tags">
          {tags.map((tag, i) => <span key={i} className="hmd-tag">{tag}</span>)}
        </div>
      )}

      {/* ── Stats ── */}
      <div className="hmd-stats">
        <span className="hmd-stat">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="4" r="2.5" stroke="#8a6510" strokeWidth="1.2"/>
            <path d="M1.5 10.5c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5" stroke="#8a6510" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          {Number(hive.member_count)}/{hive.max_members ?? '∞'} members
        </span>
        {hive.location_type === 'online' ? (
          <span className="hmd-location-pill hmd-location-pill--online">💻 Online</span>
        ) : hive.location ? (
          <span className="hmd-location-pill hmd-location-pill--inperson">
            📍 {hive.location} · {hive.location_type === 'hybrid' ? 'Hybrid' : 'In person'}
          </span>
        ) : null}
      </div>

      {/* ── Why you match ── */}
      {(hive.reasons?.length > 0 || aiStatus !== 'idle') && (
        <div className="hmd-reasons">
          <div className="hmd-reasons-header">
            <span className="hmd-reasons-label">Why you match</span>
            {aiStatus === 'done' && aiData?.source === 'ai' && (
              <span className="hmd-ai-badge">✨ AI</span>
            )}
          </div>

          {aiStatus === 'loading' && (
            <div className="hmd-ai-shimmer-wrap">
              <div className="hmd-ai-shimmer" />
              <div className="hmd-ai-shimmer" style={{ width: '72%' }} />
            </div>
          )}

          {aiStatus === 'done' && aiData?.match?.summary && (
            <p className="hmd-ai-summary">{aiData.match.summary}</p>
          )}

          {aiStatus !== 'loading' && (
            <div className="hmd-reasons-list">
              {(aiStatus === 'done' && aiData?.match?.highlights?.length > 0
                ? aiData.match.highlights
                : hive.reasons ?? []
              ).map((r, i) => (
                <span
                  key={i}
                  className={`hmd-reason-chip${aiStatus === 'done' && aiData?.source === 'ai' ? ' hmd-reason-chip-ai' : ''}`}
                >
                  {r}
                </span>
              ))}
            </div>
          )}

          {aiStatus === 'idle' && !autoFetch && (
            <button className="hmd-ai-fetch-btn" onClick={fetchAiMatch}>
              ✨ Get AI analysis
            </button>
          )}
        </div>
      )}

      {/* ── Member breakdown ── */}
      {hive.people_score === null ? (
        <p className="hmd-new-hive">✦ New Hive — be one of the first members</p>
      ) : hive.member_matches?.length > 0 ? (
        <div className="hmd-members-section">
          <button
            type="button"
            className="hmd-members-toggle"
            onClick={() => setMembersOpen(v => !v)}
          >
            <div className="hmd-avatar-strip">
              {hive.member_matches.slice(0, 5).map(m => (
                <MemberAvatar key={m.user_id} member={m} size={28} />
              ))}
              {hive.member_matches.length > 5 && (
                <span className="hmd-avatar-more">+{hive.member_matches.length - 5}</span>
              )}
            </div>
            <span className="hmd-members-toggle-label">
              {membersOpen ? 'Hide' : `${hive.member_matches.length} member${hive.member_matches.length !== 1 ? 's' : ''}`}
              <span className="hmd-members-chevron">{membersOpen ? '▲' : '▼'}</span>
            </span>
          </button>

          {membersOpen && (
            <div className="hmd-members-list">
              {hive.member_matches.map(m => (
                <div key={m.user_id} className="hmd-member-row">
                  <MemberAvatar member={m} size={32} />
                  <span className="hmd-member-name">{m.full_name ?? 'Member'}</span>
                  <span className="hmd-member-score">{m.pair_score}% with you</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ── CTA ── */}
      <div className="hmd-cta">
        {joinState === 'joined' ? (
          <a href={`/hive/${hive.hive_id}`} className="hmd-btn hmd-btn-joined">
            Joined — Open Hive →
          </a>
        ) : joinState === 'pending' ? (
          <button className="hmd-btn hmd-btn-pending" disabled>Request pending</button>
        ) : (
          <button
            className="hmd-btn hmd-btn-request"
            disabled={joinState === 'loading'}
            onClick={handleJoin}
          >
            {joinState === 'loading' ? 'Requesting…' : 'Request to Join'}
          </button>
        )}
        {joinError && <span className="hmd-join-error">{joinError}</span>}
        {hive.is_following && <span className="hmd-following-pill">Following</span>}
      </div>

    </div>
  );
}

// ── MatchResults ──────────────────────────────────────────────────────────────
function MatchResults({ hives, waitingCount, categoryLabel, city, category, area, prefillData, needsArea, questionState, onWaitlistJoined, outsideLaunch = false }) {
  const navigate = useNavigate();
  const [waitlistDone,    setWaitlistDone]    = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [liveCount,       setLiveCount]       = useState(waitingCount);
  const [waitlistError, setWaitlistError] = useState(null);
  const ages = prefillData.ageBands.filter(b => b !== 'Any age');
  const displayCity = city || area?.name || 'your area';
  const create = () => navigate('/create-hive', { state: { category, prefillData } });
  const editArea = () => navigate('/category-deep-dive', { state: questionState });

  async function handleJoinWaitlist() {
    if (waitlistDone || waitlistLoading) return;
    setWaitlistLoading(true);
    setWaitlistError(null);
    try {
      const result = await api.post('/api/hives/waitlist', { category, location: city || null, metro_key: area?.metro_key ?? null });
      setLiveCount(result.waitingCount);
      if (onWaitlistJoined) onWaitlistJoined(result.waitingCount);
      setWaitlistDone(true);
    } catch (err) { setWaitlistError(err.message || 'Could not save your spot. Try again.'); }
    finally { setWaitlistLoading(false); }
  }

  return (
    <div className={`hmd-results hmd-results--discovery${outsideLaunch ? ' hmd-results--outside' : ''}`}>

      {/* Header */}
      <div className="hmd-results-head">
        <div className="hd-eyebrow">
          <div className="hd-eyebrow-line" />
          <span className="hd-eyebrow-text">
            {outsideLaunch ? area.name : `${hives.length} Compatible Hive${hives.length !== 1 ? 's' : ''} Found`}
          </span>
        </div>
        <h1 className="hd-headline">{outsideLaunch ? <>TrueHive is in <em>Los Angeles first</em></> : <>Your <em>matches</em> are ready</>}</h1>
        {outsideLaunch && (
          <p className="hmd-outside-copy">
            There are no in-person {categoryLabel} Hives near {displayCity} yet.{' '}
            {hives.length > 0 ? `Here ${hives.length === 1 ? 'is' : 'are'} ${hives.length} online Hive${hives.length === 1 ? '' : 's'} you can join today, or start the first one in ${displayCity}.` : `Start the first one in ${displayCity}.`}
          </p>
        )}
        <div className="hmd-search-filters" aria-label="Your search">
          <span>{categoryLabel}</span>
          {area && <span>📍 {area.name}</span>}
          {prefillData.searchMode === 'online' && <span>💻 Online community only</span>}
          {ages.length > 0 && <span>Ages {ages.join(', ')}</span>}
        </div>
      </div>

      {needsArea && (
        <p className="hmd-area-prompt">Add your city to see in-person Hives near you.{' '}
          <button className="es-alt-btn" onClick={editArea}>Add your city →</button>
        </p>
      )}
      {outsideLaunch && (
        <div className="hmd-outside-actions">
          <button className="es-btn-gold" onClick={create}>Become the founder in {displayCity}</button>
          <button className="es-btn-outline" disabled={waitlistDone || waitlistLoading} onClick={handleJoinWaitlist}>
            {waitlistDone ? `We'll email you when ${displayCity} opens.` : waitlistLoading ? 'Saving…' : `Tell me when ${displayCity} opens`}
          </button>
          {waitlistError && <p role="alert" className="hmd-join-error">{waitlistError}</p>}
        </div>
      )}
      <div className="hmd-results-columns">
        <div className="hmd-cards">
        {hives.map((hive, idx) => (
          <HiveMatchCard key={hive.hive_id} hive={hive} autoFetch={idx < 3} />
        ))}
        </div>
        {!outsideLaunch && <aside className="hmd-founder-panel">
          <div className="hmd-create-panel">
            <TrueHiveMark size={56} />
            <h2>Don't see your Hive?</h2>
            <p>Start one. We'll match people like you straight into it.</p>
            <dl className="hmd-search-summary">
              <div><dt>Category</dt><dd>{categoryLabel}</dd></div>
              <div><dt>Area</dt><dd>{prefillData.searchMode === 'online' ? 'Online' : area?.name || city || 'Add your city'}</dd></div>
              <div><dt>Ages</dt><dd>{ages.length ? ages.join(', ') : 'Any age'}</dd></div>
            </dl>
            <button className="es-btn-gold" onClick={create}>Create a Hive</button>
            <p className="hmd-prefill-note">Your answers are filled in. You can change anything.</p>
          </div>
        <div className="hmd-waitlist-nudge">
          <p className="hmd-waitlist-text">
            {liveCount > 0 ? <><strong>{liveCount} {liveCount === 1 ? 'person is' : 'people are'}</strong> waiting for a {categoryLabel} Hive near {displayCity}.</> : <>Be the first to join the queue for a {categoryLabel} Hive near {displayCity}.</>}{' '}
            Join the queue to be notified of new openings.
          </p>
          <button
            className="hmd-waitlist-btn"
            disabled={waitlistDone || waitlistLoading}
            onClick={handleJoinWaitlist}
          >
            {waitlistDone ? 'You\'re in the queue ✓' : waitlistLoading ? 'Saving…' : 'Join the queue'}
          </button>
          {waitlistError && <p role="alert" className="hmd-join-error">{waitlistError}</p>}
        </div>
        </aside>}
      </div>

      <p className="es-alt-link" style={{ marginTop: '12px' }}>
        Not quite right?{' '}
        <button className="es-alt-btn" onClick={() => navigate('/find-your-hive')}>
          Browse other categories →
        </button>
      </p>

    </div>
  );
}

const ES_AVATARS = [
  { init: 'M', bg: '#c49a28',  color: '#fff'    },
  { init: 'J', bg: '#8a6510',  color: '#fff'    },
  { init: 'A', bg: '#b8902a',  color: '#fff'    },
  { init: '+', bg: '#e8d8a8',  color: '#8a6510' },
];

function FounderEmptyState({ categoryLabel, city, category, waitingCount: initialCount = 0, prefillData, onWaitlistJoined }) {
  const navigate    = useNavigate();
  const [queueJoined,  setQueueJoined]  = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [hovCard,      setHovCard]      = useState(null);
  const [liveCount,    setLiveCount]    = useState(initialCount);
  const [queueError, setQueueError] = useState(null);

  const displayCity   = city || 'your area';
  const hasWaiting    = liveCount >= 1;
  const queuePosition = liveCount + 1;

  async function handleHoldSpot() {
    if (queueJoined || queueLoading) return;
    setQueueLoading(true);
    setQueueError(null);
    try {
      const result = await api.post('/api/hives/waitlist', {
        category,
        location: city || null,
        metro_key: prefillData.searchMetroKey ?? null,
      });
      setLiveCount(result.waitingCount);
      if (onWaitlistJoined) onWaitlistJoined(result.waitingCount);
      setQueueJoined(true);
    } catch (err) { setQueueError(err.message || 'Could not save your spot. Try again.'); }
    finally { setQueueLoading(false); }
  }

  return (
    <div className="hd-founder-stage">
      {queueError && <p role="alert" className="hmd-join-error">{queueError}</p>}

      {/* ── Badge ── */}
      <div className="hd-founder-badge-wrap">
        <TrueHiveMark size={88} className="hd-founder-logo" />
        <div className="hd-founder-badge-dot">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1.2 L7.18 4.02 L10.24 4.31 L8.07 6.24 L8.71 9.25 L6 7.74 L3.29 9.25 L3.93 6.24 L1.76 4.31 L4.82 4.02 Z" fill="#1a1508"/>
          </svg>
        </div>
      </div>

      {/* ── Eyebrow ── */}
      <div className="hd-eyebrow" style={{ marginBottom: '14px' }}>
        <div className="hd-eyebrow-line" />
        <span className="hd-eyebrow-text">You're Early</span>
      </div>

      {/* ── Headline ── */}
      <h1 className="es-headline">
        No {categoryLabel} Hives in {displayCity} <em>yet</em>{' '}
        — so start the one everyone joins.
      </h1>

      {/* ── Sub-line ── */}
      <p className="es-subline">
        You're ahead of the curve. There aren't active Hives matching your preferences
        in your area right now, but others nearby are looking for the same thing.
        Be the founder, and we'll match them straight into your Hive.
      </p>

      {/* ── Two path cards ── */}
      <div className="es-cards">

        {/* LEFT: Founder */}
        <div
          className={`es-card es-card-left${hovCard === 'founder' ? ' es-card-hov' : ''}`}
          onMouseEnter={() => setHovCard('founder')}
          onMouseLeave={() => setHovCard(null)}
        >
          <span className="es-tag es-tag-gold">RECOMMENDED</span>
          <div className="es-icon-box">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5 L9.54 4.65 L13.02 5.13 L10.51 7.58 L11.07 11.04 L8 9.42 L4.93 11.04 L5.49 7.58 L2.98 5.13 L6.46 4.65 Z" fill="#c49a28"/>
            </svg>
          </div>
          <h2 className="es-card-title">Become the founder</h2>
          {hasWaiting ? (
            <p className="es-card-body">
              Start your {categoryLabel} Hive in under a minute.{' '}
              <strong className="es-waiting-strong">
                The {liveCount} people already waiting in your area
              </strong>{' '}
              get matched and invited automatically as soon as it&apos;s live.
            </p>
          ) : (
            <p className="es-card-body">
              Be the very first to start a {categoryLabel} Hive in {displayCity}.
              As others join, we&apos;ll match them straight to you.
            </p>
          )}
          <button
            className="es-btn-gold"
            onClick={() => navigate('/create-hive', { state: { category, prefillData } })}
          >
            Create This Hive →
          </button>
        </div>

        {/* RIGHT: Queue */}
        <div
          className={`es-card${hovCard === 'queue' ? ' es-card-hov' : ''}`}
          onMouseEnter={() => setHovCard('queue')}
          onMouseLeave={() => setHovCard(null)}
        >
          <span className="es-tag es-tag-muted">OR WAIT</span>
          <div className="es-icon-box">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.2" stroke="#c49a28" strokeWidth="1.2"/>
              <path d="M8 4.8 V8.2 L10.4 9.6" stroke="#c49a28" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="es-card-title">Join the queue</h2>
          <p className="es-card-body">
            Prefer to join rather than lead? Hold your spot and we&apos;ll notify
            you the moment someone founds a compatible Hive — or enough people
            gather to form one.
          </p>
          <button
            className="es-btn-outline"
            disabled={queueJoined || queueLoading}
            onClick={handleHoldSpot}
          >
            {queueJoined ? 'Spot Held ✓' : queueLoading ? 'Saving…' : 'Hold My Spot'}
          </button>
        </div>

      </div>

      {/* ── Queue strip ── */}
      {hasWaiting ? (
        <div className="es-queue-strip">
          <div className="es-avatars">
            {ES_AVATARS.map((av, i) => (
              <div
                key={i}
                className="es-avatar"
                style={{ background: av.bg, color: av.color, marginLeft: i > 0 ? '-8px' : 0 }}
              >
                {av.init}
              </div>
            ))}
          </div>
          <p className="es-queue-text">
            <strong>{liveCount} people</strong> near {displayCity} are waiting
            for a {categoryLabel} Hive. Founding one now puts you at the center of it.
          </p>
          <div className="es-queue-pos">
            <span className="es-queue-num">#{queuePosition}</span>
            <span className="es-queue-lbl">YOUR SPOT</span>
          </div>
        </div>
      ) : (
        <div className="es-queue-strip es-queue-strip-first">
          <p className="es-queue-first-text">
            You&apos;d be the first — every great Hive starts with one person.
          </p>
        </div>
      )}

      {/* ── Alt link ── */}
      <p className="es-alt-link">
        Not quite right?{' '}
        <button className="es-alt-btn" onClick={() => navigate('/find-your-hive')}>
          Browse other categories →
        </button>
      </p>

    </div>
  );
}

export default function HiveDiscoveryPage() {
  const location   = useLocation();
  const state      = location.state ?? {};
  const category   = state.category ?? '';
  const chips      = state.chips      ?? {};
  const cards      = state.cards      ?? {};
  const textValues = state.textValues ?? {};
  const metroKeys   = state.metroKeys   ?? {};
  const placeLabels = state.placeLabels ?? {};
  const { searchMode, searchMetroKey, searchPlaceLabel } = deriveSearchFields(chips, metroKeys, placeLabels);
  const ageBands = asArray(cards['social-age']).length ? asArray(cards['social-age']) : asArray(cards['event-age']);
  const prefillData = { chips, cards, textValues, searchMetroKey, searchMode, searchPlaceLabel, ageBands };

  const categoryLabel = CATEGORY_LABELS[category] ?? 'Hive';
  const city = searchPlaceLabel || textValues['social-city'] || textValues['event-city'] || textValues['professional-city'] || textValues['travel-city'] || textValues['project-city'] || textValues['spec-city'] || null;
  const scanLine = city
    ? `Scanning ${categoryLabel} Hives near ${city}`
    : category
    ? `Scanning ${categoryLabel} Hives near you`
    : 'Scanning Hives near you';

  // ── Matching flow state ───────────────────────────────────────
  const [status,      setStatus]      = useState('loading');
  const [matchResult, setMatchResult] = useState({ hives: [], waitingCount: 0 });
  const area = matchResult.area ?? null;
  const resolvedPrefills = { ...prefillData, searchMetroKey: area?.metro_key ?? searchMetroKey, searchPlaceLabel: city || area?.name || null };
  const outsideLaunch = searchMode !== 'online' && area && matchResult.isLaunchArea === false && !matchResult.hives.some(h => h.location_type === 'in-person' || h.location_type === 'hybrid');
  const questionState = { category, chips, cards, textValues, metroKeys, placeLabels };

  useEffect(() => {
    let cancelled = false;
    const timers  = [];

    // Gate 1 — minimum floor: loading animation always plays fully
    const floor = new Promise(resolve => {
      const t = setTimeout(resolve, MATCH_FLOOR_MS);
      timers.push(t);
    });

    // Gate 2 — maximum ceiling: abandon and treat as no results after 25s
    const ceiling = new Promise(resolve => {
      const t = setTimeout(() => resolve({ hives: [], waitingCount: 0 }), MATCH_CEILING_MS);
      timers.push(t);
    });

    Promise.all([
      Promise.race([runMatching(category, prefillData), ceiling]),
      floor,
    ]).then(([result]) => {
      if (cancelled) return;
      setMatchResult(result);
      if (result.needsProfile) return setStatus('needs_profile');
      setStatus(result.hives.length > 0 ? 'results' : 'empty');
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []); // runs once on mount — category & prefillData are stable route state

  // ── Tip cycling ──────────────────────────────────────────────
  const [tipIndex,   setTipIndex]   = useState(0);
  const [tipVisible, setTipVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => {
        setTipIndex(prev => (prev + 1) % TIPS.length);
        setTipVisible(true);
      }, 420);
    }, 3600);
    return () => clearInterval(id);
  }, []);

  // ── Bar animation loop ────────────────────────────────────────
  const [barValues, setBarValues] = useState(BAR_CONFIG.map(() => 0));

  useEffect(() => {
    const CYCLE_MS     = 3000;
    const STAGGER_MS   = 180;
    const FILL_STEPS   = 28;
    const FILL_MS      = 900;

    const tos = [];
    const ivs = [];

    const clearAll = () => {
      tos.forEach(clearTimeout);
      ivs.forEach(clearInterval);
      tos.length = 0;
      ivs.length = 0;
    };

    const runCycle = () => {
      clearAll();
      setBarValues(BAR_CONFIG.map(() => 0));

      BAR_CONFIG.forEach(({ target }, i) => {
        const t = setTimeout(() => {
          let step = 0;
          const iv = setInterval(() => {
            step++;
            setBarValues(prev => {
              const next = [...prev];
              next[i] = Math.min(Math.round((target * step) / FILL_STEPS), target);
              return next;
            });
            if (step >= FILL_STEPS) clearInterval(iv);
          }, FILL_MS / FILL_STEPS);
          ivs.push(iv);
        }, i * STAGGER_MS);
        tos.push(t);
      });
    };

    runCycle();
    const cycleId = setInterval(runCycle, CYCLE_MS);

    return () => {
      clearInterval(cycleId);
      clearAll();
    };
  }, []);

  return (
    <div className="hd-root">
      <Navbar />

      <div className={`hd-page${status !== 'loading' ? ' hd-page--finished' : ''}`}>

        {/* Decorative background hexagons */}
        <div className="hd-bg-hexes">
          {BG_HEXES.map((h, i) => (
            <div key={i} style={{ position: 'absolute', left: h.left, top: h.top, opacity: 0.5 }}>
              <HexOutline size={h.size} />
            </div>
          ))}
        </div>

        {status === 'needs_profile' && (
          <div className="hmd-needs-profile">
            <p className="hmd-needs-profile-text">
              Complete your profile so we can find your best matches.
            </p>
            <a href="/profile" className="hmd-btn hmd-btn-profile">Set up profile →</a>
          </div>
        )}

        {matchResult.needsArea && status === 'empty' && !outsideLaunch && (
          <p className="hmd-area-prompt">Add your city to see in-person Hives near you.{' '}
            <button className="es-alt-btn" onClick={() => navigate('/category-deep-dive', { state: questionState })}>Add your city →</button>
          </p>
        )}
        {status === 'empty' && !outsideLaunch && (
          <FounderEmptyState
            categoryLabel={categoryLabel}
            city={city}
            category={category}
            waitingCount={matchResult.waitingCount}
            prefillData={resolvedPrefills}
            onWaitlistJoined={count =>
              setMatchResult(prev => ({ ...prev, waitingCount: count }))
            }
          />
        )}

        {(status === 'results' || (status === 'empty' && outsideLaunch)) && (
          <MatchResults
            hives={matchResult.hives}
            waitingCount={matchResult.waitingCount}
            categoryLabel={categoryLabel}
            city={city}
            category={category}
            area={area}
            prefillData={resolvedPrefills}
            needsArea={matchResult.needsArea}
            questionState={questionState}
            outsideLaunch={outsideLaunch}
            onWaitlistJoined={count =>
              setMatchResult(prev => ({ ...prev, waitingCount: count }))
            }
          />
        )}

        {status === 'loading' && (
        <div className="hd-stage">

          {/* ── Ring + logo cluster ── */}
          <div className="hd-ring-wrap">
            <div className="hd-ring-outer" />
            <div className="hd-ring-scan" />
            <TrueHiveMark size={96} className="hd-logo-svg" />
          </div>

          {/* ── Eyebrow ── */}
          <div className="hd-eyebrow">
            <div className="hd-eyebrow-line" />
            <span className="hd-eyebrow-text">AI Matchmaking in Progress</span>
          </div>

          {/* ── Headline with blinking dots ── */}
          <h1 className="hd-headline">
            Searching for your <em>people</em>
            <span className="hd-dot" style={{ animationDelay: '0s' }}>.</span>
            <span className="hd-dot" style={{ animationDelay: '0.2s' }}>.</span>
            <span className="hd-dot" style={{ animationDelay: '0.4s' }}>.</span>
          </h1>

          {/* ── Dynamic scan sub-line ── */}
          <p className="hd-subline">{scanLine}</p>

          {/* ── Compatibility card ── */}
          <div className="hd-card">
            <div className="hd-card-header">
              <div className="hd-card-icon">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <rect x="0"   y="9"   width="3.5" height="6"  rx="0.7" fill="#c49a28" />
                  <rect x="5.8" y="5.5" width="3.5" height="9.5" rx="0.7" fill="#c49a28" opacity="0.75" />
                  <rect x="11.5" y="1.5" width="3.5" height="13.5" rx="0.7" fill="#c49a28" opacity="0.5" />
                </svg>
              </div>
              <span className="hd-card-header-text">Calculating Compatibility</span>
            </div>

            {BAR_CONFIG.map(({ label, target }, i) => (
              <div className="hd-bar-row" key={label}>
                <span className="hd-bar-label">{label}</span>
                <div className="hd-bar-track">
                  <div
                    className="hd-bar-fill"
                    style={{ width: `${(barValues[i] / 25) * 100}%` }}
                  />
                </div>
                <span className="hd-bar-pct">{barValues[i]}%</span>
              </div>
            ))}
          </div>

          {/* ── Cycling tip (outside card) ── */}
          <p className="hd-tip" style={{ opacity: tipVisible ? 1 : 0 }}>
            {TIPS[tipIndex]}
          </p>

        </div>
        )}
      </div>
    </div>
  );
}
