import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import '../styles/auth-simple.css';
import '../styles/signup.css';

const MIN_AGE = 18;

function ageFromDob(dob) {
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return NaN;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// Reached two ways: a direct link, or lib/api.js redirecting here on any
// 428 {needsConsent:true} — every pre-existing account (signed up before
// date_of_birth/terms were collected) and every Google signup (OAuth never
// asks for a birth date) has to pass through here once before using
// anything else.
export default function ConfirmDetailsPage() {
  const [dob,        setDob]        = useState('');
  const [agreed,     setAgreed]     = useState(false);
  const [error,      setError]      = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const maxDob = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - MIN_AGE);
    return d.toISOString().split('T')[0];
  })();

  async function handleSubmit() {
    if (submitting) return;
    setError('');
    if (!dob) { setError('Date of birth is required.'); return; }
    if (ageFromDob(dob) < MIN_AGE) {
      setError(`You must be at least ${MIN_AGE} years old to use TrueHive.`);
      return;
    }
    if (!agreed) {
      setError('You must agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/auth/consent', { dateOfBirth: dob, acceptedTerms: agreed });
      navigate('/home');
    } catch (err) {
      setError(err.data?.error ?? 'Could not save your details. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="as-page">
      <div className="as-card">
        <h1 className="as-title">Confirm your details</h1>
        <p className="as-body">
          TrueHive's Terms of Service and Privacy Policy were updated, and we
          need your date of birth on file. This takes a second.
        </p>

        <div className="su-field" style={{ textAlign: 'left', marginTop: '18px' }}>
          <label className="su-label" htmlFor="cd-dob">Date of Birth</label>
          <input
            id="cd-dob"
            type="date"
            className="su-input"
            max={maxDob}
            value={dob}
            onChange={e => setDob(e.target.value)}
            autoComplete="bday"
          />
          <span style={{ fontSize: '11.5px', color: '#9a8c72', marginTop: '4px', display: 'block' }}>
            You must be at least {MIN_AGE} years old to use TrueHive.
          </span>
        </div>

        {error && (
          <p style={{ margin: '12px 0 0', fontSize: '12.5px', color: '#c0512a', textAlign: 'left' }}>
            {error}
          </p>
        )}

        <div className="su-terms" style={{ textAlign: 'left', marginTop: '14px' }}>
          <input
            type="checkbox"
            className="su-check"
            id="cd-agree"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
          />
          <label htmlFor="cd-agree" className="su-terms-text">
            I agree to TrueHive's{' '}
            <Link to="/terms" className="su-gold-link">Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" className="su-gold-link">Privacy Policy</Link>.
          </label>
        </div>

        <button
          type="button"
          className="su-cta"
          style={{ marginTop: '18px' }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
