import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import '../styles/auth-simple.css';

export default function ForgotPasswordPage() {
  const [email,       setEmail]       = useState('');
  const [submitted,   setSubmitted]   = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await api.post('/api/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Something went wrong — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="as-page">
      <div className="as-card">
        <Link to="/login" className="as-back">← Back to sign in</Link>

        <h1 className="as-title">Reset password</h1>

        {submitted ? (
          <p className="as-body">
            If an account with that email exists, a reset link has been sent. Check your inbox
            (and spam folder) — it expires in 1 hour.
          </p>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <p className="as-body">
              Enter your email and we'll send you a link to reset your password.
            </p>

            {error && <p className="as-error">{error}</p>}

            <label className="as-label" htmlFor="fp-email">Email address</label>
            <input
              id="fp-email"
              type="email"
              className="as-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <button
              type="submit"
              className="as-btn"
              disabled={submitting || !email.trim()}
            >
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
