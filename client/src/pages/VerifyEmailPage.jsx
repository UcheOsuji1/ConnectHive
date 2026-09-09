import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import '../styles/auth-simple.css';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token          = searchParams.get('token') ?? '';

  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token found in this link.');
      return;
    }

    api.post('/api/auth/verify-email', { token })
      .then(() => setStatus('success'))
      .catch(err => {
        setStatus('error');
        setMessage(err.message || 'Verification failed — the link may have expired.');
      });
  }, [token]);

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
            <p className="as-body">Your email address has been verified. You're all set.</p>
            <Link to="/home" className="as-btn as-btn--inline">Go to home</Link>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="as-title">Verification failed</h1>
            <p className="as-body">{message}</p>
            <Link to="/login" className="as-btn as-btn--inline">Back to sign in</Link>
          </>
        )}
      </div>
    </div>
  );
}
