import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/signup.css';

const STEPS = [
  { n: 1, label: 'Create your account', desc: '— takes less than a minute.' },
  { n: 2, label: 'Build your profile',   desc: '— tell us your interests, skills, and goals.' },
  { n: 3, label: 'Find your Hive',       desc: '— get matched with the right groups instantly.' },
];

const PILLS = ['Profile Setup', 'Find Your Hive', 'Your Hive'];

export default function SignUpPage() {
  const [showPw, setShowPw] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="su-page">

      {/* ══ LEFT PANEL ══ */}
      <div className="su-left">

        {/* Honeycomb tiling */}
        <svg
          width="100%" height="100%"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          aria-hidden="true"
        >
          <defs>
            <pattern id="su-hexbg" x="0" y="0" width="34.64" height="60" patternUnits="userSpaceOnUse">
              <polygon points="17.32,0 34.64,10 34.64,30 17.32,40 0,30 0,10"
                       fill="none" stroke="#c49a28" strokeWidth="1.5"/>
              <polygon points="0,30 17.32,40 17.32,60 0,70 -17.32,60 -17.32,40"
                       fill="none" stroke="#c49a28" strokeWidth="1.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#su-hexbg)" opacity="0.07"/>
        </svg>

        {/* Radial overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 60% 40%, rgba(196,154,40,0.063) 0%, transparent 70%)',
        }} />

        {/* Content */}
        <div className="su-left-content">

          {/* Logo — links to landing page */}
          <Link to="/" className="su-brand">
            <svg width="36" height="34" viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="su-lg1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%"   stopColor="#e8c84a"/>
                  <stop offset="50%"  stopColor="#c49a28"/>
                  <stop offset="100%" stopColor="#8a6510"/>
                </linearGradient>
                <linearGradient id="su-lg2" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%"   stopColor="#e8c84a"/>
                  <stop offset="50%"  stopColor="#c49a28"/>
                  <stop offset="100%" stopColor="#8a6510"/>
                </linearGradient>
                <linearGradient id="su-lg3" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="#8a6510"/>
                  <stop offset="50%"  stopColor="#c49a28"/>
                  <stop offset="100%" stopColor="#e8c84a"/>
                </linearGradient>
              </defs>
              <polygon points="60,2 88,18 88,48 60,64 32,48 32,18"     fill="none" stroke="url(#su-lg1)" strokeWidth="9" strokeLinejoin="round"/>
              <polygon points="32,46 60,62 60,92 32,108 4,92 4,62"     fill="none" stroke="url(#su-lg2)" strokeWidth="9" strokeLinejoin="round"/>
              <polygon points="88,46 116,62 116,92 88,108 60,92 60,62" fill="none" stroke="url(#su-lg3)" strokeWidth="9" strokeLinejoin="round"/>
            </svg>
            <span className="su-wordmark">CONNECTHIVE</span>
          </Link>

          {/* Heading */}
          <div className="su-heading">
            <div className="su-heading-line1">Your Hive</div>
            <div className="su-heading-line2">starts <em>here.</em></div>
          </div>

          {/* Subtext */}
          <p className="su-subtext">
            Create your account, build your profile, and get matched with groups built around your purpose.
          </p>

          {/* 3-step journey */}
          <div className="su-steps">
            {STEPS.map(s => (
              <div key={s.n} className="su-step">
                <div className="su-step-badge">{s.n}</div>
                <div className="su-step-text">
                  <span className="su-step-label">{s.label}</span>
                  <span> {s.desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="su-stats">
            {[
              { num: '12k+', label: 'Members' },
              { num: '850+', label: 'Hives' },
              { num: '94%',  label: 'Match Rate' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div className="su-stat-num">{s.num}</div>
                <div className="su-stat-label">{s.label}</div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ══ RIGHT PANEL ══ */}
      <div className="su-right">

        {/* Back — returns to previous page in history */}
        <button type="button" className="su-back" onClick={() => navigate(-1)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>

        <div className="su-form-inner">

          {/* Eyebrow */}
          <div className="su-eyebrow">
            <div className="su-eyebrow-dash" />
            <span className="su-eyebrow-text">Get Started — It's Free</span>
          </div>

          {/* Title */}
          <h1 className="su-title">Create your <em>account</em></h1>

          {/* Subtitle */}
          <p className="su-subtitle">
            Already a member?{' '}
            <Link to="/login" className="su-gold-link">Sign in →</Link>
          </p>

          {/* OAuth buttons */}
          <div className="su-oauth-row">
            <button className="su-oauth" type="button">
              {/* Google */}
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign up with Google
            </button>
            <button className="su-oauth" type="button">
              {/* Apple */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#1a1508" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              Sign up with Apple
            </button>
          </div>

          {/* OR create with email divider */}
          <div className="su-or">
            <div className="su-or-line" />
            <span className="su-or-text">or create with email</span>
            <div className="su-or-line" />
          </div>

          {/* Name row — side by side */}
          <div className="su-name-row">
            <div className="su-field">
              <label className="su-label" htmlFor="su-first">First Name</label>
              <input id="su-first" type="text" className="su-input" placeholder="Jordan" autoComplete="given-name"/>
            </div>
            <div className="su-field">
              <label className="su-label" htmlFor="su-last">Last Name</label>
              <input id="su-last" type="text" className="su-input" placeholder="Blake" autoComplete="family-name"/>
            </div>
          </div>

          {/* Email */}
          <div className="su-field">
            <label className="su-label" htmlFor="su-email">Email Address</label>
            <input id="su-email" type="email" className="su-input" placeholder="you@example.com" autoComplete="email"/>
          </div>

          {/* Password */}
          <div className="su-field">
            <label className="su-label" htmlFor="su-pw">Password</label>
            <div className="su-input-wrap">
              <input
                id="su-pw"
                type={showPw ? 'text' : 'password'}
                className="su-input su-input--pw"
                placeholder="Create a password"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="su-pw-toggle"
                onClick={() => setShowPw(v => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b0a890" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b0a890" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Terms */}
          <div className="su-terms">
            <input type="checkbox" className="su-check" id="su-agree"/>
            <label htmlFor="su-agree" className="su-terms-text">
              I agree to ConnectHive's{' '}
              <a href="#terms" className="su-gold-link">Terms of Service</a>
              {' '}and{' '}
              <a href="#privacy" className="su-gold-link">Privacy Policy</a>
              . I'm ready to find my Hive.
            </label>
          </div>

          {/* CTA — routes to profile setup (required for all new users) */}
          <button
            type="button"
            className="su-cta"
            onClick={() => navigate('/profile-setup')}
          >
            Create Account &amp; Continue →
          </button>

          {/* Journey trail */}
          <div className="su-trail">
            <div className="su-trail-header">
              <div className="su-trail-line" />
              <span className="su-trail-label">After this you'll complete</span>
              <div className="su-trail-line" />
            </div>
            <div className="su-pills">
              {PILLS.map((pill, i) => (
                <span key={pill} className="su-pill-group">
                  <span className="su-pill">{pill}</span>
                  {i < PILLS.length - 1 && <span className="su-pill-arrow">→</span>}
                </span>
              ))}
            </div>
          </div>

          {/* Sign-in link */}
          <p className="su-signin-link">
            Already have an account?{' '}
            <Link to="/login" className="su-gold-link">Sign in</Link>
          </p>

        </div>
      </div>

    </div>
  );
}
