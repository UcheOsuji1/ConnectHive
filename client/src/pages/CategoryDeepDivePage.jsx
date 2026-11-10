import AreaLocationInput from '../components/AreaLocationInput.jsx';
import DistanceSlider from '../components/DistanceSlider.jsx';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import TrueHiveMark from '../components/TrueHiveMark.jsx';
import TrueHiveWordmark from '../components/TrueHiveWordmark.jsx';
import { getCachedMetros, nearestMetro, metroSubline } from '../lib/geo.js';
import { api } from '../lib/api';
import SkillPicker from '../components/deep-dive/SkillPicker.jsx';
import RoleBuilder from '../components/deep-dive/RoleBuilder.jsx';
import RoleWishlist from '../components/deep-dive/RoleWishlist.jsx';
import {
  asChips, asCards,
  CAREER_STAGES, PRO_INDUSTRIES, PRO_LOOKING_FOR, PRO_NETWORK_STYLES, PRO_PRIMARY_GOALS,
  PRO_WORK_SITUATIONS, MENTORSHIP_PREFS, INDUSTRY_SCOPES,
  PROJECT_TYPES, PROJECT_PATHS, PROJECT_PRIMARY_GOALS, PROJECT_STAGES, PROJECT_INDUSTRIES,
  EXPERIENCE_LEVELS, COMPENSATION, PROJECT_PREF_STAGES, WORK_STYLES, COMMITMENTS,
  PROJECT_TIMELINES, COLLAB_FORMATS, FUNDING,
} from '../data/collabVocabulary.js';
import '../styles/category-deep-dive.css';

function GroupHead({ text, sub }) {
  return (
    <div className="group-head">
      <span className="group-head-text">{text}</span>
      <span className="group-head-sub">{sub}</span>
      <span className="group-head-line" />
    </div>
  );
}

// Deep Dive phrases the slider's value differently from Quick Find's
// "Within 25 mi" — "Up to 25 miles" is this surface's own wording.
function distanceQuestionLabel(miles) {
  return miles == null ? 'Any distance' : `Up to ${miles} miles`;
}

// Rendered once per category right after its LocationQuestion, hidden by the
// caller (not here) when that category's location chip is "Online community
// only" — distance is meaningless once the search is online-only.
function DistanceQuestion({ value, onChange }) {
  return (
    <div className="cdd-section">
      <div className="cdd-section-label">How far will you go to meet your Hive?</div>
      <div className="cdd-distance-value">{distanceQuestionLabel(value)}</div>
      <DistanceSlider value={value} onChange={onChange} />
    </div>
  );
}

// An old saved cards[id] may still be a plain string (single-select, from
// before ages went multi-select) — read it as a one-item array either way.
function asAgeArray(v) {
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}

const LOCATION_CHIPS = [
  '📍 Use my current location',
  '💻 Online community only',
  "✍️ I'll type it in",
];

// ── Social Groups content data ────────────────────────────────

const SOCIAL_CHIPS_TYPES = [
  '🍽️ Dining & food runs',        '🎮 Game nights',
  '🎬 Movie & watch parties',      '🏞️ Outdoor activities',
  '🎉 Parties & events',           '☕ Coffee & casual hangouts',
  '🏋️ Fitness & wellness',         '🎨 Creative & arts',
  '🌃 Nightlife',                  '🏠 House hangouts',
  '🎵 Music & concerts',           '📸 Photography walks',
  '🐾 Pet owner meetups',          '🧳 Day trips & local adventures',
  '🎤 Open mics & performances',   '🏖️ Beach & pool days',
];
const SOCIAL_CARDS_FREQ = [
  { emoji: '🔥', name: 'Multiple times a week',    desc: 'Active social life, always something going on.' },
  { emoji: '🗓️', name: 'Weekly',                    desc: 'A consistent crew with regular meetups.' },
  { emoji: '📅', name: 'A few times a month',       desc: 'Regular but not overwhelming.' },
  { emoji: '🌊', name: 'Casual / as plans come up', desc: 'No pressure, whenever it works.' },
];
const SOCIAL_CARDS_VIBE = [
  { emoji: '😌', name: 'Chill & lowkey',    desc: 'Easy going, low energy, no pressure.' },
  { emoji: '⚡', name: 'Active & outgoing', desc: 'Always something going on.' },
  { emoji: '🌀', name: 'Mix of both',        desc: 'Chill sometimes, turned up others.' },
  { emoji: '🎭', name: 'Deep & meaningful',  desc: 'Real conversations, real connections.' },
];
const SOCIAL_CARDS_SIZE = [
  { emoji: '🤏', name: 'Very small', desc: '2–4 people, close friendships' },
  { emoji: '👥', name: 'Small',       desc: '5–10 people, tight-knit crew' },
  { emoji: '🌐', name: 'Medium',      desc: '10–20 people, more variety' },
  { emoji: '🎉', name: 'Large',       desc: '20+ people, big energy' },
];
const SOCIAL_CHIPS_STATUS = [
  '🆕 New to the city',
  '📍 Local — expanding my circle',
  '🌍 Just visiting / temporary',
  '🏡 Settled but lost touch with people',
];
const SOCIAL_CARDS_INTRO = [
  { emoji: '👋', name: '1:1 before group hangouts',      desc: 'I like to vet a new friendship before group settings.' },
  { emoji: '🎉', name: 'Straight into group settings',   desc: "I'm comfortable jumping right into the group." },
  { emoji: '🔀', name: 'Depends on the group',           desc: 'No strong preference either way.' },
];
const SOCIAL_CHIPS_COMM = [
  '💬 Active in group chat',
  '📅 Mostly just logistics',
  '🤐 Quiet in chat, show up in person',
  '🔀 Depends on the vibe',
];
const SOCIAL_CHIPS_REL = [
  '💍 In a relationship',
  '💚 Single',
  '👨‍👩‍👧 Parent',
  '🤐 Prefer not to share',
];

// ── Professional content data ─────────────────────────────────


// These 8 are rebuilt from collabVocabulary.js (Prompt 76) — same constant
// names, same values, now derived from stable keys instead of being the
// source of truth themselves. See server/src/checks/collabVocabulary.check.mjs.
const PROF_CARDS_STAGE = asCards(CAREER_STAGES);
const PROF_CHIPS_INDUSTRY = asChips(PRO_INDUSTRIES);
const PROF_CHIPS_GOALS = asChips(PRO_LOOKING_FOR);
const PROF_CARDS_NETWORK = asCards(PRO_NETWORK_STYLES);
const PROF_CARDS_PRIMARY_GOAL = asCards(PRO_PRIMARY_GOALS);
const PROF_CHIPS_WORKSIT = asChips(PRO_WORK_SITUATIONS);
const PROF_CARDS_MENTOR = asCards(MENTORSHIP_PREFS);
const PROF_CARDS_INDUSTRY_PREF = asCards(INDUSTRY_SCOPES);

// ── Travel Buddies content data ───────────────────────────────

const TRAVEL_CHIPS_TYPES = [
  '🌍 International trips',        '🏙️ Local city exploration',
  '🚗 Road trips',                 '🏕️ Camping & nature',
  '🏖️ Beach vacations',            '🎒 Backpacking',
  '✈️ Weekend getaways',            '🍽️ Food & cultural tours',
  '🧗 Adventure & extreme sports', '🚢 Cruises',
  '🎿 Ski trips',                  '🎭 Festival travel',
  '📸 Photography travel',         '🌿 Eco / wellness retreats',
  '🏛️ History & heritage tours',   '🎓 Study abroad / learning trips',
];

const TRAVEL_CARDS_BUDDY = [
  { emoji: '🗺️', name: 'Plan & go on trips together',       desc: 'A real partner — we book, plan, and travel as a team.' },
  { emoji: '📅', name: 'Accountability to travel more',     desc: 'Someone to push me to actually go and stop postponing.' },
  { emoji: '💬', name: 'Share tips & recommendations',      desc: 'A community to exchange travel intel, hacks, and inspo.' },
  { emoji: '🌐', name: 'Both online community & real trips', desc: 'A Hive that plans digitally and shows up in person.' },
];

const TRAVEL_CARDS_FREQ = [
  { emoji: '🔥', name: 'Very frequently',               desc: 'Monthly or more — travel is a lifestyle for me.' },
  { emoji: '✈️', name: 'A few times a year',            desc: 'Consistent traveler, always planning the next one.' },
  { emoji: '🗓️', name: 'Once a year',                   desc: 'One solid trip per year, I make it count.' },
  { emoji: '🌱', name: 'Rarely — looking to travel more', desc: "I want to travel but haven't been doing it enough." },
];

const TRAVEL_CHIPS_COMPANIONS = [
  '🧍 Solo',          '👫 With a partner',          '👯 With friends',
  '👨‍👩‍👧 With family', '🌐 Mix of everyone',          "🆕 Haven't traveled much yet",
];

const TRAVEL_CARDS_STYLE = [
  { emoji: '🎒', name: 'Budget backpacker',   desc: 'Hostels, street food, maximum adventure.' },
  { emoji: '🏨', name: 'Mid-range comfort',   desc: 'Nice hotels, good food, great experiences.' },
  { emoji: '✨', name: 'Luxury travel',        desc: 'First class, fine dining, no compromises.' },
  { emoji: '🔀', name: 'Depends on the trip', desc: 'Flexible, I adapt to what makes sense.' },
];

const TRAVEL_CARDS_PACE = [
  { emoji: '🐢', name: 'Slow & immersive',               desc: 'I stay in one place, soak it in, go deep not wide.' },
  { emoji: '⚡', name: 'Fast-paced explorer',             desc: 'I want to see everything — maximize every day.' },
  { emoji: '☕', name: 'Morning explorer, easy evenings', desc: 'Active during the day, relaxed and social at night.' },
  { emoji: '🌙', name: 'Late starter, up all night',     desc: 'Slow mornings, live for the nighttime energy.' },
  { emoji: '🔀', name: 'Depends on the destination',     desc: 'I read the city and go with whatever feels right.' },
  { emoji: '😌', name: 'Pure relaxation mode',           desc: 'No itinerary, no rush, vacation means rest to me.' },
];

const TRAVEL_CHIPS_PRIORITIES = [
  '🍽️ Food & dining experiences',      '🏛️ History & culture',
  '🌿 Nature & outdoors',               '🎉 Nightlife & social scene',
  '📸 Photography & content creation',  '🛍️ Shopping & fashion',
  '🧘 Relaxation & wellness',           '🎭 Art & local experiences',
  '🏋️ Staying active & fit',            '🤝 Meeting locals',
  '🎵 Live music & events',             '🌅 Scenic views & landscapes',
];

const TRAVEL_CARDS_PLAN = [
  { emoji: '📋', name: 'Planner — itinerary ready', desc: 'I research everything weeks in advance.' },
  { emoji: '🌊', name: 'Spontaneous',               desc: 'Book a flight and see what happens.' },
  { emoji: '⚖️', name: 'Loose plan, flexible',      desc: 'A rough idea, totally open on the details.' },
  { emoji: '👥', name: 'Group decides together',    desc: 'Democratic, everyone has equal input.' },
];

