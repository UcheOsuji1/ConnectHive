import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api.js';
import posthog, { isPostHogEnabled } from '../lib/posthog';
import TrueHiveMark from '../components/TrueHiveMark.jsx';

const INK = '#1e1b18';
const PAPER = '#f5f0e8';
const GOLD = '#c49a28';

function reasonLine(view) {
  if (view.reason === 'group') {
    const today = view.letInAt && new Date(view.letInAt).toDateString() === new Date().toDateString();
    return `You're one of ${view.groupCount} people we let in ${today ? 'today' : 'this week'}.`;
  }
  if (view.reason === 'referrals_10') return `You brought ${view.credits} friends, so you skipped the line.`;
  return 'We saved you a spot.';
}

export default function YoureInPage() {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/waitlist/youre-in')
      .then(data => {
        setView(data);
        if (isPostHogEnabled) posthog.capture('youre_in_viewed');
      })
      .catch(e => setError(e.data?.error ?? 'Could not load this page.'));
  }, []);

  const handleSetupProfile = async () => {
    try { await api.post('/api/waitlist/youre-in/seen'); } catch { /* non-blocking */ }
    await refreshUser();
    navigate('/profile-setup');
  };

  if (error) return <div style={{ padding: 40 }}>{error}</div>;
  if (!view) return <div style={{ padding: 40 }}>Loading…</div>;

  return (
    <div style={{ minHeight: '100vh', background: PAPER, fontFamily: "'DM Sans', sans-serif", color: INK, padding: '48px 24px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', background: '#fff', border: '1px solid #e4d9c3', borderRadius: 20, padding: 44, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#8a6510' }}>WELCOME TO TRUEHIVE</span>
        <TrueHiveMark size={56} />
        <h1 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px, 6vw, 56px)', lineHeight: 1.02, fontWeight: 700 }}>
          You're <span style={{ color: GOLD }}>in</span>{view.firstName ? `, ${view.firstName}` : ''}.
        </h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: '#4a443b' }}>
          {reasonLine(view)} Let's set up your profile and find your first Hive.
        </p>

        <div style={{ display: 'flex', gap: 14, padding: 18, borderRadius: 14, background: '#fbf8f2', border: '1px solid #efe6d3' }}>
          <span style={{ flex: '0 0 44px', height: 44, borderRadius: '50%', background: INK, color: '#e8c84a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 18 }}>U</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
              "Hey, I'm Uche, I built TrueHive. I read every waitlist answer.
              {view.founderCallUrl ? ' If you want help finding the right Hive, grab 15 minutes with me.' : ''}"
            </p>
            {view.founderCallUrl && (
              <a href={view.founderCallUrl} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 600 }}>Book a 15-minute call (optional)</a>
            )}
          </div>
        </div>

        <button type="button" onClick={handleSetupProfile}
          style={{ alignSelf: 'flex-start', font: 'inherit', fontWeight: 700, fontSize: 16, padding: '15px 28px', border: 'none', borderRadius: 12, background: `linear-gradient(135deg,#e8c84a,${GOLD})`, color: INK, cursor: 'pointer' }}>
          Set up my profile
        </button>
        <p style={{ margin: 0, fontSize: 13, color: '#5c554a' }}>Then it's the normal onboarding. Your waitlist answers fill in where they fit.</p>
      </div>
    </div>
  );
}
