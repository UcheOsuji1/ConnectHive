import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import '../styles/ceremony.css';

function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function formatDate(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const STEPS = [
  'Read mission & values',
  'Introduce yourself',
  'Pick channels & interests',
  'RSVP to orientation',
];

export default function WelcomeTakeover({ hive, hiveId, onEnter }) {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/members`)
      .then(d => setMembers(d.members ?? []))
      .catch(() => setMembers([]));
  }, [hiveId]);

  const owner = members.find(m => m.role === 'owner');
  const me    = members.find(m => m.user_id === user?.userId);

  const firstName = user?.fullName?.split(' ')[0] ?? 'there';
  const joinedAt  = formatDate(me?.joined_at);

  const welcomeMessage =
    hive.icebreaker ||
    hive.description ||
    "We're a welcoming community — don't hesitate to introduce yourself and dive in.";

  async function handleEnter() {
    setEntering(true);
    try { await api.post(`/api/hives/${hiveId}/welcome-seen`, {}); } catch {}
    onEnter();
  }

  return (
    <div className="wt-overlay">
      <div className="wt-backdrop" />
      <div className="wt-panel" role="dialog" aria-modal="true" aria-label="Welcome to the Hive">

        {/* Hex crest */}
        <div className="wt-crest-wrap">
          <svg viewBox="0 0 80 80" width="76" height="76" aria-hidden="true">
            <polygon
              points="40,4 73,22 73,58 40,76 7,58 7,22"
              fill="#17120a" stroke="#c49a28" strokeWidth="2.5" strokeLinejoin="round"
            />
          </svg>
          <span className="wt-crest-icon" aria-hidden="true">♛</span>
        </div>

        {/* Headline */}
        <div className="wt-eyebrow">YOU'RE OFFICIALLY IN</div>
        <h2 className="wt-headline">
          Welcome to {hive.hive_name},<br />{firstName}
        </h2>
        <p className="wt-sub">We're thrilled to have you as part of our community.</p>

        {/* Membership card — the one dark block */}
        <div className="wt-mem-card">
          <div className="wt-mc-top">
            <div className="wt-mc-avatar" aria-hidden="true">
              {user?.profilePhotoUrl
                ? <img src={user.profilePhotoUrl} alt="" />
                : <span>{initials(user?.fullName)}</span>}
            </div>
            <div className="wt-mc-info">
              <div className="wt-mc-name">{user?.fullName ?? 'New Member'}</div>
              <div className="wt-mc-hive">{hive.hive_name}</div>
              <span className="wt-mc-badge">MEMBER</span>
            </div>
            {/* Subtle honeycomb seal */}
            <svg className="wt-mc-seal" viewBox="0 0 60 60" width="48" height="48" aria-hidden="true" opacity="0.12">
              <polygon points="30,3 55,17 55,45 30,59 5,45 5,17" fill="none" stroke="#c49a28" strokeWidth="1.5" />
              <polygon points="30,12 47,21 47,41 30,50 13,41 13,21" fill="none" stroke="#c49a28" strokeWidth="1" />
            </svg>
          </div>
          <div className="wt-mc-cols">
            <div className="wt-mc-col">
              <div className="wt-mc-col-label">OWNER</div>
              <div className="wt-mc-col-val">{owner?.full_name ?? '—'}</div>
            </div>
            <div className="wt-mc-divider" />
            <div className="wt-mc-col">
              <div className="wt-mc-col-label">MEMBER ID</div>
              <div className="wt-mc-col-val wt-mc-mono">{user?.memberId ?? '—'}</div>
            </div>
            <div className="wt-mc-divider" />
            <div className="wt-mc-col">
              <div className="wt-mc-col-label">JOINED</div>
              <div className="wt-mc-col-val">{joinedAt}</div>
            </div>
          </div>
        </div>

        {/* Owner welcome note */}
        <div className="wt-owner-note">
          <blockquote className="wt-owner-quote">"{welcomeMessage}"</blockquote>
          <div className="wt-owner-sig">
            {owner?.profile_photo_url ? (
              <img className="wt-owner-avatar" src={owner.profile_photo_url} alt="" />
            ) : (
              <div className="wt-owner-avatar wt-owner-initials">{initials(owner?.full_name)}</div>
            )}
            <span className="wt-owner-name">— {owner?.full_name ?? 'The Hive Owner'}</span>
          </div>
        </div>

        {/* Get started steps (static preview) */}
        <div className="wt-steps-panel">
          <div className="wt-steps-header">
            <span className="wt-steps-label">GET STARTED (OPTIONAL)</span>
            <span className="wt-steps-progress">0 of {STEPS.length} completed</span>
          </div>
          <div className="wt-steps-list">
            {STEPS.map((step, i) => (
              <div key={i} className="wt-step-row">
                <span className="wt-step-num">{i + 1}</span>
                <span className="wt-step-text">{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="wt-actions">
          <button
            type="button"
            className="wt-btn-primary"
            onClick={handleEnter}
            disabled={entering}
          >
            {entering ? 'Entering…' : 'Enter Hive →'}
          </button>
          <Link to={`/welcome/hive/${hiveId}`} className="wt-btn-secondary">
            View Welcome Steps
          </Link>
        </div>

      </div>
    </div>
  );
}
