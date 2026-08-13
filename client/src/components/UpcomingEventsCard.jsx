import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

function DateTile({ eventAt, outlined }) {
  const d = new Date(eventAt);
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const day = d.getDate();
  return (
    <div className={`uec-date-tile${outlined ? ' uec-date-tile--outlined' : ''}`}>
      <span className="uec-date-month">{month}</span>
      <span className="uec-date-day">{day}</span>
    </div>
  );
}

function formatTime(eventAt) {
  return new Date(eventAt).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatWeekday(eventAt) {
  return new Date(eventAt).toLocaleString('en-US', { weekday: 'short' });
}

function UsersIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="4" r="2.2" stroke="#8a6510" strokeWidth="1.1" />
      <path d="M1.7 10.2c0-2.2 1.9-4 4.3-4s4.3 1.8 4.3 4" stroke="#8a6510" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function GoingToggle({ event, onToggle }) {
  return (
    <div className="uec-going-wrap" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className={`uec-going-btn${event.viewer_going ? ' uec-going-btn--active' : ''}`}
        onClick={() => onToggle(event)}
      >
        {event.viewer_going ? '✓ Going' : 'Going?'}
      </button>
      {event.going_count > 0 && (
        <span className="uec-going-count">
          <UsersIcon /> {event.going_count}
        </span>
      )}
    </div>
  );
}

function MyEventRow({ event, onToggle }) {
  const navigate = useNavigate();
  return (
    <div
      className="uec-row"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/hive/${event.hive_id}`)}
    >
      <DateTile eventAt={event.event_at} />
      <div className="uec-row-mid">
        <div className="uec-headline">{event.headline}</div>
        <div className="uec-meta">
          {event.hive_name} · {formatWeekday(event.event_at)} · {formatTime(event.event_at)}
        </div>
      </div>
      <GoingToggle event={event} onToggle={onToggle} />
    </div>
  );
}

function SuggestedEventRow({ event }) {
  const navigate = useNavigate();
  return (
    <div
      className="uec-row"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/hive/${event.hive_id}`)}
    >
      <DateTile eventAt={event.event_at} outlined />
      <div className="uec-row-mid">
        <div className="uec-headline">{event.headline}</div>
        <div className="uec-meta">
          {event.hive_name} · {event.hive_location || event.event_location} · {formatTime(event.event_at)}
        </div>
      </div>
      <span className="uec-view-chip">View</span>
    </div>
  );
}

export default function UpcomingEventsCard({ data, setData }) {
  if (!data) return null;

  const { myEvents, suggestedEvents } = data;

  function handleToggle(event) {
    const wasGoing = event.viewer_going;
    const optimistic = {
      viewer_going: !wasGoing,
      going_count: Math.max(0, event.going_count + (wasGoing ? -1 : 1)),
    };
    setData(prev => ({
      ...prev,
      myEvents: prev.myEvents.map(e => e.post_id === event.post_id ? { ...e, ...optimistic } : e),
      suggestedEvents: prev.suggestedEvents.map(e => e.post_id === event.post_id ? { ...e, ...optimistic } : e),
    }));

    api.post(`/api/events/${event.post_id}/rsvp`, {})
      .then(res => {
        setData(prev => ({
          ...prev,
          myEvents: prev.myEvents.map(e => e.post_id === event.post_id
            ? { ...e, viewer_going: res.going, going_count: res.goingCount } : e),
          suggestedEvents: prev.suggestedEvents.map(e => e.post_id === event.post_id
            ? { ...e, viewer_going: res.going, going_count: res.goingCount } : e),
        }));
      })
      .catch(() => {
        setData(prev => ({
          ...prev,
          myEvents: prev.myEvents.map(e => e.post_id === event.post_id
            ? { ...e, viewer_going: wasGoing, going_count: event.going_count } : e),
          suggestedEvents: prev.suggestedEvents.map(e => e.post_id === event.post_id
            ? { ...e, viewer_going: wasGoing, going_count: event.going_count } : e),
        }));
      });
  }

  const noMyEvents = myEvents.length === 0;
  const noSuggested = suggestedEvents.length === 0;

  if (noMyEvents && noSuggested) {
    return (
      <div className="home-card-shell">
        <div className="home-card-label">Upcoming Events</div>
        <p className="uec-empty">
          No upcoming events yet. Hive owners can post one from "New Post → Event."
        </p>
      </div>
    );
  }

  return (
    <div className="home-card-shell">
      <div className="home-card-label">Upcoming Events</div>

      {!noMyEvents && (
        <div className="uec-group">
          <div className="uec-group-label">From Your Hives</div>
          <div className="uec-rows">
            {myEvents.map(event => (
              <MyEventRow key={event.post_id} event={event} onToggle={handleToggle} />
            ))}
          </div>
        </div>
      )}

      {!noSuggested && (
        <div className="uec-group uec-group--suggested">
          {noMyEvents && <p className="uec-empty-inline">Nothing scheduled in your Hives yet.</p>}
          <div className="uec-group-label uec-group-label--suggested">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M6 0.6 L7.3 4.2 L11 5.2 L7.3 6.2 L6 9.8 L4.7 6.2 L1 5.2 L4.7 4.2 Z" fill="#c49a28" />
            </svg>
            Suggested Near You
          </div>
          <div className="uec-rows">
            {suggestedEvents.map(event => (
              <SuggestedEventRow key={event.post_id} event={event} />
            ))}
          </div>
          {suggestedEvents[0]?.reason && (
            <p className="uec-reason">{suggestedEvents[0].reason}</p>
          )}
        </div>
      )}
    </div>
  );
}
