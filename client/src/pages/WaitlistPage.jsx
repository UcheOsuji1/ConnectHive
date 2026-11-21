import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api.js';
import posthog, { isPostHogEnabled } from '../lib/posthog';
import TrueHiveMark from '../components/TrueHiveMark.jsx';
import TrueHiveWordmark from '../components/TrueHiveWordmark.jsx';
import { GROUP_OPTIONS, MEET_OPTIONS } from '../lib/waitlistOptions.js';

const GOLD = '#c49a28';
const INK  = '#1e1b18';
const PAPER = '#f5f0e8';

const MOBILE_BREAKPOINT = 640;

function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= breakpoint);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}

const card = { background: '#fff', border: '1px solid #e4d9c3', borderRadius: 18, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 };
const sectionTitle = { margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700 };
const chipBase = { font: 'inherit', fontSize: 14, padding: '9px 14px', borderRadius: 999, border: '1px solid #d6c8a8', background: '#fff', color: INK, cursor: 'pointer', minHeight: 44 };
const chipActive = { ...chipBase, border: `1px solid ${GOLD}`, background: '#fbf3dc', fontWeight: 600 };

function Chip({ active, onClick, children, style }) {
  return <button type="button" aria-pressed={active} onClick={onClick} style={{ ...(active ? chipActive : chipBase), ...style }}>{children}</button>;
}

// highlight = this is the first tier not yet reached ("N more to go", gold row)
function TierRow({ n, label, desc, tier, highlight, reachedLabel = 'Reached', earnedNote, mobile }) {
  const golden = tier.reached || highlight;
  const status = tier.reached ? reachedLabel : highlight ? `${tier.remaining} more to go` : `${tier.remaining} more`;
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 16px', borderRadius: 12, background: golden ? '#fbf3dc' : undefined, border: golden ? '1px solid #ecd9a0' : '1px solid #e4d9c3' }}>
      <span style={{ flex: `0 0 ${mobile ? 40 : 52}px`, height: mobile ? 40 : 52, borderRadius: mobile ? 10 : 12, background: golden ? '#fff' : '#f5f0e8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: mobile ? 16 : 20 }}>
        {n}{!mobile && <span style={{ fontSize: 10, fontWeight: 600, color: '#5c554a' }}>friends</span>}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: mobile ? 14 : 15 }}>{label}</div>
        <div style={{ fontSize: mobile ? 13 : 14, color: '#4a443b' }}>{desc}</div>
        {tier.reached && earnedNote && (
          <div style={{ margin: '2px 0 0', fontSize: 13, color: '#8a6510' }}>{earnedNote}</div>
        )}
      </div>
      <span style={{ flex: '0 0 auto', whiteSpace: 'nowrap', fontSize: 13, fontWeight: golden ? 600 : 400, color: golden ? '#8a6510' : '#5c554a' }}>
        {status}
      </span>
    </div>
  );
}

