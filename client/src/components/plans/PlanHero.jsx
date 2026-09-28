import Avatar from '../Avatar.jsx';
import RsvpMenu from './RsvpMenu.jsx';
import { typeLabel, relativeLabel, formatDate, formatTimeRange } from '../../lib/plans.js';

function Stack({ people, goingCount, maybeCount, onOpen }) {
  return (
    <button type="button" className="plans-people" onClick={onOpen}
            aria-label={`${goingCount} going, ${maybeCount} maybe — view attendees`}>
      <span className="plans-avstack">
        {people.slice(0, 4).map(p => (
          <Avatar key={p.user_id} name={p.full_name} src={p.profile_photo_url} size={26} />
        ))}
        {goingCount > people.length && (
          <span className="plans-avmore">+{goingCount - people.length}</span>
        )}
      </span>
      <span className="plans-count">
        {goingCount} going{maybeCount > 0 ? ` · ${maybeCount} maybe` : ''}
      </span>
    </button>
  );
}

export default function PlanHero({ plan, onRsvp, onOpenAttendees }) {
  const cover = plan.media_url;
  return (
    <article
      className={`plans-hero${cover ? '' : ' plans-hero--nocover'}`}
      style={cover ? { backgroundImage: `url(${cover})` } : undefined}
    >
      <div className="plans-hero-scrim" />
      <div className="plans-hero-top">
        <span className="plans-chip plans-chip--next">★ Next up</span>
        <span className="plans-chip plans-chip--when">
          {relativeLabel(plan.event_at, plan.is_live)}
        </span>
      </div>

      <div className="plans-hero-body">
        <h2 className="plans-hero-title">{plan.headline}</h2>

        <div className="plans-hero-meta">
          <span>🗓 {formatDate(plan.event_at)}</span>
          <span>🕐 {formatTimeRange(plan.event_at, plan.event_end_at)}</span>
          {plan.event_location && <span>📍 {plan.event_location}</span>}
          <span>🏷 {typeLabel(plan.plan_type)}</span>
        </div>

        <div className="plans-hero-foot">
          <div className="plans-host">
            <Avatar name={plan.host?.full_name} src={plan.host?.profile_photo_url} size={38} />
            <div className="plans-host-txt">
              <div className="plans-host-name">
                Hosted by {plan.host?.full_name ?? 'a member'}
                {plan.host?.role && (
                  <span className="plans-role">{plan.host.role}</span>
                )}
              </div>
              {plan.body && <p className="plans-hero-desc">{plan.body}</p>}
            </div>
          </div>

          <div className="plans-hero-actions">
            <Stack
              people={plan.going_preview}
              goingCount={plan.going_count}
              maybeCount={plan.maybe_count}
              onOpen={() => onOpenAttendees(plan)}
            />
            <RsvpMenu value={plan.viewer_rsvp} openUp onChange={s => onRsvp(plan, s)} />
          </div>
        </div>
      </div>
    </article>
  );
}
