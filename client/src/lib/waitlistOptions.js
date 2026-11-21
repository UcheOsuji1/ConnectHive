// Shared waitlist vocabulary — the six "what kind of group" keys and the
// three meet-preference keys, with both the long (desktop chip) and short
// (mobile chip / admin table) display forms. WaitlistPage and
// AdminWaitlistPage both import this so the two can never drift apart.
export const GROUP_OPTIONS = [
  { key: 'social',       label: 'Social Groups',             shortLabel: 'Social' },
  { key: 'professional', label: 'Professional Networking',   shortLabel: 'Professional' },
  { key: 'travel',       label: 'Travel Buddies',             shortLabel: 'Travel' },
  { key: 'project',      label: 'Project Collaboration',      shortLabel: 'Project Collab' },
  { key: 'event',        label: 'Event Buddies',              shortLabel: 'Events' },
  { key: 'specialized',  label: 'Specialized Groups',         shortLabel: 'Specialized' },
];

export const MEET_OPTIONS = [
  { key: 'online',    label: 'Online' },
  { key: 'in_person', label: 'In person' },
  { key: 'both',       label: 'Both' },
];

export function groupShortLabel(key) {
  return GROUP_OPTIONS.find(g => g.key === key)?.shortLabel ?? key;
}

export function meetLabel(key) {
  return MEET_OPTIONS.find(m => m.key === key)?.label ?? key;
}
