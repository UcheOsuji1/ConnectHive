import { useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../Avatar.jsx';
import { typeLabel, formatDate, formatTimeRange } from '../../lib/plans.js';

function closesInLabel(closesAt) {
  const ms = new Date(closesAt).getTime() - Date.now();
  if (ms <= 0) return 'Closing…';
  const h = Math.round(ms / 3600000);
  if (h < 1) return 'Closes in less than an hour';
  if (h < 24) return `Closes in ${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  return `Closes in ${d} day${d === 1 ? '' : 's'}`;
}

const STATUS_LABEL = {
  approved: 'Approved', declined: 'Declined', expired: 'Expired', withdrawn: 'Withdrawn',
};

// Matches PlanCard's look (spec: "the same plan card's look"), with a
// "Suggested plan" label, a vote bar, and owner/suggester actions inline
// instead of an RsvpMenu — a pending suggestion isn't a plan yet.
export default function SuggestionCard({ suggestion: s, hiveId, isOwner, viewerId, voteMode,
  onVote, onApprove, onDecline, onWithdraw, recent = false }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const isSuggester = s.suggested_by.user_id === viewerId;
  const total = s.yes + s.no;
  const yesPct = total ? Math.round((s.yes / total) * 100) : 0;

  async function act(fn) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  if (recent) {
    return (
      <div className="plans-card plans-card--suggestion plans-card--recent">
        <div className="plans-card-body">
          <div className="plans-sugg-head">
            <span className="plans-sugg-label">Suggested Plan</span>
            <span className={`plans-sugg-status plans-sugg-status--${s.status}`}>{STATUS_LABEL[s.status]}</span>
          </div>
          <h3 className="plans-card-title">{s.title}</h3>
          <div className="plans-card-meta">
            🗓 {formatDate(s.event_at)} · {formatTimeRange(s.event_at, s.event_end_at)}
          </div>
          <div className="plans-sugg-by">
            <Avatar name={s.suggested_by.full_name} src={s.suggested_by.profile_photo_url} size={20} />
            Suggested by {s.suggested_by.full_name ?? 'a member'}
          </div>
          {s.status === 'approved' && s.plan?.post_id && (
            <Link to={`/hive/${hiveId}/events`} className="plans-sugg-planlink">View the plan →</Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="plans-card plans-card--suggestion">
      <div className="plans-card-body">
        <div className="plans-sugg-head">
          <span className="plans-sugg-label">Suggested Plan</span>
          <span className="plans-chip">{typeLabel(s.plan_type)}</span>
        </div>

        {editing ? (
          <EditForm suggestion={s} onCancel={() => setEditing(false)}
            onSave={async (edits) => { await act(() => onApprove(s, edits)); setEditing(false); }} />
        ) : (
          <>
            <h3 className="plans-card-title">{s.title}</h3>
            <div className="plans-card-meta">
              🗓 {formatDate(s.event_at)} · {formatTimeRange(s.event_at, s.event_end_at)}
            </div>
            {s.event_location && <div className="plans-card-meta">📍 {s.event_location}</div>}
            {s.description && <p className="plans-card-desc">{s.description}</p>}

            <div className="plans-sugg-by">
              <Avatar name={s.suggested_by.full_name} src={s.suggested_by.profile_photo_url} size={20} />
              Suggested by {s.suggested_by.full_name ?? 'a member'}
            </div>

            {voteMode && (
              <div className="plans-sugg-votewrap">
                <div className="plans-sugg-votebar" role="img" aria-label={`${s.yes} yes, ${s.no} no`}>
                  <div className="plans-sugg-voteyes" style={{ width: `${yesPct}%` }} />
                </div>
                <div className="plans-sugg-votecounts">
                  <span>{s.yes} yes</span>
                  <span>{s.no} no</span>
                  <span className="plans-sugg-closes">{closesInLabel(s.closes_at)}</span>
                </div>
                <div className="plans-sugg-voteactions">
                  <button type="button" disabled={busy}
                          className={`plans-sugg-votebtn plans-sugg-votebtn--yes${s.my_vote === 'yes' ? ' plans-sugg-votebtn--on' : ''}`}
                          onClick={() => act(() => onVote(s, s.my_vote === 'yes' ? 'clear' : 'yes'))}>
                    ✓ Yes
                  </button>
                  <button type="button" disabled={busy}
                          className={`plans-sugg-votebtn plans-sugg-votebtn--no${s.my_vote === 'no' ? ' plans-sugg-votebtn--on' : ''}`}
                          onClick={() => act(() => onVote(s, s.my_vote === 'no' ? 'clear' : 'no'))}>
                    ✕ No
                  </button>
                </div>
              </div>
            )}
            {!voteMode && (
              <div className="plans-sugg-closes">{closesInLabel(s.closes_at)}</div>
            )}

            <div className="plans-sugg-actions">
              {isOwner && (
                <>
                  <button type="button" className="plans-btn-gold" disabled={busy}
                          onClick={() => act(() => onApprove(s))}>Approve</button>
                  <button type="button" className="plans-btn-ghost" disabled={busy}
                          onClick={() => setEditing(true)}>Approve with edits</button>
                  <button type="button" className="plans-btn-text plans-sugg-decline" disabled={busy}
                          onClick={() => act(() => onDecline(s))}>Decline</button>
                </>
              )}
              {!isOwner && isSuggester && (
                <button type="button" className="plans-btn-text plans-sugg-decline" disabled={busy}
                        onClick={() => act(() => onWithdraw(s))}>Withdraw</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Pre-fills every field the suggestion already carries, not just
// title/start — sending only those two to validatePlanInput would silently
// null out the location/description/cover/visibility the suggester set.
function EditForm({ suggestion: s, onSave, onCancel }) {
  const [title, setTitle] = useState(s.title);
  const [starts, setStarts] = useState(new Date(s.event_at).toISOString().slice(0, 16));
  const [ends, setEnds] = useState(s.event_end_at ? new Date(s.event_end_at).toISOString().slice(0, 16) : '');
  const [location, setLocation] = useState(s.event_location ?? '');
  const [description, setDescription] = useState(s.description ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError(null);
    try {
      await onSave({
        title: title.trim(),
        planType: s.plan_type,
        startsAt: new Date(starts).toISOString(),
        endsAt: ends ? new Date(ends).toISOString() : null,
        location: location.trim() || null,
        description: description.trim() || null,
        mediaUrl: s.media_url,
        visibility: s.visibility,
      });
    } catch (err) {
      setError(err?.data?.error ?? 'Could not save your edits.');
      setSaving(false);
    }
  }

  return (
    <div className="plans-sugg-editform">
      <label className="plans-field">
        <span>Title</span>
        <input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} />
      </label>
      <div className="plans-field-row">
        <label className="plans-field">
          <span>Starts</span>
          <input type="datetime-local" value={starts} onChange={e => setStarts(e.target.value)} />
        </label>
        <label className="plans-field">
          <span>Ends</span>
          <input type="datetime-local" value={ends} onChange={e => setEnds(e.target.value)} />
        </label>
      </div>
      <label className="plans-field">
        <span>Location</span>
        <input value={location} maxLength={200} onChange={e => setLocation(e.target.value)} />
      </label>
      <label className="plans-field">
        <span>Description</span>
        <textarea value={description} maxLength={2000} rows={3}
                  onChange={e => setDescription(e.target.value)} />
      </label>
      {error && <p className="plans-form-error">{error}</p>}
      <div className="plans-sugg-actions">
        <button type="button" className="plans-btn-gold" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Approve with these edits'}
        </button>
        <button type="button" className="plans-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
