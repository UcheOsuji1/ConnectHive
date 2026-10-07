// Hive Tools — single source of truth for the 61–66 series (Prompt 61 Part 1).
// Served to the client as-is via GET /api/tools/catalog, same idiom as
// categoryConfig.js / GET /api/categories/config, so the client never hand-
// maintains a second copy of this list.
//
// `scope`: 'hive' = has its own page off the identity rail's Tools hub;
//          'plan'  = renders inside a single plan's detail page;
//          'both'  = has a hub tile AND attaches to individual plans.
// `defaultOn`: category_name values (the real DB strings, matching
// categoryConfig.js) where a brand-new Hive starts with this tool enabled.
// `available`: only tools actually built so far. An unavailable tool is
// invisible everywhere — no catalog consumer should ever render one.
// `validateSettings`: optional per-tool settings validator, (settings) =>
// { error } | { settings }. Tools with no settings yet just omit it.

export const TOOL_CATALOG = [
  {
    key: 'find_time', name: 'Find a time', description: 'Offer candidate times and let the Hive vote on what works.',
    icon: 'calendar', scope: 'hive',
    defaultOn: ['Social Groups', 'Professional Networking', 'Travel Buddies', 'Project Collaboration', 'Event Buddies', 'Specialized Groups'],
    available: true,
  },
  {
    key: 'checkins', name: 'Check-in', description: 'Mark who actually showed up, so attendance means something.',
    icon: 'checkcircle', scope: 'plan',
    defaultOn: ['Social Groups', 'Event Buddies', 'Professional Networking', 'Project Collaboration'],
    available: true,
  },
  {
    key: 'split_costs', name: 'Split costs', description: 'Track who owes what for a plan.',
    icon: 'dollar', scope: 'plan',
    defaultOn: ['Social Groups', 'Travel Buddies', 'Event Buddies'],
    available: false,
  },
  {
    key: 'signups', name: 'Sign-up lists', description: 'Let members claim a slot — bring a dish, a ride seat, a task.',
    icon: 'clipboard', scope: 'plan',
    defaultOn: ['Social Groups', 'Event Buddies', 'Travel Buddies'],
    available: false,
  },
  {
    key: 'docs', name: 'Hive docs', description: 'A shared doc space for the Hive.',
    icon: 'doc', scope: 'hive',
    defaultOn: ['Professional Networking', 'Project Collaboration', 'Specialized Groups'],
    available: false,
  },
  {
    key: 'goals', name: 'Goals', description: 'Track what the Hive is working toward together.',
    icon: 'target', scope: 'hive',
    defaultOn: ['Social Groups', 'Professional Networking', 'Travel Buddies', 'Project Collaboration', 'Event Buddies', 'Specialized Groups'],
    available: false,
  },
  {
    key: 'coffee_chats', name: 'Meet someone new', description: 'Get paired with another member for a 1:1 chat.',
    icon: 'coffee', scope: 'hive',
    defaultOn: ['Social Groups', 'Professional Networking'],
    available: false,
  },
  {
    key: 'mentorship', name: 'Mentorship', description: 'Match mentors and mentees inside the Hive.',
    icon: 'mentor', scope: 'hive',
    defaultOn: ['Professional Networking'],
    available: false,
  },
  {
    key: 'opportunities', name: 'Opportunities board', description: 'Share roles, referrals and leads with the Hive.',
    icon: 'briefcase', scope: 'hive',
    defaultOn: ['Professional Networking'],
    available: false,
  },
  {
    key: 'tasks', name: 'Task board', description: 'Track what needs doing and who owns it.',
    icon: 'tasks', scope: 'hive',
    defaultOn: ['Project Collaboration'],
    available: false,
  },
  {
    key: 'itinerary', name: 'Itinerary', description: 'Build a shared schedule for a trip.',
    icon: 'map', scope: 'plan',
    defaultOn: ['Travel Buddies'],
    available: false,
  },
  {
    key: 'rides', name: 'Ride board', description: 'Coordinate who is driving and who needs a seat.',
    icon: 'car', scope: 'plan',
    defaultOn: ['Event Buddies'],
    available: false,
  },
  {
    key: 'ideas', name: 'Ideas board', description: 'Collect and vote on ideas for what the Hive does next.',
    icon: 'bulb', scope: 'hive',
    defaultOn: ['Social Groups', 'Travel Buddies'],
    available: false,
  },
];

export function getToolDef(key) {
  return TOOL_CATALOG.find(t => t.key === key) ?? null;
}

// What the client receives — strips any future server-only fields
// (validators are added inline per-tool in the controller, not here, so
// there is nothing non-serialisable on these objects today; this stays a
// pass-through until there is).
export function publicCatalog() {
  return TOOL_CATALOG.map(({ key, name, description, icon, scope, defaultOn, available }) =>
    ({ key, name, description, icon, scope, defaultOn, available }));
}