export default function WaitlistPage() {
  const { user, logout, refreshUser } = useAuth();
  const isMobile = useIsMobile();
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [fullName, setFullName] = useState('');
  const [wants, setWants] = useState([]);
  const [city, setCity] = useState('');
  const [meetPref, setMeetPref] = useState(null);
  const [showOnLeaderboard, setShowOnLeaderboard] = useState(true);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const loadedRef = useRef(false);

  const load = useCallback(() => {
    api.get('/api/waitlist')
      .then(data => {
        setView(data);
        if (!loadedRef.current) {
          setFullName(data.answers.fullName || '');
          setWants(data.answers.wants || []);
          setCity(data.answers.city || '');
          setMeetPref(data.answers.meetPref || null);
          setShowOnLeaderboard(data.showOnLeaderboard);
          loadedRef.current = true;
        }
      })
      .catch(e => setError(e.data?.error ?? 'Could not load your place in line.'));
  }, []);

  useEffect(() => {
    load();
    if (isPostHogEnabled) posthog.capture('waitlist_viewed');
  }, [load]);

  // Refetch every 60s while the tab is visible, and keep the auth user in
  // sync — once access flips to active, RequireAuth re-renders and redirects
  // away from here (to /youre-in) on its own.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      load();
      refreshUser();
    };
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [load, refreshUser]);

  const handleSave = async () => {
    try {
      await api.put('/api/waitlist/answers', { fullName, wants, city, meetPref, showOnLeaderboard });
      setSaved(true);
      if (isPostHogEnabled) posthog.capture('waitlist_answers_saved');
      setTimeout(() => setSaved(false), 2000);
      load();
    } catch (e) {
      setError(e.data?.error ?? 'Could not save your answers.');
    }
  };

  const copyLink = (channel) => {
    if (!view) return;
    navigator.clipboard?.writeText(view.referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (isPostHogEnabled) posthog.capture('waitlist_link_copied', { channel });
  };

  const shareLink = () => {
    if (!view) return;
    if (navigator.share) {
      navigator.share({ title: 'TrueHive', text: `Join me on TrueHive: ${view.referralLink}` }).catch(() => {});
      if (isPostHogEnabled) posthog.capture('waitlist_link_copied', { channel: 'native_share' });
    } else {
      copyLink('share_fallback');
    }
  };

  if (error && !view) return <div style={{ padding: 40 }}>{error}</div>;
  if (!view) return <div style={{ padding: 40 }}>Loading…</div>;

  const text = encodeURIComponent(`Join me on TrueHive: ${view.referralLink}`);
  const displayLink = view.referralLink.replace(/^https?:\/\//, '');

  const TIERS = [
    { key: 'priority',  n: 3,  label: 'Priority',                      shortLabel: 'Priority',              desc: 'Jump into the next group we let in.', shortDesc: 'Jump into the next group',  tier: view.tiers.priority },
    { key: 'skipLine',  n: 10, label: 'Skip the line',                  shortLabel: 'Skip the line',         desc: "You're let in right away.",            shortDesc: "You're let in right away",  tier: view.tiers.skipLine },
    { key: 'freeMonth', n: 25, label: 'A free month on a paid Hive',    shortLabel: 'Free paid-Hive month',  desc: 'For a paid Hive you create or own.',   shortDesc: 'For a paid Hive you own',    tier: view.tiers.freeMonth,
      reachedLabel: 'Earned', earnedNote: "Earned. We'll apply it to a paid Hive you own once you're in." },
  ];
  const nextKey = TIERS.find(t => !t.tier.reached)?.key ?? null;

  const firstName = fullName.split(' ')[0] || user?.email;

  return (
    <div style={{ minHeight: '100vh', background: PAPER, fontFamily: "'DM Sans', sans-serif", color: INK }}>
      <header style={{ borderBottom: '1px solid #e4d9c3', background: '#fbf8f2' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? '14px 18px' : '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 10, textDecoration: 'none' }} aria-label="TrueHive home">
            <TrueHiveMark size={isMobile ? 30 : 36} />
            <TrueHiveWordmark variant="light" size={isMobile ? 22 : 26} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {!isMobile && (
              <>
                <span style={{ width: 34, height: 34, borderRadius: '50%', background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                  {(firstName || '?')[0]?.toUpperCase()}
                </span>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{firstName}</span>
              </>
            )}
            <button type="button" onClick={logout} style={{ font: 'inherit', fontSize: 14, background: 'none', border: '1px solid #d6c8a8', borderRadius: 999, padding: '8px 16px', color: INK, cursor: 'pointer', minHeight: 44 }}>Log out</button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? '32px 18px 40px' : '40px 24px 72px', display: 'flex', flexDirection: 'column', gap: isMobile ? 20 : 32 }}>

        {!view.emailVerified && (
          <div style={{ background: '#fbf3dc', border: '1px solid #ecd9a0', borderRadius: 14, padding: '14px 20px', fontSize: 14 }}>
            Verify your email to hold your spot. Friends you invite count once they verify too.{' '}
            <button type="button" onClick={() => api.post('/api/auth/resend-verification').catch(() => {})}
              style={{ background: 'none', border: 'none', color: '#8a6510', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              Resend email
            </button>
          </div>
        )}

        <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14 }}>
          {isMobile ? (
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#8a6510' }}>YOU'RE ON THE LIST</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 28, height: 1, background: '#8a6510' }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', color: '#8a6510' }}>YOUR ACCOUNT IS READY · YOU'RE ON THE LIST</span>
              <span style={{ width: 28, height: 1, background: '#8a6510' }} />
            </div>
          )}
          <h1 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: isMobile ? 52 : 76, lineHeight: 1.02 }}>
            You're <span style={{ color: GOLD }}>#{view.place ?? '—'}</span> in line.
          </h1>
          <p style={{ margin: 0, maxWidth: 620, fontSize: isMobile ? 15 : 18, lineHeight: 1.6, color: '#4a443b' }}>
            We let people {isMobile ? 'in' : 'into TrueHive'} in small groups so we can welcome each one personally. Invite friends to move up.
          </p>

          {isMobile ? (
            <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              <div style={{ background: '#fff', border: '1px solid #e4d9c3', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700 }}>{view.waitingCount.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: '#5c554a' }}>waiting</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e4d9c3', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700 }}>{view.letInCount.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: '#5c554a' }}>let in</div>
              </div>
              <div style={{ background: INK, borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, color: '#e8c84a' }}>
                  {view.nextGroupSize ? view.nextGroupSize : 'Soon'}
                </div>
                <div style={{ fontSize: 11, color: '#d8cfbf' }}>next group</div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
              <div style={{ background: '#fff', border: '1px solid #e4d9c3', borderRadius: 14, padding: '16px 26px', minWidth: 210 }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 700 }}>{view.waitingCount.toLocaleString()}</div>
                <div style={{ fontSize: 13, color: '#5c554a' }}>people waiting</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e4d9c3', borderRadius: 14, padding: '16px 26px', minWidth: 210 }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 700 }}>{view.letInCount.toLocaleString()}</div>
                <div style={{ fontSize: 13, color: '#5c554a' }}>let in so far</div>
              </div>
              <div style={{ background: INK, color: PAPER, borderRadius: 14, padding: '16px 26px', minWidth: 210 }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 700, color: '#e8c84a' }}>
                  {view.nextGroupSize ? `${view.nextGroupSize} spots` : 'Soon'}
                </div>
                <div style={{ fontSize: 13, color: '#d8cfbf' }}>{view.nextGroupSize ? 'in the next group' : 'Next group opens soon'}</div>
              </div>
            </div>
          )}
        </section>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: isMobile ? 20 : 24 }}>

            <section style={card}>
              <h2 style={sectionTitle}>Move up the line</h2>
              <p style={{ margin: 0, fontSize: 15, color: '#4a443b' }}>
                {isMobile
                  ? <>Every friend who joins moves you up <strong>as many as 10 spots</strong>.</>
                  : <>Share your link. Every friend who joins moves you up <strong>as many as 10 spots</strong>.</>}
              </p>
              <input readOnly value={displayLink} aria-label="Your invite link"
                style={{ font: 'inherit', fontSize: 15, padding: '13px 16px', border: '1px solid #d6c8a8', borderRadius: 12, background: '#fbf8f2', color: INK, width: '100%', boxSizing: 'border-box' }} />

              {isMobile ? (
                <>
                  <button type="button" onClick={shareLink}
                    style={{ font: 'inherit', fontWeight: 700, fontSize: 15, padding: 14, border: 'none', borderRadius: 12, background: `linear-gradient(135deg,#e8c84a,${GOLD})`, color: INK, cursor: 'pointer', minHeight: 44 }}>
                    {copied ? 'Copied' : 'Share my link'}
                  </button>
                  <p style={{ margin: 0, fontSize: 12, color: '#5c554a' }}>
                    Opens your phone's share sheet. A friend counts once they sign up and verify their email.
                  </p>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <button type="button" onClick={() => copyLink('link_button')}
                      style={{ flex: '1 1 auto', font: 'inherit', fontWeight: 700, fontSize: 15, padding: '13px 22px', border: 'none', borderRadius: 12, background: `linear-gradient(135deg,#e8c84a,${GOLD})`, color: INK, cursor: 'pointer', minHeight: 44 }}>
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <a href={`sms:?&body=${text}`} onClick={() => isPostHogEnabled && posthog.capture('waitlist_link_copied', { channel: 'sms' })}
                      style={{ font: 'inherit', fontSize: 14, padding: '10px 16px', border: '1px solid #d6c8a8', borderRadius: 999, background: '#fff', color: INK, textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Text a friend</a>
                    <button type="button" onClick={() => copyLink('instagram')} style={{ ...chipBase }}>Share to Instagram</button>
                    <button type="button" onClick={() => copyLink('tiktok')} style={{ ...chipBase }}>Share to TikTok</button>
                    <a href={`mailto:?body=${text}`} onClick={() => isPostHogEnabled && posthog.capture('waitlist_link_copied', { channel: 'email' })}
                      style={{ font: 'inherit', fontSize: 14, padding: '10px 16px', border: '1px solid #d6c8a8', borderRadius: 999, background: '#fff', color: INK, textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Email</a>
                  </div>
                  {copied && <p style={{ margin: 0, fontSize: 13, color: '#5c554a' }}>Link copied. Paste it in your story or bio.</p>}
                  <p style={{ margin: 0, fontSize: 13, color: '#5c554a' }}>A friend counts once they sign up and verify their email.</p>
                </>
              )}
            </section>

            <section style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <h2 style={sectionTitle}>Your rewards</h2>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{view.credits} friend{view.credits === 1 ? '' : 's'}{!isMobile ? ' joined' : ''}</span>
              </div>
              <div style={{ height: isMobile ? 8 : 10, borderRadius: 999, background: '#efe6d3', overflow: 'hidden' }} role="img" aria-label={`${view.credits} of 25 friends`}>
                <div style={{ width: `${Math.min(100, (view.credits / 25) * 100)}%`, height: '100%', background: isMobile ? GOLD : `linear-gradient(90deg,#e8c84a,${GOLD})` }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {TIERS.map(t => (
                  <TierRow key={t.key} n={t.n} mobile={isMobile}
                    label={isMobile ? t.shortLabel : t.label}
                    desc={isMobile ? t.shortDesc : t.desc}
                    tier={t.tier} highlight={t.key === nextKey}
                    reachedLabel={t.reachedLabel} earnedNote={t.earnedNote} />
                ))}
              </div>
            </section>
          </div>

          <div style={{ flex: '1 1 400px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: isMobile ? 20 : 24 }}>
            <section style={card}>
              {!isMobile && (
                <div>
                  <h2 style={{ ...sectionTitle, marginBottom: 6 }}>Help us build your Hive</h2>
                  <p style={{ margin: 0, fontSize: 14, color: '#4a443b' }}>Three quick questions. Your answers decide which Hives we start first.</p>
                </div>
              )}
              {isMobile && <h2 style={sectionTitle}>Help us build your Hive</h2>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : 6 }}>
                <label htmlFor="wl-name" style={{ fontWeight: 600, fontSize: 14 }}>Your name</label>
                <input id="wl-name" type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                  style={{ font: 'inherit', fontSize: 15, padding: '12px 14px', border: '1px solid #d6c8a8', borderRadius: 12, background: '#fbf8f2', color: INK }} />
              </div>

              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: isMobile ? 8 : 10, padding: 0 }}>
                  {isMobile ? 'What kind of group?' : <>What kind of group do you want? <span style={{ fontWeight: 400, color: '#5c554a' }}>Pick any</span></>}
                </legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 6 : 8 }}>
                  {GROUP_OPTIONS.map(g => (
                    <Chip key={g.key} active={wants.includes(g.key)}
                      style={isMobile ? { fontSize: 13, padding: '10px 12px' } : undefined}
                      onClick={() => setWants(w => w.includes(g.key) ? w.filter(x => x !== g.key) : [...w, g.key])}>
                      {isMobile ? g.shortLabel : g.label}
                    </Chip>
                  ))}
                </div>
              </fieldset>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label htmlFor="wl-city" style={{ fontWeight: 600, fontSize: 14 }}>Where are you?</label>
                <input id="wl-city" type="text" value={city} onChange={e => setCity(e.target.value)}
                  style={{ font: 'inherit', fontSize: 15, padding: '12px 14px', border: '1px solid #d6c8a8', borderRadius: 12, background: '#fbf8f2', color: INK }} />
              </div>

              <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
                <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, padding: 0 }}>How do you like to meet?</legend>
                <div style={isMobile
                  ? { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }
                  : { display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {MEET_OPTIONS.map(m => (
                    <Chip key={m.key} active={meetPref === m.key} onClick={() => setMeetPref(m.key)}
                      style={isMobile ? { textAlign: 'center' } : undefined}>
                      {m.label}
                    </Chip>
                  ))}
                </div>
              </fieldset>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={showOnLeaderboard} onChange={e => setShowOnLeaderboard(e.target.checked)} />
                Show my first name on the top inviters list
              </label>

              <button type="button" onClick={handleSave}
                style={{ alignSelf: isMobile ? 'stretch' : 'flex-start', font: 'inherit', fontWeight: 700, fontSize: 15, padding: isMobile ? 14 : '12px 22px', border: 'none', borderRadius: 12, background: INK, color: PAPER, cursor: 'pointer', minHeight: 44 }}>
                {saved ? 'Saved' : 'Save answers'}
              </button>
            </section>

            <section style={card}>
              <h2 style={sectionTitle}>Top inviters this week</h2>
              {view.leaderboard.empty ? (
                <p style={{ margin: 0, fontSize: 14, color: '#4a443b' }}>No invites yet this week. Be the first.</p>
              ) : (
                <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {view.leaderboard.top.map(p => (
                    <li key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, padding: isMobile ? '8px 0' : '10px 4px', borderBottom: isMobile ? '1px solid #efe6d3' : '1px solid #efe6d3' }}>
                      <span style={{ width: 22, fontWeight: 700, color: '#8a6510' }}>{p.rank}</span>
                      {!isMobile && (
                        <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#8a6510', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                          {p.name?.[0]?.toUpperCase() ?? '?'}
                        </span>
                      )}
                      <span style={{ flex: 1, fontSize: isMobile ? 14 : 15 }}>{p.name}</span>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{isMobile ? p.credits : `${p.credits} friend${p.credits === 1 ? '' : 's'}`}</span>
                    </li>
                  ))}
                  {view.leaderboard.viewer && !view.leaderboard.top.some(p => p.userId === view.leaderboard.viewer.userId) && (
                    <li style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, padding: isMobile ? '8px 10px' : '10px 4px', background: '#fbf3dc', borderRadius: 10 }}>
                      <span style={{ width: 22, fontWeight: 700, color: '#5c554a' }}>{view.leaderboard.viewer.rank ?? '—'}</span>
                      {!isMobile && (
                        <span style={{ width: 32, height: 32, borderRadius: '50%', background: GOLD, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                          {firstName?.[0]?.toUpperCase() ?? '?'}
                        </span>
                      )}
                      <span style={{ flex: 1, fontSize: isMobile ? 14 : 15, fontWeight: 600 }}>You</span>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{isMobile ? view.leaderboard.viewer.credits : `${view.leaderboard.viewer.credits} friend${view.leaderboard.viewer.credits === 1 ? '' : 's'}`}</span>
                    </li>
                  )}
                </ol>
              )}
              {!isMobile && <p style={{ margin: 0, fontSize: 13, color: '#5c554a' }}>First names and last initials only. You can hide your name above.</p>}
            </section>
          </div>
        </div>

        <p style={{ margin: 0, textAlign: 'center', fontSize: isMobile ? 14 : 15, color: '#4a443b' }}>
          {isMobile
            ? "Invited to a friend's Hive? Open their link and you'll go straight in."
            : "Did a friend invite you to their Hive? Open their invite link and you'll go straight in."}
        </p>
        {error && <div style={{ textAlign: 'center', color: '#c0512a', fontSize: 13 }}>{error}</div>}
      </main>
    </div>
  );
}
