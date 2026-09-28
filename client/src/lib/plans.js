// Shared helpers for the Plans page. Every time is rendered in the viewer's
// own time zone — the server stores timestamptz and the client never converts
// to anything else.

export const PLAN_TYPES = [
  'networking', 'hangout', 'food_drinks', 'outdoors',
  'games', 'meeting', 'workshop', 'trip', 'other',
];

export const TYPE_LABELS = {
  networking:  'Networking',
  hangout:     'Hangout',
  food_drinks: 'Food & Drinks',
  outdoors:    'Outdoors',
  games:       'Games',
  meeting:     'Meeting',
  workshop:    'Workshop',
  trip:        'Trip',
  other:       'Other',
};

export const typeLabel = (t) => TYPE_LABELS[t] ?? TYPE_LABELS.other;

const DAY = 86400000;

/** "Happening now" / Today / Tomorrow / In N days / In N weeks / a date. */
export function relativeLabel(startsAt, isLive) {
  if (isLive) return 'Happening now';
  if (!startsAt) return '';
  const start = new Date(startsAt);
  const now   = new Date();
  // Compare calendar days in local time, not raw 24h spans, so an event at
  // 11pm tonight reads "Today" rather than "Tomorrow".
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(start) - midnight(now)) / DAY);

  if (days < 0)  return formatDate(startsAt);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 14)  return `In ${days} days`;
  if (days < 60)  return `In ${Math.round(days / 7)} weeks`;
  return formatDate(startsAt);
}

/** "Thu, Oct 1" */
export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

const time = (iso) => new Date(iso).toLocaleTimeString(undefined, {
  hour: 'numeric', minute: '2-digit',
});

/** "6:30 PM – 9:00 PM", or just "6:30 PM" when there is no end time. */
export function formatTimeRange(startsAt, endsAt) {
  if (!startsAt) return '';
  return endsAt ? `${time(startsAt)} – ${time(endsAt)}` : time(startsAt);
}

/** Local datetime-local input value -> ISO string. */
export function localInputToISO(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export const RSVP_LABELS = {
  going:     'Going',
  maybe:     'Maybe',
  not_going: "Can't go",
};

/** Timeframe buckets used by the When filter. */
export function withinDays(startsAt, days) {
  if (!startsAt) return false;
  return new Date(startsAt).getTime() - Date.now() <= days * DAY;
}
