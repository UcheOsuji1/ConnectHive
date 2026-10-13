import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import '../styles/account.css';

// Delete account (Danger zone) — a blockers/solo-Hives check, then password
// or Google re-auth if the session isn't fresh (last_login within 10 min).
function DeleteAccountRow() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState(null); // { blockers, soloOwnedHives, reauthRequired, canDelete }
  const [checkError, setCheckError] = useState(null);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [reauthNeeded, setReauthNeeded] = useState(null); // set from a 403 on the delete attempt itself

  async function openPanel() {
    setOpen(true);
    setCheckError(null);
    setDeleteError(null);
    setReauthNeeded(null);
    setChecking(true);
    try {
      const data = await api.get('/api/account/deletion-check');
      setCheck(data);
    } catch (err) {
      setCheckError(err.data?.error ?? 'Could not check your account. Please try again.');
    } finally {
      setChecking(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await api.post('/api/account/delete', password ? { password } : undefined);
      await logout();
      navigate('/goodbye', { state: { scheduledFor: result.scheduledFor } });
    } catch (err) {
      if (err.status === 403 && err.data?.reauth) {
        setReauthNeeded(err.data.reauth);
        setDeleteError(err.data?.error ?? null);
      } else {
        setDeleteError(err.data?.error ?? 'Could not delete your account. Please try again.');
      }
      setDeleting(false);
    }
  }

  const reauth = reauthNeeded ?? check?.reauthRequired ?? null;
  const blockers = check?.blockers ?? [];
  const soloOwnedHives = check?.soloOwnedHives ?? [];

  return (
    <div className="acct-session-row acct-session-row--stacked">
      <div className="acct-session-row">
        <div>
          <div className="acct-session-title">Delete account</div>
          <div className="acct-session-sub">Permanently removes your profile and Hives.</div>
        </div>
        {!open && (
          <button className="acct-btn acct-btn-danger" onClick={openPanel}>Delete</button>
        )}
      </div>

      {open && (
        <div className="acct-delete-panel">
          {checking && <p className="acct-delete-hint">Checking your account…</p>}
          {checkError && <p className="acct-delete-error">{checkError}</p>}

          {check && blockers.length > 0 && (
            <>
              <p className="acct-delete-hint acct-delete-hint--warn">
                You own {blockers.length === 1 ? 'a Hive' : 'Hives'} with other active members.
                Transfer ownership or delete {blockers.length === 1 ? 'it' : 'them'} first.
              </p>
              <ul className="acct-delete-blocker-list">
                {blockers.map(b => (
                  <li key={b.hive_id}>{b.hive_name} — {b.other_members} other member{b.other_members === 1 ? '' : 's'}</li>
                ))}
              </ul>
            </>
          )}

          {check && blockers.length === 0 && (
            <>
              {soloOwnedHives.length > 0 && (
                <p className="acct-delete-hint acct-delete-hint--warn">
                  {soloOwnedHives.length === 1
                    ? `"${soloOwnedHives[0].hive_name}" will also be deleted — you're its only member.`
                    : `${soloOwnedHives.length} Hives you solely own will also be deleted.`}
                  {' '}Restorable for 30 days if you log back in.
                </p>
              )}

              {reauth === 'password' && (
                <>
                  <p className="acct-delete-hint">Confirm your password to continue.</p>
                  <input
                    type="password"
                    className="acct-delete-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    autoFocus
                  />
                </>
              )}

              {reauth === 'google' && (
                <p className="acct-delete-hint acct-delete-hint--warn">
                  Your session has aged out. Sign in with Google again, then
                  come back to this page and click Delete again.
                </p>
              )}

              {deleteError && <p className="acct-delete-error">{deleteError}</p>}

              <div className="acct-delete-actions">
                <button className="acct-btn acct-btn-outline" onClick={() => setOpen(false)} disabled={deleting}>
                  Cancel
                </button>
                {reauth === 'google' ? (
                  <button
                    className="acct-btn acct-btn-gold"
                    onClick={() => { window.location.href = `${import.meta.env.VITE_API_URL ?? ''}/api/auth/google`; }}
                  >
                    Sign in with Google
                  </button>
                ) : (
                  <button
                    className="acct-btn acct-btn-danger"
                    onClick={confirmDelete}
                    disabled={deleting || (reauth === 'password' && !password)}
                  >
                    {deleting ? 'Deleting…' : 'Delete My Account'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

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

function EmailVerificationRow({ verified, email }) {
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState(null);

  async function handleResend() {
    if (sending || sent) return;
    setSending(true);
    setError(null);
    try {
      await api.post('/api/auth/resend-verification');
      setSent(true);
    } catch (err) {
      setError(err.data?.error ?? 'Could not send verification email. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="acct-row">
      <dt className="acct-row-label">Email verification</dt>
      <dd className="acct-row-value acct-row-action">
        <span className={verified ? 'acct-verified-badge' : 'acct-unverified-badge'}>
          {verified ? 'Verified' : 'Not verified'}
        </span>
        {!verified && (
          sent ? (
            <span className="acct-payments-success">Sent — check {email || 'your inbox'}.</span>
          ) : (
            <button className="acct-btn acct-btn-outline" onClick={handleResend} disabled={sending}>
              {sending ? 'Sending…' : 'Resend link'}
            </button>
          )
        )}
        {error && <span className="acct-payments-error" style={{ margin: 0 }}>{error}</span>}
      </dd>
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
              <EmailVerificationRow verified={user?.emailVerified} email={user?.email} />
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
            <DeleteAccountRow />
          </div>

        </div>
      </div>
    </>
  );
}