const TRAVEL_CARDS_BUDGET = [
  { emoji: '💵', amount: 'Under $500',    label: 'Budget' },
  { emoji: '💳', amount: '$500–$1,500',   label: 'Mid-range' },
  { emoji: '💎', amount: '$1,500–$3,000', label: 'Comfortable' },
  { emoji: '🏆', amount: '$3,000+',       label: 'Luxury' },
  { emoji: '🔀', amount: 'Flexible',      label: 'Depends on trip' },
];

const TRAVEL_CHIPS_LENGTH = [
  'Day trips', 'Weekend (2–3 days)', 'Extended (4–7 days)', '2+ weeks', 'No preference',
];

// ── Project Collab content data ───────────────────────────────

// These 13 are rebuilt from collabVocabulary.js (Prompt 76) — same constant
// names, same values, now derived from stable keys instead of being the
// source of truth themselves. See server/src/checks/collabVocabulary.check.mjs.
const PROJECT_CHIPS_TYPES = asChips(PROJECT_TYPES);
const PROJECT_CARDS_PATH = asCards(PROJECT_PATHS);
const PROJECT_CARDS_PRIMARY_GOAL = asCards(PROJECT_PRIMARY_GOALS);
const PROJECT_CARDS_STAGE = asCards(PROJECT_STAGES);
const PROJECT_CHIPS_INDUSTRY = asChips(PROJECT_INDUSTRIES);
const PROJECT_CARDS_EXPERIENCE = asCards(EXPERIENCE_LEVELS);
const PROJECT_CHIPS_OFFER = asChips(COMPENSATION);
const PROJECT_CHIPS_PREF_STAGE = asChips(PROJECT_PREF_STAGES);
const PROJECT_CARDS_WORKSTYLE = asCards(WORK_STYLES);
const PROJECT_CARDS_TIME = asCards(COMMITMENTS);
const PROJECT_CHIPS_TIMELINE = asChips(PROJECT_TIMELINES);
const PROJECT_CARDS_LOCATION = asCards(COLLAB_FORMATS);
const PROJECT_CARDS_FUNDING = asCards(FUNDING);

// ── Event Buddies content data ────────────────────────────────

const EVENT_CHIPS_TYPES = [
  '🎵 Concerts & music festivals',  '🎤 Comedy shows',
  '🏀 Sports games',                '🎓 Conferences & summits',
  '🛠️ Workshops & classes',          '🌐 Networking events',
  '🎭 Theater & performing arts',   '🎪 Festivals & pop-ups',
  '🏫 Campus events',               '🌃 Club & nightlife',
  '🍷 Wine & dining events',        '🎮 Gaming tournaments',
  '🎨 Art gallery openings',        '🏃 Charity runs & fundraisers',
  '🌿 Wellness & retreats',         '🎬 Film screenings & premieres',
  '🏋️ Fitness classes & bootcamps', '🍳 Food & drink tastings',
];

const EVENT_CARDS_LOOKING = [
  { emoji: '🎯', name: 'Someone to come with me',      desc: 'I have tickets — need a plus one or group to go with.' },
  { emoji: '📣', name: 'Discover events together',     desc: 'Find new things to do and explore as a group.' },
  { emoji: '🌐', name: 'A regular crew for going out', desc: 'A consistent group that shows up together.' },
  { emoji: '🛠️', name: 'Event organizer / host',       desc: 'I run events and need engaged, reliable attendees.' },
];

const EVENT_CARDS_FREQ = [
  { emoji: '🔥', name: 'Multiple times a week',        desc: "Always out, it's a lifestyle." },
  { emoji: '📅', name: 'Weekly',                        desc: 'At least one thing per week.' },
  { emoji: '🗓️', name: 'A few times a month',           desc: 'Selective, quality over quantity.' },
  { emoji: '🌟', name: 'For big / special events only', desc: 'I go all out for the right ones.' },
];

const EVENT_CARDS_STYLE = [
  { emoji: '🎯', name: 'Early arrival, front & center',  desc: "I'm fully engaged, best spot, full experience." },
  { emoji: '😌', name: 'Late arrival, chill in the back', desc: 'Lowkey attendance, go with the flow.' },
  { emoji: '📸', name: 'Content creator mode',           desc: 'Documenting everything, camera always out.' },
  { emoji: '🎉', name: 'Here to party & meet people',   desc: 'Social butterfly, events are about the people.' },
  { emoji: '🧠', name: 'Here to learn & absorb',        desc: 'Taking notes, networking with purpose.' },
  { emoji: '🔀', name: 'Depends on the event',           desc: 'I read the room and adapt accordingly.' },
];

const EVENT_CARDS_SIZE = [
  { emoji: '🏠', name: 'Intimate',          desc: 'Under 50 people' },
  { emoji: '🏛️', name: 'Mid-size',          desc: '50–500 people' },
  { emoji: '🏟️', name: 'Large venue',       desc: '500–5,000 people' },
  { emoji: '🌐', name: 'Massive / festival', desc: '5,000+ people' },
  { emoji: '🔀', name: 'No preference',     desc: "Size doesn't matter" },
  { emoji: '💻', name: 'Online events',     desc: 'Virtual attendance' },
];

const EVENT_CARDS_IO = [
  { emoji: '🏠', name: 'Indoor only',   desc: 'Venues, clubs, theaters, arenas.' },
  { emoji: '🌿', name: 'Outdoor only',  desc: 'Parks, festivals, open-air stages.' },
  { emoji: '🔀', name: 'No preference', desc: "Both work, it's about the event not the venue." },
];
const EVENT_CARDS_PLAN = [
  { emoji: '📋', name: 'I plan events weeks ahead',   desc: 'Tickets bought, calendar blocked, outfit ready.' },
  { emoji: '📅', name: 'A few days notice is fine',   desc: 'I can get ready quickly if I know ahead of time.' },
  { emoji: '⚡', name: 'Same-day plans work for me',  desc: "I'm always down, just send the address." },
  { emoji: '🔀', name: 'Mix of both',                  desc: 'Planned for big events, spontaneous for smaller ones.' },
];
const EVENT_CARDS_BUDGET = [
  { emoji: '🆓', name: 'Free events only', range: '$0' },
  { emoji: '💵', name: 'Budget-friendly',  range: 'Under $50' },
  { emoji: '💳', name: 'Mid-range',        range: '$50–$150' },
  { emoji: '💎', name: 'Premium',          range: '$150–$500' },
  { emoji: '🏆', name: 'VIP / Luxury',     range: '$500+' },
  { emoji: '🔀', name: 'Flexible',         range: 'Depends on event' },
];
const EVENT_CHIPS_AGE = ['18–22', '21–26', '25–32', '30–40', '40+', 'Any age'];
const EVENT_CHIPS_DISCOVERY = [
  '📱 Instagram / TikTok',           '🎟️ Eventbrite / ticketing apps',
  '👥 Word of mouth / friends',       '📧 Email newsletters',
  '🗞️ Local blogs / publications',   '🎵 Artist / venue follows',
  '🌐 Discord / community groups',    '🗺️ Google / local search',
  '📺 TV / radio',
];

// ── Specialized content data ──────────────────────────────────

const SPEC_CHIPS_TYPES = [
  '🏋️ Fitness accountability',       '📚 Study group',
  '🙏 Faith / spiritual community',  '💡 Business mastermind',
  '🌱 Personal development circle',  '🧘 Mental wellness group',
  '📖 Book club',                    '🌿 Sobriety / sober social',
  '🤝 Support group',                '🎯 Goal-setting accountability circle',
  '🧬 Health condition community',   '🌍 Cultural / heritage group',
  '👩‍👧 Parenting group',               '🏳️‍🌈 LGBTQ+ community',
  '🎓 Alumni network',                '💸 Financial literacy group',
];
const SPEC_CARDS_REASON = [
  { emoji: '🎯', name: "I'm starting something new",                  desc: 'Just beginning and want support along the way.' },
  { emoji: '🔄', name: "I'm going through a transition",              desc: 'A change in life, and I want community through it.' },
  { emoji: '💪', name: 'I want to stay consistent',                   desc: 'Already on this path, need help sticking with it.' },
  { emoji: '🌱', name: "I'm exploring this for the first time",       desc: "Curious and open, not sure exactly what I need yet." },
  { emoji: '🤝', name: "I've done this before, want community again", desc: 'Returning to this with more experience this time.' },
  { emoji: '💬', name: "I'm looking for support right now",           desc: "It's been a hard stretch and I want people who understand." },
];
const SPEC_CARDS_STRUCTURE = [
  { emoji: '📋', name: 'Highly structured',      desc: 'Set agenda, clear goals, full accountability.' },
  { emoji: '⚖️', name: 'Semi-structured',        desc: 'Framework with room for flexibility.' },
  { emoji: '🌊', name: 'Organic & free-flowing', desc: 'Community-led, no rigid structure.' },
  { emoji: '🎯', name: 'Milestone-based',        desc: 'Structured around achieving specific goals.' },
];
const SPEC_CARDS_LEVEL = [
  { emoji: '🌱', name: 'Complete beginner',       desc: 'Just starting out, learning the basics.' },
  { emoji: '📈', name: 'Some experience',          desc: 'Building consistency, getting more comfortable.' },
  { emoji: '🏆', name: 'Experienced',              desc: 'I know this well, could even mentor others.' },
  { emoji: '🔄', name: 'Returning after a break', desc: "I've done this before, picking it back up." },
];
const SPEC_CARDS_PRIVACY = [
  { emoji: '🔒', name: 'Yes, I prefer privacy',  desc: "I'd like to stay anonymous or low-profile." },
  { emoji: '🌐', name: "No, I'm fully open",      desc: 'Comfortable being visible in the group.' },
  { emoji: '🔀', name: 'Depends on the group',    desc: "I'll decide once I see who's involved." },
];
const SPEC_CHIPS_FORMAT = [
  '💬 Text-based check-ins',
  '🎥 Video calls',
  '📞 Voice calls only',
  '🤝 In-person meetups',
  '📝 Journaling / written reflection',
  '🔀 Mix of formats',
];
const SPEC_CARDS_SIZE = [
  { emoji: '🤏', name: 'Very small',    desc: '2–4 people, deep intimacy' },
  { emoji: '👥', name: 'Small',          desc: '5–10 people, close-knit' },
  { emoji: '🌐', name: 'Larger',         desc: '10+ people, more perspectives' },
  { emoji: '🔀', name: 'No preference', desc: 'Whatever fits best' },
];
const SPEC_CARDS_ROLE = [
  { emoji: '🧭', name: 'I want to lead / facilitate', desc: "I'm ready to guide this group." },
  { emoji: '👤', name: 'I want to participate',        desc: "I'm here as a member, not a leader." },
  { emoji: '🔄', name: 'Open to either',               desc: "Depends on the group and what's needed." },
];
const SPEC_CHIPS_SUCCESS = [
  '✅ Hitting personal goals',     '🤝 Real accountability partners',
  '🧠 Learning from others',       '💬 Safe space to share openly',
  '🌱 Personal transformation',    '🏆 Measurable results',
  '🌍 Finding community',          '💡 Sharing knowledge',
];
const SPEC_CARDS_COMMITMENT = [
  { emoji: '🌊', name: 'Casual check-ins',      desc: 'Low pressure, join when I can.' },
  { emoji: '📅', name: 'Regular & consistent',  desc: "I'll show up reliably every week." },
  { emoji: '🔥', name: 'Fully committed',        desc: "This is a priority, I'm all in." },
  { emoji: '🔀', name: 'Depends on the group',  desc: "I'll decide once I see the fit." },
];

