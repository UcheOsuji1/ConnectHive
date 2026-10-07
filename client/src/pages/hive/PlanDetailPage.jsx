import { useState, useEffect, useCallback } from 'react';
import { useParams, useOutletContext, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from '../../components/Avatar.jsx';
import RsvpMenu from '../../components/plans/RsvpMenu.jsx';
import EditPlanModal from '../../components/plans/EditPlanModal.jsx';
import PlanDiscussion from '../../components/plans/PlanDiscussion.jsx';
import CheckInButton from '../../components/tools/CheckInButton.jsx';
import { typeLabel, formatDate, formatTimeRange, relativeLabel } from '../../lib/plans.js';
import '../../styles/hive-plans.css';
import '../../styles/hive-plan-detail.css';

export default function PlanDetailPage() {
  const { id: hiveId, postId } = useParams();
  const ctx = useOutletContext() ?? {};
  const { user } = useAuth();
  const viewerId = user?.userId;
  const isOwner = !!ctx.isOwner;
  const hiveTools = ctx.hiveTools ?? [];

  const [plan, setPlan] = useState(null);
  const [attendees, setAttendees] = useState(null);
  const [error, setError] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/plans/${postId}`)
      .then(d => setPlan(d.plan))
      .catch(e => setError(e?.status === 403 ? 'You must be a member of this Hive.' : e?.status === 404 ? 'Plan not found.' : 'Could not load this plan.'));
    api.get(`/api/events/${postId}/attendees`).then(setAttendees).catch(() => {});
  }, [hiveId, postId]);
  useEffect(() => { load(); }, [load]);

  async function onRsvp(status) {
    const prev = plan;
    setPlan(p => p && { ...p, viewer_rsvp: status });
    try {
      const r = await api.post(`/api/events/${postId}/rsvp`, { status: status ?? 'clear' });
      setPlan(p => p && { ...p, viewer_rsvp: r.status, going_count: r.goingCount, maybe_count: r.maybeCount, not_going_count: r.notGoingCount });
      load();
    } catch (e) {
      setPlan(prev);
      setActionError(e?.data?.error ?? 'Could not update your RSVP.');
      setTimeout(() => setActionError(null), 5000);
    }
  }

  async function goingToAll() {
    if (!plan?.series) return;
    try {
      await api.post(`/api/hives/${hiveId}/plans/${postId}/rsvp-series`);
      load();
    } catch (e) {
      setActionError(e?.data?.error ?? 'Could not RSVP to the series.');
    }
  }

  async function cancel(scope) {
    setActionError(null);
    try {
      await api.post(`/api/hives/${hiveId}/plans/${postId}/cancel`, { scope });
      setCancelOpen(false);
      load();
    } catch (e) {
      setActionError(e?.data?.error ?? 'Could not cancel this plan.');
    }
  }

  if (error) {
    return (
      <div className="pd-page">
        <p className="pd-error">{error}</p>
        <Link to={`/hive/${hiveId}/events`} className="pd-back">← Back to Plans</Link>
      </div>
    );
  }
  if (!plan) return <div className="pd-page"><div className="pd-skel" /></div>;

  const cover = plan.media_url;
  const planTools = hiveTools.filter(t => t.enabled && t.scope === 'plan');
  const canHostCheckIn = isOwner || plan.host?.user_id === viewerId;

  return (
    <div className="pd-page">
      <Link to={`/hive/${hiveId}/events`} className="pd-back">← Plans</Link>

      {plan.cancelled_at && (
        <div className="pd-cancelled-banner">This plan was cancelled.</div>
      )}

      <div className={`pd-hero${cover ? '' : ' pd-hero--nocover'}`} style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
        <div className="pd-hero-scrim" />
        <div className="pd-hero-body">
          {plan.series && (
            <span className="pd-series-chip">Repeats {plan.series.rule === 'weekly' ? 'weekly' : plan.series.rule === 'biweekly' ? 'every 2 weeks' : 'monthly'} · {plan.series.index} of {plan.series.count}</span>
          )}
          <h1 className="pd-hero-title">{plan.headline}</h1>
          <div className="pd-hero-meta">
            <span>🗓 {formatDate(plan.event_at)}</span>
            <span>🕐 {formatTimeRange(plan.event_at, plan.event_end_at)}</span>
            {plan.event_location && <span>📍 {plan.event_location}</span>}
            <span>🏷 {typeLabel(plan.plan_type)}</span>
            <span>{relativeLabel(plan.event_at, plan.is_live)}</span>
          </div>
          <div className="pd-hero-host">
            <Avatar name={plan.host?.full_name} src={plan.host?.profile_photo_url} size={34} />
            <span>Hosted by {plan.host?.full_name ?? 'a member'}</span>
          </div>
          {plan.body && <p className="pd-hero-desc">{plan.body}</p>}

          <div className="pd-hero-actions">
            {!plan.cancelled_at && <RsvpMenu value={plan.viewer_rsvp} onChange={onRsvp} />}
            {plan.series && !plan.cancelled_at && (
              <button type="button" className="pd-going-all-btn" onClick={goingToAll}>Going to all</button>
            )}
            {isOwner && !plan.cancelled_at && (
              <div className="pd-menu-wrap">
                <button type="button" className="pd-menu-btn" onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>⋯</button>
                {menuOpen && (
                  <div className="pd-menu">
                    <button type="button" onClick={() => { setMenuOpen(false); setEditOpen(true); }}>Edit</button>
                    <button type="button" className="pd-menu-danger" onClick={() => { setMenuOpen(false); setCancelOpen(true); }}>Cancel plan</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {actionError && <p className="pd-error">{actionError}</p>}

      <div className="pd-layout">
        <div className="pd-main">
          {attendees && (
            <div className="pd-attendees">
              {['going', 'maybe', 'not_going'].map(key => (
                attendees[key].length > 0 && (
                  <div key={key} className="pd-attendee-group">
                    <div className="pd-attendee-label">
                      {key === 'going' ? 'Going' : key === 'maybe' ? 'Maybe' : "Can't go"} ({attendees[key].length})
                      {attendees.outside[key] > 0 && ` +${attendees.outside[key]} outside the Hive`}
                    </div>
                    <div className="pd-attendee-row">
                      {attendees[key].map(p => (
                        <Link key={p.user_id} to={`/profile/${p.user_id}`} className="pd-attendee" title={p.full_name}>
                          <Avatar name={p.full_name} src={p.profile_photo_url} size={30} />
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              ))}
            </div>
          )}

          <PlanDiscussion postId={postId} />
        </div>

        {planTools.length > 0 && (
          <aside className="pd-tools-stack">
            {planTools.map(t => t.key === 'checkins' && (
              <CheckInButton
                key={t.key}
                hiveId={hiveId}
                postId={postId}
                canHostCheckIn={canHostCheckIn}
              />
            ))}
          </aside>
        )}
      </div>

      {editOpen && (
        <EditPlanModal hiveId={hiveId} plan={plan} onClose={() => setEditOpen(false)}
                       onSaved={updated => { setPlan(updated); setEditOpen(false); }} />
      )}

      {cancelOpen && (
        <>
          <div className="plans-scrim" onClick={() => setCancelOpen(false)} />
          <div className="pd-cancel-modal" role="dialog" aria-modal="true" aria-label="Cancel plan">
            <h3>Cancel this plan?</h3>
            <p>Everyone who RSVP'd Going or Maybe will be notified.</p>
            <div className="pd-cancel-actions">
              <button type="button" className="plans-btn-ghost" onClick={() => setCancelOpen(false)}>Never mind</button>
              <button type="button" className="pd-cancel-btn" onClick={() => cancel('this')}>Cancel this plan</button>
              {plan.series && (
                <button type="button" className="pd-cancel-btn" onClick={() => cancel('future')}>Cancel this and all future plans</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
