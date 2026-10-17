import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useOutletContext, useNavigate, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { planCreateMode } from '../../lib/plans.js';
import CreatePlanModal from '../../components/plans/CreatePlanModal.jsx';
import AreaLocationInput from '../../components/AreaLocationInput.jsx';
import '../../styles/hive-itinerary.css';

function fmtDate(d) {
  if (!d) return '';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDateFull(d) {
  if (!d) return '';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
// Local calendar date, not toISOString().slice(0,10) (that's the UTC date —
// near midnight in a timezone behind UTC it disagrees with dayList()'s
// local-midnight Date arithmetic below, which produced an off-by-one "Day 0
// of 3" instead of "Day 1 of 3" when the two were mixed).
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayList(startsOn, endsOn) {
  const out = [];
  let d = new Date(`${startsOn}T00:00:00`);
  const end = new Date(`${endsOn}T00:00:00`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}
function linkDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/* ───────────────────────── New trip modal ───────────────────────── */
function NewTripModal({ hiveId, costGroups, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [costGroupId, setCostGroupId] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { trip } = await api.post(`/api/hives/${hiveId}/tools/itinerary/trips`, {
        title, destination, startsOn, endsOn, costGroupId: costGroupId || null,
      });
      onCreated(trip);
    } catch (e2) {
      setError(e2?.data?.error ?? 'Could not create this trip.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="it-scrim" onClick={onClose} />
      <div className="it-modal" role="dialog" aria-modal="true" aria-label="New trip">
        <div className="it-modal-head">
          <h3 className="it-modal-title">New trip</h3>
          <button type="button" className="it-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="it-form" onSubmit={submit}>
          <label className="it-field">
            Title
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Big Sur weekend" autoFocus />
          </label>
          <label className="it-field">
            Destination
            <AreaLocationInput label="Trip destination" value={destination} onChange={setDestination} maxLength={120} placeholder="Big Sur, CA" />
          </label>
          <div className="it-field-row">
            <label className="it-field">
              Starts
              <input type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} />
            </label>
            <label className="it-field">
              Ends
              <input type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} />
            </label>
          </div>
          {costGroups.length > 0 && (
            <label className="it-field">
              Cost group (optional)
              <select value={costGroupId} onChange={e => setCostGroupId(e.target.value)}>
                <option value="">None</option>
                {costGroups.map(g => <option key={g.group_id} value={g.group_id}>{g.title}</option>)}
              </select>
            </label>
          )}
          {error && <p className="it-form-error">{error}</p>}
          <div className="it-modal-foot">
            <button type="button" className="it-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="it-btn-gold" disabled={busy}>{busy ? 'Creating…' : 'Create trip'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ───────────────────────── Trips hub ───────────────────────── */
function TripsHub() {
  const { hiveId, isOwner, canPost } = useOutletContext() ?? {};
  const navigate = useNavigate();
  const [trips, setTrips] = useState(null);
  const [editors, setEditors] = useState('members');
  const [costGroups, setCostGroups] = useState([]);
  const [splitCostsOn, setSplitCostsOn] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/itinerary/trips`).then(d => setTrips(d.trips ?? [])).catch(() => setTrips([]));
  }, [hiveId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/tools`).then(d => {
      const tool = (d.tools ?? []).find(t => t.key === 'itinerary');
      setEditors(tool?.settings?.editors ?? 'members');
      setSplitCostsOn((d.tools ?? []).some(t => t.key === 'split_costs' && t.enabled));
    }).catch(() => {});
  }, [hiveId]);

  useEffect(() => {
    if (!splitCostsOn) return;
    api.get(`/api/hives/${hiveId}/tools/split_costs/groups`).then(d => setCostGroups(d.groups ?? [])).catch(() => {});
  }, [hiveId, splitCostsOn]);

  const canCreate = isOwner || (editors === 'members' && !!canPost);

  if (trips === null) return <div className="it-page"><div className="it-skel" /></div>;

  const today = todayStr();
  const upcoming = trips.filter(t => t.ends_on >= today);
  const past = trips.filter(t => t.ends_on < today);

  return (
    <div className="it-page">
      <div className="it-head">
        <div>
          <h2 className="it-title">Itinerary</h2>
          <p className="it-sub">A day-by-day trip plan the group builds together.</p>
        </div>
        {canCreate && <button type="button" className="it-btn-gold" onClick={() => setShowNew(true)}>+ New trip</button>}
      </div>

      {trips.length === 0 ? (
        <p className="it-empty">No trips yet. {canCreate ? 'Start planning the first one.' : 'An owner or editor can start planning one.'}</p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="it-trip-section">
              <h3 className="it-section-title">Upcoming</h3>
              <div className="it-trip-list">
                {upcoming.map(t => <TripCard key={t.trip_id} trip={t} hiveId={hiveId} />)}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section className="it-trip-section">
              <h3 className="it-section-title">Past</h3>
              <div className="it-trip-list">
                {past.map(t => <TripCard key={t.trip_id} trip={t} hiveId={hiveId} />)}
              </div>
            </section>
          )}
        </>
      )}

      {showNew && (
        <NewTripModal hiveId={hiveId} costGroups={costGroups} onClose={() => setShowNew(false)}
                      onCreated={trip => navigate(`/hive/${hiveId}/tools/itinerary/${trip.trip_id}`)} />
      )}
    </div>
  );
}

