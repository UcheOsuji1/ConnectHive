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
// `planRules`: how a new Hive in this category gets plans made (Prompt 60,
// decision 6) — owners/admins-only vs members-can-suggest, and owner-approves
// vs the-Hive-votes. An existing Hive never changes; this only sets the
// defaults createHive writes for a brand new one.
export const CATEGORY_CONFIG = {
  'Social Groups': {
    defaultRooms: ['general', 'weekend-plans', 'food-spots', 'random'],
    planTypes: ['hangout', 'food_drinks', 'games'],
    labels: { nextPlan: 'Upcoming Plan', goal: 'Hive Goal' },
    // Rotates with 'Top idea' once the Ideas tool (Prompt 66) is on and has
    // at least one idea — see hiveHomeController.js's socialFeatured branch.
    // Off, or with no ideas yet, this is recentMedia exactly as before.
    railModule: 'socialFeatured',
    planRules: { plan_proposers: 'members', plan_approval: 'vote' },
  },
  'Professional Networking': {
    defaultRooms: ['general', 'opportunities', 'industry-talk', 'introductions'],
    planTypes: ['networking', 'meeting', 'workshop'],
    labels: { nextPlan: 'Next Session', goal: 'Networking Goal' },
    railModule: 'opportunities',
    planRules: { plan_proposers: 'members', plan_approval: 'owner' },
  },
  'Travel Buddies': {
    defaultRooms: ['general', 'trip-planning', 'destinations', 'food', 'photos'],
    planTypes: ['trip', 'outdoors', 'food_drinks'],
    labels: { nextPlan: 'Next Trip', goal: 'Travel Goal' },
    railModule: 'pinnedItinerary',
    planRules: { plan_proposers: 'members', plan_approval: 'vote' },
  },
  'Project Collaboration': {
    defaultRooms: ['general', 'frontend', 'backend', 'design', 'ideas'],
    planTypes: ['meeting', 'workshop', 'networking'],
    labels: { nextPlan: 'Next Milestone', goal: 'Project Goal' },
    railModule: 'recentFiles',
    planRules: { plan_proposers: 'members', plan_approval: 'owner' },
  },
  'Event Buddies': {
    defaultRooms: ['general', 'upcoming-events', 'meetup-plans', 'rides'],
    planTypes: ['outdoors', 'networking', 'hangout'],
    labels: { nextPlan: 'Next Event', goal: 'Hive Goal' },
    railModule: 'nextPlanAttendees',
    planRules: { plan_proposers: 'members', plan_approval: 'vote' },
  },
  'Specialized Groups': {
    defaultRooms: ['general'],
    planTypes: [],
    labels: { nextPlan: 'Upcoming Plan', goal: 'Hive Goal' },
    railModule: null,
    planRules: { plan_proposers: 'owners', plan_approval: 'owner' },
  },
};

// Starter rooms for a Project Collaboration Hive, by its first selected
// project type (Prompt 83, Step 8) — #general is always created first (as
// today, see createHive), these are the extra rooms after it. Keyed by the
// PROJECT_TYPES keys in collabVocabulary.js; `_fallback` covers no type, the
// "building"/"either" paths with nothing selected, or only "Something else".
export const PROJECT_ROOMS_BY_TYPE = {
  app_software:      ['frontend', 'backend', 'design', 'ideas'], // today's set
  startup:            ['product', 'growth', 'fundraising', 'ideas'],
  film_video:         ['script', 'pre-production', 'shoot-days', 'editing'],
  music:              ['demos', 'recording', 'mixing', 'release'],
  content_media:      ['content-ideas', 'editing', 'publishing', 'analytics'],
  creative_studio:    ['briefs', 'work-in-progress', 'feedback', 'inspiration'],
  brand_ecommerce:    ['product', 'marketing', 'operations', 'ideas'],
  ai_research:        ['papers', 'experiments', 'data', 'ideas'],
  academic_research:  ['reading', 'methods', 'data', 'writing'],
  hardware:           ['design', 'prototyping', 'sourcing', 'testing'],
  social_impact:      ['outreach', 'events', 'fundraising', 'ideas'],
  student:            ['assignments', 'research', 'presentation', 'ideas'],
  game_studio:        ['design-doc', 'art', 'code', 'playtesting'],
  fashion:            ['designs', 'samples', 'photoshoots', 'launch'],
  food:               ['menu', 'sourcing', 'events', 'ideas'],
  theater:            ['script', 'rehearsals', 'tech', 'promo'],
  podcast:            ['episode-ideas', 'guests', 'editing', 'promo'],
  publishing:         ['drafts', 'editing', 'cover-art', 'launch'],
  event_production:   ['planning', 'vendors', 'promo', 'day-of'],
  _fallback:          ['ideas', 'updates'],
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

// #general first, then the extra rooms for the Hive's first project type (or
// the fallback set when there's no type to key off of).
export function getProjectRooms(projectTypes) {
  const key = Array.isArray(projectTypes) && projectTypes.length ? projectTypes[0] : null;
  const extra = (key && PROJECT_ROOMS_BY_TYPE[key]) ?? PROJECT_ROOMS_BY_TYPE._fallback;
  return ['general', ...extra];
}
