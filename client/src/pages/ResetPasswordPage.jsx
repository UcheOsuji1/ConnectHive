import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import '../styles/auth-simple.css';

export default function ResetPasswordPage() {
  const [searchParams]                = useSearchParams();
  const navigate                      = useNavigate();
  const token                         = searchParams.get('token') ?? '';

  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [done,        setDone]        = useState(false);
  const [error,       setError]       = useState('');

  if (!token) {
    return (
      <div className="as-page">
        <div className="as-card">
          <h1 className="as-title">Invalid link</h1>
          <p className="as-body">This reset link is missing or malformed.</p>
          <Link to="/forgot-password" className="as-btn as-btn--inline">Request a new link</Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.message || 'Reset failed — the link may have expired.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="as-page">
      <div className="as-card">
        <h1 className="as-title">Choose a new password</h1>

        {done ? (
          <p className="as-body">
            Password updated. Redirecting you to sign in…
          </p>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {error && <p className="as-error">{error}</p>}

            <label className="as-label" htmlFor="rp-pw">New password</label>
            <div className="as-pw-wrap">
              <input
                id="rp-pw"
                type={showPw ? 'text' : 'password'}
                className="as-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="as-pw-toggle"
                onClick={() => setShowPw(v => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>

            <label className="as-label" htmlFor="rp-confirm">Confirm password</label>
            <input
              id="rp-confirm"
              type={showPw ? 'text' : 'password'}
              className="as-input"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />

            <button
              type="submit"
              className="as-btn"
              disabled={submitting || !password || !confirm}
            >
              {submitting ? 'Updating…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