function TripCard({ trip, hiveId }) {
  return (
    <Link to={`/hive/${hiveId}/tools/itinerary/${trip.trip_id}`} className="it-trip-card">
      <div className="it-trip-card-main">
        <h4 className="it-trip-card-title">{trip.title}</h4>
        <p className="it-trip-card-meta">{trip.destination} · {fmtDate(trip.starts_on)} – {fmtDate(trip.ends_on)}</p>
      </div>
      <span className="it-trip-card-count">{trip.item_count} item{trip.item_count === 1 ? '' : 's'}</span>
    </Link>
  );
}

/* ───────────────────────── Item card ───────────────────────── */
function ItemCard({ item, canEdit, grabbed, onGrabToggle, onKeyMove, onEdit, onDelete, onMakePlan }) {
  function onKeyDown(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onGrabToggle(item);
    } else if (grabbed && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      onKeyMove(item, e.key);
    } else if (grabbed && e.key === 'Escape') {
      e.preventDefault();
      onGrabToggle(item, true);
    }
  }

  return (
    <div className={`it-item${grabbed ? ' it-item--grabbed' : ''}`} tabIndex={canEdit ? 0 : -1}
         aria-grabbed={grabbed} onKeyDown={canEdit ? onKeyDown : undefined}
         draggable={canEdit} onDragStart={() => onGrabToggle(item, false, true)}>
      <div className="it-item-time">{fmtTime(item.time) ?? '—'}</div>
      <div className="it-item-body">
        <div className="it-item-top">
          <h5 className="it-item-title">{item.title}</h5>
          {item.plan_post_id && <span className="it-item-plan-chip">📅 Plan made</span>}
        </div>
        {item.location && <p className="it-item-location">📍 {item.location}</p>}
        {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="it-item-link">{linkDomain(item.url)}</a>}
        {item.notes && <p className="it-item-notes">{item.notes}</p>}
        {item.created_by_name && <p className="it-item-by">Added by {item.created_by_name}</p>}
        {canEdit && (
          <div className="it-item-actions">
            <button type="button" className="it-btn-text" onClick={() => onEdit(item)}>Edit</button>
            <button type="button" className="it-btn-text it-btn-text--danger" onClick={() => onDelete(item)}>Delete</button>
            {!item.plan_post_id && <button type="button" className="it-btn-text" onClick={() => onMakePlan(item)}>Make this a plan</button>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Item modal (add/edit) ───────────────────────── */
function ItemModal({ hiveId, tripId, days, defaultDay, item, onClose, onSaved }) {
  const [day, setDay] = useState(item?.day ?? defaultDay);
  const [time, setTime] = useState(item?.time ?? '');
  const [title, setTitle] = useState(item?.title ?? '');
  const [location, setLocation] = useState(item?.location ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const body = { day, time: time || null, title, location: location || null, url: url || null, notes };
    try {
      if (item) await api.patch(`/api/hives/${hiveId}/tools/itinerary/items/${item.item_id}`, body);
      else await api.post(`/api/hives/${hiveId}/tools/itinerary/trips/${tripId}/items`, body);
      onSaved();
    } catch (e2) {
      setError(e2?.data?.error ?? 'Could not save this item.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="it-scrim" onClick={onClose} />
      <div className="it-modal" role="dialog" aria-modal="true" aria-label={item ? 'Edit item' : 'Add item'}>
        <div className="it-modal-head">
          <h3 className="it-modal-title">{item ? 'Edit item' : 'Add item'}</h3>
          <button type="button" className="it-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="it-form" onSubmit={submit}>
          <div className="it-field-row">
            <label className="it-field">
              Day
              <select value={day} onChange={e => setDay(e.target.value)}>
                {days.map(d => <option key={d} value={d}>{fmtDateFull(d)}</option>)}
              </select>
            </label>
            <label className="it-field">
              Time (optional)
              <input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </label>
          </div>
          <label className="it-field">
            Title
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Check into hotel" autoFocus />
          </label>
          <label className="it-field">
            Location (optional)
            <input value={location} onChange={e => setLocation(e.target.value)} maxLength={200} />
          </label>
          <label className="it-field">
            Link (optional)
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
          </label>
          <label className="it-field">
            Notes (optional)
            <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={3} />
          </label>
          {error && <p className="it-form-error">{error}</p>}
          <div className="it-modal-foot">
            <button type="button" className="it-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="it-btn-gold" disabled={busy}>{busy ? 'Saving…' : item ? 'Save' : 'Add item'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ───────────────────────── Trip detail ───────────────────────── */
function TripDetail() {
  const { id: hiveId, tripId } = useParams();
  const ctx = useOutletContext() ?? {};
  const { isOwner, canPost } = ctx;
  const navigate = useNavigate();
  const [data, setData] = useState(null); // { trip, costGroup, items }
  const [editors, setEditors] = useState('members');
  const [showNewItem, setShowNewItem] = useState(null); // day string | null
  const [editItem, setEditItem] = useState(null);
  const [planItem, setPlanItem] = useState(null);
  const [planMsg, setPlanMsg] = useState(null);
  const [grabbedId, setGrabbedId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const liveRef = useRef(null);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/itinerary/trips/${tripId}`)
      .then(setData).catch(() => setData(false));
  }, [hiveId, tripId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/tools`).then(d => {
      const tool = (d.tools ?? []).find(t => t.key === 'itinerary');
      setEditors(tool?.settings?.editors ?? 'members');
    }).catch(() => {});
  }, [hiveId]);

  function announce(text) { setAnnouncement(text); }

  async function deleteTrip() {
    if (!window.confirm('Archive this trip? It will no longer show as active.')) return;
    await api.delete(`/api/hives/${hiveId}/tools/itinerary/trips/${tripId}`);
    navigate(`/hive/${hiveId}/tools/itinerary`);
  }

  async function deleteItem(item) {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    await api.delete(`/api/hives/${hiveId}/tools/itinerary/items/${item.item_id}`);
    load();
  }

  async function moveItemTo(item, day, beforeItemId, afterItemId) {
    try {
      await api.post(`/api/hives/${hiveId}/tools/itinerary/items/${item.item_id}/move`, { day, beforeItemId, afterItemId });
      load();
    } catch { load(); }
  }

  function untimedInDay(day) {
    return (data.items ?? []).filter(i => i.day === day && !i.time).sort((a, b) => a.position - b.position);
  }

  function handleGrabToggle(item, cancel = false, viaDrag = false) {
    if (viaDrag) { setDragId(item.item_id); return; }
    if (grabbedId === item.item_id) {
      setGrabbedId(null);
      announce(cancel ? `Cancelled moving ${item.title}.` : `Dropped ${item.title}.`);
    } else {
      setGrabbedId(item.item_id);
      announce(`Picked up ${item.title}. Use left and right arrow keys to change day, up and down to reorder, Space to drop, Escape to cancel.`);
    }
  }

  function handleKeyMove(item, key) {
    const days = dayList(data.trip.starts_on, data.trip.ends_on);
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const idx = days.indexOf(item.day);
      const newIdx = key === 'ArrowLeft' ? Math.max(0, idx - 1) : Math.min(days.length - 1, idx + 1);
      if (newIdx === idx) return;
      const newDay = days[newIdx];
      const col = untimedInDay(newDay);
      const last = col[col.length - 1];
      moveItemTo(item, newDay, last?.item_id ?? null, null);
      announce(`Moved ${item.title} to ${fmtDateFull(newDay)}.`);
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      const col = untimedInDay(item.day);
      const idx = col.findIndex(i => i.item_id === item.item_id);
      const swapIdx = key === 'ArrowUp' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= col.length) return;
      const neighbor = col[swapIdx];
      const beforeIdx = key === 'ArrowUp' ? swapIdx - 1 : swapIdx;
      const afterIdx = key === 'ArrowUp' ? swapIdx : swapIdx + 1;
      const beforeItemId = beforeIdx >= 0 ? (col[beforeIdx]?.item_id ?? null) : null;
      const afterItemId = afterIdx < col.length ? (col[afterIdx]?.item_id ?? null) : null;
      moveItemTo(item, item.day, beforeItemId, afterItemId);
      announce(`Moved ${item.title} ${key === 'ArrowUp' ? 'up' : 'down'}, now next to ${neighbor.title}.`);
    }
  }

  function handleDrop(targetItem) {
    if (!dragId || dragId === targetItem.item_id) return;
    const dragItem = data.items.find(i => i.item_id === dragId);
    const col = untimedInDay(targetItem.day);
    const idx = col.findIndex(i => i.item_id === targetItem.item_id);
    moveItemTo(dragItem, targetItem.day, idx > 0 ? col[idx - 1].item_id : null, targetItem.item_id);
    setDragId(null);
  }

  function openMakePlan(item) {
    setPlanItem(item);
  }

  if (data === null) return <div className="it-page"><div className="it-skel" /></div>;
  if (data === false) return <div className="it-page"><p className="it-empty">Trip not found.</p></div>;

  const { trip, costGroup, items } = data;
  const canEdit = isOwner || (editors === 'members' && !!canPost);
  const days = dayList(trip.starts_on, trip.ends_on);
  const today = todayStr();
  const isHappening = trip.starts_on <= today && today <= trip.ends_on;
  // days.indexOf, not Date subtraction — days was already built via
  // dayList()'s local-midnight arithmetic, so a string lookup against it
  // stays consistent instead of re-parsing today through a different method.
  const dayOfTrip = isHappening ? days.indexOf(today) + 1 : null;
  const mode = planCreateMode(ctx);

  return (
    <div className="it-page it-trip-page">
      <Link to={`/hive/${hiveId}/tools/itinerary`} className="it-back">← All trips</Link>

      <div aria-live="polite" className="it-sr-only" ref={liveRef}>{announcement}</div>

      <div className="it-trip-head">
        <div>
          <h2 className="it-title">{trip.title}</h2>
          <p className="it-sub">
            {trip.destination} · {fmtDateFull(trip.starts_on)} – {fmtDateFull(trip.ends_on)}
            {isHappening && <span className="it-day-badge">Day {dayOfTrip} of {days.length}</span>}
          </p>
          {costGroup && (
            <Link to={`/hive/${hiveId}/tools/split_costs/${costGroup.group_id}`} className="it-cost-link">
              💵 {costGroup.title} →
            </Link>
          )}
        </div>
        <div className="it-trip-head-actions">
          <button type="button" className="it-btn-ghost" onClick={() => window.print()}>Print</button>
          {canEdit && <button type="button" className="it-btn-text it-btn-text--danger" onClick={deleteTrip}>Archive trip</button>}
        </div>
      </div>

      {planMsg && <p className="it-plan-msg">{planMsg}</p>}

      <div className="it-days">
        {days.map(day => {
          const dayItems = items.filter(i => i.day === day);
          return (
            <section key={day} className="it-day-section">
              <div className="it-day-head">
                <h3 className="it-day-title">{fmtDateFull(day)}{day === today && <span className="it-today-chip">Today</span>}</h3>
                {canEdit && <button type="button" className="it-btn-text" onClick={() => setShowNewItem(day)}>+ Add item</button>}
              </div>
              {dayItems.length === 0 ? (
                <p className="it-empty it-day-empty">Nothing planned yet.</p>
              ) : (
                <div className="it-item-list" onDragOver={e => e.preventDefault()}
                     onDrop={() => { if (dragId) { const col = untimedInDay(day); const last = col[col.length - 1]; const dragItem = items.find(i => i.item_id === dragId); if (dragItem) moveItemTo(dragItem, day, last?.item_id ?? null, null); setDragId(null); } }}>
                  {dayItems.map(item => (
                    <ItemCard key={item.item_id} item={item} canEdit={canEdit}
                              grabbed={grabbedId === item.item_id}
                              onGrabToggle={handleGrabToggle} onKeyMove={handleKeyMove}
                              onEdit={setEditItem} onDelete={deleteItem}
                              onMakePlan={openMakePlan} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {showNewItem && (
        <ItemModal hiveId={hiveId} tripId={tripId} days={days} defaultDay={showNewItem}
                   onClose={() => setShowNewItem(null)} onSaved={() => { setShowNewItem(null); load(); }} />
      )}
      {editItem && (
        <ItemModal hiveId={hiveId} tripId={tripId} days={days} item={editItem}
                   onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); load(); }} />
      )}

      {planItem && mode && (
        <CreatePlanModal
          hiveId={hiveId}
          prefill={{
            title: planItem.title, planType: 'trip', location: planItem.location || trip.destination,
            description: `Part of the ${trip.title} itinerary.${planItem.url ? `\n${planItem.url}` : ''}`,
          }}
          mode={mode}
          planRules={{ plan_approval: ctx.hive?.plan_approval, vote_window_hours: ctx.hive?.vote_window_hours }}
          sourceTripItemId={planItem.item_id}
          onClose={() => setPlanItem(null)}
          onCreated={(_result, kind) => {
            setPlanItem(null);
            setPlanMsg(kind === 'suggestion' ? 'Suggested as a plan — it will link back once approved.' : 'Plan created and linked to this item.');
            setTimeout(() => setPlanMsg(null), 6000);
            load();
          }}
        />
      )}
      {planItem && !mode && (
        <>
          <div className="it-scrim" onClick={() => setPlanItem(null)} />
          <div className="it-modal" role="dialog" aria-modal="true">
            <p className="it-empty">You don't have permission to create or suggest plans in this Hive.</p>
            <div className="it-modal-foot">
              <button type="button" className="it-btn-ghost" onClick={() => setPlanItem(null)}>Close</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function HiveItineraryPage() {
  const { tripId } = useParams();
  return tripId ? <TripDetail /> : <TripsHub />;
}
