import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, useSearchParams, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import Avatar from '../../components/Avatar.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import '../../styles/hive-mentorship.css';

const TABS = [
  { key: 'find', label: 'Find a mentor' },
  { key: 'requests', label: 'Requests' },
  { key: 'mine', label: 'My mentorships' },
];

/* ───────────────────────── Profile setup modal ───────────────────────── */
function ProfileModal({ hiveId, profile, mySkills, onClose, onSaved }) {
  const [role, setRole] = useState(profile?.role ?? 'mentee');
  const [topics, setTopics] = useState(profile?.topics ?? []);
  const [newTopic, setNewTopic] = useState('');
  const [about, setAbout] = useState(profile?.about ?? '');
  const [capacity, setCapacity] = useState(profile?.capacity ?? 2);
  const [accepting, setAccepting] = useState(profile?.accepting ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function addTopic(t) {
    const trimmed = t.trim();
    if (!trimmed || topics.length >= 8 || topics.includes(trimmed)) return;
    setTopics([...topics, trimmed]);
  }

  async function save(e) {
    e.preventDefault();
    if (topics.length === 0) { setError('Pick at least one topic.'); return; }
    setBusy(true); setError(null);
    try {
      await api.put(`/api/hives/${hiveId}/tools/mentorship/profile`, {
        role, topics, about, capacity: Number(capacity), accepting,
      });
      onSaved();
    } catch (e2) {
      setError(e2?.data?.error ?? 'Could not save.');
      setBusy(false);
    }
  }

  const unusedSkills = (mySkills ?? []).filter(s => !topics.includes(s));

  return (
    <>
      <div className="mts-scrim" onClick={onClose} />
      <div className="mts-modal" role="dialog" aria-modal="true">
        <div className="mts-modal-head">
          <h3 className="mts-modal-title">Your mentorship card</h3>
          <button type="button" className="mts-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="mts-form" onSubmit={save}>
          <div className="mts-field">
            I am a
            <div className="mts-role-row">
              {['mentee', 'mentor', 'both'].map(r => (
                <button key={r} type="button" className={`mts-role-btn${role === r ? ' mts-role-btn--on' : ''}`}
                        onClick={() => setRole(r)}>
                  {r === 'both' ? 'Both' : r === 'mentor' ? 'Mentor' : 'Mentee'}
                </button>
              ))}
            </div>
          </div>

          <div className="mts-field">
            Topics (1-8)
            {unusedSkills.length > 0 && (
              <div className="mts-chip-row">
                {unusedSkills.map(s => (
                  <button key={s} type="button" className="mts-chip-btn" onClick={() => addTopic(s)}>+ {s}</button>
                ))}
              </div>
            )}
            <div className="mts-topic-list">
              {topics.map(t => (
                <span key={t} className="mts-topic-pill">
                  {t}
                  <button type="button" onClick={() => setTopics(topics.filter(x => x !== t))} aria-label={`Remove ${t}`}>×</button>
                </span>
              ))}
            </div>
            <div className="mts-add-row">
              <input value={newTopic} onChange={e => setNewTopic(e.target.value)} maxLength={40}
                     placeholder="Add a topic…"
                     onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTopic(newTopic); setNewTopic(''); } }} />
              <button type="button" className="mts-btn-ghost" onClick={() => { addTopic(newTopic); setNewTopic(''); }}>Add</button>
            </div>
          </div>

          <label className="mts-field">
            About (optional)
            <textarea className="mts-textarea" rows={3} maxLength={280} value={about} onChange={e => setAbout(e.target.value)} />
          </label>

          {(role === 'mentor' || role === 'both') && (
            <>
              <label className="mts-field">
                Capacity — how many mentees at once
                <input type="number" min={0} max={5} value={capacity} onChange={e => setCapacity(e.target.value)} />
              </label>
              <label className="mts-check-row">
                <input type="checkbox" checked={accepting} onChange={e => setAccepting(e.target.checked)} />
                Currently accepting requests
              </label>
            </>
          )}

          {error && <p className="mts-error">{error}</p>}
          <div className="mts-modal-foot">
            <button type="button" className="mts-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="mts-btn-gold" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ───────────────────────── Request modal ───────────────────────── */
