import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import '../styles/auth-simple.css';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token          = searchParams.get('token') ?? '';
  const navigate       = useNavigate();
  const { user, loading, refreshUser } = useAuth();

  const [status,    setStatus]    = useState('verifying');
  const [message,   setMessage]   = useState('');
  const [resending, setResending] = useState(false);
  const [resentOk,  setResentOk]  = useState(false);

  // Wait for auth context to resolve so we know whether the user is logged in
  // before deciding what to do after a successful verification.
  useEffect(() => {
    if (loading) return;

    if (!token) {
      setStatus('error');
      setMessage('No verification token found in this link.');
      return;
    }

    api.post('/api/auth/verify-email', { token })
      .then(async () => {
        if (user) {
          // Logged in — refresh context so the banner disappears immediately,
          // then show success in place (no reload needed).
          await refreshUser();
          setStatus('success');
        } else {
          // Logged out (e.g. opened link in a different browser or private window).
          // Token was consumed successfully; send them to sign in with a flag.
          navigate('/login?verified=1', { replace: true });
        }
      })
      .catch(err => {
        setStatus('error');
        setMessage(err.message || 'This verification link is invalid or has expired.');
      });
  }, [token, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResend = async () => {
    if (resending || resentOk) return;
    setResending(true);
    try {
      await api.post('/api/auth/resend-verification');
      setResentOk(true);
    } catch { /* non-fatal */ } finally {
      setResending(false);
    }
  };

  return (
    <div className="as-page">
      <div className="as-card">
        {status === 'verifying' && (
          <>
            <h1 className="as-title">Verifying…</h1>
            <p className="as-body">Checking your email verification link.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 className="as-title">Email verified</h1>
            <p className="as-body">Your email address has been confirmed. You're all set.</p>
            <Link to="/home" className="as-btn as-btn--inline">Go to home</Link>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="as-title">Verification failed</h1>
            <p className="as-body">{message}</p>
            {user ? (
              resentOk ? (
                <p className="as-body" style={{ color: '#3a7a3a' }}>
                  A new verification email is on its way.
                </p>
              ) : (
                <button
                  className="as-btn as-btn--inline"
                  onClick={handleResend}
                  disabled={resending}
                >
                  {resending ? 'Sending…' : 'Send a new link'}
                </button>
              )
            ) : (
              <p className="as-body">
                <Link to="/login">Sign in</Link> and use "Resend email" from the
                banner to request a new link.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
