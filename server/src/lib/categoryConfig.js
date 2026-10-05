// Category-aware defaults for a Hive — spec §11. Keyed by the real
// category_name values seeded in migrate.js / stored in `categories`
// (confirmed live: 'Social Groups', 'Professional Networking', 'Travel
// Buddies', 'Project Collaboration', 'Event Buddies', 'Specialized Groups').
// This is the single source of truth, read by createHive (default rooms),
// the "Add suggested rooms" action, Hive Home / Chat's category labels, the
// Home right-column featured module, and CreatePlanModal's type ordering.
// Served to the client as-is via GET /api/categories/config so neither side
// can drift from the other.
//
// `labels`: the spec's right-rail table names only two slots explicitly for
// every row — the upcoming-plan card and the goal card. Travel/Project/
// Professional get a named variant; Social, Event and Specialized fall back
// to the generic label the app already used before this prompt ("Upcoming
// Plan" / "Hive Goal") rather than inventing more named variants the spec
// text given to us doesn't actually list.
//
// `planTypes`: the spec table names *which* existing PLAN_TYPES (lib/plans.js
// on the client) a category prefers first — not new types. Ordering below is
// this author's best judgment of fit per category; Specialized gets no
// override since it has no rail module or extra rooms either, consistent
// with being the deliberate no-op category throughout.
export const CATEGORY_CONFIG = {
  'Social Groups': {
    defaultRooms: ['general', 'weekend-plans', 'food-spots', 'random'],
    planTypes: ['hangout', 'food_drinks', 'games'],
    labels: { nextPlan: 'Upcoming Plan', goal: 'Hive Goal' },
    railModule: 'recentMedia',
  },
  'Professional Networking': {
    defaultRooms: ['general', 'opportunities', 'industry-talk', 'introductions'],
    planTypes: ['networking', 'meeting', 'workshop'],
    labels: { nextPlan: 'Next Session', goal: 'Networking Goal' },
    railModule: 'opportunities',
  },
  'Travel Buddies': {
    defaultRooms: ['general', 'trip-planning', 'destinations', 'food', 'photos'],
    planTypes: ['trip', 'outdoors', 'food_drinks'],
    labels: { nextPlan: 'Next Trip', goal: 'Travel Goal' },
    railModule: 'pinnedItinerary',
  },
  'Project Collaboration': {
    defaultRooms: ['general', 'frontend', 'backend', 'design', 'ideas'],
    planTypes: ['meeting', 'workshop', 'networking'],
    labels: { nextPlan: 'Next Milestone', goal: 'Project Goal' },
    railModule: 'recentFiles',
  },
  'Event Buddies': {
    defaultRooms: ['general', 'upcoming-events', 'meetup-plans', 'rides'],
    planTypes: ['outdoors', 'networking', 'hangout'],
    labels: { nextPlan: 'Next Event', goal: 'Hive Goal' },
    railModule: 'nextPlanAttendees',
  },
  'Specialized Groups': {
    defaultRooms: ['general'],
    planTypes: [],
    labels: { nextPlan: 'Upcoming Plan', goal: 'Hive Goal' },
    railModule: null,
  },
};

// Slug <-> real category_name, mirrors CATEGORY_NAME_MAP in hivesController.js
// (not re-exported from there to avoid a controller importing into a lib and
// back; the slugs themselves are a client-facing convention, not DB data).
export const CATEGORY_SLUGS = {
  social: 'Social Groups',
  professional: 'Professional Networking',
  travel: 'Travel Buddies',
  project: 'Project Collaboration',
  event: 'Event Buddies',
  specialized: 'Specialized Groups',
};

export function getCategoryConfig(categoryName) {
  return CATEGORY_CONFIG[categoryName] ?? null;
}
