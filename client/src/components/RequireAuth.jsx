import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

function VerifyBanner({ email }) {
  const [dismissed, setDismissed] = useState(false);
  const [sending,   setSending]   = useState(false);
  const [sent,      setSent]      = useState(false);

  if (dismissed) return null;

  const handleResend = async () => {
    if (sending || sent) return;
    setSending(true);
    try {
      await api.post('/api/auth/resend-verification');
      setSent(true);
    } catch { /* non-fatal */ } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      background:    '#fffbea',
      borderBottom:  '1px solid #e8d87a',
      padding:       '10px 20px',
      display:       'flex',
      alignItems:    'center',
      gap:           12,
      fontSize:      13,
      color:         '#5a4800',
      flexWrap:      'wrap',
    }}>
      <span>
        Please verify your email address{email ? ` (${email})` : ''} to unlock all features.
      </span>
      {!sent ? (
        <button
          onClick={handleResend}
          disabled={sending}
          style={{
            background:   'none',
            border:       '1px solid #c49a28',
            borderRadius: 6,
            padding:      '3px 10px',
            fontSize:     12,
            color:        '#8a6510',
            cursor:       'pointer',
          }}
        >
          {sending ? 'Sending…' : 'Resend email'}
        </button>
      ) : (
        <span style={{ color: '#3a7a3a', fontWeight: 500 }}>Verification email sent.</span>
      )}
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          marginLeft:   'auto',
          background:   'none',
          border:       'none',
          cursor:       'pointer',
          fontSize:     16,
          color:        '#8a7a54',
          lineHeight:   1,
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#f5f0e8',
      }}>
        <svg
          width="40" height="40" viewBox="0 0 40 40"
          style={{ animation: 'spin 0.8s linear infinite' }}
          aria-label="Loading"
        >
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <circle cx="20" cy="20" r="16" fill="none" stroke="#e9dfcf" strokeWidth="3" />
          <path d="M20 4 a16 16 0 0 1 16 16" fill="none" stroke="#c49a28" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (!user) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return (
    <>
      {user.emailVerified === false && (
        <VerifyBanner email={user.email} />
      )}
      <Outlet />
    </>
  );
}
