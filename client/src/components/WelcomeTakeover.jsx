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
  { icon: '📖', title: 'Read mission & values',    desc: 'Understand what we stand for'     },
  { icon: '👋', title: 'Introduce yourself',        desc: 'Say hi in the introductions feed' },
  { icon: '🎯', title: 'Pick channels & interests', desc: 'Tailor your Hive experience'      },
  { icon: '📅', title: 'RSVP to orientation',       desc: 'Meet the community in person'     },
];

function OrnateCrest() {
  return (
    <svg viewBox="0 0 320 90" className="wt-crest-svg" aria-hidden="true">
      {/* Left laurel branch */}
      <g fill="#c49a28">
        <ellipse cx="112" cy="33" rx="13" ry="5.5" transform="rotate(-22,112,33)" />
        <ellipse cx="93"  cy="25" rx="12" ry="5"   transform="rotate(-40,93,25)"  opacity="0.9"/>
        <ellipse cx="76"  cy="21" rx="11" ry="4.5" transform="rotate(-57,76,21)"  opacity="0.85"/>
        <ellipse cx="61"  cy="21" rx="10" ry="4"   transform="rotate(-72,61,21)"  opacity="0.8"/>
        <ellipse cx="49"  cy="25" rx="9"  ry="3.5" transform="rotate(-85,49,25)"  opacity="0.7"/>
        <ellipse cx="112" cy="57" rx="13" ry="5.5" transform="rotate(22,112,57)"  />
        <ellipse cx="93"  cy="65" rx="12" ry="5"   transform="rotate(40,93,65)"   opacity="0.9"/>
        <ellipse cx="76"  cy="69" rx="11" ry="4.5" transform="rotate(57,76,69)"   opacity="0.85"/>
        <ellipse cx="61"  cy="69" rx="10" ry="4"   transform="rotate(72,61,69)"   opacity="0.8"/>
        <ellipse cx="49"  cy="65" rx="9"  ry="3.5" transform="rotate(85,49,65)"   opacity="0.7"/>
        <path d="M126 45 C110 40 94 31 78 25 C65 21 52 21 42 24" stroke="#c49a28" strokeWidth="1.5" fill="none" opacity="0.55"/>
        <path d="M126 45 C110 50 94 59 78 65 C65 69 52 69 42 66" stroke="#c49a28" strokeWidth="1.5" fill="none" opacity="0.55"/>
        <path d="M42 24 C38 34 38 56 42 66" stroke="#c49a28" strokeWidth="1.8" fill="none" opacity="0.65"/>
      </g>
      {/* Right laurel branch (mirrored) */}
      <g fill="#c49a28" transform="translate(320,0) scale(-1,1)">
        <ellipse cx="112" cy="33" rx="13" ry="5.5" transform="rotate(-22,112,33)" />
        <ellipse cx="93"  cy="25" rx="12" ry="5"   transform="rotate(-40,93,25)"  opacity="0.9"/>
        <ellipse cx="76"  cy="21" rx="11" ry="4.5" transform="rotate(-57,76,21)"  opacity="0.85"/>
        <ellipse cx="61"  cy="21" rx="10" ry="4"   transform="rotate(-72,61,21)"  opacity="0.8"/>
        <ellipse cx="49"  cy="25" rx="9"  ry="3.5" transform="rotate(-85,49,25)"  opacity="0.7"/>
        <ellipse cx="112" cy="57" rx="13" ry="5.5" transform="rotate(22,112,57)"  />
        <ellipse cx="93"  cy="65" rx="12" ry="5"   transform="rotate(40,93,65)"   opacity="0.9"/>
        <ellipse cx="76"  cy="69" rx="11" ry="4.5" transform="rotate(57,76,69)"   opacity="0.85"/>
        <ellipse cx="61"  cy="69" rx="10" ry="4"   transform="rotate(72,61,69)"   opacity="0.8"/>
        <ellipse cx="49"  cy="65" rx="9"  ry="3.5" transform="rotate(85,49,65)"   opacity="0.7"/>
        <path d="M126 45 C110 40 94 31 78 25 C65 21 52 21 42 24" stroke="#c49a28" strokeWidth="1.5" fill="none" opacity="0.55"/>
        <path d="M126 45 C110 50 94 59 78 65 C65 69 52 69 42 66" stroke="#c49a28" strokeWidth="1.5" fill="none" opacity="0.55"/>
        <path d="M42 24 C38 34 38 56 42 66" stroke="#c49a28" strokeWidth="1.8" fill="none" opacity="0.65"/>
      </g>
      {/* Central charcoal hexagon */}
      <polygon points="160,9 186,24 186,54 160,69 134,54 134,24"
        fill="#17120a" stroke="#c49a28" strokeWidth="2.5" strokeLinejoin="round"/>
      {/* Crown */}
      <text x="160" y="42" textAnchor="middle" dominantBaseline="middle"
        fill="#c49a28" fontSize="26" fontFamily="Georgia,'Times New Roman',serif">♛</text>
      {/* Small honeycomb mark */}
      <polygon points="160,58 164.3,60.5 164.3,65.5 160,68 155.7,65.5 155.7,60.5"
        fill="none" stroke="#c49a28" strokeWidth="0.9" opacity="0.45"/>
    </svg>
  );
}

