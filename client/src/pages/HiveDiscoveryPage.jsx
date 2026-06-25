import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
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

// ── Matching stub ─────────────────────────────────────────────────────────────
// Swap ONLY this function body when real formula / AI matching is ready.
// Must return { hives: Array, waitingCount: number }.
async function runMatching(category, prefillData) {
  try {
    const res = await fetch('/api/hives/match', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ category, ...prefillData }),
    });
    if (!res.ok) return { hives: [], waitingCount: 0 };
    return await res.json();
  } catch {
    // Endpoint not built yet — fall through to empty-state
    return { hives: [], waitingCount: 0 };
  }
}
// ──────────────────────────────────────────────────────────────────────────────

const ES_AVATARS = [
  { init: 'M', bg: '#c49a28',  color: '#fff'    },
  { init: 'J', bg: '#8a6510',  color: '#fff'    },
  { init: 'A', bg: '#b8902a',  color: '#fff'    },
  { init: '+', bg: '#e8d8a8',  color: '#8a6510' },
];

function FounderEmptyState({ categoryLabel, city, category, waitingCount = 0, prefillData }) {
  const navigate    = useNavigate();
  const [queueJoined, setQueueJoined] = useState(false);
  const [hovCard,     setHovCard]     = useState(null);

  const displayCity    = city || 'your area';
  const hasWaiting     = waitingCount >= 1;
  const queuePosition  = waitingCount + 1;

  return (
    <div className="hd-founder-stage">

      {/* ── Badge ── */}
      <div className="hd-founder-badge-wrap">
        <svg className="hd-founder-logo" viewBox="8 2 68 66" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="es-grad" x1="8" y1="2" x2="76" y2="68" gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor="#E8C56A" />
              <stop offset="45%"  stopColor="#C9A24A" />
              <stop offset="100%" stopColor="#9A7830" />
            </linearGradient>
          </defs>
          <polygon points="28,4 43.6,13 43.6,31 28,40 12.4,31 12.4,13"
            stroke="url(#es-grad)" strokeWidth="4.5" strokeLinejoin="round" fill="#fdf8ec" />
          <polygon points="54,4 69.6,13 69.6,31 54,40 38.4,31 38.4,13"
            stroke="url(#es-grad)" strokeWidth="4.5" strokeLinejoin="round" fill="#fdf8ec" />
          <polygon points="41,30 56.6,39 56.6,57 41,66 25.4,57 25.4,39"
            stroke="url(#es-grad)" strokeWidth="4.5" strokeLinejoin="round" fill="#fdf8ec" />
        </svg>
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
                The {waitingCount} people already waiting in your area
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
            disabled={queueJoined}
            onClick={() => setQueueJoined(true)}
          >
            {queueJoined ? 'Spot Held ✓' : 'Hold My Spot'}
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
            <strong>{waitingCount} people</strong> near {displayCity} are waiting
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
  const prefillData = { chips, cards, textValues };

  const categoryLabel = CATEGORY_LABELS[category] ?? 'Hive';
  const city = textValues['social-city'] || textValues['event-city'] || null;
  const scanLine = city
    ? `Scanning ${categoryLabel} Hives near ${city}`
    : category
    ? `Scanning ${categoryLabel} Hives near you`
    : 'Scanning Hives near you';

  // ── Matching flow state ───────────────────────────────────────
  const [status,      setStatus]      = useState('loading');
  const [matchResult, setMatchResult] = useState({ hives: [], waitingCount: 0 });

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

      <div className="hd-page">

        {/* Decorative background hexagons */}
        <div className="hd-bg-hexes">
          {BG_HEXES.map((h, i) => (
            <div key={i} style={{ position: 'absolute', left: h.left, top: h.top, opacity: 0.5 }}>
              <HexOutline size={h.size} />
            </div>
          ))}
        </div>

        {status === 'empty' && (
          <FounderEmptyState
            categoryLabel={categoryLabel}
            city={city}
            category={category}
            waitingCount={matchResult.waitingCount}
            prefillData={prefillData}
          />
        )}

        {status === 'results' && (
          <div className="hd-results-placeholder">
            <p className="hd-results-ph-label">Results screen coming soon</p>
            <p className="hd-results-ph-count">
              Found {matchResult.hives.length} compatible Hive
              {matchResult.hives.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}

        {status === 'loading' && (
        <div className="hd-stage">

          {/* ── Ring + logo cluster ── */}
          <div className="hd-ring-wrap">
            <div className="hd-ring-outer" />
            <div className="hd-ring-scan" />
            <svg
              className="hd-logo-svg"
              viewBox="8 2 68 66"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="hd-grad" x1="8" y1="2" x2="76" y2="68" gradientUnits="userSpaceOnUse">
                  <stop offset="0%"   stopColor="#E8C56A" />
                  <stop offset="45%"  stopColor="#C9A24A" />
                  <stop offset="100%" stopColor="#9A7830" />
                </linearGradient>
              </defs>
              <polygon points="28,4 43.6,13 43.6,31 28,40 12.4,31 12.4,13"
                stroke="url(#hd-grad)" strokeWidth="4.5" strokeLinejoin="round" fill="#faf8f4" />
              <polygon points="54,4 69.6,13 69.6,31 54,40 38.4,31 38.4,13"
                stroke="url(#hd-grad)" strokeWidth="4.5" strokeLinejoin="round" fill="#faf8f4" />
              <polygon points="41,30 56.6,39 56.6,57 41,66 25.4,57 25.4,39"
                stroke="url(#hd-grad)" strokeWidth="4.5" strokeLinejoin="round" fill="#faf8f4" />
            </svg>
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
