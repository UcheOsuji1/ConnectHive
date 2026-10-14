import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const DISMISS_KEY = 'th_verify_strip_dismissed_until';

function isDismissedToday() {
  try {
    const until = localStorage.getItem(DISMISS_KEY);
    return !!until && new Date() < new Date(until);
  } catch {
    return false;
  }
}

function dismissUntilTomorrow() {
  try {
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    localStorage.setItem(DISMISS_KEY, tomorrow.toISOString());
  } catch { /* private window / storage blocked — strip just won't stay hidden */ }
}

// V1 — "Verify {email} to join or create Hives." Renders under the nav bar
// (see .verify-strip in globals.css) on every logged-in page, via Navbar
// itself rather than RequireAuth, so it isn't covered by the fixed nav.
export default function VerifyStrip({ email }) {
  const [dismissed, setDismissed] = useState(isDismissedToday);
  const [sending,   setSending]   = useState(false);
  const [sent,      setSent]      = useState(false);
  const navigate = useNavigate();

  if (dismissed) return null;

  const handleResend = async () => {
    if (sending || sent) return;
    setSending(true);
    try {
      await api.post('/api/auth/resend-verification');
      setSent(true);
      setTimeout(() => setSent(false), 60_000);
    } catch { /* non-fatal */ } finally {
      setSending(false);
    }
  };

  const handleDismiss = () => {
    dismissUntilTomorrow();
    setDismissed(true);
  };

  return (
    <div className="verify-strip" role="status">
      <span className="verify-strip-text">
        Verify <strong>{email}</strong> to join or create Hives.
      </span>
      <div className="verify-strip-actions">
        {!sent ? (
          <button className="verify-strip-btn" onClick={handleResend} disabled={sending}>
            {sending ? 'Sending…' : 'Resend link'}
          </button>
        ) : (
          <span className="verify-strip-sent">Sent. Check your inbox</span>
        )}
        <button className="verify-strip-btn" onClick={() => navigate('/settings')}>
          Change email
        </button>
        <button className="verify-strip-close" onClick={handleDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
