import { useState } from 'react';
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

// Identical ornate crest reused from WelcomeTakeover
function OrnateCrest() {
  return (
    <svg viewBox="0 0 320 90" className="wt-crest-svg" aria-hidden="true">
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
      <polygon points="160,9 186,24 186,54 160,69 134,54 134,24"
        fill="#17120a" stroke="#c49a28" strokeWidth="2.5" strokeLinejoin="round"/>
      <text x="160" y="42" textAnchor="middle" dominantBaseline="middle"
        fill="#c49a28" fontSize="26" fontFamily="Georgia,'Times New Roman',serif">♛</text>
      <polygon points="160,58 164.3,60.5 164.3,65.5 160,68 155.7,65.5 155.7,60.5"
        fill="none" stroke="#c49a28" strokeWidth="0.9" opacity="0.45"/>
    </svg>
  );
}

export default function OwnerCelebrationTakeover({ hive, hiveId, member, onDone }) {
  const { user }    = useAuth();
  const ownerFirst  = user?.fullName?.split(' ')[0] ?? 'there';
  const memberFirst = member.full_name?.split(' ')[0] ?? 'them';

  // ── Assign role ───────────────────────────────────────────────────────────────
  const [role,       setRole]       = useState('member');
  const [roleStatus, setRoleStatus] = useState(null); // null | 'saving' | 'saved' | 'error'

  async function handleRoleChange(newRole) {
    if (roleStatus === 'saving' || newRole === role) return;
    const prev = role;
    setRole(newRole);
    setRoleStatus('saving');
    try {
      await api.patch(`/api/hives/${hiveId}/members/${member.user_id}/role`, { role: newRole });
      setRoleStatus('saved');
    } catch {
      setRole(prev);
      setRoleStatus('error');
    }
  }

  // ── Send welcome message ──────────────────────────────────────────────────────
  const [msgText,   setMsgText]   = useState('');
  const [msgStatus, setMsgStatus] = useState(null); // null | 'sending' | 'sent'

  async function handleSendMessage() {
    if (!msgText.trim() || msgStatus === 'sending' || msgStatus === 'sent') return;
    setMsgStatus('sending');
    try {
      await api.post(`/api/hives/${hiveId}/members/${member.user_id}/notify`, { message: msgText.trim() });
      setMsgStatus('sent');
    } catch {
      setMsgStatus(null);
    }
  }

  return (
    <div className="wt-overlay">
      <div className="wt-backdrop" />
      <div className="wt-panel" role="dialog" aria-modal="true" aria-label="Member added">

        {/* Confetti — aria-hidden, pointer-events none */}
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

        {/* Hero */}
        <div className="wt-hero">
          <OrnateCrest />
          <div className="wt-eyebrow">NEW MEMBER ADDED</div>
          <h2 className="wt-headline">
            Congratulations, <span className="wt-hn-gold">{ownerFirst}</span>
          </h2>
          <p className="wt-sub">
            {member.full_name} is now officially part of {hive.hive_name}. Set them up for a great start.
          </p>
        </div>

        {/* Two-column body */}
        <div className="wt-body">

          {/* LEFT: accepted member card */}
          <div className="wt-col-left">
            <div className="wt-mem-card">
              <span className="wt-mc-pill">MEMBER</span>
              <div className="wt-mc-top">
                <div className="wt-mc-avatar">
                  {member.profile_photo_url
                    ? <img src={member.profile_photo_url} alt="" />
                    : <span>{initials(member.full_name)}</span>}
                </div>
                <div className="wt-mc-info">
                  <div className="wt-mc-name">{member.full_name ?? 'New Member'}</div>
                  <div className="wt-mc-hive">{hive.hive_name}</div>
                </div>
              </div>
              <div className="wt-mc-cols">
                <div className="wt-mc-col">
                  <div className="wt-mc-col-label">ROLE</div>
                  <div className="wt-mc-col-val">{role.charAt(0).toUpperCase() + role.slice(1)}</div>
                </div>
                <div className="wt-mc-divider" />
                <div className="wt-mc-col">
                  <div className="wt-mc-col-label">MEMBER ID</div>
                  <div className="wt-mc-col-val wt-mc-mono">{member.member_id ?? '—'}</div>
                </div>
                <div className="wt-mc-divider" />
                <div className="wt-mc-col">
                  <div className="wt-mc-col-label">JOINED</div>
                  <div className="wt-mc-col-val">{formatDate(member.joined_at)}</div>
                </div>
              </div>
              {/* Honeycomb watermark */}
              <svg className="wt-mc-seal" viewBox="0 0 80 80" aria-hidden="true" width="60" height="60">
                <polygon points="40,4 72,22 72,58 40,76 8,58 8,22"
                  fill="none" stroke="#c49a28" strokeWidth="1.5" opacity="0.14"/>
                <polygon points="40,16 62,28 62,52 40,64 18,52 18,28"
                  fill="none" stroke="#c49a28" strokeWidth="1" opacity="0.09"/>
              </svg>
            </div>
          </div>

          {/* RIGHT: quick setup panel */}
          <div className="wt-col-right">
            <div className="wt-steps-panel">
              <div className="wt-steps-header">
                <span className="wt-steps-label">QUICK SETUP (OPTIONAL)</span>
              </div>
              <div className="wt-steps-list">

                {/* 1. Assign role */}
                <div className="wt-step-card oct-action-card">
                  <span className="wt-step-icon" aria-hidden="true">🎭</span>
                  <div className="wt-step-content">
                    <div className="wt-step-title">Assign role</div>
                    <select
                      className="oct-select"
                      value={role}
                      onChange={e => handleRoleChange(e.target.value)}
                      disabled={roleStatus === 'saving'}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <span className="oct-status">
                    {roleStatus === 'saving' && <span className="oct-status-saving">…</span>}
                    {roleStatus === 'saved'  && <span className="oct-status-saved">✓ Saved</span>}
                    {roleStatus === 'error'  && <span className="oct-status-error">Failed</span>}
                  </span>
                </div>

                {/* 2. Send welcome message */}
                <div className="wt-step-card oct-action-card oct-msg-card">
                  <span className="wt-step-icon" aria-hidden="true">💬</span>
                  <div className="wt-step-content">
                    <div className="wt-step-title">Send welcome message</div>
                    {msgStatus === 'sent' ? (
                      <div className="oct-sent-confirm">Message sent ✓</div>
                    ) : (
                      <div className="oct-msg-row">
                        <input
                          type="text"
                          className="oct-input"
                          placeholder={`Welcome to the Hive, ${memberFirst}!`}
                          value={msgText}
                          onChange={e => setMsgText(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                          disabled={msgStatus === 'sending'}
                        />
                        <button
                          type="button"
                          className="oct-send-btn"
                          onClick={handleSendMessage}
                          disabled={!msgText.trim() || msgStatus === 'sending'}
                        >
                          {msgStatus === 'sending' ? '…' : 'Send'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. View member profile */}
                <div className="wt-step-card oct-action-card">
                  <span className="wt-step-icon" aria-hidden="true">👤</span>
                  <div className="wt-step-content">
                    <div className="wt-step-title">View member profile</div>
                    <div className="wt-step-desc">See their full profile and interests</div>
                  </div>
                  <Link
                    to={`/profile/${member.user_id}`}
                    className="oct-open-link"
                  >
                    Open →
                  </Link>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="wt-actions">
          <button
            type="button"
            className="wt-btn-primary"
            onClick={onDone}
          >
            Done
          </button>
          <Link to={`/profile/${member.user_id}`} className="wt-btn-secondary">
            View {memberFirst}'s profile
          </Link>
        </div>

      </div>
    </div>
  );
}
