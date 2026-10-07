import { useState, useRef, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { localInputToISO } from '../../lib/plans.js';

const DURATIONS = [30, 60, 90, 120, 180];

export default function CreateTimePollModal({ hiveId, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(60);
  const [location, setLocation] = useState('');
  const [slots, setSlots] = useState(['', '']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const firstRef = useRef(null);

  useEffect(() => { firstRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function setSlot(i, v) {
    setSlots(s => s.map((x, idx) => idx === i ? v : x));
  }
  function addSlot() {
    if (slots.length >= 20) return;
    setSlots(s => [...s, '']);
  }
  function removeSlot(i) {
    if (slots.length <= 2) return;
    setSlots(s => s.filter((_, idx) => idx !== i));
  }

  async function submit(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return setError('A title is required.');
    const filled = slots.filter(Boolean);
    if (filled.length < 2) return setError('Offer at least 2 candidate times.');

    setSaving(true);
    setError(null);
    try {
      const { poll } = await api.post(`/api/hives/${hiveId}/tools/find_time/polls`, {
        title: t,
        durationMinutes: Number(duration),
        location: location.trim() || null,
        slots: filled.map(localInputToISO),
      });
      onCreated(poll);
    } catch (err) {
      setError(err?.data?.error ?? 'Could not create the poll.');
      setSaving(false);
    }
  }

  return (
    <>
      <div className="ft-scrim" onClick={onClose} />
      <div className="ft-modal" role="dialog" aria-modal="true" aria-label="Find a time">
        <div className="ft-modal-head">
          <h2 className="ft-modal-title">Find a time</h2>
          <button type="button" className="ft-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form className="ft-form" onSubmit={submit}>
          <label className="ft-field">
            <span>Title *</span>
            <input ref={firstRef} value={title} maxLength={120}
                   onChange={e => setTitle(e.target.value)} placeholder="Weekly sync" />
          </label>

          <div className="ft-field-row">
            <label className="ft-field">
              <span>Duration</span>
              <select value={duration} onChange={e => setDuration(e.target.value)}>
                {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </label>
            <label className="ft-field">
              <span>Location</span>
              <input value={location} maxLength={200}
                     onChange={e => setLocation(e.target.value)} placeholder="Optional" />
            </label>
          </div>

          <div className="ft-field">
            <span>Candidate times (2–20)</span>
            {slots.map((s, i) => (
              <div key={i} className="ft-slot-row">
                <input type="datetime-local" value={s} onChange={e => setSlot(i, e.target.value)} />
                {slots.length > 2 && (
                  <button type="button" className="ft-slot-remove" onClick={() => removeSlot(i)} aria-label="Remove this time">×</button>
                )}
              </div>
            ))}
            {slots.length < 20 && (
              <button type="button" className="ft-btn-ghost" onClick={addSlot}>+ Add another time</button>
            )}
          </div>

          {error && <p className="ft-form-error">{error}</p>}

          <div className="ft-modal-foot">
            <button type="button" className="ft-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="ft-btn-gold" disabled={saving}>
              {saving ? 'Creating…' : 'Create poll'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