// ─────────────────────────────────────────────────────────────

const CATEGORY_CONTENT = {
  social: {
    eyebrow:     'Social Groups · Deep Dive',
    titleBefore: 'What kind of ',
    titleEm:     'social life',
    titleAfter:  ' are you building?',
    subtitle:    "Help us find the right vibe — not just any group, but one that actually fits how you like to connect.",
    nextText:    'Find My Social Hive →',
    createText:  'Create Social Hive',
    totalItems:  28,
  },
  professional: {
    eyebrow:     'Professional · Deep Dive',
    titleBefore: "Let's build your ",
    titleEm:     'professional network.',
    titleAfter:  '',
    subtitle:    "The right connections depend on where you are in your career and what you're trying to accomplish. The more you share, the better your matches.",
    nextText:    'Find My Professional Hive →',
    createText:  'Create Professional Hive',
    totalItems:  94,
  },
  travel: {
    eyebrow:     'Travel Buddies · Deep Dive',
    titleBefore: 'Where do you want ',
    titleEm:     'to go?',
    titleAfter:  '',
    subtitle:    "Travel is deeply personal. The more you tell us about how you explore, the better we'll match you with people who travel exactly the same way.",
    nextText:    'Find My Travel Hive →',
    createText:  'Create Travel Hive',
    totalItems:  40,
  },
  project: {
    eyebrow:     'Project Collab · Deep Dive',
    titleBefore: 'What are you ',
    titleEm:     'building?',
    titleAfter:  '',
    subtitle:    "Great collaborations start with the right match of skills, goals, work styles, and commitment. The more you share, the better your team match.",
    nextText:    'Find My Collab Hive →',
    createText:  'Create Collab Hive',
    totalItems:  147,
  },
  event: {
    eyebrow:     'Event Buddies · Deep Dive',
    titleBefore: 'What events do you ',
    titleEm:     'live for?',
    titleAfter:  '',
    subtitle:    "Find people who show up to the same things as you — same vibe, same budget, same energy. Not just any event buddy, the right ones.",
    nextText:    'Find My Event Hive →',
    createText:  'Create Event Hive',
    totalItems:  41,
  },
  specialized: {
    eyebrow:     'Specialized Groups · Deep Dive',
    titleBefore: "What's your ",
    titleEm:     'specific purpose?',
    titleAfter:  '',
    subtitle:    "Specialized Hives are built around one focused goal. Tell us as much or as little as feels comfortable — we'll use it to find people who truly understand.",
    nextText:    'Find My Specialized Hive →',
    createText:  'Create Specialized Hive',
    totalItems:  30,
  },
};

// ── Social Groups-specific card components ────────────────────

