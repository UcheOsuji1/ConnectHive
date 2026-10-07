import { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../lib/api.js';
import { PLAN_TYPES, TYPE_LABELS, localInputToISO } from '../../lib/plans.js';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];

// Mirrors server/src/controllers/eventsController.js's nthWeekdayOfMonth —
// used here only to build the form's "skips these months" preview text, not
// to compute real dates (the server is the source of truth for that).
function monthHasNthWeekday(year, month, weekday, n) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (n - 1) * 7;
  return day <= new Date(year, month + 1, 0).getDate();
}

function monthlyPreview(startDate, count) {
  if (!startDate || isNaN(startDate.getTime())) return null;
  const weekday = startDate.getDay();
  const n = Math.ceil(startDate.getDate() / 7);
  if (n > 5) return null;
  const skipped = [];
  let year = startDate.getFullYear(), month = startDate.getMonth(), found = 1;
  let guard = 0;
  while (found < count && guard < 240) {
    guard++;
    month++;
    if (month > 11) { month = 0; year++; }
    if (monthHasNthWeekday(year, month, weekday, n)) found++;
    else skipped.push(new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  }
  return { label: `${ORDINAL[n - 1]} ${WEEKDAY_NAMES[weekday]} of the month`, skipped };
}

// mode: 'create' (today's direct form, owner/admin), 'propose' (owner/admin
// in vote mode — defaults to a vote, with a "Create without a vote"
// escape hatch), 'suggest' (a member suggesting). planRules is required for
// 'propose'/'suggest' so the footer note and the checkbox can reflect the
// Hive's actual settings instead of guessing them.
export default function CreatePlanModal({
  hiveId, prefill, onClose, onCreated, preferredTypes = [],
  mode = 'create', planRules = null, channelId = null,
}) {
  // Category-aware ordering (spec §11) — the category's preferred types
  // first, in the order it lists them, then everything else in its usual
  // order. No new types: this only ever reorders PLAN_TYPES.
  const orderedTypes = [
    ...preferredTypes.filter(t => PLAN_TYPES.includes(t)),
    ...PLAN_TYPES.filter(t => !preferredTypes.includes(t)),
  ];
  const [title, setTitle]   = useState(prefill?.title ?? '');
  const [type, setType]     = useState(prefill?.planType ?? 'other');
  const [location, setLoc]  = useState('');
  const [starts, setStarts] = useState('');
  const [ends, setEnds]     = useState('');
  const [desc, setDesc]     = useState('');
  const [visibility, setVis] = useState('hive');
  const [mediaUrl, setMediaUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  // Recurring plans (Part 4) — Never / Weekly / Every 2 weeks / Monthly on
  // the same weekday, for N times.
  const [repeatRule, setRepeatRule] = useState('never');
  const [repeatCount, setRepeatCount] = useState(4);
  // "Propose" defaults to a vote (decision 3) — owner must actively check
  // this to skip straight to a direct plan.
  const [skipVote, setSkipVote] = useState(false);
  const [error, setError]   = useState(null);
  const [saving, setSaving] = useState(false);

  const panelRef = useRef(null);
  const fileRef  = useRef(null);
  const firstRef = useRef(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  // Escape closes; Tab is trapped inside the dialog.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const f = panelRef.current?.querySelectorAll(
        'button, input, select, textarea, [href]');
      if (!f?.length) return;
      const list = [...f].filter(el => !el.disabled);
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function pickCover(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const sig = await api.post(`/api/hives/${hiveId}/upload-signature`, { type: 'plan' });
      const fd = new FormData();
      fd.append('file', file);
      fd.append('api_key',   sig.api_key);
      fd.append('timestamp', String(sig.timestamp));
      fd.append('signature', sig.signature);
      fd.append('folder',    sig.folder);
      const r = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`,
        { method: 'POST', body: fd });
      const d = await r.json();
      if (!d.secure_url) throw new Error(d.error?.message ?? 'Upload failed.');
      setMediaUrl(d.secure_url);
    } catch (err) {
      setError(err?.data?.error ?? err.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  // Same rules the server enforces, so the common cases never round-trip.
  function clientValidate() {
    const t = title.trim();
    if (!t) return 'A title is required.';
    if (t.length > 120) return 'Title must be 120 characters or fewer.';
    if (!starts) return 'A start time is required.';
    const s = new Date(starts);
    if (isNaN(s.getTime())) return 'Start time is not a valid date.';
    if (s.getTime() <= Date.now()) return 'Start time must be in the future.';
    if (ends) {
      const e = new Date(ends);
      if (isNaN(e.getTime())) return 'End time is not a valid date.';
      if (e.getTime() <= s.getTime()) return 'End time must be after the start time.';
    }
    if (location.trim().length > 200) return 'Location must be 200 characters or fewer.';
    if (desc.trim().length > 2000) return 'Description must be 2000 characters or fewer.';
    return null;
  }

  // 'create' always creates directly; 'propose' creates directly only when
  // the owner checked "Create without a vote"; 'suggest' always suggests.
  const willSuggest = mode === 'suggest' || (mode === 'propose' && !skipVote);

  const monthlyInfo = useMemo(
    () => repeatRule === 'monthly_weekday' ? monthlyPreview(starts ? new Date(starts) : null, repeatCount) : null,
    [repeatRule, starts, repeatCount],
  );

  async function submit(e) {
    e.preventDefault();
    const bad = clientValidate();
    if (bad) { setError(bad); return; }
    setSaving(true); setError(null);
    const payload = {
      title: title.trim(),
      planType: type,
      startsAt: localInputToISO(starts),
      endsAt: ends ? localInputToISO(ends) : null,
      location: location.trim() || null,
      description: desc.trim() || null,
      mediaUrl,
      visibility,
      repeat: repeatRule === 'never' ? null : { rule: repeatRule, count: Number(repeatCount) },
    };
    try {
      if (willSuggest) {
        const { suggestion } = await api.post(`/api/hives/${hiveId}/plan-suggestions`, {
          ...payload, channelId,
        });
        onCreated(suggestion, 'suggestion');
      } else {
        const { plan } = await api.post(`/api/hives/${hiveId}/plans`, payload);
        onCreated(plan, 'plan');
      }
    } catch (err) {
      setError(err?.data?.error ?? 'Could not save this.');
      setSaving(false);
    }
  }

  const modalTitle = mode === 'suggest' ? 'Suggest a Plan' : mode === 'propose' ? 'Propose a Plan' : 'Create a Plan';

  return (
    <>
      <div className="plans-scrim" onClick={onClose} />
      <div className="plans-modal" role="dialog" aria-modal="true" aria-label={modalTitle} ref={panelRef}>
        <div className="plans-modal-head">
          <h2 className="plans-modal-title">{modalTitle}</h2>
          <button type="button" className="plans-drawer-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form className="plans-form" onSubmit={submit}>
          <label className="plans-field">
            <span>Title *</span>
            <input ref={firstRef} value={title} maxLength={120}
                   onChange={e => setTitle(e.target.value)} placeholder="Founders' Rooftop Mixer" />
          </label>

          <div className="plans-field-row">
            <label className="plans-field">
              <span>Type</span>
              <select value={type} onChange={e => setType(e.target.value)}>
                {orderedTypes.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="plans-field">
              <span>Location</span>
              <input value={location} maxLength={200}
                     onChange={e => setLoc(e.target.value)} placeholder="Rooftop at 8th & Spring" />
            </label>
          </div>

          <div className="plans-field-row">
            <label className="plans-field">
              <span>Starts *</span>
              <input type="datetime-local" value={starts} onChange={e => setStarts(e.target.value)} />
            </label>
            <label className="plans-field">
              <span>Ends</span>
              <input type="datetime-local" value={ends} onChange={e => setEnds(e.target.value)} />
            </label>
          </div>

          <div className="plans-field-row">
            <label className="plans-field">
              <span>Repeats</span>
              <select value={repeatRule} onChange={e => setRepeatRule(e.target.value)}>
                <option value="never">Never</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly_weekday">Monthly on the same weekday</option>
              </select>
            </label>
            {repeatRule !== 'never' && (
              <label className="plans-field">
                <span>For how many times</span>
                <input type="number" min={2} max={26} value={repeatCount}
                       onChange={e => setRepeatCount(e.target.value)} />
              </label>
            )}
          </div>
          {repeatRule === 'monthly_weekday' && monthlyInfo && (
            <p className="plans-form-note">
              Repeats the {monthlyInfo.label}.
              {monthlyInfo.skipped.length > 0 && (
                <> Some months have no {monthlyInfo.label.split(' ').slice(0, 2).join(' ')} — skipped: {monthlyInfo.skipped.join(', ')}.</>
              )}
            </p>
          )}

          <label className="plans-field">
            <span>Description</span>
            <textarea value={desc} maxLength={2000} rows={3}
                      onChange={e => setDesc(e.target.value)}
                      placeholder="What should people expect?" />
          </label>

          <div className="plans-field">
            <span>Cover photo</span>
            <div className="plans-cover-row">
              <button type="button" className="plans-btn-ghost" disabled={uploading}
                      onClick={() => fileRef.current?.click()}>
                {uploading ? 'Uploading…' : mediaUrl ? 'Replace photo' : 'Upload a photo'}
              </button>
              {mediaUrl && (
                <>
                  <img className="plans-cover-thumb" src={mediaUrl} alt="" />
                  <button type="button" className="plans-btn-text" onClick={() => setMediaUrl(null)}>
                    Remove
                  </button>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickCover} />
            </div>
          </div>

          <label className="plans-field">
            <span>Who can see it</span>
            <select value={visibility} onChange={e => setVis(e.target.value)}>
              <option value="hive">Hive members only</option>
              <option value="public">Public (followers can see it in their feed)</option>
            </select>
          </label>

          {mode === 'propose' && (
            <label className="plans-skipvote-row">
              <input type="checkbox" checked={skipVote} onChange={e => setSkipVote(e.target.checked)} />
              Create without a vote
            </label>
          )}

          {error && <p className="plans-form-error">{error}</p>}

          <p className="plans-form-note">
            {!willSuggest
              ? "Your RSVP is set to Going automatically. You're the host."
              : planRules?.plan_approval === 'owner'
                ? 'An owner will review your suggestion.'
                : `Your suggestion goes to a vote. It closes within ${planRules?.vote_window_hours ?? 48} hours, `
                  + 'or 1 hour before the plan starts — whichever comes first.'}
          </p>

          <div className="plans-modal-foot">
            <button type="button" className="plans-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="plans-btn-gold" disabled={saving || uploading}>
              {saving
                ? (willSuggest ? 'Submitting…' : 'Creating…')
                : (willSuggest ? (mode === 'suggest' ? 'Suggest Plan' : 'Propose Plan') : 'Create Plan')}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
