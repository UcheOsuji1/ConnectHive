import { useState, useEffect, useCallback } from 'react';
import { useParams, useOutletContext, Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { socket } from '../../lib/socket.js';
import { useAuth } from '../../context/AuthContext.jsx';
import AnswerChips from '../../components/tools/AnswerChips.jsx';
import CreateTimePollModal from '../../components/tools/CreateTimePollModal.jsx';
import '../../styles/hive-find-time.css';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function fmtSlot(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const STATUS_LABEL = { open: 'Open', closed: 'Closed', scheduled: 'Scheduled' };

// ── List view ────────────────────────────────────────────────────────────────
function PollList({ hiveId, canCreate }) {
  const [polls, setPolls] = useState(null);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/find_time/polls`)
      .then(d => setPolls(d.polls))
      .catch(e => setError(e?.data?.error ?? 'Could not load polls.'));
  }, [hiveId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="ft-page">
      <div className="ft-head">
        <div>
          <h2 className="ft-title">Find a time</h2>
          <p className="ft-sub">Offer candidate times and let the Hive say what works.</p>
        </div>
        {canCreate && (
          <button type="button" className="ft-btn-gold" onClick={() => setCreateOpen(true)}>
            + New time poll
          </button>
        )}
      </div>

      {error && <p className="ft-form-error">{error}</p>}
      {polls === null && !error && <div className="ft-skel" />}

      {polls && polls.length === 0 && (
        <p className="ft-empty">
          {canCreate ? 'No polls yet. Offer a few candidate times to get started.' : 'No polls yet.'}
        </p>
      )}

      {polls && polls.length > 0 && (
        <div className="ft-list">
          {polls.map(p => (
            <Link key={p.poll_id} to={`/hive/${hiveId}/tools/find_time/${p.poll_id}`} className="ft-list-item">
              <div className="ft-list-item-main">
                <span className="ft-list-item-title">{p.title}</span>
                <span className="ft-list-item-meta">{p.slot_count} candidate time{p.slot_count === 1 ? '' : 's'}</span>
              </div>
              <span className={`ft-status ft-status--${p.status}`}>{STATUS_LABEL[p.status]}</span>
            </Link>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateTimePollModal
          hiveId={hiveId}
          onClose={() => setCreateOpen(false)}
          onCreated={poll => navigate(`/hive/${hiveId}/tools/find_time/${poll.poll_id}`)}
        />
      )}
    </div>
  );
}

// ── Detail / grid view ───────────────────────────────────────────────────────
function PollDetail({ hiveId, pollId, isOwner }) {
  const { user } = useAuth();
  const viewerId = user?.userId;
  const [poll, setPoll] = useState(null);
  const [error, setError] = useState(null);
  const [busySlot, setBusySlot] = useState(null);
  const [scheduling, setScheduling] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [resultMsg, setResultMsg] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/find_time/polls/${pollId}`)
      .then(d => setPoll(d.poll))
      .catch(e => setError(e?.status === 404 ? 'Poll not found.' : (e?.data?.error ?? 'Could not load this poll.')));
  }, [hiveId, pollId]);
  useEffect(() => { load(); }, [load]);

  // Live updates — counts/best-slot only, matching the 54b broadcast pattern.
  useEffect(() => {
    function onUpdate(payload) {
      if (payload.poll_id !== pollId) return;
      setPoll(p => p && {
        ...p,
        best_slot_id: payload.best_slot_id,
        slots: p.slots.map(s => {
          const match = payload.slots.find(x => x.slot_id === s.slot_id);
          return match ? { ...s, works: match.works, if_needed: match.if_needed, cant: match.cant, score: match.score } : s;
        }),
      });
    }
    socket.on('time_poll_updated', onUpdate);
    return () => socket.off('time_poll_updated', onUpdate);
  }, [pollId]);

  async function answer(slotId, value) {
    setBusySlot(slotId);
    try {
      const { poll: updated } = await api.post(
        `/api/hives/${hiveId}/tools/find_time/polls/${pollId}/answer`, { slotId, answer: value },
      );
      setPoll(updated);
    } catch (e) {
      setActionError(e?.data?.error ?? 'Could not save your answer.');
    } finally {
      setBusySlot(null);
    }
  }

  async function schedule(slotId) {
    setScheduling(slotId);
    setActionError(null);
    try {
      const result = await api.post(`/api/hives/${hiveId}/tools/find_time/polls/${pollId}/schedule`, { slotId });
      if (result.created === 'plan') {
        navigate(`/hive/${hiveId}/events/${result.plan.post_id}`);
      } else {
        setResultMsg('Submitted as a suggestion — it needs approval before it becomes a plan.');
        load();
      }
    } catch (e) {
      setActionError(e?.data?.error ?? 'Could not schedule from this poll.');
    } finally {
      setScheduling(null);
    }
  }

  async function close() {
    try { await api.post(`/api/hives/${hiveId}/tools/find_time/polls/${pollId}/close`); load(); }
    catch (e) { setActionError(e?.data?.error ?? 'Could not close this poll.'); }
  }

  async function del() {
    try {
      await api.delete(`/api/hives/${hiveId}/tools/find_time/polls/${pollId}`);
      navigate(`/hive/${hiveId}/tools/find_time`);
    } catch (e) { setActionError(e?.data?.error ?? 'Could not delete this poll.'); }
  }

  if (error) {
    return (
      <div className="ft-page">
        <p className="ft-form-error">{error}</p>
        <Link to={`/hive/${hiveId}/tools/find_time`} className="ft-btn-ghost">← Back to polls</Link>
      </div>
    );
  }
  if (!poll) return <div className="ft-page"><div className="ft-skel" /></div>;

  const canManage = poll.created_by === viewerId || isOwner;
  // Respondents who aren't the viewer, for the read-only rows below the
  // viewer's own editable row.
  const otherUserIds = [...new Set(
    poll.slots.flatMap(s => s.answers.map(a => a.user_id)).filter(id => id !== viewerId),
  )];
  const otherUsers = otherUserIds
    .map(id => poll.slots.flatMap(s => s.answers).find(a => a.user_id === id))
    .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''));

  const answerFor = (slot, userId) => slot.answers.find(a => a.user_id === userId)?.answer ?? null;

  return (
    <div className="ft-page">
      <div className="ft-head">
        <div>
          <Link to={`/hive/${hiveId}/tools/find_time`} className="ft-back">← Polls</Link>
          <h2 className="ft-title">{poll.title}</h2>
          <p className="ft-sub">
            {poll.duration_minutes} min{poll.location ? ` · ${poll.location}` : ''} · Times shown in {TZ}
          </p>
        </div>
        <span className={`ft-status ft-status--${poll.status}`}>{STATUS_LABEL[poll.status]}</span>
      </div>

      {poll.status === 'scheduled' && poll.plan_post_id && (
        <Link to={`/hive/${hiveId}/events/${poll.plan_post_id}`} className="ft-scheduled-banner">
          Scheduled — view the plan →
        </Link>
      )}
      {poll.pending_suggestion_id && (
        <p className="ft-pending-banner">A suggestion from this poll is awaiting approval.</p>
      )}

      {actionError && <p className="ft-form-error">{actionError}</p>}
      {resultMsg && <p className="ft-result-msg">{resultMsg}</p>}

      {/* ── Desktop grid ── */}
      <div className="ft-grid-wrap">
        <table className="ft-grid">
          <thead>
            <tr>
              <th className="ft-grid-corner">You</th>
              {poll.slots.map(s => (
                <th key={s.slot_id} className={`ft-grid-slothead${s.slot_id === poll.best_slot_id ? ' ft-grid-slothead--best' : ''}`}>
                  {fmtSlot(s.starts_at)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="ft-grid-rowlabel">You</td>
              {poll.slots.map(s => (
                <td key={s.slot_id} className="ft-grid-cell">
                  <AnswerChips
                    value={s.viewer_answer}
                    disabled={poll.status !== 'open' || busySlot === s.slot_id}
                    onChange={v => answer(s.slot_id, v)}
                  />
                </td>
              ))}
            </tr>
            {otherUsers.map(u => (
              <tr key={u.user_id}>
                <td className="ft-grid-rowlabel">{u.full_name ?? 'Member'}</td>
                {poll.slots.map(s => {
                  const a = answerFor(s, u.user_id);
                  return (
                    <td key={s.slot_id} className="ft-grid-cell ft-grid-cell--readonly">
                      {a ? <span className={`ft-static-chip ft-static-chip--${a}`}>{a === 'works' ? 'Works' : a === 'if_needed' ? 'If needed' : "Can't"}</span> : <span className="ft-static-chip ft-static-chip--none">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="ft-grid-totals">
              <td className="ft-grid-rowlabel">Totals</td>
              {poll.slots.map(s => (
                <td key={s.slot_id} className={`ft-grid-cell ft-grid-totalcell${s.slot_id === poll.best_slot_id ? ' ft-grid-totalcell--best' : ''}`}>
                  <div className="ft-totals-line">{s.works} works · {s.if_needed} if needed · {s.cant} can't</div>
                  {s.slot_id === poll.best_slot_id && <div className="ft-best-label">★ Best time</div>}
                  {canManage && poll.status === 'open' && (
                    <button type="button" className="ft-schedule-btn" disabled={scheduling === s.slot_id}
                            onClick={() => schedule(s.slot_id)}>
                      {scheduling === s.slot_id ? 'Scheduling…' : 'Schedule this'}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Mobile cards ── */}
      <div className="ft-cards">
        {poll.slots.map(s => (
          <div key={s.slot_id} className={`ft-card${s.slot_id === poll.best_slot_id ? ' ft-card--best' : ''}`}>
            <div className="ft-card-when">{fmtSlot(s.starts_at)}</div>
            <div className="ft-totals-line">{s.works} works · {s.if_needed} if needed · {s.cant} can't</div>
            {s.slot_id === poll.best_slot_id && <div className="ft-best-label">★ Best time</div>}
            <AnswerChips
              value={s.viewer_answer}
              disabled={poll.status !== 'open' || busySlot === s.slot_id}
              onChange={v => answer(s.slot_id, v)}
            />
            {canManage && poll.status === 'open' && (
              <button type="button" className="ft-schedule-btn" disabled={scheduling === s.slot_id}
                      onClick={() => schedule(s.slot_id)}>
                {scheduling === s.slot_id ? 'Scheduling…' : 'Schedule this'}
              </button>
            )}
          </div>
        ))}
      </div>

      {canManage && poll.status === 'open' && (
        <div className="ft-manage-row">
          <button type="button" className="ft-btn-ghost" onClick={close}>Close poll</button>
          <button type="button" className="ft-btn-ghost ft-btn-danger" onClick={del}>Delete poll</button>
        </div>
      )}
    </div>
  );
}

export default function HiveFindTimePage() {
  const { id: hiveId, pollId } = useParams();
  const { isOwner, canPost } = useOutletContext();

  if (pollId) return <PollDetail hiveId={hiveId} pollId={pollId} isOwner={isOwner} />;
  return <PollList hiveId={hiveId} canCreate={!!canPost} />;
}
