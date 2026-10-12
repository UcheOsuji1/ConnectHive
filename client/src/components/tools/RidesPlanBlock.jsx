import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { socket } from '../../lib/socket.js';
import Avatar from '../Avatar.jsx';
import '../../styles/hive-rides.css';

function fmtDepart(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

// Plan page's Tools stack entry for the Ride board (Prompt 66 Part 2) — the
// same "live right here, no extra page load" pattern as SplitCostsPlanBlock
// and SignupsPlanBlock. Eligibility (RSVP going/maybe) is enforced by the
// server; this only hides the offer/request CTAs when the viewer plainly
// isn't eligible, to avoid a pointless round trip to a 403.
export default function RidesPlanBlock({ hiveId, postId, viewerRsvp }) {
  const [board, setBoard] = useState(null);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/rides/board?postId=${postId}`)
      .then(setBoard).catch(() => setBoard(false));
  }, [hiveId, postId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onUpdate = (e) => { if (e?.post_id === postId) load(); };
    socket.on('rides_updated', onUpdate);
    return () => socket.off('rides_updated', onUpdate);
  }, [load, postId]);

  const eligible = viewerRsvp === 'going' || viewerRsvp === 'maybe';

  async function cancelOffer(offerId) {
    setBusy(offerId);
    try { await api.delete(`/api/hives/${hiveId}/tools/rides/offers/${offerId}`); load(); }
    catch { /* non-fatal here */ } finally { setBusy(null); }
  }
  async function cancelRequest(requestId) {
    setBusy(requestId);
    try { await api.delete(`/api/hives/${hiveId}/tools/rides/requests/${requestId}`); load(); }
    catch { /* non-fatal */ } finally { setBusy(null); }
  }
  async function requestSeat(offerId) {
    setBusy(offerId);
    try { await api.post(`/api/hives/${hiveId}/tools/rides/offers/${offerId}/request`); load(); }
    catch { /* non-fatal */ } finally { setBusy(null); }
  }
  async function confirmRider(offerId, riderId) {
    setBusy(`${offerId}-${riderId}`);
    try { await api.post(`/api/hives/${hiveId}/tools/rides/offers/${offerId}/riders/${riderId}/confirm`); load(); }
    catch { /* non-fatal */ } finally { setBusy(null); }
  }
  async function declineRider(offerId, riderId) {
    setBusy(`${offerId}-${riderId}`);
    try { await api.post(`/api/hives/${hiveId}/tools/rides/offers/${offerId}/riders/${riderId}/decline`); load(); }
    catch { /* non-fatal */ } finally { setBusy(null); }
  }

  if (board === null) return null;
  if (board === false) return <div className="pd-tool-block"><div className="pd-tool-block-title">Ride board</div></div>;

  const { offers, requests } = board;

  return (
    <div className="pd-tool-block rd-block">
      <div className="pd-tool-block-title">Ride board</div>

      {offers.length === 0 && requests.length === 0 && (
        <p className="pd-tool-empty">No rides posted yet.</p>
      )}

      {offers.map(o => (
        <div key={o.offer_id} className="rd-offer-card">
          <div className="rd-offer-top">
            <Avatar name={o.driver.full_name} src={o.driver.profile_photo_url} size={28} />
            <div className="rd-offer-main">
              <span className="rd-offer-driver">{o.driver.full_name}</span>
              <span className="rd-offer-meta">
                {o.seats_left} of {o.seats} seat{o.seats === 1 ? '' : 's'} · {o.leaving_from}
                {o.departs_at && ` · ${fmtDepart(o.departs_at)}`}
              </span>
            </div>
            {o.is_mine ? (
              <button type="button" className="pd-tool-small-btn" disabled={busy === o.offer_id} onClick={() => cancelOffer(o.offer_id)}>Cancel</button>
            ) : eligible && !o.my_seat_status && o.seats_left > 0 ? (
              <button type="button" className="pd-tool-small-btn pd-tool-small-btn--gold" disabled={busy === o.offer_id} onClick={() => requestSeat(o.offer_id)}>Request a seat</button>
            ) : o.my_seat_status === 'requested' ? (
              <span className="rd-status-chip">Requested</span>
            ) : o.my_seat_status === 'confirmed' ? (
              <span className="rd-status-chip rd-status-chip--on">Confirmed</span>
            ) : null}
          </div>
          {o.note && <p className="rd-offer-note">{o.note}</p>}
          {o.confirmed_riders.length > 0 && (
            <div className="rd-rider-row">
              {o.confirmed_riders.map(r => (
                <span key={r.user_id} className="rd-rider-chip">
                  <Avatar name={r.full_name} src={r.profile_photo_url} size={18} /> {r.full_name}
                </span>
              ))}
            </div>
          )}
          {o.is_mine && o.requested_riders.length > 0 && (
            <div className="rd-requested-list">
              {o.requested_riders.map(r => (
                <div key={r.user_id} className="rd-requested-row">
                  <Avatar name={r.full_name} src={r.profile_photo_url} size={22} />
                  <span>{r.full_name}</span>
                  <button type="button" className="pd-tool-small-btn pd-tool-small-btn--gold" disabled={busy === `${o.offer_id}-${r.user_id}`} onClick={() => confirmRider(o.offer_id, r.user_id)}>Confirm</button>
                  <button type="button" className="pd-tool-small-btn" disabled={busy === `${o.offer_id}-${r.user_id}`} onClick={() => declineRider(o.offer_id, r.user_id)}>Decline</button>
                </div>
              ))}
            </div>
          )}
          {o.my_seat_status === 'confirmed' && (
            <Link to={`/hive/${hiveId}/chat`} className="pd-tool-link">Open the ride chat →</Link>
          )}
        </div>
      ))}

      {requests.length > 0 && (
        <div className="rd-requests-section">
          <span className="rd-requests-title">Looking for a ride</span>
          {requests.map(r => (
            <div key={r.request_id} className="rd-request-row">
              <Avatar name={r.rider.full_name} src={r.rider.profile_photo_url} size={22} />
              <span className="rd-request-text">{r.rider.full_name} · {r.from_area}{r.note ? ` · ${r.note}` : ''}</span>
              {r.is_mine && (
                <button type="button" className="pd-tool-small-btn" disabled={busy === r.request_id} onClick={() => cancelRequest(r.request_id)}>Cancel</button>
              )}
            </div>
          ))}
        </div>
      )}

      {eligible && (
        <div className="rd-cta-row">
          <button type="button" className="pd-tool-small-btn pd-tool-small-btn--gold" onClick={() => setShowOfferForm(v => !v)}>
            {showOfferForm ? 'Cancel' : '+ Offer a ride'}
          </button>
          <button type="button" className="pd-tool-small-btn" onClick={() => setShowRequestForm(v => !v)}>
            {showRequestForm ? 'Cancel' : '+ Request a ride'}
          </button>
        </div>
      )}

      {showOfferForm && (
        <OfferForm hiveId={hiveId} postId={postId} onDone={() => { setShowOfferForm(false); load(); }} />
      )}
      {showRequestForm && (
        <RequestForm hiveId={hiveId} postId={postId} onDone={() => { setShowRequestForm(false); load(); }} />
      )}
    </div>
  );
}

function OfferForm({ hiveId, postId, onDone }) {
  const [seats, setSeats] = useState(3);
  const [leavingFrom, setLeavingFrom] = useState('');
  const [departsAt, setDepartsAt] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post(`/api/hives/${hiveId}/tools/rides/offers`, {
        postId, seats: Number(seats), leavingFrom,
        departsAt: departsAt ? new Date(departsAt).toISOString() : null, note,
      });
      onDone();
    } catch (e2) {
      setError(e2?.data?.error ?? 'Could not post this offer.');
      setBusy(false);
    }
  }

  return (
    <form className="rd-form" onSubmit={submit}>
      <div className="rd-form-row">
        <label className="rd-field">
          Seats
          <input type="number" min={1} max={8} value={seats} onChange={e => setSeats(e.target.value)} />
        </label>
        <label className="rd-field">
          Leaving from (an area)
          <input value={leavingFrom} maxLength={80} onChange={e => setLeavingFrom(e.target.value)} placeholder="Koreatown" />
        </label>
      </div>
      <label className="rd-field">
        Departs (optional)
        <input type="datetime-local" value={departsAt} onChange={e => setDepartsAt(e.target.value)} />
      </label>
      <label className="rd-field">
        Note (optional)
        <textarea value={note} maxLength={280} rows={2} onChange={e => setNote(e.target.value)} />
      </label>
      {error && <p className="rd-form-error">{error}</p>}
      <button type="submit" className="pd-tool-small-btn pd-tool-small-btn--gold" disabled={busy || !leavingFrom.trim()}>
        {busy ? 'Posting…' : 'Post offer'}
      </button>
    </form>
  );
}

function RequestForm({ hiveId, postId, onDone }) {
  const [fromArea, setFromArea] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post(`/api/hives/${hiveId}/tools/rides/requests`, { postId, fromArea, note });
      onDone();
    } catch (e2) {
      setError(e2?.data?.error ?? 'Could not post this request.');
      setBusy(false);
    }
  }

  return (
    <form className="rd-form" onSubmit={submit}>
      <label className="rd-field">
        Your area
        <input value={fromArea} maxLength={80} onChange={e => setFromArea(e.target.value)} placeholder="Silver Lake" />
      </label>
      <label className="rd-field">
        Note (optional)
        <textarea value={note} maxLength={280} rows={2} onChange={e => setNote(e.target.value)} />
      </label>
      {error && <p className="rd-form-error">{error}</p>}
      <button type="submit" className="pd-tool-small-btn pd-tool-small-btn--gold" disabled={busy || !fromArea.trim()}>
        {busy ? 'Posting…' : 'Post request'}
      </button>
    </form>
  );
}
