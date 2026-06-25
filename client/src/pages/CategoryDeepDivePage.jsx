import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import '../styles/category-deep-dive.css';

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
const SOCIAL_CHIPS_LOCATION = [
  '📍 Use my current location',
  '💻 Online community only',
  "✍️ I'll type it in",
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


const PROF_CARDS_STAGE = [
  { emoji: '🎓', name: 'Student',                desc: 'Still in school, building foundations.' },
  { emoji: '🌱', name: 'Early career (0–3 yrs)', desc: 'Just getting started in my field.' },
  { emoji: '📈', name: 'Mid-career (3–8 yrs)',   desc: 'Growing and establishing myself.' },
  { emoji: '🏆', name: 'Senior / Leadership',    desc: 'Experienced — giving and getting more.' },
];

const PROF_CHIPS_INDUSTRY = [
  '💻 Tech / Software',    '🎬 Film & Media',        '💰 Finance / Investing',
  '🚀 Startups',           '🎨 Design & Creative',   '📢 Marketing',
  '⚕️ Healthcare',          '⚖️ Law / Legal',          '🏫 Education',
  '🏗️ Real Estate',         '🎭 Entertainment',        '📊 Consulting',
  '🛍️ Retail / E-commerce', '🌿 Wellness / Fitness',   '🏛️ Government / Nonprofit',
  '🔬 Science / Research', '✈️ Hospitality / Travel', '🏭 Manufacturing',
  '🎮 Gaming / Esports',   '🏦 Banking / Fintech',   '🌍 International / Global',
];

const PROF_CHIPS_GOALS = [
  '🧭 A mentor',                 '👥 Peers in my field',           '🤝 Collaborators',
  '💼 Job / internship leads',   '💡 Investors / advisors',        '📣 Speaking opportunities',
  '🌐 Industry connections',     '🧠 Knowledge sharing',           '📰 Stay current on trends',
  '🏆 Leadership development',   '💬 Honest career feedback',      '🎯 Accountability for goals',
  '🧑‍💻 Find a business partner',  '📋 Join a mastermind group',     '🎙️ Podcast / media collab',
  '🏛️ Board / advisory roles',   '🌍 International connections',   '📱 Social media growth collab',
  '🤲 Mentor the next generation',
];

const PROF_CARDS_NETWORK = [
  { emoji: '☕', name: '1-on-1 coffee chats',   desc: 'Intimate, focused conversations.' },
  { emoji: '🎤', name: 'Group events & panels', desc: 'Structured, high-value group settings.' },
  { emoji: '💬', name: 'Online / async first',  desc: 'Chat, DMs, and virtual calls.' },
  { emoji: '🔀', name: 'Mix of everything',     desc: 'Flexible, whatever makes sense.' },
];

const PROF_CARDS_PRIMARY_GOAL = [
  { emoji: '🎯', name: 'Land a new job or promotion',    desc: 'Actively looking to move up or move on.' },
  { emoji: '🚀', name: 'Launch or grow my business',     desc: 'Building something of my own.' },
  { emoji: '💡', name: 'Break into a new industry',      desc: 'Pivoting or expanding into new territory.' },
  { emoji: '🧠', name: 'Develop a specific skill',       desc: 'Focused on learning and leveling up.' },
  { emoji: '🌐', name: 'Expand my professional network', desc: 'More connections, more opportunities.' },
  { emoji: '💰', name: 'Increase my income',             desc: 'Freelance, raise, side income — all of the above.' },
  { emoji: '🏆', name: 'Build authority in my field',    desc: 'Become a recognized name in my industry.' },
  { emoji: '🤝', name: 'Find a business partner',        desc: 'Looking for a co-founder or long-term collaborator.' },
];

const PROF_CHIPS_WORKSIT = [
  '💼 Full-time employee',              '🚀 Founder / co-founder',
  '🧑‍💻 Freelancer / consultant',         '🎓 Student',
  '🔍 Actively job searching',           '🌱 Recently laid off / in transition',
  '🏖️ Taking a break / sabbatical',      '🔀 Multiple things at once',
];

const PROF_CARDS_MENTOR = [
  { emoji: '🧭', name: 'I want to be mentored',           desc: "Looking for guidance, advice, and someone who's been there before." },
  { emoji: '💡', name: 'I want to mentor others',         desc: 'I have experience to share and want to help people grow.' },
  { emoji: '🔄', name: 'Both — I can do either',          desc: 'Open to mentoring and being mentored depending on context.' },
  { emoji: '👥', name: 'Neither — just peer connections', desc: 'I want equals to grow alongside, not a mentor dynamic.' },
];

const PROF_CARDS_INDUSTRY_PREF = [
  { emoji: '🎯', name: 'Same industry only', desc: 'I want deep domain expertise around me.' },
  { emoji: '🌍', name: 'Cross-industry',     desc: 'I value diverse perspectives from different fields.' },
  { emoji: '🔀', name: 'No preference',      desc: "Just match me well — industry doesn't matter." },
];

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

const PROJECT_CHIPS_TYPES = [
  '📱 App / Software team',         '🚀 Co-founding a startup',
  '🎬 Film / video crew',            '🎵 Music production team',
  '📝 Content / media collective',  '🎨 Creative studio / design team',
  '🛍️ Brand / e-commerce venture',   '🤖 AI / ML research group',
  '📚 Research & academic collab',  '🏗️ Physical product / hardware',
  '🌿 Social impact project',       '🎓 Student project group',
  '🔍 Looking to join a project',
];

const PROJECT_CARDS_PRIMARY_GOAL = [
  { emoji: '🚀', name: 'Ship a real product or business',     desc: "I'm here to build something real and launch it." },
  { emoji: '🧠', name: 'Learn by building with others',       desc: 'Growth and skill-building is the main priority.' },
  { emoji: '💰', name: 'Generate income from the project',    desc: 'This needs to make money — monetization is the goal.' },
  { emoji: '🏆', name: 'Build my portfolio / credentials',    desc: 'I want tangible work to show for this collaboration.' },
  { emoji: '🌱', name: 'Find a long-term co-founder',         desc: 'Looking for a partner, not just a project teammate.' },
  { emoji: '🎯', name: 'Complete a specific one-time project', desc: 'Defined scope, clear end date, deliver and done.' },
  { emoji: '🌍', name: 'Create social impact',                desc: "Profit isn't the point — impact and mission are." },
  { emoji: '📣', name: 'Build an audience or brand',          desc: 'Growing a following, platform, or creative identity.' },
];

const PROJECT_CARDS_STAGE = [
  { emoji: '💡', name: 'Just an idea',              desc: 'I have a concept but nothing built yet.' },
  { emoji: '🔧', name: 'Building MVP',               desc: 'Actively building the first version.' },
  { emoji: '🚀', name: 'Launched — growing',        desc: 'Already live, looking to scale.' },
  { emoji: '🔍', name: 'Looking to join a project', desc: 'No project yet, I want to contribute to one.' },
];

const PROJECT_CHIPS_INDUSTRY = [
  '💻 Tech / Software',            '🎬 Film & Entertainment',
  '🎵 Music & Audio',              '📱 Social media / Content',
  '🤖 AI / Machine Learning',      '🛍️ E-commerce / Retail',
  '🌍 Social impact / Nonprofit',  '🏥 Health & Wellness',
  '🎓 Education / EdTech',         '💰 Finance / Fintech',
  '🎨 Art & Design',               '🏗️ Hardware / Physical product',
  '🌿 Sustainability / CleanTech', '🎮 Gaming / Interactive',
  '🏠 Real Estate / PropTech',
];

const PROJECT_CHIPS_SKILLS_BRINGING = [
  '💻 Frontend development',   '🗄️ Backend development',
  '📱 Mobile development',     '🤖 AI / ML engineering',
  '🖥️ UI/UX design',           '🎨 Graphic / visual design',
  '🎬 Video production',       '🎙️ Audio / music production',
  '📢 Marketing & growth',     '✍️ Writing / copywriting',
  '📊 Data & analytics',       '💼 Business strategy & ops',
  '💰 Finance & fundraising',  '🧭 Project management',
  '🎤 Sales & partnerships',   '⚖️ Legal & contracts',
  '🔬 Research',
];

const PROJECT_CHIPS_SKILLS_NEEDED = [
  '💻 A developer',         '🖥️ A designer',
  '📢 A marketer',          '💼 Business / operations',
  '📊 Data / analyst',      '💰 Finance / fundraising',
  '✍️ Writer / copywriter', '🎬 Filmmaker / editor',
  '🧭 Project manager',     '🎙️ Audio / music producer',
  '🎤 Sales person',        '⚖️ Legal advisor',
  '🔬 Researcher',
];

const PROJECT_CHIPS_ROLES = [
  '💻 Developer',          '🎨 Designer',             '📢 Marketer',
  '💼 Business / Ops',     '📊 Data / Analytics',     '🎬 Filmmaker / Editor',
  '✍️ Writer / Copywriter', '💰 Finance / Fundraising', '🧭 Project Lead',
  '🎤 Content Creator',    '🔬 Researcher',
];

const PROJECT_CARDS_WORKSTYLE = [
  { emoji: '💬', name: 'Async / remote',       desc: 'Work independently, check in regularly online.' },
  { emoji: '📅', name: 'Weekly sync meetings', desc: 'Structured check-ins, clear milestones and deadlines.' },
  { emoji: '🔥', name: 'Intensive sprints',    desc: 'Deep focus, fast-paced, ship things quickly.' },
  { emoji: '🔀', name: 'Flexible',             desc: 'Adapts to what the project and team need.' },
];

const PROJECT_CARDS_TIME = [
  { emoji: '🔥', name: 'Full-time',    hours: '40+ hrs / week',         desc: 'This is my main focus — all in.' },
  { emoji: '⚡', name: 'Part-time',    hours: '15–20 hrs / week',        desc: 'Serious commitment alongside other work.' },
  { emoji: '📅', name: 'Side project', hours: '5–10 hrs / week',         desc: 'Nights and weekends, steady progress.' },
  { emoji: '🌊', name: 'Casual',       hours: 'A few hours when I can',  desc: 'Low pressure, flexible timing.' },
];

const PROJECT_CHIPS_TIMELINE = [
  '⚡ Short sprint (days–weeks)', '📅 A few months',
  '🗓️ 6 months to a year',       '🚀 Long-term / ongoing',
  '🔍 Not sure yet',
];

const PROJECT_CARDS_LOCATION = [
  { emoji: '🌐', name: 'Fully remote / online',       desc: "Zoom, Slack, async tools, location doesn't matter." },
  { emoji: '📍', name: 'In-person only (local team)', desc: 'I want to be in the same room as my collaborators.' },
  { emoji: '🔀', name: 'Hybrid',                      desc: 'Mostly online with occasional in-person meetups.' },
  { emoji: '🏢', name: 'Co-working space',             desc: 'A shared physical workspace to build together.' },
];

const PROJECT_CARDS_FUNDING = [
  { emoji: '💵', name: 'Bootstrapped',    desc: 'Self-funded, no outside money.' },
  { emoji: '🤝', name: 'Pre-revenue',     desc: 'Not funded yet, looking for partners.' },
  { emoji: '💡', name: 'Seeking funding', desc: 'Actively looking for investors or grants.' },
  { emoji: '💰', name: 'Already funded',  desc: 'We have capital to work with.' },
  { emoji: '🎓', name: 'Academic project', desc: 'School or research, no funding needed.' },
];

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
const EVENT_CHIPS_LOCATION = [
  '📍 Use my current location',
  '💻 Online events only',
  "✍️ I'll type it in",
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
    totalItems:  72,
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
    totalItems:  114,
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

function CardGrid({ id, cards, selectedCard, onSelect }) {
  return (
    <div className="cdd-card-grid">
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

function EventAgeChipRow({ id, chips: ageChips, selectedCard, onSelect }) {
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {ageChips.map(chip => {
        const sel = selectedCard === chip;
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

// ── Logo SVG (gradient IDs namespaced to avoid conflicts) ─────

function LogoSVG() {
  return (
    <svg width="26" height="24" viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cdd-g1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#e8c84a" />
          <stop offset="50%"  stopColor="#c49a28" />
          <stop offset="100%" stopColor="#8a6510" />
        </linearGradient>
        <linearGradient id="cdd-g2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#e8c84a" />
          <stop offset="50%"  stopColor="#c49a28" />
          <stop offset="100%" stopColor="#8a6510" />
        </linearGradient>
        <linearGradient id="cdd-g3" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#8a6510" />
          <stop offset="50%"  stopColor="#c49a28" />
          <stop offset="100%" stopColor="#e8c84a" />
        </linearGradient>
      </defs>
      <polygon points="60,2 88,18 88,48 60,64 32,48 32,18"     fill="none" stroke="url(#cdd-g1)" strokeWidth="9" strokeLinejoin="round" />
      <polygon points="32,46 60,62 60,92 32,108 4,92 4,62"     fill="none" stroke="url(#cdd-g2)" strokeWidth="9" strokeLinejoin="round" />
      <polygon points="88,46 116,62 116,92 88,108 60,92 60,62" fill="none" stroke="url(#cdd-g3)" strokeWidth="9" strokeLinejoin="round" />
    </svg>
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
  const [chips,         setChips]         = useState({});  // { id: string[] }
  const [cards,         setCards]         = useState({});  // { id: string|null }
  const [customVisible, setCustomVisible] = useState({});  // { id: bool }
  const [customInput,   setCustomInput]   = useState({});  // { id: string }
  const [customAdded,   setCustomAdded]   = useState({});  // { id: string[] }
  const [textValues,    setTextValues]    = useState({});  // { id: string }

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
  const progress = useMemo(() => {
    const chipCount = Object.values(chips).reduce((n, arr) => n + arr.length, 0);
    const cardCount = Object.values(cards).filter(Boolean).length;
    const textCount = Object.values(textValues).filter(v => v.trim()).length;
    const total = chipCount + cardCount + textCount;
    return Math.min((total / (content.totalItems * 0.2)) * 100, 100);
  }, [chips, cards, textValues, content.totalItems]);

  useEffect(() => {
    if (!CATEGORY_CONTENT[category]) {
      navigate('/find-your-hive', { replace: true });
    }
  }, [category, navigate]);

  // ── Navigate next ──
  const handleNext = () =>
    navigate('/hive-discovery', { state: { category, chips, cards, textValues } });

  return (
    <div className="cdd-root">
      <div className="cdd-wrap">

        {/* ── Top Bar ── */}
        <div className="cdd-topbar">
          <Link to="/" className="cdd-logo">
            <LogoSVG />
            <span className="cdd-wordmark">ConnectHive</span>
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
              selectedCard={cards['social-age'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What city or area are you in?</div>
            <ChipGroup
              id="social-location"
              chips={SOCIAL_CHIPS_LOCATION}
              selected={chips['social-location'] || []}
              onToggle={toggleChip}
              single
            />
            {chips['social-location']?.[0] === "✍️ I'll type it in" && (
              <input
                type="text"
                style={{
                  marginTop: '10px',
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
                placeholder="e.g. Los Angeles, CA / New York, NY..."
                value={textValues['social-city'] || ''}
                onChange={e => setTextValues(prev => ({ ...prev, 'social-city': e.target.value }))}
                onFocus={e => { e.target.style.borderColor = '#c49a28'; }}
                onBlur={e => { e.target.style.borderColor = '#d8d0bc'; }}
              />
            )}
          </div>

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
            <div className="cdd-section-label">What type of Hive are you looking for?</div>
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
            <div className="cdd-section-label">What&apos;s your primary collaboration goal?</div>
            <CardGrid
              id="proj-primary-goal"
              cards={PROJECT_CARDS_PRIMARY_GOAL}
              selectedCard={cards['proj-primary-goal'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What stage is your project at?</div>
            <CardGrid
              id="proj-stage"
              cards={PROJECT_CARDS_STAGE}
              selectedCard={cards['proj-stage'] ?? null}
              onSelect={toggleCard}
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What industry or space is your project in?</div>
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
              customLabel="+ My industry"
              customPlaceholder="Enter your industry or space..."
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What skills are you bringing to the table?</div>
            <ChipGroup
              id="proj-skills-bringing"
              chips={PROJECT_CHIPS_SKILLS_BRINGING}
              selected={chips['proj-skills-bringing'] || []}
              onToggle={toggleChip}
              customizable
              customAdded={customAdded['proj-skills-bringing'] || []}
              customVisible={!!customVisible['proj-skills-bringing']}
              onShowCustom={showCustom}
              customInputVal={customInput['proj-skills-bringing'] || ''}
              onCustomChange={handleCustomInput}
              onCustomAdd={addCustom}
              customLabel="+ My skill"
              customPlaceholder="Enter a skill you're bringing..."
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">
              What skills is your project missing?{' '}
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9.5px', fontWeight: 300, color: '#b0a880' }}>
                (what do you need?)
              </span>
            </div>
            <ChipGroup
              id="proj-skills-needed"
              chips={PROJECT_CHIPS_SKILLS_NEEDED}
              selected={chips['proj-skills-needed'] || []}
              onToggle={toggleChip}
              customizable
              customAdded={customAdded['proj-skills-needed'] || []}
              customVisible={!!customVisible['proj-skills-needed']}
              onShowCustom={showCustom}
              customInputVal={customInput['proj-skills-needed'] || ''}
              onCustomChange={handleCustomInput}
              onCustomAdd={addCustom}
              customLabel="+ Something else"
              customPlaceholder="Describe the skill or role you need..."
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What role are you filling or looking for?</div>
            <ChipGroup
              id="proj-roles"
              chips={PROJECT_CHIPS_ROLES}
              selected={chips['proj-roles'] || []}
              onToggle={toggleChip}
              customizable
              customAdded={customAdded['proj-roles'] || []}
              customVisible={!!customVisible['proj-roles']}
              onShowCustom={showCustom}
              customInputVal={customInput['proj-roles'] || ''}
              onCustomChange={handleCustomInput}
              onCustomAdd={addCustom}
              customLabel="+ My role"
              customPlaceholder="Enter your specific role..."
            />
          </div>

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
            <div className="cdd-section-label">How long is your project timeline?</div>
            <ChipGroup
              id="proj-timeline"
              chips={PROJECT_CHIPS_TIMELINE}
              selected={chips['proj-timeline'] || []}
              onToggle={toggleChip}
              single
            />
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">Where do you prefer to collaborate?</div>
            <CardGrid
              id="proj-location"
              cards={PROJECT_CARDS_LOCATION}
              selectedCard={cards['proj-location'] ?? null}
              onSelect={toggleCard}
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
            <div className="cdd-section-label">
              Describe your project or what you want to build{' '}
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9.5px', fontWeight: 300, color: '#b0a880' }}>
                (optional)
              </span>
            </div>
            <textarea
              className="cdd-textarea"
              style={{ height: '80px', resize: 'none' }}
              placeholder="e.g. Building a React app that connects freelancers with local businesses. I'm the developer — need a designer and marketer. MVP stage, 10hrs/week commitment, fully remote..."
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
            <ChipGroup
              id="event-location"
              chips={EVENT_CHIPS_LOCATION}
              selected={chips['event-location'] || []}
              onToggle={toggleChip}
              single
            />
            {chips['event-location']?.[0] === "✍️ I'll type it in" && (
              <input
                type="text"
                style={{
                  marginTop: '10px',
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
                placeholder="e.g. Los Angeles, CA / New York, NY / Chicago, IL..."
                value={textValues['event-city'] || ''}
                onChange={e => setTextValues(prev => ({ ...prev, 'event-city': e.target.value }))}
                onFocus={e => { e.target.style.borderColor = '#c49a28'; }}
                onBlur={e => { e.target.style.borderColor = '#d8d0bc'; }}
              />
            )}
          </div>

          <div className="cdd-section">
            <div className="cdd-section-label">What age range are you looking for?</div>
            <EventAgeChipRow
              id="event-age"
              chips={EVENT_CHIPS_AGE}
              selectedCard={cards['event-age'] ?? null}
              onSelect={toggleCard}
            />
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
              onClick={() => navigate('/create-hive', { state: { category, prefillData: { chips, cards, textValues } } })}
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
