import { Link } from 'react-router-dom';
import Avatar from '../Avatar.jsx';
import RsvpMenu from './RsvpMenu.jsx';
import { typeLabel, relativeLabel, formatDate, formatTimeRange } from '../../lib/plans.js';

export default function PlanCard({ plan, past = false, onRsvp, onOpenAttendees }) {
  const cover = plan.media_url;
  return (
    <article className={`plans-card${past ? ' plans-card--past' : ''}`}>
      <Link to={`/hive/${plan.hive_id}/events/${plan.post_id}`}
        className={`plans-card-cover${cover ? '' : ' plans-card-cover--nocover'}`}
        style={cover ? { backgroundImage: `url(${cover})` } : undefined}
      >
        <span className="plans-tag">{typeLabel(plan.plan_type)}</span>
        {!past && (
          <span className="plans-chip plans-chip--when plans-chip--sm">
            {relativeLabel(plan.event_at, plan.is_live)}
          </span>
        )}
        {/* No cover: the type name carries the card instead of a blank panel. */}
        {!cover && <span className="plans-cover-word">{typeLabel(plan.plan_type)}</span>}
      </Link>

      <div className="plans-card-body">
        {plan.series && (
          <span className="plans-series-chip">
            Repeats {plan.series.rule === 'weekly' ? 'weekly' : plan.series.rule === 'biweekly' ? 'every 2 weeks' : 'monthly'} · {plan.series.index} of {plan.series.count}
          </span>
        )}
        <h3 className="plans-card-title">
          <Link to={`/hive/${plan.hive_id}/events/${plan.post_id}`} className="plans-card-title-link">{plan.headline}</Link>
        </h3>
        <div className="plans-card-meta">
          🗓 {formatDate(plan.event_at)} · {formatTimeRange(plan.event_at, plan.event_end_at)}
        </div>
        {plan.event_location && (
          <div className="plans-card-meta">📍 {plan.event_location}</div>
        )}
        {plan.body && <p className="plans-card-desc">{plan.body}</p>}

        <div className="plans-card-host">
          <Avatar name={plan.host?.full_name} src={plan.host?.profile_photo_url} size={22} />
          <span>Hosted by {plan.host?.full_name ?? 'a member'}</span>
        </div>

        <div className="plans-card-foot">
          <button
            type="button"
            className="plans-people"
            onClick={() => onOpenAttendees(plan)}
            aria-label={`${plan.going_count} ${past ? 'went' : 'going'} — view attendees`}
          >
            <span className="plans-avstack">
              {plan.going_preview.slice(0, 3).map(p => (
                <Avatar key={p.user_id} name={p.full_name} src={p.profile_photo_url} size={22} />
              ))}
              {plan.going_count > plan.going_preview.length && (
                <span className="plans-avmore plans-avmore--sm">
                  +{plan.going_count - plan.going_preview.length}
                </span>
              )}
            </span>
            <span className="plans-count plans-count--stacked">
              <b>{plan.going_count} {past ? 'went' : 'going'}</b>
              {!past && plan.maybe_count > 0 && <em>{plan.maybe_count} maybe</em>}
            </span>
          </button>

          {!past && (
            <RsvpMenu value={plan.viewer_rsvp} onChange={s => onRsvp(plan, s)} />
          )}
        </div>
      </div>
    </article>
  );
}
