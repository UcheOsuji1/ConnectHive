import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api.js';
import Avatar from '../Avatar.jsx';
import '../../styles/hive-checkins.css';

// Check-in (Prompt 61 Part 5, extended Prompt 62 Part 0.5). Self check-in for
// the viewer, plus a host/owner/admin roll call over every active member —
// Going and Maybe listed first (the likely candidates), then everyone else,
// filterable by a search field once the Hive is big enough for that to matter.
export default function CheckInButton({ hiveId, postId, canHostCheckIn }) {
  const [data, setData] = useState(null);
  const [attendees, setAttendees] = useState(null);
  const [members, setMembers] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/plans/${postId}/checkins`).then(setData).catch(() => {});
  }, [hiveId, postId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!canHostCheckIn) return;
    api.get(`/api/events/${postId}/attendees`).then(setAttendees).catch(() => {});
    api.get(`/api/hives/${hiveId}/members`).then(d => setMembers(d.members ?? [])).catch(() => {});
  }, [canHostCheckIn, hiveId, postId]);

  async function selfCheckIn() {
    setBusy('self');
    setError(null);
    try {
      await api.post(`/api/hives/${hiveId}/plans/${postId}/checkin`);
      load();
    } catch (e) {
      setError(e?.data?.error ?? 'Could not check in.');
    } finally {
      setBusy(null);
    }
  }

  async function markAttended(userId) {
    setBusy(userId);
    setError(null);
    try {
      await api.post(`/api/hives/${hiveId}/plans/${postId}/checkin/${userId}`);
      load();
    } catch (e) {
      setError(e?.data?.error ?? 'Could not mark attendance.');
    } finally {
      setBusy(null);
    }
  }

  if (!data) return null;

  const checkedInIds = new Set(data.checkins.map(c => c.user_id));
  // Going + Maybe first (the likely candidates), then every other active
  // member — the endpoint allows marking anyone active, not just RSVPs.
  const goingMaybe = [...(attendees?.going ?? []), ...(attendees?.maybe ?? [])];
  const goingMaybeIds = new Set(goingMaybe.map(p => p.user_id));
  const rest = (members ?? []).filter(m => !goingMaybeIds.has(m.user_id));
  const allCandidates = canHostCheckIn ? [...goingMaybe, ...rest] : [];
  const q = search.trim().toLowerCase();
  const candidates = q
    ? allCandidates.filter(p => (p.full_name ?? '').toLowerCase().includes(q))
    : allCandidates;

  return (
    <div className="ci-box">
      <div className="ci-head">Check-in</div>
      {error && <p className="ci-error">{error}</p>}

      {!data.viewer_checked_in ? (
        <button type="button" className="ci-btn-here" disabled={busy === 'self'} onClick={selfCheckIn}>
          {busy === 'self' ? 'Checking in…' : "I'm here"}
        </button>
      ) : (
        <div className="ci-done">✓ You're checked in</div>
      )}

      {data.checkins.length > 0 && (
        <div className="ci-list">
          <div className="ci-list-label">{data.checkins.length} checked in</div>
          {data.checkins.map(c => (
            <div key={c.user_id} className="ci-row">
              <Avatar name={c.full_name} src={c.profile_photo_url} size={22} />
              <span className="ci-row-name">{c.full_name ?? 'Member'}</span>
              {c.method === 'host' && <span className="ci-row-tag">marked by host</span>}
            </div>
          ))}
        </div>
      )}

      {canHostCheckIn && allCandidates.length > 0 && (
        <div className="ci-rollcall">
          <div className="ci-list-label">Roll call</div>
          <input type="text" className="ci-search" placeholder="Search members…"
                 value={search} onChange={e => setSearch(e.target.value)}
                 aria-label="Search members for roll call" />
          {candidates.length === 0 && <p className="ci-empty">No members match "{search}".</p>}
          {candidates.map(p => (
            <div key={p.user_id} className="ci-row ci-row--rollcall">
              <Avatar name={p.full_name} src={p.profile_photo_url} size={22} />
              <span className="ci-row-name">{p.full_name ?? 'Member'}</span>
              {checkedInIds.has(p.user_id) ? (
                <span className="ci-row-check">✓</span>
              ) : (
                <button type="button" className="ci-mark-btn" disabled={busy === p.user_id}
                        onClick={() => markAttended(p.user_id)}>
                  {busy === p.user_id ? '…' : 'Mark here'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