export default function WelcomeTakeover({ hive, hiveId, onEnter }) {
  const { user }   = useAuth();
  const [members,  setMembers]  = useState([]);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/members`)
      .then(d => setMembers(d.members ?? []))
      .catch(() => setMembers([]));
  }, [hiveId]);

  const owner     = members.find(m => m.role === 'owner');
  const me        = members.find(m => m.user_id === user?.userId);
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

        {/* Confetti — decorative only, aria-hidden, pointer-events none */}
        <div className="wt-confetti" aria-hidden="true">
          <div className="wt-ribbon wt-r1" /><div className="wt-ribbon wt-r2" />
          <div className="wt-ribbon wt-r3" /><div className="wt-ribbon wt-r4" />
          <div className="wt-ribbon wt-r5" /><div className="wt-ribbon wt-r6" />
          <svg className="wt-hf wt-hfl" viewBox="0 0 20 23" width="13" height="15" aria-hidden="true">
            <polygon points="10,1 18,5.5 18,15.5 10,20 2,15.5 2,5.5" fill="none" stroke="#c49a28" strokeWidth="1.5" opacity="0.45"/>
          </svg>
          <svg className="wt-hf wt-hfr" viewBox="0 0 20 23" width="10" height="12" aria-hidden="true">
            <polygon points="10,1 18,5.5 18,15.5 10,20 2,15.5 2,5.5" fill="none" stroke="#c49a28" strokeWidth="1.5" opacity="0.4"/>
          </svg>
          <svg className="wt-hf wt-hfc" viewBox="0 0 20 23" width="11" height="13" aria-hidden="true">
            <polygon points="10,1 18,5.5 18,15.5 10,20 2,15.5 2,5.5" fill="none" stroke="#c49a28" strokeWidth="1.5" opacity="0.35"/>
          </svg>
        </div>

        {/* Hero: crest + headline (full width, centered) */}
        <div className="wt-hero">
          <OrnateCrest />
          <div className="wt-eyebrow">YOU'RE OFFICIALLY IN</div>
          <h2 className="wt-headline">
            Welcome to <span className="wt-hn-gold">{hive.hive_name}</span>,<br />{firstName}
          </h2>
          <p className="wt-sub">We're thrilled to have you as part of our community.</p>
        </div>

        {/* Two-column body */}
        <div className="wt-body">

          {/* LEFT: membership card + owner note */}
          <div className="wt-col-left">
            <div className="wt-mem-card">
              <span className="wt-mc-pill">MEMBER</span>
              <div className="wt-mc-top">
                <div className="wt-mc-avatar">
                  {user?.profilePhotoUrl
                    ? <img src={user.profilePhotoUrl} alt="" />
                    : <span>{initials(user?.fullName)}</span>}
                </div>
                <div className="wt-mc-info">
                  <div className="wt-mc-name">{user?.fullName ?? 'New Member'}</div>
                  <div className="wt-mc-hive">{hive.hive_name}</div>
                </div>
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
              {/* Embossed honeycomb watermark */}
              <svg className="wt-mc-seal" viewBox="0 0 80 80" aria-hidden="true" width="60" height="60">
                <polygon points="40,4 72,22 72,58 40,76 8,58 8,22"
                  fill="none" stroke="#c49a28" strokeWidth="1.5" opacity="0.14"/>
                <polygon points="40,16 62,28 62,52 40,64 18,52 18,28"
                  fill="none" stroke="#c49a28" strokeWidth="1" opacity="0.09"/>
              </svg>
            </div>

            <div className="wt-owner-note">
              <div className="wt-quote-mark" aria-hidden="true">"</div>
              <blockquote className="wt-owner-quote">{welcomeMessage}</blockquote>
              <div className="wt-owner-sig">
                {owner?.profile_photo_url
                  ? <img className="wt-owner-avatar" src={owner.profile_photo_url} alt="" />
                  : <div className="wt-owner-avatar wt-owner-initials">{initials(owner?.full_name)}</div>}
                <span className="wt-owner-name">— {owner?.full_name ?? 'The Hive Owner'}, Owner</span>
              </div>
            </div>
          </div>

          {/* RIGHT: steps panel */}
          <div className="wt-col-right">
            <div className="wt-steps-panel">
              <div className="wt-steps-header">
                <span className="wt-steps-label">GET STARTED (OPTIONAL)</span>
                <span className="wt-steps-progress">0 of {STEPS.length} completed</span>
              </div>
              <div className="wt-steps-list">
                {STEPS.map((step, i) => (
                  <div key={i} className="wt-step-card">
                    <span className="wt-step-icon" aria-hidden="true">{step.icon}</span>
                    <div className="wt-step-content">
                      <div className="wt-step-title">{step.title}</div>
                      <div className="wt-step-desc">{step.desc}</div>
                    </div>
                    <span className="wt-step-num" aria-hidden="true">{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Actions — centered below both columns */}
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
