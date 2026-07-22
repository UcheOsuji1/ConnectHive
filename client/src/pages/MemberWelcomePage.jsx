import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import '../styles/welcome.css';

function formatDate(dateStr) {
  if (!dateStr) return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function MemberWelcomePage() {
  const { hiveId } = useParams();
  const { user }   = useAuth();
  const [hiveName,  setHiveName]  = useState('');
  const [joinedAt,  setJoinedAt]  = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/api/hives/${hiveId}`),
      api.get(`/api/hives/${hiveId}/members`),
    ])
      .then(([hiveData, membersData]) => {
        setHiveName(hiveData.hive?.hive_name ?? '');
        const me = (membersData.members ?? []).find(m => m.user_id === user?.user_id);
        if (me?.joined_at) setJoinedAt(me.joined_at);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [hiveId, user?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="wlc-shell">
        <div className="wlc-card wlc-loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className="wlc-shell">
      <div className="wlc-card">

        {/* Gold hex seal */}
        <div className="wlc-seal">
          <svg viewBox="0 0 72 72" width="72" height="72" fill="none">
            <polygon
              points="36,4 67,21 67,55 36,72 5,55 5,21"
              fill="rgba(200,155,44,0.18)"
              stroke="#C89B2C"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <text x="36" y="44" textAnchor="middle" fontSize="22" fill="#C89B2C">✓</text>
          </svg>
        </div>

        <div className="wlc-eyebrow">— MEMBERSHIP CONFIRMED —</div>

        <h1 className="wlc-headline">You're in.</h1>

        <p className="wlc-sub">
          Welcome to <span className="wlc-hive-name">{hiveName}</span>
        </p>

        <div className="wlc-divider-wrap">
          <hr className="wlc-rule" />
          <span className="wlc-rule-text">You're officially part of something great.</span>
          <hr className="wlc-rule" />
        </div>

        {/* Credential strip */}
        <div className="wlc-credential">
          <div className="wlc-cred-row">
            <span className="wlc-cred-label">MEMBER ID</span>
            <span className="wlc-cred-value">{user?.memberId ?? '—'}</span>
          </div>
          <div className="wlc-cred-divider" />
          <div className="wlc-cred-row">
            <span className="wlc-cred-label">JOINED</span>
            <span className="wlc-cred-value">{formatDate(joinedAt)}</span>
          </div>
        </div>

        <div className="wlc-actions">
          <Link to={`/hive/${hiveId}`} className="wlc-btn-primary">
            Open {hiveName} →
          </Link>
          <Link to="/home" className="wlc-btn-ghost">
            Back to home
          </Link>
        </div>

      </div>
    </div>
  );
}