function RequestModal({ hiveId, mentor, onClose, onSent }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function send(e) {
    e.preventDefault();
    if (!message.trim()) { setError('Say a bit about what you’re hoping for.'); return; }
    setBusy(true); setError(null);
    try {
      await api.post(`/api/hives/${hiveId}/tools/mentorship/requests`, { mentorId: mentor.user_id, message });
      onSent();
    } catch (e2) {
      setError(e2?.data?.error ?? 'Could not send this request.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mts-scrim" onClick={onClose} />
      <div className="mts-modal" role="dialog" aria-modal="true">
        <div className="mts-modal-head">
          <h3 className="mts-modal-title">Request {mentor.full_name}</h3>
          <button type="button" className="mts-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="mts-form" onSubmit={send}>
          <label className="mts-field">
            What would you like help with?
            <textarea className="mts-textarea" rows={4} maxLength={500} value={message}
                      onChange={e => setMessage(e.target.value)} autoFocus />
          </label>
          {error && <p className="mts-error">{error}</p>}
          <div className="mts-modal-foot">
            <button type="button" className="mts-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="mts-btn-gold" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ───────────────────────── Find a mentor tab ───────────────────────── */
function FindMentorTab({ hiveId }) {
  const [mentors, setMentors] = useState(null);
  const [requesting, setRequesting] = useState(null);
  const [sentTo, setSentTo] = useState(new Set());

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/mentorship/mentors`).then(d => setMentors(d.mentors ?? [])).catch(() => setMentors([]));
  }, [hiveId]);
  useEffect(() => { load(); }, [load]);

  if (mentors === null) return <div className="mts-skel" />;
  if (mentors.length === 0) return <p className="mts-empty">No mentors with open spots right now.</p>;

  return (
    <div className="mts-mentor-grid">
      {mentors.map(m => (
        <div key={m.user_id} className="mts-mentor-card">
          <div className="mts-mentor-top">
            <Avatar name={m.full_name} src={m.profile_photo_url} size={40} />
            <div>
              <div className="mts-mentor-name">{m.full_name}</div>
              <div className="mts-mentor-spots">{m.open_spots} open spot{m.open_spots === 1 ? '' : 's'}</div>
            </div>
          </div>
          {m.about && <p className="mts-mentor-about">{m.about}</p>}
          <div className="mts-topic-list">
            {m.topics.map(t => (
              <span key={t} className={`mts-topic-pill mts-topic-pill--readonly${m.overlapping_topics.includes(t) ? ' mts-topic-pill--match' : ''}`}>
                {t}
              </span>
            ))}
          </div>
          <button type="button" className="mts-btn-gold mts-request-btn" disabled={sentTo.has(m.user_id)}
                  onClick={() => setRequesting(m)}>
            {sentTo.has(m.user_id) ? 'Request sent' : 'Request mentorship'}
          </button>
        </div>
      ))}
      {requesting && (
        <RequestModal hiveId={hiveId} mentor={requesting} onClose={() => setRequesting(null)}
                      onSent={() => { setSentTo(s => new Set([...s, requesting.user_id])); setRequesting(null); }} />
      )}
    </div>
  );
}

/* ───────────────────────── Requests tab ───────────────────────── */
function RequestsTab({ hiveId }) {
  const [direction, setDirection] = useState('incoming');
  const [requests, setRequests] = useState(null);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/mentorship/requests?direction=${direction}`)
      .then(d => setRequests(d.requests ?? [])).catch(() => setRequests([]));
  }, [hiveId, direction]);
  useEffect(() => { load(); }, [load]);

  async function act(requestId, action) {
    await api.post(`/api/hives/${hiveId}/tools/mentorship/requests/${requestId}/${action}`).catch(() => {});
    load();
  }

  return (
    <div>
      <div className="mts-subtabs">
        <button type="button" className={`mts-subtab${direction === 'incoming' ? ' mts-subtab--on' : ''}`}
                onClick={() => setDirection('incoming')}>Incoming</button>
        <button type="button" className={`mts-subtab${direction === 'outgoing' ? ' mts-subtab--on' : ''}`}
                onClick={() => setDirection('outgoing')}>Outgoing</button>
      </div>
      {requests === null ? <div className="mts-skel" /> : requests.length === 0 ? (
        <p className="mts-empty">No {direction} requests.</p>
      ) : (
        <div className="mts-request-list">
          {requests.map(r => {
            const other = direction === 'incoming' ? r.mentee : r.mentor;
            return (
              <div key={r.request_id} className="mts-request-row">
                <Avatar name={other.full_name} src={other.profile_photo_url} size={36} />
                <div className="mts-request-main">
                  <div className="mts-request-name">{other.full_name}</div>
                  <p className="mts-request-message">{r.message}</p>
                  <span className={`mts-status-pill mts-status-pill--${r.status}`}>{r.status}</span>
                </div>
                {direction === 'incoming' && r.status === 'pending' && (
                  <div className="mts-request-actions">
                    <button type="button" className="mts-btn-gold" onClick={() => act(r.request_id, 'accept')}>Accept</button>
                    <button type="button" className="mts-btn-ghost" onClick={() => act(r.request_id, 'decline')}>Decline</button>
                  </div>
                )}
                {direction === 'outgoing' && r.status === 'pending' && (
                  <button type="button" className="mts-btn-ghost" onClick={() => act(r.request_id, 'withdraw')}>Withdraw</button>
                )}
                {r.status === 'accepted' && (
                  <Link to={`/hive/${hiveId}/chat/${r.channel_id}`} className="mts-btn-ghost">Open chat</Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── My mentorships tab ───────────────────────── */
function MineTab({ hiveId, myUserId }) {
  const [list, setList] = useState(null);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/mentorship/mine`).then(d => setList(d.mentorships ?? [])).catch(() => setList([]));
  }, [hiveId]);
  useEffect(() => { load(); }, [load]);

  async function end(requestId) {
    if (!window.confirm('End this mentorship? The chat stays, but won’t take new messages.')) return;
    await api.post(`/api/hives/${hiveId}/tools/mentorship/requests/${requestId}/end`).catch(() => {});
    load();
  }

  if (list === null) return <div className="mts-skel" />;
  if (list.length === 0) return <p className="mts-empty">No mentorships yet.</p>;

  return (
    <div className="mts-request-list">
      {list.map(r => {
        const iAmMentor = r.mentor.user_id === myUserId;
        const other = iAmMentor ? r.mentee : r.mentor;
        return (
          <div key={r.request_id} className="mts-request-row">
            <Avatar name={other.full_name} src={other.profile_photo_url} size={36} />
            <div className="mts-request-main">
              <div className="mts-request-name">{other.full_name}</div>
              <span className="mts-request-role">{iAmMentor ? 'You’re their mentor' : 'You’re their mentee'}</span>
              <span className={`mts-status-pill mts-status-pill--${r.status}`}>{r.status}</span>
            </div>
            <Link to={`/hive/${hiveId}/chat/${r.channel_id}`} className="mts-btn-ghost">Open chat</Link>
            {r.status === 'accepted' && (
              <button type="button" className="mts-btn-text mts-btn-text--danger" onClick={() => end(r.request_id)}>End</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function HiveMentorshipPage() {
  const { hiveId } = useOutletContext() ?? {};
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some(t => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'find';
  const { user } = useAuth();
  const myUserId = user?.user_id ?? null;
  const [profile, setProfile] = useState(undefined);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [mySkills, setMySkills] = useState([]);

  const loadProfile = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/mentorship/profile`).then(d => setProfile(d.profile)).catch(() => setProfile(null));
  }, [hiveId]);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  useEffect(() => {
    api.get('/api/users/profile').then(d => {
      setMySkills((d.profile?.skills ?? []).map(s => typeof s === 'string' ? s : s?.label).filter(Boolean));
    }).catch(() => {});
  }, []);

  return (
    <div className="mts-page">
      <div className="mts-head">
        <div>
          <h2 className="mts-title">Mentorship</h2>
          <p className="mts-sub">Match mentors and mentees inside this Hive.</p>
        </div>
        <button type="button" className="mts-btn-ghost" onClick={() => setShowProfileModal(true)}>
          {profile ? 'Edit my card' : 'Set up my card'}
        </button>
      </div>

      <div className="mts-tabs">
        {TABS.map(t => (
          <button key={t.key} type="button" className={`mts-tab${tab === t.key ? ' mts-tab--on' : ''}`}
                  onClick={() => setSearchParams({ tab: t.key })}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'find' && <FindMentorTab hiveId={hiveId} />}
      {tab === 'requests' && <RequestsTab hiveId={hiveId} />}
      {tab === 'mine' && <MineTab hiveId={hiveId} myUserId={myUserId} />}

      {showProfileModal && (
        <ProfileModal hiveId={hiveId} profile={profile} mySkills={mySkills}
                      onClose={() => setShowProfileModal(false)}
                      onSaved={() => { setShowProfileModal(false); loadProfile(); }} />
      )}
    </div>
  );
}
