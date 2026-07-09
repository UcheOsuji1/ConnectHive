import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import '../styles/account.css';

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
                  <span>Everyone in ConnectHive</span>
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
                <div className="acct-session-sub">Sign out of your ConnectHive account on this device.</div>
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
