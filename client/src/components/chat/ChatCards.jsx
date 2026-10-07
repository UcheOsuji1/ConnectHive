import { useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../Avatar.jsx';
import RsvpMenu from '../plans/RsvpMenu.jsx';
import { typeLabel, formatTimeRange } from '../../lib/plans.js';
import { api } from '../../lib/api.js';

// ── Plan card in the message stream ──────────────────────────────────────────
export function PlanMessageCard({ plan, removed, hiveId, onRsvp }) {
  if (removed || !plan) {
    return <div className="hc-plancard hc-plancard--gone">This plan was removed.</div>;
  }

  const d = new Date(plan.event_at);
  const cover = plan.media_url;

  return (
    <div className="hc-plancard">
      <div className="hc-plancard-head">
        <span aria-hidden="true">📅</span>
        <span className="hc-plancard-label">Upcoming Plan</span>
        <Link to={`/hive/${hiveId}/events/${plan.post_id}`} className="hc-plancard-link">View Plan →</Link>
      </div>

      <div className="hc-plancard-body">
        <div className={`hc-plancard-cover${cover ? '' : ' hc-plancard-cover--fallback'}`}
             style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
          <div className="hc-datetile hc-datetile--onCover">
            <span className="hc-datetile-dow">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
            <span className="hc-datetile-date">
              {d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} {d.getDate()}
            </span>
            <span className="hc-datetile-time">
              {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
        </div>

        <div className="hc-plancard-main">
          <h4 className="hc-plancard-title">
            <Link to={`/hive/${hiveId}/events/${plan.post_id}`} className="plans-card-title-link">{plan.headline}</Link>
          </h4>
          {plan.event_location && (
            <div className="hc-plancard-row">📍 {plan.event_location}</div>
          )}
          <div className="hc-plancard-row">
            <span>👥 {plan.going_count} going</span>
            <span className="hc-ctx-chip">{typeLabel(plan.plan_type)}</span>
            <span className="hc-plancard-time">
              {formatTimeRange(plan.event_at, plan.event_end_at)}
            </span>
          </div>
          {plan.body && <p className="hc-plancard-desc">{plan.body}</p>}
          <div className="hc-plancard-foot">
            <RsvpMenu value={plan.viewer_rsvp} onChange={s => onRsvp(plan, s)} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Suggested-plan card in the message stream ────────────────────────────────
// Matches PlanMessageCard's look (gold left border). On approval it renders
// the real plan via PlanMessageCard instead — a suggestion isn't a plan
// until then, so it keeps its own vote/approve UI up to that point.
export function SuggestionMessageCard({
  suggestion: s, hiveId, isOwner, viewerId, voteMode,
  onVote, onApprove, onDecline, onWithdraw, onPlanRsvp,
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!s) return null;

  if (s.status === 'approved' && s.plan) {
    return <PlanMessageCard plan={s.plan} hiveId={hiveId} onRsvp={onPlanRsvp} />;
  }

  const isSuggester = s.suggested_by.user_id === viewerId;
  const total = s.yes + s.no;
  const yesPct = total ? Math.round((s.yes / total) * 100) : 0;
  const d = new Date(s.event_at);

  async function act(fn) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  const STATUS_LABEL = { declined: 'Declined', expired: 'Expired', withdrawn: 'Withdrawn' };

  return (
    <div className="hc-plancard hc-suggcard">
      <div className="hc-plancard-head">
        <span aria-hidden="true">📅</span>
        <span className="hc-plancard-label">Suggested Plan</span>
        {s.status !== 'pending' && (
          <span className="hc-pollcard-closed">{STATUS_LABEL[s.status]}</span>
        )}
      </div>

      <div className="hc-plancard-body">
        <div className={`hc-plancard-cover${s.media_url ? '' : ' hc-plancard-cover--fallback'}`}
             style={s.media_url ? { backgroundImage: `url(${s.media_url})` } : undefined}>
          <div className="hc-datetile hc-datetile--onCover">
            <span className="hc-datetile-dow">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
            <span className="hc-datetile-date">
              {d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} {d.getDate()}
            </span>
            <span className="hc-datetile-time">
              {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
        </div>

        <div className="hc-plancard-main">
          {editing ? (
            <SuggEditForm suggestion={s} onCancel={() => setEditing(false)}
              onSave={async (edits) => { await act(() => onApprove(s, edits)); setEditing(false); }} />
          ) : (
            <>
              <h4 className="hc-plancard-title">{s.title}</h4>
              {s.event_location && <div className="hc-plancard-row">📍 {s.event_location}</div>}
              <div className="hc-plancard-row">
                <span className="hc-ctx-chip">{typeLabel(s.plan_type)}</span>
                <span className="hc-plancard-time">{formatTimeRange(s.event_at, s.event_end_at)}</span>
              </div>
              <div className="hc-suggcard-by">
                <Avatar name={s.suggested_by.full_name} src={s.suggested_by.profile_photo_url} size={18} />
                Suggested by {s.suggested_by.full_name ?? 'a member'}
              </div>

              {voteMode && s.status === 'pending' && (
                <div className="hc-suggcard-votewrap">
                  <div className="hc-suggcard-votebar" role="img" aria-label={`${s.yes} yes, ${s.no} no`}>
                    <div className="hc-suggcard-voteyes" style={{ width: `${yesPct}%` }} />
                  </div>
                  <div className="hc-suggcard-votecounts">
                    <span>{s.yes} yes</span>
                    <span>{s.no} no</span>
                  </div>
                  <div className="hc-suggcard-voteactions">
                    <button type="button" disabled={busy}
                            className={`hc-suggcard-votebtn hc-suggcard-votebtn--yes${s.my_vote === 'yes' ? ' hc-suggcard-votebtn--on' : ''}`}
                            onClick={() => act(() => onVote(s, s.my_vote === 'yes' ? 'clear' : 'yes'))}>
                      ✓ Yes
                    </button>
                    <button type="button" disabled={busy}
                            className={`hc-suggcard-votebtn hc-suggcard-votebtn--no${s.my_vote === 'no' ? ' hc-suggcard-votebtn--on' : ''}`}
                            onClick={() => act(() => onVote(s, s.my_vote === 'no' ? 'clear' : 'no'))}>
                      ✕ No
                    </button>
                  </div>
                </div>
              )}

              {s.status === 'pending' && (
                <div className="hc-plancard-foot hc-suggcard-actions">
                  {isOwner ? (
                    <>
                      <button type="button" className="hc-suggcard-btn hc-suggcard-btn--gold" disabled={busy}
                              onClick={() => act(() => onApprove(s))}>Approve</button>
                      <button type="button" className="hc-suggcard-btn" disabled={busy}
                              onClick={() => setEditing(true)}>Approve with edits</button>
                      <button type="button" className="hc-suggcard-btn hc-suggcard-btn--text" disabled={busy}
                              onClick={() => act(() => onDecline(s))}>Decline</button>
                    </>
                  ) : isSuggester && (
                    <button type="button" className="hc-suggcard-btn hc-suggcard-btn--text" disabled={busy}
                            onClick={() => act(() => onWithdraw(s))}>Withdraw</button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SuggEditForm({ suggestion: s, onSave, onCancel }) {
  const [title, setTitle] = useState(s.title);
  const [starts, setStarts] = useState(new Date(s.event_at).toISOString().slice(0, 16));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setError(null);
    try {
      await onSave({
        title: title.trim(), planType: s.plan_type,
        startsAt: new Date(starts).toISOString(),
        endsAt: s.event_end_at, location: s.event_location,
        description: s.description, mediaUrl: s.media_url, visibility: s.visibility,
      });
    } catch (err) {
      setError(err?.data?.error ?? 'Could not save your edits.');
      setSaving(false);
    }
  }

  return (
    <div className="hc-suggcard-editform">
      <input className="hc-modal-input" value={title} maxLength={120}
             onChange={e => setTitle(e.target.value)} />
      <input className="hc-modal-input" type="datetime-local" value={starts}
             onChange={e => setStarts(e.target.value)} />
      {error && <p className="hc-modal-error">{error}</p>}
      <div className="hc-suggcard-actions">
        <button type="button" className="hc-suggcard-btn hc-suggcard-btn--gold" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Approve with these edits'}
        </button>
        <button type="button" className="hc-suggcard-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Poll card in the message stream ──────────────────────────────────────────
export function PollMessageCard({ poll, hiveId, onVote }) {
  const [voters, setVoters] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!poll) return null;
  const total = poll.total_votes;
  const mine  = new Set(poll.my_votes ?? []);
  const voted = mine.size > 0;

  async function pick(optionId) {
    if (poll.closed || busy) return;
    setBusy(true);
    try {
      const next = poll.allows_multiple
        ? (mine.has(optionId) ? [...mine].filter(id => id !== optionId) : [...mine, optionId])
        : [optionId];
      await onVote(poll, next);
    } finally { setBusy(false); }
  }

  async function showVoters() {
    try {
      const d = await api.get(`/api/hives/${hiveId}/polls/${poll.poll_id}/voters`);
      setVoters(d.voters ?? {});
    } catch { setVoters({}); }
  }

  return (
    <div className="hc-pollcard">
      <div className="hc-pollcard-head">
        <span aria-hidden="true">📊</span>
        <span className="hc-plancard-label">Poll</span>
        {poll.closed && <span className="hc-pollcard-closed">Closed</span>}
      </div>
      <h4 className="hc-pollcard-q">{poll.question}</h4>

      <div className="hc-pollcard-opts">
        {poll.options.map(o => {
          const pct = total ? Math.round((o.count / total) * 100) : 0;
          const isMine = mine.has(o.option_id);
          return (
            <button
              key={o.option_id}
              type="button"
              className={`hc-poll-opt${isMine ? ' hc-poll-opt--mine' : ''}`}
              onClick={() => pick(o.option_id)}
              disabled={poll.closed || busy}
              aria-pressed={isMine}
            >
              <span className="hc-poll-bar" style={{ width: `${pct}%` }} aria-hidden="true" />
              <span className="hc-poll-label">{o.label}</span>
              <span className="hc-poll-count">{pct}% · {o.count}</span>
            </button>
          );
        })}
      </div>

      <div className="hc-pollcard-foot">
        <span>{total} vote{total === 1 ? '' : 's'}</span>
        {voted && <span className="hc-pollcard-voted">You voted</span>}
        {poll.allows_multiple && <span className="hc-pollcard-multi">Pick as many as you like</span>}
        <button type="button" className="hc-pollcard-who" onClick={showVoters}>See who voted</button>
      </div>

      {voters && (
        <div className="hc-pollcard-voters">
          {poll.options.map(o => (
            <div key={o.option_id} className="hc-pollcard-voterrow">
              <span className="hc-pollcard-voterlabel">{o.label}</span>
              <span className="hc-pollcard-voterlist">
                {(voters[o.option_id] ?? []).length === 0
                  ? <span className="hc-ctx-empty">Nobody yet</span>
                  : (voters[o.option_id] ?? []).map(v => (
                      <span key={v.user_id} className="hc-pollcard-voter">
                        <Avatar name={v.full_name} src={v.profile_photo_url} size={20} />
                        {v.full_name ?? 'Member'}
                      </span>
                    ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create-poll modal ────────────────────────────────────────────────────────
export function CreatePollModal({ hiveId, channelId, channelName, onClose, onCreated }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions]   = useState(['', '']);
  const [multi, setMulti]       = useState(false);
  const [error, setError]       = useState(null);
  const [saving, setSaving]     = useState(false);

  const setOpt = (i, v) => setOptions(o => o.map((x, k) => (k === i ? v : x)));

  async function submit(e) {
    e.preventDefault();
    const q = question.trim();
    const opts = options.map(o => o.trim()).filter(Boolean);
    if (!q)               return setError('A question is required.');
    if (q.length > 200)   return setError('The question must be 200 characters or fewer.');
    if (opts.length < 2)  return setError('A poll needs at least 2 options.');
    if (opts.length > 6)  return setError('A poll can have at most 6 options.');

    setSaving(true); setError(null);
    try {
      const d = await api.post(`/api/hives/${hiveId}/polls`, {
        channelId, question: q, options: opts, allowsMultiple: multi,
      });
      onCreated(d);
    } catch (err) {
      setError(err?.data?.error ?? 'Could not create the poll.');
      setSaving(false);
    }
  }

  return (
    <div className="hc-modal-overlay" onClick={onClose}>
      <div className="hc-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
           aria-label="Create a poll">
        <div className="hc-modal-header">
          <span>Poll in #{channelName}</span>
          <button className="hc-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="hc-modal-body" onSubmit={submit}>
          <label className="hc-modal-label" htmlFor="hc-poll-q">Question</label>
          <input id="hc-poll-q" className="hc-modal-input" value={question} maxLength={200}
                 onChange={e => setQuestion(e.target.value)} placeholder="Where shall we eat?" />

          <label className="hc-modal-label">Options</label>
          {options.map((o, i) => (
            <input key={i} className="hc-modal-input" value={o} maxLength={80}
                   onChange={e => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} />
          ))}
          {options.length < 6 && (
            <button type="button" className="hc-poll-addopt"
                    onClick={() => setOptions(o => [...o, ''])}>+ Add an option</button>
          )}

          <label className="hc-poll-multi">
            <input type="checkbox" checked={multi} onChange={e => setMulti(e.target.checked)} />
            Let people pick more than one
          </label>

          {error && <p className="hc-modal-error">{error}</p>}

          <div className="hc-modal-footer">
            <button type="button" className="hc-modal-btn hc-modal-btn--cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="hc-modal-btn hc-modal-btn--create" disabled={saving}>
              {saving ? 'Creating…' : 'Create poll'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
