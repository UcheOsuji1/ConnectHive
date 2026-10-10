import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import '../styles/account.css';

// Payments (Prompt 62, Part 1) — optional handles used by Split costs to
// build deep links into each person's own payment app. Never pre-filled with
// an amount; TrueHive never touches the money itself.
function PaymentsCard() {
  const [handles, setHandles] = useState(null);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.get('/api/users/profile')
      .then(d => setHandles({
        venmoHandle: d.profile?.venmo_handle ?? '',
        cashappHandle: d.profile?.cashapp_handle ?? '',
        paypalHandle: d.profile?.paypal_handle ?? '',
      }))
      .catch(() => setError('Could not load your payment handles.'));
  }, []);

  function set(key, val) { setHandles(h => ({ ...h, [key]: val })); }

  async function save() {
    setSaving(true); setSaveError(null); setSuccess(false);
    try {
      await api.put('/api/users/profile', handles);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setSaveError(err?.data?.error ?? 'Could not save your payment handles.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="acct-card">
      <div className="acct-section-label">Payments</div>
      <p className="acct-payments-sub">
        Used by Split costs to link to your payment apps — shown only to people you share a
        Hive with, inside that tool. TrueHive never moves money itself.
      </p>
      {error && <p className="acct-payments-error">{error}</p>}
      {handles && (
        <>
          <div className="acct-payments-fields">
            <label className="acct-payments-field">
              <span>Venmo</span>
              <input value={handles.venmoHandle} maxLength={31}
                     placeholder="your-venmo-handle"
                     onChange={e => set('venmoHandle', e.target.value)} />
            </label>
            <label className="acct-payments-field">
              <span>CashApp</span>
              <input value={handles.cashappHandle} maxLength={31}
                     placeholder="$your-cashtag"
                     onChange={e => set('cashappHandle', e.target.value)} />
            </label>
            <label className="acct-payments-field">
              <span>PayPal</span>
              <input value={handles.paypalHandle} maxLength={31}
                     placeholder="your-paypal-me"
                     onChange={e => set('paypalHandle', e.target.value)} />
            </label>
          </div>
          {saveError && <p className="acct-payments-error">{saveError}</p>}
          {success && <p className="acct-payments-success">Saved.</p>}
          <button type="button" className="acct-btn acct-btn-gold" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save payment handles'}
          </button>
        </>
      )}
    </div>
  );
}

export default function AccountSettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <>
      <Navbar />
      <div className="acct-page">
        <div className="acct-inner">

          {/* ── Page title ── */}
          <div className="acct-title-block">
            <span className="acct-eyebrow">Account</span>
            <h1 className="acct-h1">Account &amp; Settings</h1>
            <p className="acct-subtitle">Private controls — only you can see this page.</p>
          </div>

          {/* ── 1. Account info ── */}
          <div className="acct-card">
            <div className="acct-section-label">Account info</div>
            <dl className="acct-rows">
              <div className="acct-row">
                <dt className="acct-row-label">Email</dt>
                <dd className="acct-row-value">{user?.email || '—'}</dd>
              </div>
              <div className="acct-row">
                <dt className="acct-row-label">Member ID</dt>
                <dd className="acct-row-value acct-member-id">{user?.memberId || '—'}</dd>
              </div>
              <div className="acct-row">
                <dt className="acct-row-label">Member since</dt>
                <dd className="acct-row-value">{memberSince}</dd>
              </div>
            </dl>
          </div>

          {/* ── 2. Security ── */}
          <div className="acct-card">
            <div className="acct-section-label">Security</div>
            <dl className="acct-rows">
              <div className="acct-row">
                <dt className="acct-row-label">Password</dt>
                <dd className="acct-row-value acct-row-action">
                  <span>••••••••</span>
                  <span className="acct-action-group">
                    <button className="acct-btn acct-btn-outline" disabled>Change password</button>
                    <span className="acct-soon">Soon</span>
                  </span>
                </dd>
              </div>
              <div className="acct-row">
                <dt className="acct-row-label">Two-factor authentication</dt>
                <dd className="acct-row-value acct-row-action">
                  <span className="acct-soon">Soon</span>
                </dd>
              </div>
            </dl>
          </div>

          {/* ── 3. Privacy ── */}
          <div className="acct-card">
            <div className="acct-section-label">Privacy</div>
            <dl className="acct-rows">
              <div className="acct-row">
                <dt className="acct-row-label">Who can view your profile</dt>
                <dd className="acct-row-value acct-row-action">
                  <span>Everyone in TrueHive</span>
                  <span className="acct-soon">Soon</span>
                </dd>
              </div>
              <div className="acct-row">
                <dt className="acct-row-label">Who can send you Hive requests</dt>
                <dd className="acct-row-value acct-row-action">
                  <span>Anyone</span>
                  <span className="acct-soon">Soon</span>
                </dd>
              </div>
            </dl>
          </div>

          {/* ── 3b. Payments ── */}
          <PaymentsCard />

          {/* ── 4. Notifications ── */}
          <div className="acct-card">
            <div className="acct-section-label">Notifications</div>
            <dl className="acct-rows">
              <div className="acct-row">
                <dt className="acct-row-label">Email notifications</dt>
                <dd className="acct-row-value acct-row-action">
                  <span className="acct-soon">Soon</span>
                </dd>
              </div>
            </dl>
          </div>

          {/* ── 5. Session ── */}
          <div className="acct-card">
            <div className="acct-section-label">Session</div>
            <div className="acct-session-row">
              <div>
                <div className="acct-session-title">Log out</div>
                <div className="acct-session-sub">Sign out of your TrueHive account on this device.</div>
              </div>
              <button className="acct-btn acct-btn-gold" onClick={handleLogout}>Log out</button>
            </div>
          </div>

          {/* ── 6. Danger zone ── */}
          <div className="acct-card acct-card-danger">
            <div className="acct-section-label acct-section-label-danger">Danger zone</div>
            <div className="acct-session-row">
              <div>
                <div className="acct-session-title">Delete account</div>
                <div className="acct-session-sub">Permanently removes your profile and Hives.</div>
              </div>
              <span className="acct-action-group">
                <button className="acct-btn acct-btn-danger" disabled>Delete</button>
                <span className="acct-soon">Soon</span>
              </span>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