function SocialIntroCardGrid({ id, cards, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
      {cards.map((card, i) => {
        const sel = selectedCard === card.name;
        const hov = hovered === card.name;
        return (
          <div
            key={card.name}
            style={{
              gridColumn: i === cards.length - 1 ? 'span 2' : undefined,
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '12px',
              padding: '14px 16px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => onSelect(id, card.name)}
            onMouseEnter={() => setHovered(card.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ fontSize: '20px', marginBottom: '7px' }}>{card.emoji}</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', fontWeight: 500, color: '#1a1508', marginBottom: '4px' }}>
              {card.name}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 300, color: '#a09880', lineHeight: 1.4 }}>
              {card.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SocialRelChipRow({ id, chips: relChips, selectedChip, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {relChips.map(chip => {
        const sel = selectedChip === chip;
        const hov = hovered === chip && !sel;
        return (
          <div
            key={chip}
            style={{
              padding: '8px 16px',
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '20px',
              background: sel ? '#c49a28' : '#fff',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '12.5px',
              fontWeight: sel ? 500 : 400,
              color: sel ? '#0f0d07' : '#4a4030',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s, color 0.15s',
            }}
            onClick={() => onSelect(id, chip)}
            onMouseEnter={() => setHovered(chip)}
            onMouseLeave={() => setHovered(null)}
          >
            {chip}
          </div>
        );
      })}
    </div>
  );
}

// ── Specialized-specific card components ─────────────────────

function SpecReasonCardGrid({ id, cards, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
      {cards.map(card => {
        const sel = selectedCard === card.name;
        const hov = hovered === card.name;
        return (
          <div
            key={card.name}
            style={{
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '12px',
              padding: '14px 16px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => onSelect(id, card.name)}
            onMouseEnter={() => setHovered(card.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ fontSize: '20px', marginBottom: '7px' }}>{card.emoji}</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', fontWeight: 500, color: '#1a1508', marginBottom: '4px' }}>
              {card.name}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 300, color: '#a09880', lineHeight: 1.4 }}>
              {card.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SpecPrivacyCardRow({ id, cards, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'flex', gap: '10px' }}>
      {cards.map(card => {
        const sel = selectedCard === card.name;
        const hov = hovered === card.name;
        return (
          <div
            key={card.name}
            style={{
              flex: 1,
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '12px',
              padding: '16px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => onSelect(id, card.name)}
            onMouseEnter={() => setHovered(card.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <span style={{ fontSize: '22px', display: 'block', marginBottom: '7px' }}>{card.emoji}</span>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', fontWeight: 500, color: '#1a1508', marginBottom: '3px' }}>
              {card.name}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 300, color: '#a09880', lineHeight: 1.35 }}>
              {card.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SpecSizeCardRow({ id, cards, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'flex', gap: '10px' }}>
      {cards.map(card => {
        const sel = selectedCard === card.name;
        const hov = hovered === card.name;
        return (
          <div
            key={card.name}
            style={{
              flex: 1,
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '12px',
              padding: '14px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => onSelect(id, card.name)}
            onMouseEnter={() => setHovered(card.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <span style={{ fontSize: '20px', display: 'block', marginBottom: '6px' }}>{card.emoji}</span>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '14px', fontWeight: 500, color: '#1a1508', marginBottom: '2px' }}>
              {card.name}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10.5px', fontWeight: 300, color: '#a09880' }}>
              {card.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Reusable sub-components ───────────────────────────────────

function ChipGroup({
  id,
  chips,
  selected,
  onToggle,
  single            = false,
  customizable      = false,
  customAdded       = [],
  customVisible     = false,
  onShowCustom,
  customInputVal    = '',
  onCustomChange,
  onCustomAdd,
  customLabel       = '+ Something else',
  customPlaceholder = 'Type your activity…',
}) {
  return (
    <div>
      <div className="cdd-chip-row">
        {[...chips, ...customAdded].map(chip => (
          <button
            key={chip}
            type="button"
            className={`cdd-chip${selected.includes(chip) ? ' selected' : ''}`}
            onClick={() => onToggle(id, chip, single)}
          >
            {chip}
          </button>
        ))}
        {customizable && (
          <button
            type="button"
            className="cdd-chip-dashed"
            onClick={() => onShowCustom(id)}
          >
            {customLabel}
          </button>
        )}
      </div>

      {customizable && customVisible && (
        <div className="cdd-custom-row">
          <input
            type="text"
            className="cdd-custom-input"
            placeholder={customPlaceholder}
            value={customInputVal}
            onChange={e => onCustomChange(id, e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onCustomAdd(id)}
          />
          <button type="button" className="cdd-custom-add" onClick={() => onCustomAdd(id)}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// The one "What city or area are you in?" question, reused identically by
// every category. Lifts its resolved value (chip, typed text, metro_key,
// place label) to the parent via the on*Change callbacks, so handleNext can
// forward it straight into route state the same way chips/cards/textValues
// already are. Coordinates from navigator.geolocation never leave this
// component — only the nearest metro's metro_key is reported upward.
function LocationQuestion({
  selectedChip, onSelectChip,
  savedMetroKey,
  cityText, onCityTextChange,
  onMetroKeyChange,
  onPlaceLabelChange,
  hideOnlineChip = false,
}) {
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | locating | confirmed | failed
  const [confirmedMetro, setConfirmedMetro] = useState(null);
  const [subline, setSubline] = useState('');
  const [locationDenied, setLocationDenied] = useState(false);
  const inputRef = useRef(null);
  const geoRequest = useRef(0);
  useEffect(() => () => { geoRequest.current++; }, []);
  useEffect(() => {
    let cancelled = false;
    if (selectedChip === '📍 Use my current location' && savedMetroKey) {
      getCachedMetros().then(metros => {
        if (cancelled) return;
        const area = metros.find(m => m.metro_key === savedMetroKey);
        if (area) { setConfirmedMetro(area); setSubline(metroSubline(area)); setGeoStatus('confirmed'); }
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [selectedChip, savedMetroKey]);

  async function handleUseLocation() {
    const requestId = ++geoRequest.current;
    onSelectChip('📍 Use my current location');
    setGeoStatus('locating');
    setLocationDenied(false);
    try {
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error('unsupported')); return; }
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 600000 });
      });
      const metros = await getCachedMetros();
      if (requestId !== geoRequest.current) return;
      const nearest = nearestMetro(pos.coords.latitude, pos.coords.longitude, metros);
      if (nearest) {
        onMetroKeyChange(nearest.metro_key);
        onPlaceLabelChange(nearest.name);
        setConfirmedMetro(nearest);
        setSubline(metroSubline(nearest));
        setGeoStatus('confirmed');
        // Best-effort — saves the precise (rounded) coordinates for the
        // distance filter. Never blocks the metro-based flow above; a
        // failure here is silent since the metro resolution already worked.
        api.post('/api/users/location', { latitude: pos.coords.latitude, longitude: pos.coords.longitude }).catch(() => {});
      } else {
        fallbackToTyping();
      }
    } catch (err) {
      if (requestId === geoRequest.current) fallbackToTyping(err?.code === 1);
    }
  }

  function fallbackToTyping(permissionDenied = false) {
    setGeoStatus('failed');
    setLocationDenied(permissionDenied);
    onSelectChip("✍️ I'll type it in");
    onMetroKeyChange(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleChange() {
    geoRequest.current++;
    onSelectChip(null);
    onMetroKeyChange(null);
    onPlaceLabelChange('');
    setConfirmedMetro(null);
    setGeoStatus('idle');
    setLocationDenied(false);
  }

  function handleChipClick(chip) {
    geoRequest.current++;
    if (chip === '📍 Use my current location') { handleUseLocation(); return; }
    if (chip === '💻 Online community only') {
      onSelectChip(chip);
      onMetroKeyChange(null);
      onPlaceLabelChange('');
      setGeoStatus('idle');
      setLocationDenied(false);
      return;
    }
    // "I'll type it in"
    onMetroKeyChange(null);
    onPlaceLabelChange('');
    setGeoStatus('idle');
    setLocationDenied(false);
    onSelectChip(chip);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const showTyping = selectedChip === "✍️ I'll type it in" || geoStatus === 'failed';

  const visibleLocationChips = hideOnlineChip
    ? LOCATION_CHIPS.filter(c => c !== '💻 Online community only')
    : LOCATION_CHIPS;

  return (
    <div>
      <div className="cdd-chip-row">
        {visibleLocationChips.map(chip => (
          <button
            key={chip}
            type="button"
            className={`cdd-chip${selectedChip === chip ? ' selected' : ''}`}
            onClick={() => handleChipClick(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      {geoStatus === 'locating' && (
        <p className="cdd-location-status">Finding your area…</p>
      )}

      {geoStatus === 'confirmed' && confirmedMetro && (
        <div className="cdd-location-confirm">
          <span className="cdd-location-confirm-main">📍 {confirmedMetro.name}</span>
          <button type="button" className="cdd-location-change" onClick={handleChange}>Change</button>
          {subline && <span className="cdd-location-confirm-sub">{subline}</span>}
        </div>
      )}

      {showTyping && (
        <div className="cdd-location-field">
          <AreaLocationInput inputRef={inputRef} inputClassName="cdd-custom-input" inputStyle={{ width: '100%', marginTop: 10 }}
            placeholder="e.g. Los Angeles, CA / New York, NY..." value={cityText}
            onChange={val => { onCityTextChange(val); onMetroKeyChange(null); onPlaceLabelChange(''); }}
            onSelect={({ metroKey, place }) => { onMetroKeyChange(metroKey); onPlaceLabelChange(place.display_name); }} />
          {geoStatus === 'failed' && (
            <p className="cdd-location-error">
              {locationDenied ? 'Location access was blocked. Type your city instead.' : "We couldn't find your area. Type your city instead."}
            </p>
          )}

        </div>
      )}
    </div>
  );
}

function CardGrid({ id, cards, selectedCard, onSelect, cols }) {
  return (
    <div className={`cdd-card-grid${cols === 3 ? ' three' : ''}`}>
      {cards.map(card => (
        <div
          key={card.name}
          className={`cdd-card${selectedCard === card.name ? ' selected' : ''}`}
          onClick={() => onSelect(id, card.name)}
        >
          <div className="cdd-card-emoji">{card.emoji}</div>
          <div className="cdd-card-name">{card.name}</div>
          <div className="cdd-card-desc">{card.desc}</div>
        </div>
      ))}
    </div>
  );
}

// ── Event Buddies-specific card components ────────────────────

function EventBudgetCardGrid({ id, cards, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
      {cards.map(card => {
        const sel = selectedCard === card.name;
        const hov = hovered === card.name;
        return (
          <div
            key={card.name}
            style={{
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '12px',
              padding: '14px 12px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => onSelect(id, card.name)}
            onMouseEnter={() => setHovered(card.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ fontSize: '22px', marginBottom: '6px' }}>{card.emoji}</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '14px', fontWeight: 500, color: '#1a1508', marginBottom: '2px' }}>
              {card.name}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 500, color: '#c49a28' }}>
              {card.range}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Multi-select: picking "Any age" clears every other band, and picking any
// band clears "Any age" — the two are mutually exclusive, everything else
// stacks freely. `asAgeArray` (below) lets this read an old single-value
// cards[id] (a plain string, from before multi-select) as a one-item array.
function EventAgeChipRow({ id, chips: ageChips, selected, onToggle }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {ageChips.map(chip => {
        const sel = selected.includes(chip);
        const hov = hovered === chip;
        return (
          <div
            key={chip}
            style={{
              flex: 1,
              minWidth: '100px',
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '10px',
              padding: '10px 8px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              textAlign: 'center',
              cursor: 'pointer',
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: '15px',
              fontWeight: 500,
              color: sel || hov ? '#8a6510' : '#1a1508',
              transition: 'border-color 0.15s, background 0.15s, color 0.15s',
            }}
            onClick={() => onToggle(id, chip)}
            onMouseEnter={() => setHovered(chip)}
            onMouseLeave={() => setHovered(null)}
          >
            {sel ? '✓ ' : ''}{chip}
          </div>
        );
      })}
    </div>
  );
}

function EventSizeCardGrid({ id, cards, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
      {cards.map(card => {
        const sel = selectedCard === card.name;
        const hov = hovered === card.name;
        return (
          <div
            key={card.name}
            style={{
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '12px',
              padding: '14px 12px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => onSelect(id, card.name)}
            onMouseEnter={() => setHovered(card.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ fontSize: '22px', display: 'block', marginBottom: '6px' }}>{card.emoji}</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '14px', fontWeight: 500, color: '#1a1508', marginBottom: '2px' }}>
              {card.name}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10.5px', fontWeight: 300, color: '#a09880' }}>
              {card.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventIOCardRow({ id, cards, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'flex', gap: '10px' }}>
      {cards.map(card => {
        const sel = selectedCard === card.name;
        const hov = hovered === card.name;
        return (
          <div
            key={card.name}
            style={{
              flex: 1,
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '12px',
              padding: '16px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => onSelect(id, card.name)}
            onMouseEnter={() => setHovered(card.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ fontSize: '24px', display: 'block', marginBottom: '7px' }}>{card.emoji}</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', fontWeight: 500, color: '#1a1508', marginBottom: '3px' }}>
              {card.name}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 300, color: '#a09880' }}>
              {card.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Project Collab-specific card components ───────────────────

function WorkStyleCardGrid({ id, cards, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
      {cards.map(card => {
        const sel = selectedCard === card.name;
        const hov = hovered === card.name;
        return (
          <div
            key={card.name}
            style={{
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '12px',
              padding: '14px 16px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => onSelect(id, card.name)}
            onMouseEnter={() => setHovered(card.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{
              width: '38px', height: '38px', minWidth: '38px',
              borderRadius: '8px',
              background: sel || hov ? '#fdf0d0' : '#f8f4ea',
              fontSize: '20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {card.emoji}
            </div>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', fontWeight: 500, color: '#1a1508', marginBottom: '3px' }}>
                {card.name}
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 300, color: '#a09880', lineHeight: 1.35 }}>
                {card.desc}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimeCardGrid({ id, cards, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
      {cards.map(card => {
        const sel = selectedCard === card.name;
        const hov = hovered === card.name;
        return (
          <div
            key={card.name}
            style={{
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '12px',
              padding: '14px 16px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => onSelect(id, card.name)}
            onMouseEnter={() => setHovered(card.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ fontSize: '22px', marginBottom: '6px' }}>{card.emoji}</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', fontWeight: 500, color: '#1a1508', marginBottom: '3px' }}>
              {card.name}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 500, color: '#c49a28', marginBottom: '3px' }}>
              {card.hours}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10.5px', fontWeight: 300, color: '#a09880' }}>
              {card.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FundingCardRow({ id, cards, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {cards.map(card => {
        const sel = selectedCard === card.name;
        const hov = hovered === card.name;
        return (
          <div
            key={card.name}
            style={{
              flex: 1,
              minWidth: '130px',
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '10px',
              padding: '12px 10px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => onSelect(id, card.name)}
            onMouseEnter={() => setHovered(card.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <span style={{ fontSize: '20px', display: 'block', marginBottom: '5px' }}>{card.emoji}</span>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '13px', fontWeight: 500, color: '#1a1508', display: 'block', marginBottom: '2px' }}>
              {card.name}
            </span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10px', fontWeight: 300, color: '#a09880', lineHeight: 1.3, display: 'block' }}>
              {card.desc}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Travel-specific card components ──────────────────────────

function BudgetCardRow({ id, cards, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
      {cards.map(card => {
        const sel = selectedCard === card.amount;
        const hov = hovered === card.amount;
        return (
          <div
            key={card.amount}
            style={{
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '10px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              padding: '12px 8px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => onSelect(id, card.amount)}
            onMouseEnter={() => setHovered(card.amount)}
            onMouseLeave={() => setHovered(null)}
          >
            <span style={{ fontSize: '18px', display: 'block', marginBottom: '4px' }}>{card.emoji}</span>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '16px', color: '#c49a28', display: 'block', marginBottom: '3px', lineHeight: 1.2 }}>
              {card.amount}
            </span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10px', color: '#8a8070', lineHeight: 1.3, display: 'block' }}>
              {card.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Professional-specific card components ─────────────────────

function MentorCardGrid({ id, cards, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
      {cards.map(card => {
        const sel = selectedCard === card.name;
        const hov = hovered === card.name;
        return (
          <div
            key={card.name}
            style={{
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '12px',
              padding: '16px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => onSelect(id, card.name)}
            onMouseEnter={() => setHovered(card.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{
              width: '40px', height: '40px', minWidth: '40px',
              borderRadius: '8px',
              background: sel || hov ? '#fdf0d0' : '#f8f4ea',
              fontSize: '22px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {card.emoji}
            </div>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', fontWeight: 500, color: '#1a1508', marginBottom: '3px' }}>
                {card.name}
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 300, color: '#a09880', lineHeight: 1.35 }}>
                {card.desc}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PrefCardRow({ id, cards, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'flex', gap: '10px' }}>
      {cards.map(card => {
        const sel = selectedCard === card.name;
        const hov = hovered === card.name;
        return (
          <div
            key={card.name}
            style={{
              flex: 1,
              border: `0.5px solid ${sel || hov ? '#c49a28' : '#d8d0bc'}`,
              borderRadius: '12px',
              padding: '16px',
              background: sel ? '#fffbf0' : hov ? '#fffdf7' : '#fff',
              boxShadow: sel ? '0 0 0 1px #c49a28' : 'none',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onClick={() => onSelect(id, card.name)}
            onMouseEnter={() => setHovered(card.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ fontSize: '22px', marginBottom: '6px' }}>{card.emoji}</div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '14px', fontWeight: 500, color: '#1a1508', marginBottom: '3px' }}>
              {card.name}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10.5px', fontWeight: 300, color: '#a09880', lineHeight: 1.35 }}>
              {card.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}


function CreateBtn({ text, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      style={{
        height: '42px',
        padding: '0 24px',
        border: '0.5px solid #c49a28',
        borderRadius: '8px',
        background: hov ? '#fdf5e0' : 'transparent',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '12px',
        fontWeight: 500,
        color: '#8a6510',
        cursor: 'pointer',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        transition: 'all 0.15s',
      }}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {text}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────

export default function CategoryDeepDivePage() {
  const navigate = useNavigate();
  const location = useLocation();

  const rawCat  = (location.state?.category
    ?? new URLSearchParams(location.search).get('category')
    ?? '');
  const category = rawCat.toLowerCase();
  const content  = CATEGORY_CONTENT[category] ?? CATEGORY_CONTENT.social;

  // ── State ──
  const [chips,         setChips]         = useState(location.state?.chips ?? {});  // { id: string[] }
  const [cards,         setCards]         = useState(location.state?.cards ?? {});  // ages may be arrays or legacy strings
  const [customVisible, setCustomVisible] = useState({});  // { id: bool }
  const [customInput,   setCustomInput]   = useState({});  // { id: string }
  const [customAdded,   setCustomAdded]   = useState({});  // { id: string[] }
  const [textValues,    setTextValues]    = useState(location.state?.textValues ?? {});
  const [metroKeys,     setMetroKeys]     = useState(location.state?.metroKeys ?? {});
  const [placeLabels,   setPlaceLabels]   = useState(location.state?.placeLabels ?? {});
  const [roles,         setRoles]         = useState(location.state?.roles ?? []);
  const [saveSkillsToProfile, setSaveSkillsToProfile] = useState(true);

  // Pre-fill prof-skills / proj-skills from the signed-in user's saved
  // profile skills, but only on first load — never when Back is restoring a
  // previously-answered picker (location.state already carries that answer).
  useEffect(() => {
    const skillsId = category === 'professional' ? 'prof-skills' : category === 'project' ? 'proj-skills' : null;
    if (!skillsId) return;
    if (location.state?.chips?.[skillsId]?.length) return; // Back is restoring this
    if (chips[skillsId]?.length) return; // already has an answer this session
    api.get('/api/users/profile')
      .then(({ profile }) => {
        if (profile?.skills?.length) {
          setChips(prev => (prev[skillsId]?.length ? prev : { ...prev, [skillsId]: profile.skills }));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Pre-fill "Company or school" from the profile the same way, when there's
  // no saved answer yet.
  useEffect(() => {
    if (category !== 'professional') return;
    if (location.state?.textValues?.['prof-org']) return;
    if (textValues['prof-org']) return;
    api.get('/api/users/profile')
      .then(({ profile }) => {
        if (profile?.school_company) {
          setTextValues(prev => (prev['prof-org'] ? prev : { ...prev, 'prof-org': profile.school_company }));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // A search handed off from Quick Find's own slider continues at that
  // value; arriving fresh (no refineFilters yet) seeds from the user's saved
  // default instead, same as Quick Find does on its own first load.
  const incomingMaxDistance = location.state?.refineFilters?.maxDistance;
  const [maxDistance, setMaxDistance] = useState(incomingMaxDistance !== undefined ? incomingMaxDistance : 50);
  useEffect(() => {
    if (incomingMaxDistance !== undefined) return;
    api.get('/api/users/profile')
      .then(({ profile }) => setMaxDistance(profile?.max_distance_miles ?? 50))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ──
  const toggleChip = (id, label, single = false) =>
    setChips(prev => {
      const cur = prev[id] || [];
      return {
        ...prev,
        [id]: single
          ? (cur[0] === label ? [] : [label])
          : (cur.includes(label) ? cur.filter(l => l !== label) : [...cur, label]),
      };
    });

  const toggleCard = (id, label) =>
    setCards(prev => ({ ...prev, [id]: prev[id] === label ? null : label }));

  // Multi-select ages — "Any age" and a specific band are mutually
  // exclusive; picking one clears the other kind. Reads an old single-value
  // string via asAgeArray so a stale saved state still loads correctly.
  const toggleAgeBand = (id, label) =>
    setCards(prev => {
      const cur = asAgeArray(prev[id]);
      let next;
      if (label === 'Any age') {
        next = cur.includes('Any age') ? [] : ['Any age'];
      } else {
        const withoutAny = cur.filter(c => c !== 'Any age');
        next = withoutAny.includes(label) ? withoutAny.filter(c => c !== label) : [...withoutAny, label];
      }
      return { ...prev, [id]: next };
    });

  // Single-select setter for a *-location chip row, used by LocationQuestion.
  const setLocationChip = (id, label) =>
    setChips(prev => ({ ...prev, [id]: label ? [label] : [] }));
  const setMetroKey   = (id, key)   => setMetroKeys(prev => ({ ...prev, [id]: key }));
  const setPlaceLabel = (id, label) => setPlaceLabels(prev => ({ ...prev, [id]: label }));

  // Multi-select where one option (e.g. "Any stage") is exclusive with the
  // rest — same mutual-exclusion idea as toggleAgeBand, generalised.
  const toggleExclusiveChip = (id, label, exclusiveLabel) =>
    setChips(prev => {
      const cur = prev[id] || [];
      let next;
      if (label === exclusiveLabel) {
        next = cur.includes(exclusiveLabel) ? [] : [exclusiveLabel];
      } else {
        const withoutExclusive = cur.filter(c => c !== exclusiveLabel);
        next = withoutExclusive.includes(label) ? withoutExclusive.filter(c => c !== label) : [...withoutExclusive, label];
      }
      return { ...prev, [id]: next };
    });

  // The merged "Where and how will you work together?" question. Picking
  // Remote internally sets chips['project-location'] to the same marker the
  // old standalone LocationQuestion chip used, so createPrefills/handleNext's
  // existing searchMode derivation keeps working unchanged. Leaving Remote
  // for another card (or deselecting it) clears that forced marker so the
  // real LocationQuestion starts fresh.
  const REMOTE_CARD = 'Fully remote / online';
  // CardGrid calls onSelect(id, card.name) — matched here (id is always
  // 'proj-location' for this grid, kept only so the signature lines up).
  const handleProjLocationCard = (_id, name) => {
    const next = cards['proj-location'] === name ? null : name;
    toggleCard('proj-location', name);
    if (next === REMOTE_CARD) {
      setLocationChip('project-location', '💻 Online community only');
      setMetroKey('project-location', null);
      setPlaceLabel('project-location', '');
    } else if (chips['project-location']?.[0] === '💻 Online community only') {
      setLocationChip('project-location', null);
    }
  };

  const showCustom = (id) =>
    setCustomVisible(prev => ({ ...prev, [id]: !prev[id] }));

  const handleCustomInput = (id, val) =>
    setCustomInput(prev => ({ ...prev, [id]: val }));

  const addCustom = (id) => {
    const val = (customInput[id] || '').trim();
    if (!val) return;
    setCustomAdded(prev => ({ ...prev, [id]: [...(prev[id] || []), val] }));
    toggleChip(id, val, false);
    setCustomInput(prev =>   ({ ...prev, [id]: '' }));
    setCustomVisible(prev => ({ ...prev, [id]: false }));
  };

  // ── Progress ──
  // Chip-array lengths already count each selected skill (prof-skills /
  // proj-skills are stored as chips), so roles need their own term — one
  // point per role, same unit the prompt asks for.
  const progress = useMemo(() => {
    const chipCount = Object.values(chips).reduce((n, arr) => n + arr.length, 0);
    const cardCount = Object.values(cards).filter(v => Array.isArray(v) ? v.length > 0 : Boolean(v)).length;
    const textCount = Object.values(textValues).filter(v => v.trim()).length;
    const rolesCount = roles.length;
    const total = chipCount + cardCount + textCount + rolesCount;
    return Math.min((total / (content.totalItems * 0.2)) * 100, 100);
  }, [chips, cards, textValues, roles, content.totalItems]);

  // Project only: which answers belong to the visible path(s), so a
  // Building-only answer never gets sent once someone has switched to
  // Joining (and vice versa) — the hidden group's state is kept, just not sent.
  const projPath = cards['proj-path'] ?? null;
  const showBuildingGroup = projPath === 'Building a team' || projPath === 'Open to either';
  const showJoiningGroup = projPath === 'Joining a project' || projPath === 'Open to either';
  const isJoiningOnly = projPath === 'Joining a project';

  function visibleProjectAnswers() {
    const BUILDING_IDS = { chips: ['proj-offer'], cards: ['proj-stage'], text: [] };
    const JOINING_IDS = { chips: ['proj-want-roles', 'proj-return', 'proj-pref-stage'], cards: ['proj-experience'], text: [] };
    const hiddenChipIds = new Set([
      ...(!showBuildingGroup ? BUILDING_IDS.chips : []),
      ...(!showJoiningGroup ? JOINING_IDS.chips : []),
    ]);
    const hiddenCardIds = new Set([
      ...(!showBuildingGroup ? BUILDING_IDS.cards : []),
      ...(!showJoiningGroup ? JOINING_IDS.cards : []),
    ]);
    const visibleChips = Object.fromEntries(Object.entries(chips).filter(([id]) => !hiddenChipIds.has(id)));
    const visibleCards = Object.fromEntries(Object.entries(cards).filter(([id]) => !hiddenCardIds.has(id)));
    const visibleRoles = showBuildingGroup ? roles : [];
    return { chips: visibleChips, cards: visibleCards, roles: visibleRoles };
  }

  useEffect(() => {
    if (!CATEGORY_CONTENT[category]) {
      navigate('/find-your-hive', { replace: true });
    }
  }, [category, navigate]);

  // Best-effort save of whatever Deep Dive has learned about this person's
  // profile — new skills (if the picker's checkbox is on) and, for
  // Professional, the title/org fields. Never blocks navigation; a failure
  // here just means the profile doesn't pick up these fields this time.
  function saveCollabProfile() {
    const skillsId = category === 'professional' ? 'prof-skills' : category === 'project' ? 'proj-skills' : null;
    const addSkills = saveSkillsToProfile && skillsId ? (chips[skillsId] ?? []) : [];
    const headline = category === 'professional' ? (textValues['prof-title'] || '').trim() : '';
    const schoolCompany = category === 'professional' ? (textValues['prof-org'] || '').trim() : '';

    // Only the visible path's answers travel here too — same rule the
    // match request itself follows (see visibleProjectAnswers above).
    let deepDive = null;
    if (category === 'project') {
      const { chips: visChips, cards: visCards, roles: visRoles } = visibleProjectAnswers();
      deepDive = { category, answers: { chips: visChips, cards: visCards, textValues, roles: visRoles } };
    } else if (category === 'professional') {
      deepDive = { category, answers: { chips, cards, textValues, roles } };
    }

    if (!addSkills.length && !headline && !schoolCompany && !deepDive) return;
    api.patch('/api/users/profile/collab', {
      ...(addSkills.length ? { addSkills } : {}),
      ...(headline ? { headline } : {}),
      ...(schoolCompany ? { schoolCompany } : {}),
      ...(deepDive ? { deepDive } : {}),
    }).catch(err => console.error('[CategoryDeepDivePage] profile collab save failed:', err));
  }

  // ── Navigate next ──
  const handleNext = () => {
    const refineFilters = { ...(location.state?.refineFilters ?? {}), maxDistance };
    // The full (unfiltered) answers — this is what seeds this page's own
    // state again if the person comes Back from Discovery, so the hidden
    // group's answers survive the round trip, not just in-session switches.
    const fullAnswers = { category, chips, cards, textValues, metroKeys, placeLabels, refineFilters, roles };
    window.history.replaceState({ ...window.history.state, usr: fullAnswers }, '');
    // What actually travels to Discovery — for Project, only the visible
    // path's answers (Part 4: "don't send hidden-group answers").
    const projectOverrides = category === 'project' ? visibleProjectAnswers() : null;
    const sentAnswers = projectOverrides
      ? { ...fullAnswers, chips: projectOverrides.chips, cards: projectOverrides.cards, roles: projectOverrides.roles }
      : fullAnswers;
    // Best-effort — the Deep Dive's own save of the radius choice. Never
    // blocks navigation; failing here still lets this search use `maxDistance`.
    api.put('/api/users/max-distance', { maxDistanceMiles: maxDistance }).catch(() => {});
    saveCollabProfile();
    navigate('/hive-discovery', { state: sentAnswers });
  };
  const createPrefills = () => {
    const locationId = `${category === 'specialized' ? 'spec' : category}-location`;
    const projectOverrides = category === 'project' ? visibleProjectAnswers() : null;
    saveCollabProfile();
    return {
      chips: projectOverrides?.chips ?? chips,
      cards: projectOverrides?.cards ?? cards,
      textValues,
      roles: projectOverrides?.roles ?? roles,
      searchMetroKey: metroKeys[locationId] ?? null,
      searchPlaceLabel: placeLabels[locationId] || null,
      searchMode: chips[locationId]?.[0] === '💻 Online community only' ? 'online' : 'area',
      ageBands: asAgeArray(cards['social-age'] ?? cards['event-age']),
    };
  };

  return (
    <div className="cdd-root">
      <div className="cdd-wrap">

        {/* ── Top Bar ── */}
        <div className="cdd-topbar">
          <Link to="/" className="cdd-logo" aria-label="TrueHive home">
            <TrueHiveMark size={24} />
            <TrueHiveWordmark variant="light" className="th-wordmark--compact" />
          </Link>
          <button
            type="button"
            className="cdd-back-btn"
            onClick={() => navigate('/find-your-hive')}
          >
            ← Back to Categories
          </button>
        </div>

        {/* ── Progress Bar ── */}
        <div className="cdd-progress-track">
          <div className="cdd-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* ── Page Header ── */}
        <div className="cdd-eyebrow-row">
          <div className="cdd-eyebrow-line" />
          <span className="cdd-eyebrow-text">{content.eyebrow}</span>
        </div>
        <h1 className="cdd-title">
          {content.titleBefore}<em>{content.titleEm}</em>{content.titleAfter}
        </h1>
        <p className="cdd-subtitle">{content.subtitle}</p>

        {/* ══ Social Groups sections ══ */}
        {category === 'social' && (<>

          <div className="cdd-section">
            <div className="cdd-section-label">What type of Hive are you looking for?</div>
            <ChipGroup
              id="types"
              chips={SOCIAL_CHIPS_TYPES}
              selected={chips.types || []}
              onToggle={toggleChip}
              customizable
              customAdded={customAdded.types || []}
              customVisible={!!customVisible.types}
              onShowCustom={showCustom}
              customInputVal={customInput.types || ''}
              onCustomChange={handleCustomInput}
              onCustomAdd={addCustom}
              customLabel="+ Something else"
              customPlaceholder="Describe the type of social Hive you want..."
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">How often are you looking to hang out?</div>
            <SpecReasonCardGrid
              id="freq"
              cards={SOCIAL_CARDS_FREQ}
              selectedCard={cards.freq ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What&apos;s your social vibe?</div>
            <SpecReasonCardGrid
              id="vibe"
              cards={SOCIAL_CARDS_VIBE}
              selectedCard={cards.vibe ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What size group feels right to you?</div>
            <SpecSizeCardRow
              id="social-size"
              cards={SOCIAL_CARDS_SIZE}
              selectedCard={cards['social-size'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What age range are you looking for in this Hive?</div>
            <EventAgeChipRow
              id="social-age"
              chips={EVENT_CHIPS_AGE}
              selected={asAgeArray(cards['social-age'])}
              onToggle={toggleAgeBand}
            />
            <p className="cdd-hint">Pick as many as you like.</p>
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What city or area are you in?</div>
            <LocationQuestion
              selectedChip={chips['social-location']?.[0] ?? null}
              savedMetroKey={metroKeys['social-location']}
              onSelectChip={label => setLocationChip('social-location', label)}
              cityText={textValues['social-city'] || ''}
              onCityTextChange={val => setTextValues(prev => ({ ...prev, 'social-city': val }))}
              onMetroKeyChange={key => setMetroKey('social-location', key)}
              onPlaceLabelChange={label => setPlaceLabel('social-location', label)}
            />
          </div>

          {chips['social-location']?.[0] !== '💻 Online community only' && (
            <DistanceQuestion value={maxDistance} onChange={setMaxDistance} />
          )}

          <div className="cdd-section">
            <div className="cdd-section-label">Are you new to the area or an established local?</div>
            <ChipGroup
              id="social-status"
              chips={SOCIAL_CHIPS_STATUS}
              selected={chips['social-status'] || []}
              onToggle={toggleChip}
              single
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">Do you prefer meeting people 1:1 first or jumping into groups?</div>
            <SocialIntroCardGrid
              id="social-intro"
              cards={SOCIAL_CARDS_INTRO}
              selectedCard={cards['social-intro'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What&apos;s your communication style outside of hangouts?</div>
            <ChipGroup
              id="social-comm"
              chips={SOCIAL_CHIPS_COMM}
              selected={chips['social-comm'] || []}
              onToggle={toggleChip}
              single
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">
              Relationship context{' '}
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9.5px', fontWeight: 300, color: '#b0a880' }}>
                (optional — helps with group fit)
              </span>
            </div>
            <SocialRelChipRow
              id="social-rel"
              chips={SOCIAL_CHIPS_REL}
              selectedChip={cards['social-rel'] ?? null}
              onSelect={toggleCard}
            />
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10.5px', color: '#b0a880', fontStyle: 'italic', marginTop: '8px' }}>
              This is entirely optional and only used to suggest more relevant groups (e.g. couple-friendly or family-friendly Hives).
            </div>
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">
              Anything specific you&apos;re looking for?{' '}
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9.5px', fontWeight: 300, color: '#b0a880' }}>
                (optional)
              </span>
            </div>
            <textarea
              className="cdd-textarea"
              style={{ height: '72px', resize: 'none' }}
              placeholder="e.g. Looking for a laid-back group of creatives in their 20s who like trying new restaurants and occasional weekend trips..."
              value={textValues['social-notes'] || ''}
              onChange={e => setTextValues(prev => ({ ...prev, 'social-notes': e.target.value }))}
              onFocus={e => { e.target.style.borderColor = '#c49a28'; }}
              onBlur={e => { e.target.style.borderColor = '#d8d0bc'; }}
            />
          </div>

        </>)}

        {/* ══ Professional sections ══ */}
        {category === 'professional' && (<>

          <div className="cdd-section">
            <div className="cdd-section-label">What are you looking for from this Hive?</div>
            <ChipGroup
              id="goals"
              chips={PROF_CHIPS_GOALS}
              selected={chips.goals || []}
              onToggle={toggleChip}
              customizable
              customAdded={customAdded.goals || []}
              customVisible={!!customVisible.goals}
              onShowCustom={showCustom}
              customInputVal={customInput.goals || ''}
              onCustomChange={handleCustomInput}
              onCustomAdd={addCustom}
              customLabel="+ Something else"
              customPlaceholder="Describe what you need from this Hive..."
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What city or area are you in?</div>
            <LocationQuestion
              selectedChip={chips['professional-location']?.[0] ?? null}
              savedMetroKey={metroKeys['professional-location']}
              onSelectChip={label => setLocationChip('professional-location', label)}
              cityText={textValues['professional-city'] || ''}
              onCityTextChange={val => setTextValues(prev => ({ ...prev, 'professional-city': val }))}
              onMetroKeyChange={key => setMetroKey('professional-location', key)}
              onPlaceLabelChange={label => setPlaceLabel('professional-location', label)}
            />
          </div>

          {chips['professional-location']?.[0] !== '💻 Online community only' && (
            <DistanceQuestion value={maxDistance} onChange={setMaxDistance} />
          )}

          <div className="cdd-section">
            <div className="cdd-section-label">What do you do?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <div>
                <label className="field-label" htmlFor="prof-title">Role or title</label>
                <input
                  id="prof-title"
                  className="cdd-text-input"
                  type="text"
                  maxLength={80}
                  value={textValues['prof-title'] || ''}
                  onChange={e => setTextValues(prev => ({ ...prev, 'prof-title': e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="prof-org">
                  Company or school <span className="cdd-optional">(from your profile)</span>
                </label>
                <input
                  id="prof-org"
                  className="cdd-text-input"
                  type="text"
                  maxLength={120}
                  value={textValues['prof-org'] || ''}
                  onChange={e => setTextValues(prev => ({ ...prev, 'prof-org': e.target.value }))}
                />
              </div>
            </div>
            <p className="cdd-hint">Shows on your card in Professional Hives, e.g. "Software Engineer · CSUN". Saves to your profile.</p>
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What&apos;s your primary professional goal right now?</div>
            <CardGrid
              id="prof-primary-goal"
              cards={PROF_CARDS_PRIMARY_GOAL}
              selectedCard={cards['prof-primary-goal'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What&apos;s your current work situation?</div>
            <ChipGroup
              id="prof-worksit"
              chips={PROF_CHIPS_WORKSIT}
              selected={chips['prof-worksit'] || []}
              onToggle={toggleChip}
              single
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What&apos;s your current career stage?</div>
            <CardGrid
              id="stage"
              cards={PROF_CARDS_STAGE}
              selectedCard={cards.stage ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What industry or field are you in?</div>
            <ChipGroup
              id="industry"
              chips={PROF_CHIPS_INDUSTRY}
              selected={chips.industry || []}
              onToggle={toggleChip}
              customizable
              customAdded={customAdded.industry || []}
              customVisible={!!customVisible.industry}
              onShowCustom={showCustom}
              customInputVal={customInput.industry || ''}
              onCustomChange={handleCustomInput}
              onCustomAdd={addCustom}
              customLabel="+ My industry"
              customPlaceholder="Type your industry or field..."
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What skills do you bring?</div>
            <SkillPicker
              value={chips['prof-skills'] || []}
              onChange={skills => setChips(prev => ({ ...prev, 'prof-skills': skills }))}
              saveToProfile={saveSkillsToProfile}
              onSaveToggleChange={setSaveSkillsToProfile}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">Are you looking to mentor or be mentored?</div>
            <MentorCardGrid
              id="prof-mentor"
              cards={PROF_CARDS_MENTOR}
              selectedCard={cards['prof-mentor'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">Do you prefer industry-specific or cross-industry Hives?</div>
            <PrefCardRow
              id="prof-indpref"
              cards={PROF_CARDS_INDUSTRY_PREF}
              selectedCard={cards['prof-indpref'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">How do you prefer to network?</div>
            <CardGrid
              id="network"
              cards={PROF_CARDS_NETWORK}
              selectedCard={cards.network ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">
              Tell us more about your professional goals{' '}
              <span className="cdd-optional">(optional)</span>
            </div>
            <textarea
              className="cdd-textarea"
              style={{ height: '80px', resize: 'none' }}
              placeholder="e.g. I'm a software engineer at an early-stage startup looking to connect with other founders, engineers, and potential investors in the LA tech scene. Open to advising smaller teams in exchange for access to a strong senior network..."
              value={textValues['prof-notes'] || ''}
              onChange={e => setTextValues(prev => ({ ...prev, 'prof-notes': e.target.value }))}
            />
          </div>

        </>)}

        {/* ══ Travel Buddies sections ══ */}
        {category === 'travel' && (<>

          <div className="cdd-section">
            <div className="cdd-section-label">What type of Hive are you looking for?</div>
            <ChipGroup
              id="travel-types"
              chips={TRAVEL_CHIPS_TYPES}
              selected={chips['travel-types'] || []}
              onToggle={toggleChip}
              customizable
              customAdded={customAdded['travel-types'] || []}
              customVisible={!!customVisible['travel-types']}
              onShowCustom={showCustom}
              customInputVal={customInput['travel-types'] || ''}
              onCustomChange={handleCustomInput}
              onCustomAdd={addCustom}
              customLabel="+ Something else"
              customPlaceholder="Describe the travel experience you're looking for..."
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What city or area are you in?</div>
            <LocationQuestion
              selectedChip={chips['travel-location']?.[0] ?? null}
              savedMetroKey={metroKeys['travel-location']}
              onSelectChip={label => setLocationChip('travel-location', label)}
              cityText={textValues['travel-city'] || ''}
              onCityTextChange={val => setTextValues(prev => ({ ...prev, 'travel-city': val }))}
              onMetroKeyChange={key => setMetroKey('travel-location', key)}
              onPlaceLabelChange={label => setPlaceLabel('travel-location', label)}
            />
          </div>

          {chips['travel-location']?.[0] !== '💻 Online community only' && (
            <DistanceQuestion value={maxDistance} onChange={setMaxDistance} />
          )}

          <div className="cdd-section">
            <div className="cdd-section-label">What are you looking for from a travel buddy?</div>
            <CardGrid
              id="travel-buddy"
              cards={TRAVEL_CARDS_BUDDY}
              selectedCard={cards['travel-buddy'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">How often do you travel?</div>
            <CardGrid
              id="travel-freq"
              cards={TRAVEL_CARDS_FREQ}
              selectedCard={cards['travel-freq'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">Who do you usually travel with?</div>
            <ChipGroup
              id="travel-companions"
              chips={TRAVEL_CHIPS_COMPANIONS}
              selected={chips['travel-companions'] || []}
              onToggle={toggleChip}
              single
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What&apos;s your travel style?</div>
            <CardGrid
              id="travel-style"
              cards={TRAVEL_CARDS_STYLE}
              selectedCard={cards['travel-style'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What&apos;s your pace when traveling?</div>
            <MentorCardGrid
              id="travel-pace"
              cards={TRAVEL_CARDS_PACE}
              selectedCard={cards['travel-pace'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What do you prioritize on a trip?</div>
            <ChipGroup
              id="travel-priority"
              chips={TRAVEL_CHIPS_PRIORITIES}
              selected={chips['travel-priority'] || []}
              onToggle={toggleChip}
              customizable
              customAdded={customAdded['travel-priority'] || []}
              customVisible={!!customVisible['travel-priority']}
              onShowCustom={showCustom}
              customInputVal={customInput['travel-priority'] || ''}
              onCustomChange={handleCustomInput}
              onCustomAdd={addCustom}
              customLabel="+ Something else"
              customPlaceholder="What matters most to you on a trip?"
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">How do you like to plan?</div>
            <CardGrid
              id="travel-plan"
              cards={TRAVEL_CARDS_PLAN}
              selectedCard={cards['travel-plan'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">
              What&apos;s your typical budget per trip?{' '}
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9.5px', fontWeight: 300, color: '#b0a880' }}>
                (per person, excluding flights)
              </span>
            </div>
            <BudgetCardRow
              id="travel-budget"
              cards={TRAVEL_CARDS_BUDGET}
              selectedCard={cards['travel-budget'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">
              Any destinations in mind?{' '}
              <span className="cdd-optional">(optional)</span>
            </div>
            <input
              type="text"
              className="cdd-text-input"
              style={{ height: '40px', border: '0.5px solid #d8d0bc', borderRadius: '8px', background: '#fff', fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: '#1a1508', width: '100%', boxSizing: 'border-box', padding: '0 12px' }}
              placeholder="e.g. Japan, NYC, Paris, anywhere warm, open to suggestions..."
              value={textValues.destinations || ''}
              onChange={e => setTextValues(prev => ({ ...prev, destinations: e.target.value }))}
              onFocus={e => { e.target.style.borderColor = '#c49a28'; }}
              onBlur={e => { e.target.style.borderColor = '#d8d0bc'; }}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">Typical trip length?</div>
            <ChipGroup
              id="travel-length"
              chips={TRAVEL_CHIPS_LENGTH}
              selected={chips['travel-length'] || []}
              onToggle={toggleChip}
              single
            />
          </div>

        </>)}

        {/* ══ Project Collab sections ══ */}
        {category === 'project' && (<>

          <div className="cdd-section">
            <div className="cdd-section-label">Are you joining a project or building a team?</div>
            <CardGrid
              id="proj-path"
              cols={3}
              cards={PROJECT_CARDS_PATH}
              selectedCard={cards['proj-path'] ?? null}
              onSelect={toggleCard}
            />
            <p className="cdd-hint">Your answer decides which questions come next.</p>
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">
              {isJoiningOnly ? 'What kind of project do you want to join?' : 'What kind of project is it?'}
            </div>
            <ChipGroup
              id="proj-types"
              chips={PROJECT_CHIPS_TYPES}
              selected={chips['proj-types'] || []}
              onToggle={toggleChip}
              customizable
              customAdded={customAdded['proj-types'] || []}
              customVisible={!!customVisible['proj-types']}
              onShowCustom={showCustom}
              customInputVal={customInput['proj-types'] || ''}
              onCustomChange={handleCustomInput}
              onCustomAdd={addCustom}
              customLabel="+ Something else"
              customPlaceholder="Describe your project type..."
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">Where and how will you work together?</div>
            <CardGrid
              id="proj-location"
              cards={PROJECT_CARDS_LOCATION}
              selectedCard={cards['proj-location'] ?? null}
              onSelect={handleProjLocationCard}
            />
            {cards['proj-location'] && cards['proj-location'] !== REMOTE_CARD && (<>
              <div style={{ marginTop: 14 }}>
                <LocationQuestion
                  hideOnlineChip
                  selectedChip={chips['project-location']?.[0] ?? null}
                  savedMetroKey={metroKeys['project-location']}
                  onSelectChip={label => setLocationChip('project-location', label)}
                  cityText={textValues['project-city'] || ''}
                  onCityTextChange={val => setTextValues(prev => ({ ...prev, 'project-city': val }))}
                  onMetroKeyChange={key => setMetroKey('project-location', key)}
                  onPlaceLabelChange={label => setPlaceLabel('project-location', label)}
                />
              </div>
              <DistanceQuestion value={maxDistance} onChange={setMaxDistance} />
            </>)}
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What&apos;s your main goal?</div>
            <CardGrid
              id="proj-primary-goal"
              cards={PROJECT_CARDS_PRIMARY_GOAL}
              selectedCard={cards['proj-primary-goal'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">
              {isJoiningOnly ? 'What industries interest you?' : 'What industry or space is it in?'}
            </div>
            <ChipGroup
              id="proj-industry"
              chips={PROJECT_CHIPS_INDUSTRY}
              selected={chips['proj-industry'] || []}
              onToggle={toggleChip}
              customizable
              customAdded={customAdded['proj-industry'] || []}
              customVisible={!!customVisible['proj-industry']}
              onShowCustom={showCustom}
              customInputVal={customInput['proj-industry'] || ''}
              onCustomChange={handleCustomInput}
              onCustomAdd={addCustom}
              customLabel="+ Something else"
              customPlaceholder="Enter your industry or space..."
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What skills do you bring?</div>
            <SkillPicker
              value={chips['proj-skills'] || []}
              onChange={skills => setChips(prev => ({ ...prev, 'proj-skills': skills }))}
              saveToProfile={saveSkillsToProfile}
              onSaveToggleChange={setSaveSkillsToProfile}
            />
          </div>

          {!projPath && <p className="cdd-hint">Your answer decides which questions come next.</p>}

          {showBuildingGroup && (<>
            <GroupHead text="Building a team" sub="4 questions" />

            <div className="cdd-section">
              <div className="cdd-section-label">What stage is your project at?</div>
              <CardGrid
                id="proj-stage"
                cols={3}
                cards={PROJECT_CARDS_STAGE}
                selectedCard={cards['proj-stage'] ?? null}
                onSelect={toggleCard}
              />
            </div>

            <div className="cdd-section">
              <div className="cdd-section-label">Who do you need?</div>
              <RoleBuilder
                value={roles}
                onChange={setRoles}
                projectTypes={chips['proj-types'] || []}
              />
            </div>

            <div className="cdd-section">
              <div className="cdd-section-label">What&apos;s your funding situation?</div>
              <FundingCardRow
                id="proj-funding"
                cards={PROJECT_CARDS_FUNDING}
                selectedCard={cards['proj-funding'] ?? null}
                onSelect={toggleCard}
              />
            </div>

            <div className="cdd-section">
              <div className="cdd-section-label">What can you offer collaborators?</div>
              <ChipGroup
                id="proj-offer"
                chips={PROJECT_CHIPS_OFFER}
                selected={chips['proj-offer'] || []}
                onToggle={toggleChip}
              />
              <p className="cdd-hint">Pick all that apply. People joining answer the same options, so you only meet people who want what you can offer.</p>
            </div>
          </>)}

          {showJoiningGroup && (<>
            <GroupHead text="Joining a project" sub="4 questions" />

            <div className="cdd-section">
              <div className="cdd-section-label">What role(s) do you want to play?</div>
              <RoleWishlist
                value={chips['proj-want-roles'] || []}
                onChange={roles => setChips(prev => ({ ...prev, 'proj-want-roles': roles }))}
                projectTypes={chips['proj-types'] || []}
                selectedSkills={chips['proj-skills'] || []}
              />
              <p className="cdd-hint">Add as many as you're open to. Owners see these on your join request.</p>
            </div>

            <div className="cdd-section">
              <div className="cdd-section-label">What&apos;s your experience level?</div>
              <CardGrid
                id="proj-experience"
                cards={PROJECT_CARDS_EXPERIENCE}
                selectedCard={cards['proj-experience'] ?? null}
                onSelect={toggleCard}
              />
            </div>

            <div className="cdd-section">
              <div className="cdd-section-label">What are you looking for in return?</div>
              <ChipGroup
                id="proj-return"
                chips={PROJECT_CHIPS_OFFER}
                selected={chips['proj-return'] || []}
                onToggle={toggleChip}
              />
              <p className="cdd-hint">Pick everything you'd say yes to. Same options project owners pick from.</p>
            </div>

            <div className="cdd-section">
              <div className="cdd-section-label">
                What stage do you want to join at? <span className="cdd-optional">(optional)</span>
              </div>
              <div className="cdd-chip-row">
                {PROJECT_CHIPS_PREF_STAGE.map(chip => (
                  <button
                    key={chip}
                    type="button"
                    className={`cdd-chip${(chips['proj-pref-stage'] || []).includes(chip) ? ' selected' : ''}`}
                    onClick={() => toggleExclusiveChip('proj-pref-stage', chip, '🔀 Any stage')}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </>)}

          <GroupHead text="How you work" sub="Everyone" />

          <div className="cdd-section">
            <div className="cdd-section-label">Work style preference?</div>
            <WorkStyleCardGrid
              id="proj-workstyle"
              cards={PROJECT_CARDS_WORKSTYLE}
              selectedCard={cards['proj-workstyle'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">Time commitment level?</div>
            <TimeCardGrid
              id="proj-time"
              cards={PROJECT_CARDS_TIME}
              selectedCard={cards['proj-time'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">
              {isJoiningOnly ? 'How long do you want to commit?' : 'How long is your project timeline?'}
            </div>
            <ChipGroup
              id="proj-timeline"
              chips={PROJECT_CHIPS_TIMELINE}
              selected={chips['proj-timeline'] || []}
              onToggle={toggleChip}
              single
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">
              Anything else?{' '}
              <span className="cdd-optional">(optional)</span>
            </div>
            <textarea
              className="cdd-textarea"
              style={{ height: '80px', resize: 'none' }}
              placeholder={isJoiningOnly
                ? "e.g. Product designer with 4 years in fintech. Want to help an early team ship their first app…"
                : "e.g. Shooting a 12-minute short in LA this spring. Script is done, we shoot weekends in March…"}
              value={textValues['proj-notes'] || ''}
              onChange={e => setTextValues(prev => ({ ...prev, 'proj-notes': e.target.value }))}
            />
          </div>

        </>)}

        {/* ══ Event Buddies sections ══ */}
        {category === 'event' && (<>

          <div className="cdd-section">
            <div className="cdd-section-label">What type of Hive are you looking for?</div>
            <ChipGroup
              id="event-types"
              chips={EVENT_CHIPS_TYPES}
              selected={chips['event-types'] || []}
              onToggle={toggleChip}
              customizable
              customAdded={customAdded['event-types'] || []}
              customVisible={!!customVisible['event-types']}
              onShowCustom={showCustom}
              customInputVal={customInput['event-types'] || ''}
              onCustomChange={handleCustomInput}
              onCustomAdd={addCustom}
              customLabel="+ Something else"
              customPlaceholder="Describe the events you want to attend..."
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What are you looking for in an event buddy?</div>
            <CardGrid
              id="event-looking"
              cards={EVENT_CARDS_LOOKING}
              selectedCard={cards['event-looking'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">How often do you go to events?</div>
            <CardGrid
              id="event-freq"
              cards={EVENT_CARDS_FREQ}
              selectedCard={cards['event-freq'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What&apos;s your event style?</div>
            <WorkStyleCardGrid
              id="event-style"
              cards={EVENT_CARDS_STYLE}
              selectedCard={cards['event-style'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What size events do you prefer?</div>
            <EventSizeCardGrid
              id="event-size"
              cards={EVENT_CARDS_SIZE}
              selectedCard={cards['event-size'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">Do you prefer indoor or outdoor events?</div>
            <EventIOCardRow
              id="event-io"
              cards={EVENT_CARDS_IO}
              selectedCard={cards['event-io'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">Do you prefer planned or spontaneous events?</div>
            <CardGrid
              id="event-plan"
              cards={EVENT_CARDS_PLAN}
              selectedCard={cards['event-plan'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What&apos;s your typical budget per event?</div>
            <EventBudgetCardGrid
              id="event-budget"
              cards={EVENT_CARDS_BUDGET}
              selectedCard={cards['event-budget'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What city or area are you in?</div>
            <LocationQuestion
              selectedChip={chips['event-location']?.[0] ?? null}
              savedMetroKey={metroKeys['event-location']}
              onSelectChip={label => setLocationChip('event-location', label)}
              cityText={textValues['event-city'] || ''}
              onCityTextChange={val => setTextValues(prev => ({ ...prev, 'event-city': val }))}
              onMetroKeyChange={key => setMetroKey('event-location', key)}
              onPlaceLabelChange={label => setPlaceLabel('event-location', label)}
            />
          </div>

          {chips['event-location']?.[0] !== '💻 Online community only' && (
            <DistanceQuestion value={maxDistance} onChange={setMaxDistance} />
          )}

          <div className="cdd-section">
            <div className="cdd-section-label">What age range are you looking for?</div>
            <EventAgeChipRow
              id="event-age"
              chips={EVENT_CHIPS_AGE}
              selected={asAgeArray(cards['event-age'])}
              onToggle={toggleAgeBand}
            />
            <p className="cdd-hint">Pick as many as you like.</p>
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">How do you usually find out about events?</div>
            <ChipGroup
              id="event-discovery"
              chips={EVENT_CHIPS_DISCOVERY}
              selected={chips['event-discovery'] || []}
              onToggle={toggleChip}
              customizable
              customAdded={customAdded['event-discovery'] || []}
              customVisible={!!customVisible['event-discovery']}
              onShowCustom={showCustom}
              customInputVal={customInput['event-discovery'] || ''}
              onCustomChange={handleCustomInput}
              onCustomAdd={addCustom}
              customLabel="+ Something else"
              customPlaceholder="Describe how you discover events..."
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">
              Any upcoming events or venues?{' '}
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9.5px', fontWeight: 300, color: '#b0a880' }}>
                (optional)
              </span>
            </div>
            <input
              type="text"
              style={{
                width: '100%',
                height: '40px',
                border: '0.5px solid #d8d0bc',
                borderRadius: '8px',
                background: '#fff',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: '#1a1508',
                boxSizing: 'border-box',
                padding: '0 12px',
                outline: 'none',
              }}
              placeholder="e.g. Rolling Loud, Coachella, the local jazz bar every Thursday..."
              value={textValues['event-upcoming'] || ''}
              onChange={e => setTextValues(prev => ({ ...prev, 'event-upcoming': e.target.value }))}
              onFocus={e => { e.target.style.borderColor = '#c49a28'; }}
              onBlur={e => { e.target.style.borderColor = '#d8d0bc'; }}
            />
          </div>

        </>)}

        {/* ══ Specialized sections ══ */}
        {category === 'specialized' && (<>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#fdf8ec', border: '0.5px solid #e8d8a8', borderRadius: '10px', padding: '12px 14px', marginBottom: '24px' }}>
            <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>🔒</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11.5px', color: '#8a7240', lineHeight: 1.5 }}>
              Everything you share here is used only for matching. You&apos;re always in control of what you reveal to a group once you join.
            </span>
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What type of Hive are you looking for?</div>
            <ChipGroup
              id="spec-types"
              chips={SPEC_CHIPS_TYPES}
              selected={chips['spec-types'] || []}
              onToggle={toggleChip}
              customizable
              customAdded={customAdded['spec-types'] || []}
              customVisible={!!customVisible['spec-types']}
              onShowCustom={showCustom}
              customInputVal={customInput['spec-types'] || ''}
              onCustomChange={handleCustomInput}
              onCustomAdd={addCustom}
              customLabel="+ Something else"
              customPlaceholder="Describe your specialized group..."
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What city or area are you in?</div>
            <LocationQuestion
              selectedChip={chips['spec-location']?.[0] ?? null}
              savedMetroKey={metroKeys['spec-location']}
              onSelectChip={label => setLocationChip('spec-location', label)}
              cityText={textValues['spec-city'] || ''}
              onCityTextChange={val => setTextValues(prev => ({ ...prev, 'spec-city': val }))}
              onMetroKeyChange={key => setMetroKey('spec-location', key)}
              onPlaceLabelChange={label => setPlaceLabel('spec-location', label)}
            />
          </div>

          {chips['spec-location']?.[0] !== '💻 Online community only' && (
            <DistanceQuestion value={maxDistance} onChange={setMaxDistance} />
          )}

          <div className="cdd-section">
            <div className="cdd-section-label">Why are you looking for this group right now?</div>
            <SpecReasonCardGrid
              id="spec-reason"
              cards={SPEC_CARDS_REASON}
              selectedCard={cards['spec-reason'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">How structured do you want the group to be?</div>
            <CardGrid
              id="spec-structure"
              cards={SPEC_CARDS_STRUCTURE}
              selectedCard={cards['spec-structure'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What&apos;s your experience level with this?</div>
            <CardGrid
              id="spec-level"
              cards={SPEC_CARDS_LEVEL}
              selectedCard={cards['spec-level'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">Is privacy or anonymity important to you?</div>
            <SpecPrivacyCardRow
              id="spec-privacy"
              cards={SPEC_CARDS_PRIVACY}
              selectedCard={cards['spec-privacy'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What format works best for you?</div>
            <ChipGroup
              id="spec-format"
              chips={SPEC_CHIPS_FORMAT}
              selected={chips['spec-format'] || []}
              onToggle={toggleChip}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">How important is group size to you?</div>
            <SpecSizeCardRow
              id="spec-size"
              cards={SPEC_CARDS_SIZE}
              selectedCard={cards['spec-size'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">Are you looking to lead or just participate?</div>
            <SpecPrivacyCardRow
              id="spec-role"
              cards={SPEC_CARDS_ROLE}
              selectedCard={cards['spec-role'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What does success look like for you in this group?</div>
            <ChipGroup
              id="spec-success"
              chips={SPEC_CHIPS_SUCCESS}
              selected={chips['spec-success'] || []}
              onToggle={toggleChip}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">
              Describe what you&apos;re looking for{' '}
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9.5px', fontWeight: 300, color: '#b0a880' }}>
                (optional)
              </span>
            </div>
            <textarea
              className="cdd-textarea"
              style={{ height: '80px', resize: 'none' }}
              placeholder="e.g. Looking for a fitness accountability group that checks in daily, shares workouts, and keeps each other on track toward specific goals..."
              value={textValues['spec-notes'] || ''}
              onChange={e => setTextValues(prev => ({ ...prev, 'spec-notes': e.target.value }))}
              onFocus={e => { e.target.style.borderColor = '#c49a28'; }}
              onBlur={e => { e.target.style.borderColor = '#d8d0bc'; }}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">Commitment level you&apos;re ready for</div>
            <CardGrid
              id="spec-commitment"
              cards={SPEC_CARDS_COMMITMENT}
              selectedCard={cards['spec-commitment'] ?? null}
              onSelect={toggleCard}
            />
          </div>

        </>)}

        {/* ── Bottom Nav ── */}
        <div className="cdd-nav">
          <button type="button" className="cdd-nav-back" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <CreateBtn
              text={content.createText}
              onClick={() => navigate('/create-hive', { state: { category, prefillData: createPrefills() } })}
            />
            <button type="button" className="cdd-nav-next" onClick={handleNext}>
              {content.nextText}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
