import { useState, useEffect, useRef } from 'react';
import { useOutletContext, useNavigate, Link } from 'react-router-dom';
import Avatar from '../../components/Avatar.jsx';
import { Icon } from '../../components/home/HomeBits.jsx';
import { api } from '../../lib/api.js';
import '../../styles/hive-about.css';

function monthYear(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function flattenTags(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === 'string') { try { return flattenTags(JSON.parse(v)); } catch { return [v]; } }
  return [];
}

// Splits ground_rules into a numbered list on newlines, stripping any "1."
// or "-" the author already typed. A single unbroken block falls back to a
// plain paragraph instead of faking a one-item list.
function parseRules(text) {
  if (!text) return { items: [], paragraph: null };
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return { items: [], paragraph: text.trim() };
  return { items: lines.map(l => l.replace(/^(\d+[.)]\s*|[-*]\s*)/, '').trim()).filter(Boolean), paragraph: null };
}

function AddPlaceholder({ hiveId, label }) {
  return (
    <Link to={`/hive/${hiveId}/settings`} className="hab-placeholder">
      Add a {label} →
    </Link>
  );
}

export default function HiveAboutPage() {
  const { hive, hiveId, isOwner } = useOutletContext();
  const navigate = useNavigate();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaving,     setLeaving]     = useState(false);
  const [leaveError,  setLeaveError]  = useState(null);

  const [owner,   setOwner]   = useState(null);
  const [leaders, setLeaders] = useState([]); // owner + admins
  const [glance,  setGlance]  = useState(null);
  const [toast,   setToast]   = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/members`)
      .then(d => {
        const members = d.members ?? [];
        const leads = members.filter(m => m.role === 'owner' || m.role === 'admin');
        setLeaders(leads);
        setOwner(leads.find(m => m.role === 'owner') ?? null);
      })
      .catch(() => {});
    // Same stats query Hive Home uses — mediaCount and upcomingPlans share
    // its exact definition rather than a second, possibly-drifting one.
    api.get(`/api/hives/${hiveId}/home`)
      .then(d => setGlance(d.stats ?? null))
      .catch(() => {});
  }, [hiveId]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  function invite() {
    const link = `${window.location.origin}/hive/${hiveId}`;
    navigator.clipboard.writeText(link)
      .then(() => flash('Link copied'))
      .catch(() => flash('Could not copy the link'));
  }

  async function confirmLeave() {
    setLeaving(true);
    setLeaveError(null);
    try {
      await api.post(`/api/hives/${hiveId}/leave`, {});
      navigate('/my-hive');
    } catch (err) {
      setLeaveError(err.data?.error ?? 'Could not leave. Please try again.');
      setLeaving(false);
    }
  }

  if (!hive) return null;

  const canEdit = hive.my_role === 'owner' || hive.my_role === 'admin';
  const tags = flattenTags(hive.tags);
  const rules = parseRules(hive.ground_rules);

  const chips = [
    hive.category_name && { icon: 'users', text: hive.category_name },
    hive.location      && { icon: 'pin',   text: hive.location },
    hive.location_type && { icon: 'globe',
      text: hive.location_type.charAt(0).toUpperCase() + hive.location_type.slice(1) },
  ].filter(Boolean);

  return (
    <div className="hab-page">

      {/* ── Hero ── */}
      <header
        className={`hab-hero${hive.banner_url ? '' : ' hab-hero--fallback'}`}
        style={hive.banner_url ? { backgroundImage: `url(${hive.banner_url})` } : undefined}
      >
        <div className="hab-hero-scrim" />
        <div className="hab-hero-inner">
          <div className="hab-hero-text">
            <div className="hab-eyebrow">ABOUT THIS HIVE</div>
            <h1 className="hab-hero-title">{hive.hive_name}</h1>
            {hive.tagline ? (
              <p className="hab-hero-desc">{hive.tagline}</p>
            ) : canEdit ? (
              <AddPlaceholder hiveId={hiveId} label="tagline" />
            ) : null}
            {chips.length > 0 && (
              <div className="hab-hero-chips">
                {chips.map(c => (
                  <span key={c.icon} className="hab-herochip">
                    <Icon name={c.icon} size={14} /> {c.text}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="hab-invite" onClick={invite}>
            <Icon name="invite" size={16} /> Invite Friends
          </button>
        </div>
      </header>

      {toast && <div className="hab-toast">{toast}</div>}

      {/* ── Founder note ── */}
      {hive.founder_note ? (
        <section className="hab-card hab-note-card">
          <div className="hab-card-label">
            <span aria-hidden="true">💬</span> A note from {owner?.full_name?.split(' ')[0] ?? 'the founders'}
          </div>
          <div className="hab-note-body">
            <Avatar name={owner?.full_name} src={owner?.profile_photo_url} size={56} />
            <div className="hab-note-text">
              {hive.founder_note.split('\n').map((p, i) => p.trim() && <p key={i}>{p}</p>)}
              <p className="hab-note-sign">— {owner?.full_name ?? 'The founders'}, Founder</p>
            </div>
          </div>
        </section>
      ) : canEdit ? (
        <section className="hab-card hab-card--empty">
          <AddPlaceholder hiveId={hiveId} label="note from the founders" />
        </section>
      ) : null}

      {/* ── About This Hive ── */}
      {hive.description && (
        <section className="hab-card">
          <div className="hab-card-label"><span aria-hidden="true">📝</span> About This Hive</div>
          <p className="hab-card-body">{hive.description}</p>
        </section>
      )}

      {/* ── Purpose / Location / Cadence / Tags ── */}
      <div className="hab-grid4">
        {hive.purpose ? (
          <div className="hab-card">
            <div className="hab-card-label"><span aria-hidden="true">🎯</span> Our Purpose</div>
            <p className="hab-card-body">{hive.purpose}</p>
          </div>
        ) : canEdit ? (
          <div className="hab-card hab-card--empty"><AddPlaceholder hiveId={hiveId} label="purpose" /></div>
        ) : null}

        {hive.location && (
          <div
            className={`hab-card hab-card--photo${hive.banner_url ? '' : ' hab-card--photo-fallback'}`}
            style={hive.banner_url ? { backgroundImage: `url(${hive.banner_url})` } : undefined}
          >
            <div className="hab-card-photo-scrim" />
            <div className="hab-card-photo-content">
              <div className="hab-card-label hab-card-label--onphoto"><span aria-hidden="true">📍</span> Location</div>
              <p className="hab-card-body hab-card-body--onphoto">
                {hive.location}
                {hive.location_type && ` · ${hive.location_type.charAt(0).toUpperCase() + hive.location_type.slice(1)}`}
              </p>
            </div>
          </div>
        )}

        {hive.cadence && (
          <div className="hab-card">
            <div className="hab-card-label"><span aria-hidden="true">📅</span> Meeting Cadence</div>
            <p className="hab-card-body">{hive.cadence}</p>
          </div>
        )}

        {tags.length > 0 ? (
          <div className="hab-card">
            <div className="hab-card-label"><span aria-hidden="true">🏷️</span> Tags</div>
            <div className="hab-chips">
              {tags.map(t => <span key={t} className="hab-chip">{t}</span>)}
            </div>
          </div>
        ) : canEdit ? (
          <div className="hab-card hab-card--empty"><AddPlaceholder hiveId={hiveId} label="tags" /></div>
        ) : null}
      </div>

      {/* ── Rules / Pinned Goal / Glance ── */}
      <div className="hab-grid3">
        {hive.ground_rules ? (
          <div className="hab-card">
            <div className="hab-card-label"><span aria-hidden="true">📜</span> Hive Rules</div>
            {rules.items.length > 0 ? (
              <ol className="hab-rules-list">
                {rules.items.map((r, i) => <li key={i}>{r}</li>)}
              </ol>
            ) : (
              <p className="hab-card-body">{rules.paragraph}</p>
            )}
          </div>
        ) : canEdit ? (
          <div className="hab-card hab-card--empty"><AddPlaceholder hiveId={hiveId} label="Hive Rules" /></div>
        ) : null}

        {hive.pinned_goal && (
          <div className="hab-card">
            <div className="hab-card-label-row">
              <div className="hab-card-label"><span aria-hidden="true">⭐</span> Pinned Goal</div>
              {canEdit && <Link to={`/hive/${hiveId}/settings`} className="hab-edit-link">Edit →</Link>}
            </div>
            <p className="hab-card-body">{hive.pinned_goal}</p>
          </div>
        )}

        <div className="hab-card">
          <div className="hab-card-label"><span aria-hidden="true">📊</span> Hive at a Glance</div>
          <div className="hab-glance-grid">
            <div className="hab-glance-stat">
              <span className="hab-glance-num">{hive.member_count ?? '—'}</span>
              <span className="hab-glance-label">Members</span>
            </div>
            <div className="hab-glance-stat">
              <span className="hab-glance-num">{glance?.upcomingPlans ?? '—'}</span>
              <span className="hab-glance-label">Upcoming Plans</span>
            </div>
            <div className="hab-glance-stat">
              <span className="hab-glance-num">{glance?.mediaCount ?? '—'}</span>
              <span className="hab-glance-label">Photos & Files</span>
            </div>
            <div className="hab-glance-stat">
              <span className="hab-glance-num hab-glance-num--sm">Since {monthYear(hive.created_at)}</span>
              <span className="hab-glance-label">Created</span>
            </div>
            {/* Only once 3+ past plans have check-in data (Prompt 61 Part 5) —
                never shown as 0% before there's real data behind it. */}
            {glance?.attendanceRate && (
              <div className="hab-glance-stat">
                <span className="hab-glance-num">{glance.attendanceRate.rate}%</span>
                <span className="hab-glance-label">Attendance Rate</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Owners and admins ── */}
      {leaders.length > 0 && (
        <section className="hab-card">
          <div className="hab-card-label"><span aria-hidden="true">👑</span> Owners &amp; Admins</div>
          <div className="hab-leaders-list">
            {leaders.map(m => (
              <Link key={m.user_id} to={`/profile/${m.user_id}`} className="hab-leader">
                <Avatar name={m.full_name} src={m.profile_photo_url} size={32} />
                <span>{m.full_name ?? 'Member'}</span>
                <span className="hab-leader-role">{m.role === 'owner' ? 'Founder' : 'Admin'}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Icebreaker ── */}
      {hive.icebreaker && (
        <section className="hab-card hab-icebreaker-card">
          <div className="hab-card-label"><span aria-hidden="true">💬</span> Conversation starter</div>
          <p className="hab-card-body">{hive.icebreaker}</p>
        </section>
      )}

      {/* ── Leave Hive — shown for non-owners only (owners use Settings) ── */}
      {!isOwner && (
        <div className="hw-settings-card hw-settings-danger-card">
          <div className="hw-card-label">Danger Zone</div>

          {!confirmOpen ? (
            <div className="hw-settings-danger-row">
              <div>
                <div className="hw-settings-label">Leave this Hive</div>
                <div className="hw-settings-hint">You can rejoin later if the Hive is open or re-apply if it requires approval.</div>
              </div>
              <button
                type="button"
                className="hw-settings-danger-btn"
                onClick={() => { setConfirmOpen(true); setLeaveError(null); }}
              >
                Leave Hive
              </button>
            </div>
          ) : (
            <div className="hw-leave-dialog">
              <p className="hw-leave-hint hw-leave-hint--warn">
                Are you sure you want to leave <strong>{hive.hive_name}</strong>?
              </p>
              {leaveError && <p className="hw-leave-error">{leaveError}</p>}
              <div className="hw-leave-actions">
                <button
                  type="button"
                  className="hw-leave-cancel-btn"
                  onClick={() => setConfirmOpen(false)}
                  disabled={leaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="hw-settings-danger-btn"
                  onClick={confirmLeave}
                  disabled={leaving}
                >
                  {leaving ? 'Leaving…' : 'Confirm Leave'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
