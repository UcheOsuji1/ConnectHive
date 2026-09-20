/**
 * TrueHive — dev seed script
 *
 * Usage:
 *   node src/db/seed.js           # add seed data, skip if already present
 *   node src/db/seed.js --reset   # delete seeded rows first, then re-seed
 *   node src/db/seed.js --force   # run in NODE_ENV=production (guard override)
 *
 * All seeded users carry the email domain @seed.connecthive.local.
 * Cleanup only ever touches rows with that domain — real user data is never deleted.
 */

import './../env.js';
import bcrypt from 'bcryptjs';
import { pool, query } from './index.js';

const SEED_DOMAIN  = '@seed.connecthive.local';
const SEED_PASSWORD = 'Connect2024!';
const FORCE         = process.argv.includes('--force');
const RESET         = process.argv.includes('--reset');

if (process.env.NODE_ENV === 'production' && !FORCE) {
  console.error('✗ Refusing to seed a production database. Pass --force to override.');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function q(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

function ago(days, hours = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

function future(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ── Vocabulary constants (Part 4 drift-check) ─────────────────────────────────
// Copies of client/src/data/interestTaxonomy.js, skillTaxonomy.js, and
// ProfileSetupPage.jsx constants. If client taxonomy chips change, update both
// and re-run — the check below will fail loudly on any mismatch.

const VALID_INTERESTS = new Set([
  // fitness
  '🏃 Running','🏋️ Weightlifting','🧘 Yoga','🥊 Boxing','🚴 Cycling','🏊 Swimming',
  '💃 Dance Fitness','🥋 Martial Arts','⛹️ Calisthenics','🧗 Rock Climbing','🏃 HIIT','🏌️ Golf',
  // gaming
  '🎯 FPS / Shooters','⚔️ RPGs','🏆 Competitive / Esports','🎲 Board Games','🃏 Card Games',
  '🌍 Open World','👾 Indie Games','📱 Mobile Gaming','🕹️ Retro / Classic','🎮 Console Gaming',
  '💻 PC Gaming','🌐 MMORPGs',
  // food
  '🍱 Trying new cuisines','🍳 Home cooking','🥗 Healthy eating','🍕 Restaurant hopping',
  '☕ Coffee culture','🍷 Wine & cocktails','🥘 Meal prepping','🌱 Plant-based',
  '🍣 Sushi & Asian food','🧁 Baking & desserts','🌮 Street food','🫗 Mixology',
  '🔥 Grilling & BBQ','🫙 Fermentation & preservation','🍵 Tea culture','👨‍👩‍👧 Family recipes',
  '📸 Food photography','🌾 Farmers markets',
  // music
  '🎤 Hip-Hop / Rap','🎸 Rock / Alternative','🎹 R&B / Soul','🎧 Electronic / EDM',
  '🎻 Classical','🎷 Jazz','🌍 Afrobeats','💃 Latin / Reggaeton','🎵 Pop','🎸 Indie',
  '🎤 Live concerts','🎼 Music production',
  // film
  '🎬 Indie films','🦸 Action / Marvel','😂 Comedy','😱 Horror / Thriller','📺 Documentaries',
  '🌸 Anime','🌍 International cinema','📽️ Filmmaking','✍️ Screenwriting','🎭 Drama / Theater',
  '📱 Short-form content','🎥 Streaming culture',
  // tech
  '🤖 AI / Machine Learning','📱 Mobile Apps','🌐 Web Development','🔐 Cybersecurity',
  '📊 Data Science','🚀 Startups','🕹️ Game Dev','⛓️ Blockchain / Web3','🤖 Robotics',
  '☁️ Cloud / DevOps','🥽 AR / VR','🔬 Biotech',
  // sports
  '🏀 Basketball','⚽ Soccer / Football','🏈 American Football','⚾ Baseball','🎾 Tennis',
  '🏐 Volleyball','🏊 Swimming','🎽 Track & Field','🏒 Hockey','🏉 Rugby',
  '🎱 Pool / Billiards','🏏 Cricket',
  // fashion
  '👟 Streetwear','👔 Business / Formal','🧥 Vintage / Thrift','👗 High Fashion',
  '🌱 Sustainable fashion','💄 Beauty & Makeup','💅 Nail art','✂️ Styling / Wardrobe',
  '📸 Fashion photography','🧵 DIY / Sewing',
  // art
  '✏️ Drawing / Illustration','🖌️ Painting','🎭 Acting / Theater','💃 Dance','🖋️ Poetry / Writing',
  '🎤 Spoken word','📸 Photography','🎬 Videography','🏺 Sculpture / Ceramics','🎨 Digital art',
  '🖼️ Museum & gallery hopping','🎪 Improv / Comedy',
  // travel
  '🌍 International travel','🏙️ City exploration','🏕️ Camping','🥾 Hiking','🏖️ Beach trips',
  '🍽️ Food tourism','🎒 Backpacking','🚗 Road trips','🧗 Adventure sports','📸 Travel photography',
]);

const VALID_SKILLS = new Set([
  // software
  '⚛️ Frontend / React','🐍 Python','🟨 JavaScript','☕ Java / Kotlin','📱 iOS / Swift','🤖 Android',
  '🗄️ Backend / APIs','☁️ Cloud / DevOps','🤖 AI / ML','🔐 Cybersecurity','🎮 Game Dev',
  '⛓️ Blockchain / Web3','🗃️ Databases / SQL','🧪 QA / Testing','🐳 Docker / Kubernetes',
  // data
  '📈 Data Analysis','🤖 Machine Learning','📊 Data Visualization','🗃️ SQL / Databases',
  '🐍 Python / Pandas','📉 Financial Modeling','🔬 Research Methods','📋 UX Research / Surveys',
  '🧮 Statistics','🧠 NLP / LLMs','📡 Data Engineering','🔭 Business Intelligence',
  // engineering
  '🏗️ Civil / Structural','⚡ Electrical Engineering','🔧 Mechanical Engineering','✈️ Aerospace',
  '🏭 Manufacturing','🔩 Hardware / Embedded','🤖 Robotics / Automation','🔋 Renewable Energy',
  '🛢️ Chemical Engineering','🌊 Environmental Engineering','🖨️ 3D Printing / Prototyping',
  '🧰 Product Engineering',
  // design
  '🖥️ UI / UX Design','🖌️ Graphic Design','🎬 Motion / Animation','📦 Product Design',
  '🏗️ Industrial Design','🏠 Interior / Architecture','👗 Fashion Design','🖋️ Brand / Identity',
  '🌐 Web Design','🖼️ Illustration','📐 Figma / Prototyping','🎨 3D Modeling',
  // marketing
  '📱 Social Media Marketing','✍️ Content Marketing','🔍 SEO / SEM','📧 Email Marketing',
  '🤝 Partnerships / BD','📊 Analytics / Growth Hacking','🎤 PR / Communications',
  '💰 Paid Ads / PPC','🎥 Video Marketing','🌐 Community Building','💡 Brand Strategy',
  '📈 Performance Marketing',
  // business
  '🚀 Entrepreneurship','📋 Project Management','🏆 Team Leadership','💰 Sales / Negotiation',
  '📊 Business Strategy','🤝 Operations / Ops','🗂️ Event Planning','🎤 Public Speaking',
  '🌐 International Business','📑 Consulting','🏢 Corporate Strategy','🌱 Social Enterprise',
  // content
  '📹 Video Editing','🎙️ Podcasting','✍️ Copywriting / Blogging','📸 Photography',
  '🎵 Music Production','📱 Short-form / Reels','🖥️ Live Streaming','📝 Journalism / Reporting',
  '📖 Screenwriting','🎨 Graphic Creation','📺 Documentary','🤳 Influencer / Creator',
  // writing
  '📖 Creative Writing','📄 Technical Writing','🔖 Editing / Proofreading','🌍 Translation',
  '🗣️ Interpreting','📚 Bilingual / Multilingual','📝 Grant Writing','⚖️ Legal Writing',
  '📓 Poetry','📧 Business Writing','🗞️ Essays / Long-form','🏷️ Localization',
  // arts
  '🎭 Acting / Theater','🎬 Film / TV Acting','🎙️ Voice Acting','🎤 Hosting / MC',
  '🎪 Improv / Comedy','😂 Stand-up Comedy','💃 Dance / Choreography','🎶 Musical Theater',
  '🎨 Fine Art / Painting','✏️ Drawing / Illustration','🏺 Sculpture / Ceramics','🎻 Music Performance',
  // music skills
  '🎸 Guitar / Bass','🎹 Piano / Keys','🥁 Drums / Percussion','🎤 Vocals','🎻 Strings',
  '🎺 Brass / Woodwind','🎵 Music Production','🎚️ Mixing / Mastering','🎧 DJing',
  '🎼 Composition / Arranging','🔊 Live Sound','🎙️ Audio Engineering',
  // health
  '🩺 Nursing','👨‍⚕️ Medicine / Clinical','🦷 Dentistry','💊 Pharmacy','🧠 Psychology / Therapy',
  '🏃 Personal Training','🧘 Yoga / Pilates Instruction','🥗 Nutrition / Dietetics',
  '🦴 Physical Therapy','💆 Massage Therapy','🧪 Medical Research','🚑 Emergency Medicine',
  // education
  '👩‍🏫 K–12 Teaching','🏫 Higher Education','📖 Tutoring / Academic Coaching','🎓 Curriculum Design',
  '👶 Early Childhood Education','🌍 ESL / Language Teaching','🧑‍💻 Coding Education',
  '🎨 Arts Education','📊 STEM Education','🌱 Special Education','🎤 Corporate Training',
  '📱 EdTech / E-Learning',
  // culinary
  '🍳 Professional Cooking','🥐 Pastry / Baking','🍷 Wine / Beverage Service',
  '🍸 Bartending / Mixology','🏨 Hotel / Resort Management','🍽️ Restaurant Operations',
  '🧑‍🍳 Private Chef / Catering','🌿 Farm-to-Table Sourcing','🍫 Chocolate / Confectionery',
  '🥩 Butchery / Charcuterie','📸 Food Photography','🌮 Food Truck / Pop-up',
  // trades
  '⚡ Electrician','🔧 Plumbing','🪵 Carpentry / Woodworking',
  '🏠 Construction / General Contracting','🌡️ HVAC / Refrigeration','🔩 Welding / Metalwork',
  '🚗 Automotive / Mechanic','🏗️ Masonry / Concrete','🪟 Glazing / Fenestration',
  '🛁 Tiling / Flooring','🔌 Low-Voltage / A/V Systems','⚙️ Millwright / Industrial Maintenance',
  // science
  '🧬 Biology / Genetics','⚗️ Chemistry','⚛️ Physics','🌍 Earth / Environmental Science',
  '🌌 Astronomy','🧪 Lab Techniques','🔭 Clinical Trials','🦠 Microbiology / Immunology',
  '📐 Mathematics','🌊 Marine Science','🌱 Botany / Ecology','🐾 Zoology / Animal Science',
  // sports skills
  '🏋️ Strength & Conditioning','🏀 Basketball Coaching','⚽ Soccer / Football Coaching',
  '🎾 Tennis Coaching','🏊 Swimming Coaching','🥊 Boxing / MMA Coaching','🏌️ Golf Instruction',
  '🧗 Climbing Coaching','🚴 Cycling / Triathlon','🏃 Running / Track Coaching',
  '🏐 Volleyball Coaching','⚾ Baseball / Softball Coaching',
  // law
  '⚖️ Legal Practice / Attorney','👮 Law Enforcement','🚒 Fire & Emergency Services',
  '🏛️ Government / Policy','🌐 Nonprofit / NGO Leadership','🤝 Social Work',
  '🧑‍⚖️ Paralegal / Legal Research','🌍 International Relations',
  '📣 Advocacy / Community Organizing','🪖 Military / Veterans Affairs',
  '🛡️ Compliance / Regulatory','🏘️ Urban Planning',
  // finance
  '📊 Accounting / Bookkeeping','💰 Investment Banking','📈 Stock / Equity Trading',
  '🏠 Real Estate Sales','🏢 Commercial Real Estate','💵 Financial Planning','🪙 Crypto / DeFi',
  '💳 FinTech','📑 Tax / CPA','🌐 Venture Capital / PE','🏦 Banking / Lending',
  '📋 Insurance / Risk Management',
  // coaching
  '🧭 Life Coaching','💼 Career Coaching','🧠 Executive / Leadership Coaching',
  '💑 Relationship Coaching','🧘 Mindfulness / Meditation','🌱 Wellness Coaching',
  '😴 Sleep & Recovery','🥗 Health & Lifestyle Coaching','💪 Athletic / Performance Coaching',
  '📚 Academic Coaching','🌿 Holistic / Integrative Health','🎯 Goal Setting / Accountability',
]);

const VALID_GOALS    = new Set(['goals','vibes','growth','account','diversity','action']);
const VALID_AVAIL    = new Set(['Weekdays','Weekends','Mornings','Afternoons','Evenings','Late Nights','Flexible']);
const VALID_MEET     = new Set(['online','inperson','hybrid','global']);
const VALID_SIZE     = new Set(['s','m','l','a']);
const VALID_FREQ     = new Set(['Daily','A few times a week','Weekly','Bi-weekly','Monthly','As needed']);
const VALID_AGE      = new Set(['18–24','25–34','35–44','45–54','55+']);
const VALID_COMMIT   = new Set(['casual','regular','high','depends']);

function validateVocabulary() {
  const errors = [];
  for (const u of USERS) {
    const p = u.profile;
    const name = p.full_name;
    (p.interests ?? []).forEach(v => { if (!VALID_INTERESTS.has(v)) errors.push(`${name} interest: ${JSON.stringify(v)}`); });
    (p.skills    ?? []).forEach(v => { if (!VALID_SKILLS.has(v))    errors.push(`${name} skill: ${JSON.stringify(v)}`);    });
    (p.goals     ?? []).forEach(v => { if (!VALID_GOALS.has(v))     errors.push(`${name} goal: ${JSON.stringify(v)}`);     });
    (p.availability ?? []).forEach(v => { if (!VALID_AVAIL.has(v))  errors.push(`${name} avail: ${JSON.stringify(v)}`);  });
    if (p.connection_preference && !VALID_MEET.has(p.connection_preference))
      errors.push(`${name} connection_preference: ${JSON.stringify(p.connection_preference)}`);
    if (p.group_size_preference && !VALID_SIZE.has(p.group_size_preference))
      errors.push(`${name} group_size_preference: ${JSON.stringify(p.group_size_preference)}`);
    const sp = p.social_preferences ?? {};
    if (sp.frequency && !VALID_FREQ.has(sp.frequency))
      errors.push(`${name} sp.frequency: ${JSON.stringify(sp.frequency)}`);
    (sp.ageRange ?? []).forEach(v => { if (!VALID_AGE.has(v))       errors.push(`${name} sp.ageRange: ${JSON.stringify(v)}`); });
    if (sp.commitment && !VALID_COMMIT.has(sp.commitment))
      errors.push(`${name} sp.commitment: ${JSON.stringify(sp.commitment)}`);
  }
  if (errors.length) {
    console.error('\n✗ Vocabulary drift detected — fix these before seeding:\n');
    errors.forEach(e => console.error('  •', e));
    process.exit(1);
  }
  console.log('  ✓ Vocabulary check passed');
}

// ── Seed data ─────────────────────────────────────────────────────────────────
// Intended strong matches (profile → hive indices):
//   Jordan(0)  → CSUN SWE(1), SideProject(3)
//   Nia(1)     → NSBE LA(0), Afro-STEM(5), Aerospace Lunch(12)
//   Marcus(2)  → LA Creative(2), Leimert Park(14)
//   Priya(3)   → Data Science LA(6)
//   Darius(4)  → NSBE LA(0), Afro-STEM(5)
//   Sofia(5)   → Black Business Builders(10)
//   Alex(6)    → UX/Design Crit(9)
//   Kezia(7)   → Pre-Med CSUN Hub(7)
//   Tyler(8)   → LA Creative(2), Leimert Park(14)
//   Amara(9)   → Afro-STEM(5), NSBE LA(0), Aerospace Lunch(12)
//   William(10)→ Finance Nerds SFV(11)
//   Jade(11)   → Leimert Park(14), LA Creative(2)
//   Omar(12)   → SideProject(3), CSUN SWE(1)
//   Camille(13)→ Legal Tech(13)
//   Dev(14)    → CSUN SWE(1), SideProject(3)

const USERS = [
  {
    email: `jordan.carter${SEED_DOMAIN}`,
    profile: {
      full_name: 'Jordan Carter',
      age: 22, location: 'Northridge, CA', school_company: 'CSUN',
      bio: 'CS junior at CSUN. I build mobile apps on the weekends and I\'m looking for people to collaborate on side projects.',
      interests:   ['🌐 Web Development', '📱 Mobile Apps', '🎮 Console Gaming', '🤖 AI / Machine Learning', '🕹️ Game Dev'],
      skills:      ['📱 iOS / Swift', '🤖 Android', '⚛️ Frontend / React', '🐍 Python'],
      goals:       ['growth', 'goals', 'account'],
      availability:['Weekdays', 'Evenings', 'Weekends'],
      personality_type: 'INTJ',
      connection_preference: 'hybrid',
      connection_purposes: ['networking', 'collaboration', 'learning'],
      group_size_preference: 's',
      social_preferences: { frequency: 'Weekly', ageRange: ['18–24', '25–34'], commitment: 'regular' },
    },
  },
  {
    email: `nia.washington${SEED_DOMAIN}`,
    profile: {
      full_name: 'Nia Washington',
      age: 24, location: 'Los Angeles, CA', school_company: 'NSBE - Greater LA',
      bio: 'Mechanical engineering grad, now at an aerospace startup in El Segundo. NSBE chapter officer and proud Hive co-founder.',
      interests:   ['🧘 Yoga', '🌍 Afrobeats', '🤖 Robotics', '🚀 Startups', '🏃 Running'],
      skills:      ['✈️ Aerospace', '🔧 Mechanical Engineering', '📋 Project Management', '🎤 Public Speaking'],
      goals:       ['goals', 'action', 'diversity'],
      availability:['Weekends', 'Evenings'],
      personality_type: 'ENFJ',
      connection_preference: 'hybrid',
      connection_purposes: ['networking', 'mentorship', 'community'],
      group_size_preference: 'm',
      social_preferences: { frequency: 'Monthly', ageRange: ['18–24', '25–34'], commitment: 'regular' },
    },
  },
  {
    email: `marcus.reynolds${SEED_DOMAIN}`,
    profile: {
      full_name: 'Marcus Reynolds',
      age: 26, location: 'Inglewood, CA', school_company: 'Self-employed',
      bio: 'Freelance videographer and content creator. I shoot for brands, events, and documentaries. Looking to collaborate with creatives in LA.',
      interests:   ['📽️ Filmmaking', '📸 Photography', '👟 Streetwear', '🏀 Basketball', '🌍 International travel'],
      skills:      ['📹 Video Editing', '📸 Photography', '📺 Documentary', '📱 Short-form / Reels'],
      goals:       ['vibes', 'action', 'growth'],
      availability:['Weekends', 'Flexible'],
      personality_type: 'ENFP',
      connection_preference: 'hybrid',
      connection_purposes: ['collaboration', 'creative projects', 'social'],
      group_size_preference: 'm',
      social_preferences: { frequency: 'Monthly', ageRange: ['18–24', '25–34', '35–44'], commitment: 'casual' },
    },
  },
  {
    email: `priya.nair${SEED_DOMAIN}`,
    profile: {
      full_name: 'Priya Nair',
      age: 23, location: 'Sherman Oaks, CA', school_company: 'CSUN',
      bio: 'Data science MS student. I love Kaggle competitions, boardgames, and trying every new ramen spot in the Valley.',
      interests:   ['🤖 AI / Machine Learning', '📊 Data Science', '🎲 Board Games', '🍱 Trying new cuisines', '🥾 Hiking'],
      skills:      ['🤖 Machine Learning', '📊 Data Visualization', '🗃️ SQL / Databases', '🐍 Python / Pandas', '🧮 Statistics'],
      goals:       ['goals', 'growth', 'account'],
      availability:['Weekends', 'Evenings'],
      personality_type: 'INTP',
      connection_preference: 'hybrid',
      connection_purposes: ['learning', 'collaboration', 'social'],
      group_size_preference: 's',
      social_preferences: { frequency: 'Bi-weekly', ageRange: ['18–24', '25–34'], commitment: 'regular' },
    },
  },
  {
    email: `darius.bell${SEED_DOMAIN}`,
    profile: {
      full_name: 'Darius Bell',
      age: 27, location: 'Compton, CA', school_company: 'Northrop Grumman',
      bio: 'Electrical engineer by day, community builder always. NSBE alumni. I want to connect Black engineers in LA and give back.',
      interests:   ['🎷 Jazz', '🎲 Board Games', '🌍 Afrobeats', '🤖 Robotics', '🏀 Basketball'],
      skills:      ['⚡ Electrical Engineering', '🎤 Public Speaking', '🏆 Team Leadership', '📝 Grant Writing'],
      goals:       ['diversity', 'goals', 'action'],
      availability:['Weekdays', 'Evenings'],
      personality_type: 'ENTJ',
      connection_preference: 'hybrid',
      connection_purposes: ['networking', 'mentorship', 'community'],
      group_size_preference: 'l',
      social_preferences: { frequency: 'Monthly', ageRange: ['18–24', '25–34', '35–44'], commitment: 'regular' },
    },
  },
  {
    email: `sofia.ramirez${SEED_DOMAIN}`,
    profile: {
      full_name: 'Sofia Ramirez',
      age: 21, location: 'Van Nuys, CA', school_company: 'CSUN',
      bio: 'Business admin junior, minoring in marketing. I run a small Etsy shop and I\'m obsessed with brand strategy.',
      interests:   ['💃 Latin / Reggaeton', '💃 Dance Fitness', '🍕 Restaurant hopping', '🚀 Startups', '👟 Streetwear'],
      skills:      ['📱 Social Media Marketing', '💡 Brand Strategy', '✍️ Content Marketing', '🖌️ Graphic Design'],
      goals:       ['goals', 'growth', 'action'],
      availability:['Weekends', 'Afternoons'],
      personality_type: 'ESFP',
      connection_preference: 'hybrid',
      connection_purposes: ['entrepreneurship', 'networking', 'social'],
      group_size_preference: 'm',
      social_preferences: { frequency: 'Weekly', ageRange: ['18–24', '25–34'], commitment: 'regular' },
    },
  },
  {
    email: `alex.nguyen${SEED_DOMAIN}`,
    profile: {
      full_name: 'Alex Nguyen',
      age: 25, location: 'Reseda, CA', school_company: 'Google (contractor)',
      bio: 'UX designer who transitioned from graphic design. I geek out on accessibility, design systems, and making things work for everyone.',
      interests:   ['🚴 Cycling', '☕ Coffee culture', '🌐 Web Development', '✏️ Drawing / Illustration', '🎨 Digital art'],
      skills:      ['🖥️ UI / UX Design', '📐 Figma / Prototyping', '🌐 Web Design', '📋 UX Research / Surveys'],
      goals:       ['growth', 'account', 'diversity'],
      availability:['Weekdays', 'Evenings'],
      personality_type: 'INFP',
      connection_preference: 'online',
      connection_purposes: ['learning', 'networking', 'collaboration'],
      group_size_preference: 's',
      social_preferences: { frequency: 'Bi-weekly', ageRange: ['18–24', '25–34'], commitment: 'casual' },
    },
  },
  {
    email: `kezia.okafor${SEED_DOMAIN}`,
    profile: {
      full_name: 'Kezia Okafor',
      age: 23, location: 'Chatsworth, CA', school_company: 'CSUN',
      bio: 'Pre-med junior doing research in the biology department. Founding member of NSBE pre-med chapter at CSUN.',
      interests:   ['🎽 Track & Field', '🍳 Home cooking', '🔬 Biotech', '📺 Documentaries', '🧘 Yoga'],
      skills:      ['🧬 Biology / Genetics', '🧪 Lab Techniques', '📝 Grant Writing', '🎤 Public Speaking'],
      goals:       ['diversity', 'growth', 'goals'],
      availability:['Weekends', 'Afternoons'],
      personality_type: 'ENFJ',
      connection_preference: 'hybrid',
      connection_purposes: ['mentorship', 'community', 'learning'],
      group_size_preference: 'm',
      social_preferences: { frequency: 'Weekly', ageRange: ['18–24', '25–34'], commitment: 'regular' },
    },
  },
  {
    email: `tyler.brooks${SEED_DOMAIN}`,
    profile: {
      full_name: 'Tyler Brooks',
      age: 28, location: 'Burbank, CA', school_company: 'Warner Bros. Discovery',
      bio: 'Junior producer at WBD. New to LA from Atlanta. Looking for people to explore the city with and maybe start a film club.',
      interests:   ['🎬 Indie films', '😂 Comedy', '🍽️ Food tourism', '🏃 Running', '✍️ Screenwriting'],
      skills:      ['📖 Screenwriting', '📋 Project Management', '🗂️ Event Planning', '📹 Video Editing'],
      goals:       ['vibes', 'goals', 'diversity'],
      availability:['Weekends', 'Evenings'],
      personality_type: 'ENFP',
      connection_preference: 'inperson',
      connection_purposes: ['social', 'networking', 'creative projects'],
      group_size_preference: 'm',
      social_preferences: { frequency: 'Monthly', ageRange: ['18–24', '25–34', '35–44'], commitment: 'casual' },
    },
  },
  {
    email: `amara.diallo${SEED_DOMAIN}`,
    profile: {
      full_name: 'Amara Diallo',
      age: 24, location: 'Torrance, CA', school_company: 'SpaceX (intern → FTE)',
      bio: 'Propulsion engineer at SpaceX. First-gen, NSBE member, obsessed with making aerospace more accessible. Let\'s build something.',
      interests:   ['🧗 Rock Climbing', '🤖 Robotics', '🚀 Startups', '📺 Documentaries', '🌍 International travel'],
      skills:      ['✈️ Aerospace', '🔧 Mechanical Engineering', '🐍 Python / Pandas', '📊 STEM Education'],
      goals:       ['diversity', 'goals', 'action'],
      availability:['Weekends', 'Evenings'],
      personality_type: 'ISTJ',
      connection_preference: 'hybrid',
      connection_purposes: ['mentorship', 'networking', 'community'],
      group_size_preference: 's',
      social_preferences: { frequency: 'Monthly', ageRange: ['18–24', '25–34'], commitment: 'regular' },
    },
  },
  {
    email: `will.chen${SEED_DOMAIN}`,
    profile: {
      full_name: 'William Chen',
      age: 22, location: 'Granada Hills, CA', school_company: 'CSUN',
      bio: 'Finance senior prepping for the CFA. I run a stock-picking club on campus and love a good debate about macroeconomics.',
      interests:   ['🎾 Tennis', '🌍 International travel', '📊 Data Science', '🚀 Startups', '🍷 Wine & cocktails'],
      skills:      ['💰 Investment Banking', '📈 Stock / Equity Trading', '💵 Financial Planning', '📉 Financial Modeling'],
      goals:       ['goals', 'account', 'growth'],
      availability:['Weekdays', 'Evenings'],
      personality_type: 'ESTJ',
      connection_preference: 'hybrid',
      connection_purposes: ['learning', 'networking', 'accountability'],
      group_size_preference: 'm',
      social_preferences: { frequency: 'Weekly', ageRange: ['18–24', '25–34'], commitment: 'regular' },
    },
  },
  {
    email: `jade.morris${SEED_DOMAIN}`,
    profile: {
      full_name: 'Jade Morris',
      age: 26, location: 'Long Beach, CA', school_company: 'Freelance / Cal State Long Beach alum',
      bio: 'Graphic designer and muralist. I\'ve painted walls in Leimert Park and done branding for local restaurants. Art is how I connect.',
      interests:   ['✏️ Drawing / Illustration', '🖌️ Painting', '🎹 R&B / Soul', '🖼️ Museum & gallery hopping', '🏙️ City exploration'],
      skills:      ['🖌️ Graphic Design', '🖋️ Brand / Identity', '🎨 Fine Art / Painting', '🏺 Sculpture / Ceramics'],
      goals:       ['vibes', 'action', 'diversity'],
      availability:['Flexible', 'Weekends'],
      personality_type: 'ISFP',
      connection_preference: 'inperson',
      connection_purposes: ['creative projects', 'community', 'social'],
      group_size_preference: 's',
      social_preferences: { frequency: 'Monthly', ageRange: ['18–24', '25–34', '35–44'], commitment: 'casual' },
    },
  },
  {
    email: `omar.hassan${SEED_DOMAIN}`,
    profile: {
      full_name: 'Omar Hassan',
      age: 25, location: 'Glendale, CA', school_company: 'Amazon Web Services',
      bio: 'Cloud engineer at AWS. I contribute to open-source projects and I\'m building a SaaS app on the side. Let\'s hack together.',
      interests:   ['☁️ Cloud / DevOps', '🚀 Startups', '⚽ Soccer / Football', '🍳 Home cooking', '🌐 Web Development'],
      skills:      ['☁️ Cloud / DevOps', '🔐 Cybersecurity', '🗄️ Backend / APIs', '🐳 Docker / Kubernetes'],
      goals:       ['action', 'growth', 'account'],
      availability:['Weekdays', 'Evenings'],
      personality_type: 'INTP',
      connection_preference: 'online',
      connection_purposes: ['collaboration', 'learning', 'accountability'],
      group_size_preference: 's',
      social_preferences: { frequency: 'Bi-weekly', ageRange: ['18–24', '25–34'], commitment: 'high' },
    },
  },
  {
    email: `camille.fontenot${SEED_DOMAIN}`,
    profile: {
      full_name: 'Camille Fontenot',
      age: 27, location: 'Culver City, CA', school_company: 'Sony Pictures',
      bio: 'Entertainment lawyer turned legal tech enthusiast. New to LA, trying to find my people at the intersection of law, tech, and culture.',
      interests:   ['🎷 Jazz', '🖼️ Museum & gallery hopping', '🎬 Indie films', '🤖 AI / Machine Learning', '🏙️ City exploration'],
      skills:      ['⚖️ Legal Practice / Attorney', '⚖️ Legal Writing', '🤝 Partnerships / BD', '🐍 Python'],
      goals:       ['diversity', 'goals', 'growth'],
      availability:['Weekdays', 'Evenings', 'Weekends'],
      personality_type: 'ENTJ',
      connection_preference: 'hybrid',
      connection_purposes: ['networking', 'learning', 'social'],
      group_size_preference: 'm',
      social_preferences: { frequency: 'Monthly', ageRange: ['25–34', '35–44'], commitment: 'casual' },
    },
  },
  {
    email: `dev.patel${SEED_DOMAIN}`,
    profile: {
      full_name: 'Dev Patel',
      age: 23, location: 'Woodland Hills, CA', school_company: 'CSUN',
      bio: 'Computer science senior who loves competitive programming and anything distributed systems. Also trying to get into hiking.',
      interests:   ['🏆 Competitive / Esports', '🏏 Cricket', '🥾 Hiking', '🌸 Anime', '☁️ Cloud / DevOps'],
      skills:      ['☕ Java / Kotlin', '🗄️ Backend / APIs', '🐳 Docker / Kubernetes', '📡 Data Engineering'],
      goals:       ['goals', 'account', 'growth'],
      availability:['Weekends', 'Evenings'],
      personality_type: 'ISTP',
      connection_preference: 'hybrid',
      connection_purposes: ['learning', 'accountability', 'social'],
      group_size_preference: 's',
      social_preferences: { frequency: 'Weekly', ageRange: ['18–24', '25–34'], commitment: 'regular' },
    },
  },
];

// ── Hive definitions ──────────────────────────────────────────────────────────
// Tags are plain-text taxonomy chip strings (emoji stripped) or free-form.
// Descriptions + ideal_members contain skill and goal vocabulary so scorePurpose
// can match — see GOAL_MAP tokens: goals=[shared,goals], vibes=[good,vibes,fun],
// growth=[personal,growth], account=[accountability], diversity=[diversity,thought],
// action=[action,results].

const HIVES = [
  {
    hive_name:    'NSBE Los Angeles',
    category:     'Professional Networking',
    description:  'The official Hive for NSBE Greater LA chapter members. We organize career fairs, company tours, and the annual scholarship fundraiser. Shared goals drive everything we do — action and real results placing Black engineers in aerospace, electrical engineering, and mechanical engineering roles. Diversity of thought makes us stronger.',
    ideal_members: 'Engineers and technologists in aerospace, mechanical engineering, electrical engineering, and robotics seeking real accountability and career growth. Project management, team leadership, and public speaking skills valued.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'Los Angeles, CA',
    max_members:  80,
    cadence:      'Monthly',
    tags:         ['NSBE', 'Robotics', 'Startups', 'Afrobeats', 'Black engineers'],
    pinned_goal:  'Place 10 members in engineering roles by year-end.',
    ground_rules: 'Respect everyone. Share opportunities. No spam.',
    discoverable: true,
    ownerIdx:     1,
    adminIdxs:    [4, 9],
    memberIdxs:   [0, 7],
    reqIdxs:      [6, 10],
  },
  {
    hive_name:    'CSUN SWE Study Circle',
    category:     'Project Collaboration',
    description:  'Weekly problem-solving sessions for CSUN software engineering students. We tackle LeetCode, system design, distributed systems, and peer-review code in React, Python, Java, Kotlin, JavaScript, and backend APIs. Cloud infrastructure and mobile app experience welcome.',
    ideal_members: 'CSUN students and recent grads preparing for software engineering interviews. Python, Java, Kotlin, React, backend APIs, and cloud platforms helpful. Come with accountability and a personal growth mindset.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'Northridge, CA',
    max_members:  20,
    cadence:      'Weekly',
    tags:         ['CSUN', 'Web Development', 'Cloud / DevOps', 'Mobile Apps', 'interview prep'],
    pinned_goal:  'Every member lands an internship — shared goals with real accountability.',
    icebreaker:   'What\'s the first program you ever wrote?',
    discoverable: true,
    ownerIdx:     0,
    adminIdxs:    [14],
    memberIdxs:   [3, 6, 10],
    reqIdxs:      [11],
  },
  {
    hive_name:    'LA Creative Collective',
    category:     'Social Groups',
    description:  'Filmmakers, designers, musicians, and writers in LA who want to create together. Monthly meetups, collabs, and portfolio feedback sessions. Good vibes and fun are mandatory — this is a space where creativity and action produce real results.',
    ideal_members: 'Creatives with skills in filmmaking, photography, video editing, screenwriting, painting, illustration, music production, or graphic design. Diversity of thought and background welcome. Come ready to show your work.',
    join_policy:  'request',
    location_type:'in-person',
    location:     'Los Angeles, CA',
    max_members:  30,
    cadence:      'Monthly',
    tags:         ['filmmaking', 'Photography', 'Screenwriting', 'Painting', 'Drawing / Illustration'],
    pinned_goal:  'Produce one collaborative short film this year.',
    ground_rules: 'Constructive feedback only. Credit your collaborators.',
    discoverable: true,
    ownerIdx:     2,
    adminIdxs:    [11],
    memberIdxs:   [6, 8],
    reqIdxs:      [5],
  },
  {
    hive_name:    'SideProject Builders',
    category:     'Project Collaboration',
    description:  'A remote-first group for engineers, designers, and PMs building side projects. Accountability sprints, feedback, and demo days. We value action and results — each member ships something real. Personal growth through building in public.',
    ideal_members: 'Engineers and makers with skills in cloud platforms, backend APIs, web development, React, Python, Docker, Kubernetes, or SaaS product design. Startups mindset essential. Shared goals and accountability keep the group moving.',
    join_policy:  'open',
    location_type:'online',
    location:     null,
    max_members:  25,
    cadence:      'Biweekly',
    tags:         ['SaaS', 'Cloud / DevOps', 'Web Development', 'Startups', 'indie hacker'],
    pinned_goal:  'Each member ships something in 90 days.',
    icebreaker:   'What are you building and why?',
    discoverable: true,
    ownerIdx:     12,
    adminIdxs:    [0],
    memberIdxs:   [3, 6, 14],
    reqIdxs:      [10],
  },
  {
    hive_name:    'Valley New Arrivals',
    category:     'Social Groups',
    description:  'A welcoming space for people who recently moved to the San Fernando Valley. We explore the neighborhood, share tips, and build real friendships. Good vibes and fun are the whole point — no agenda, just community.',
    ideal_members: 'Anyone new to the Valley looking for friends and a sense of belonging. All backgrounds welcome.',
    join_policy:  'open',
    location_type:'in-person',
    location:     'San Fernando Valley, CA',
    max_members:  40,
    cadence:      'Biweekly',
    tags:         ['community', 'new to LA', 'social', 'valley', 'friends'],
    icebreaker:   'Where did you move from and what surprised you most about the Valley?',
    discoverable: true,
    ownerIdx:     8,
    adminIdxs:    [1],
    memberIdxs:   [5, 13],
    reqIdxs:      [],
  },
  {
    hive_name:    'Afro-STEM Network',
    category:     'Professional Networking',
    description:  'A community for Black professionals in STEM — aerospace, mechanical engineering, electrical engineering, and beyond. Monthly panels, resume reviews, and coffee chats. Diversity of thought and shared goals drive everything we do.',
    ideal_members: 'Black engineers and scientists in aerospace, electrical engineering, mechanical engineering, robotics, and STEM education. We welcome Python and data skills too. Action and results — not just networking.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'Los Angeles, CA',
    max_members:  60,
    cadence:      'Monthly',
    tags:         ['NSBE', 'Aerospace', 'Afrobeats', 'Robotics', 'Startups'],
    discoverable: true,
    ownerIdx:     4,
    adminIdxs:    [1, 9],
    memberIdxs:   [7, 0],
    reqIdxs:      [5, 6],
  },
  {
    hive_name:    'Data Science LA',
    category:     'Project Collaboration',
    description:  'Kaggle competitions, machine learning reading groups, and data science projects for ML/DS folks in LA. We push for personal growth and keep each other accountable. From beginners to PhDs — everyone is welcome.',
    ideal_members: 'Data scientists, ML engineers, and analysts with Python, SQL, statistics, machine learning, or data visualization skills. We value shared goals, accountability, and continuous personal growth. NLP and data engineering welcome too.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'Los Angeles, CA',
    max_members:  35,
    cadence:      'Biweekly',
    tags:         ['Machine Learning', 'Data Science', 'Python', 'Statistics', 'Kaggle'],
    pinned_goal:  'Win a Kaggle Featured competition as a team.',
    icebreaker:   'What\'s the most interesting dataset you\'ve worked with?',
    discoverable: true,
    ownerIdx:     3,
    adminIdxs:    [12],
    memberIdxs:   [0, 10, 14],
    reqIdxs:      [6],
  },
  {
    hive_name:    'Pre-Med CSUN Hub',
    category:     'Social Groups',
    description:  'Study groups, MCAT prep, shadowing coordination, and moral support for pre-med students at CSUN. We share knowledge of biology, genetics, and lab techniques. Diversity of thought and background make our group stronger.',
    ideal_members: 'Pre-med students with interests in biology, genetics, biotech, and lab techniques. Grant writing and public speaking experience valued. We support personal growth and shared goals for every member on the med-school path.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'Northridge, CA',
    max_members:  25,
    cadence:      'Weekly',
    tags:         ['Biology / Genetics', 'Biotech', 'Lab Techniques', 'MCAT', 'CSUN'],
    pinned_goal:  'Every member submits their med school application.',
    icebreaker:   'What made you want to go into medicine?',
    discoverable: true,
    ownerIdx:     7,
    adminIdxs:    [],
    memberIdxs:   [1, 5, 10],
    reqIdxs:      [],
  },
  {
    hive_name:    'LA Weekend Hikers',
    category:     'Event Buddies',
    description:  'Weekend hikes around LA — Griffith, Malibu Creek, Mt. Wilson, Santa Monica Mountains. All skill levels. Good vibes and fun every time. We carpool when possible.',
    ideal_members: 'Anyone who loves hiking, running, camping, or just being outside. No experience required.',
    join_policy:  'open',
    location_type:'in-person',
    location:     'Greater Los Angeles, CA',
    max_members:  30,
    cadence:      'Weekly',
    tags:         ['Hiking', 'Running', 'Camping', 'outdoors', 'fitness'],
    icebreaker:   'What\'s your favourite hike you\'ve done in California?',
    discoverable: true,
    ownerIdx:     9,
    adminIdxs:    [2],
    memberIdxs:   [3, 8, 13],
    reqIdxs:      [11],
  },
  {
    hive_name:    'UX/Design Crit Circle',
    category:     'Project Collaboration',
    description:  'A biweekly design critique session for UX designers and product designers. Show your work in Figma or prototyping tools, get real feedback. Personal growth through honest critique — accountability to ship better work.',
    ideal_members: 'Designers with skills in UI/UX design, Figma, prototyping, web design, UX research, or illustration. Drawing, graphic design, and digital art backgrounds are a plus. We value diversity of thought in design approaches.',
    join_policy:  'request',
    location_type:'online',
    location:     null,
    max_members:  15,
    cadence:      'Biweekly',
    tags:         ['UI / UX Design', 'Figma / Prototyping', 'Web Design', 'Drawing / Illustration', 'critique'],
    ground_rules: 'Be specific. Reference design principles. No personal jabs.',
    discoverable: true,
    ownerIdx:     6,
    adminIdxs:    [11],
    memberIdxs:   [2, 5],
    reqIdxs:      [13],
  },
  {
    hive_name:    'Black Business Builders',
    category:     'Professional Networking',
    description:  'Entrepreneurs, freelancers, and business owners in LA\'s Black community. Referrals, funding resources, and pop-up market coordination. Growth-focused action with real results for Black-owned brands and startups.',
    ideal_members: 'Business owners and marketers with skills in social media marketing, brand strategy, content marketing, entrepreneurship, and graphic design. Event planning a plus. Shared goals — let\'s build together.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'Los Angeles, CA',
    max_members:  50,
    cadence:      'Monthly',
    tags:         ['Entrepreneurship', 'Startups', 'Social Media Marketing', 'Brand Strategy', 'Black business'],
    discoverable: true,
    ownerIdx:     11,
    adminIdxs:    [5],
    memberIdxs:   [2, 8, 13],
    reqIdxs:      [],
  },
  {
    hive_name:    'Finance Nerds SFV',
    category:     'Specialized Groups',
    description:  'Stock picks, macro debates, CFA study groups, and real-money portfolio challenges. We hold each other accountable — shared goals and personal growth through disciplined analysis. Startups and data science angles welcome.',
    ideal_members: 'Finance-minded people with skills in investment banking, stock and equity trading, financial planning, financial modeling, or data science. Accountability is core — we track results together.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'San Fernando Valley, CA',
    max_members:  20,
    cadence:      'Weekly',
    tags:         ['Investment Banking', 'Stock / Equity Trading', 'Data Science', 'Startups', 'CFA'],
    icebreaker:   'What\'s a stock you own and why?',
    discoverable: true,
    ownerIdx:     10,
    adminIdxs:    [12],
    memberIdxs:   [0, 14],
    reqIdxs:      [3],
  },
  {
    hive_name:    'Aerospace Lunch Club',
    category:     'Event Buddies',
    description:  'Monthly lunches for aerospace engineers and enthusiasts across El Segundo, Torrance, and Long Beach. SpaceX, Northrop, Boeing — all welcome. Shared goals and action-oriented results in propulsion, mechanical engineering, and aerospace.',
    ideal_members: 'Engineers in aerospace, mechanical engineering, electrical engineering, and propulsion. Python and robotics skills welcome. We also value STEM education advocates and public speakers.',
    join_policy:  'open',
    location_type:'in-person',
    location:     'El Segundo / Torrance / Long Beach, CA',
    max_members:  null,
    cadence:      'Monthly',
    tags:         ['Aerospace', 'Mechanical Engineering', 'Electrical Engineering', 'Robotics', 'networking'],
    discoverable: true,
    ownerIdx:     9,
    adminIdxs:    [4, 1],
    memberIdxs:   [0, 7],
    reqIdxs:      [],
  },
  {
    hive_name:    'Legal Tech Explorers',
    category:     'Specialized Groups',
    description:  'Lawyers, technologists, and policy wonks unpacking machine learning in the courtroom, e-discovery, and the future of legal practice. Diversity of thought is essential — we need both legal and tech perspectives.',
    ideal_members: 'Legal professionals with skills in legal practice, legal writing, policy, or AI tools. Python and machine learning knowledge is a plus. We value personal growth at the intersection of law and technology.',
    join_policy:  'request',
    location_type:'online',
    location:     null,
    max_members:  20,
    cadence:      'Monthly',
    tags:         ['Legal Practice / Attorney', 'Machine Learning', 'Legal Writing', 'Policy', 'legal tech'],
    discoverable: true,
    ownerIdx:     13,
    adminIdxs:    [12],
    memberIdxs:   [6],
    reqIdxs:      [10],
  },
  {
    hive_name:    'Leimert Park Art Walks',
    category:     'Event Buddies',
    description:  'Celebrating the art and culture of Leimert Park. Monthly gallery walks, meet local artists, and commission community murals. Good vibes and fun — this is a space of joy, creativity, and diversity of thought.',
    ideal_members: 'Artists and creatives with skills in painting, drawing, illustration, fine art, photography, filmmaking, graphic design, or sculpture. Community-minded. Everyone welcome.',
    join_policy:  'open',
    location_type:'in-person',
    location:     'Leimert Park, Los Angeles, CA',
    max_members:  null,
    cadence:      'Monthly',
    tags:         ['Painting', 'Drawing / Illustration', 'Photography', 'filmmaking', 'Leimert Park'],
    icebreaker:   'What piece of art stopped you in your tracks?',
    discoverable: true,
    ownerIdx:     11,
    adminIdxs:    [2],
    memberIdxs:   [5, 8, 13],
    reqIdxs:      [],
  },
];

// Chat messages per hive (by hiveIdx, userIdx pairs)
const CHAT_THREADS = {
  0: [ // NSBE LA
    { userIdx: 1, text: 'Welcome everyone to the NSBE LA Hive! Excited to connect and grow together.', daysAgo: 14 },
    { userIdx: 4, text: 'Big news — we just confirmed a company tour at SpaceX El Segundo next month. Drop your interest below!', daysAgo: 13 },
    { userIdx: 9, text: 'I\'m IN. El Segundo is right by me. Should I coordinate carpools from campus?', daysAgo: 13, replyTo: 1 },
    { userIdx: 0, text: 'Yes please! I\'m at CSUN and happy to drive if others want to meet at the Metrolink.', daysAgo: 12 },
    { userIdx: 7, text: 'This is amazing. I\'ve been trying to get a tour there for months. Thank you Nia!', daysAgo: 12 },
    { userIdx: 1, text: 'Reminder: scholarship applications close Friday. Five awards at $1,500 each. Link in the About section.', daysAgo: 5 },
    { userIdx: 4, text: 'Just submitted mine. The essay prompt this year is really thoughtful.', daysAgo: 5, replyTo: 5 },
    { userIdx: 9, text: 'Also submitted. Fingers crossed for everyone.', daysAgo: 4 },
    { userIdx: 1, text: 'Our next chapter meeting is Saturday the 20th at 10am — location TBD, stay tuned!', daysAgo: 2 },
  ],
  1: [ // CSUN SWE Study Circle
    { userIdx: 0, text: 'Hey team! First session is this Thursday 7pm at the library. We\'ll warm up with two mediums on binary trees.', daysAgo: 10 },
    { userIdx: 14, text: 'Perfect. I\'ll bring printed copies of Cracking the Coding Interview ch. 4.', daysAgo: 10 },
    { userIdx: 3, text: 'Should we do a mock behavioral interview round too? I need practice there more than LC tbh.', daysAgo: 9, replyTo: 0 },
    { userIdx: 0, text: 'Yes! We can split the session — 45 min LC, 30 min behavioral pairs. Good call.', daysAgo: 9, replyTo: 2 },
    { userIdx: 6, text: 'I land on Thursday. Count me in starting next week!', daysAgo: 8 },
    { userIdx: 10, text: 'Quick question — how are we keeping track of which problems we\'ve done?', daysAgo: 6 },
    { userIdx: 0, text: 'I made a Notion tracker. DM me for access. We\'re tagging by topic and difficulty.', daysAgo: 6, replyTo: 5 },
    { userIdx: 14, text: 'Thursday session recap: we crushed two binary tree mediums, one DP hard (Omar figured it out 😤). Great group.', daysAgo: 3 },
    { userIdx: 3, text: 'I actually solved one on my own that I\'ve been stuck on for weeks. Accountability works.', daysAgo: 2 },
  ],
  6: [ // Data Science LA
    { userIdx: 3, text: 'New Kaggle competition just dropped — House Prices regression. Who\'s joining?', daysAgo: 8 },
    { userIdx: 12, text: 'I\'m in. Let\'s form a team. Last time I did one solo and it was rough.', daysAgo: 8 },
    { userIdx: 0, text: 'Count me in. I want to try XGBoost ensemble on this one.', daysAgo: 7, replyTo: 1 },
    { userIdx: 3, text: 'Let\'s meet Sunday 3pm on Zoom to do initial EDA together. Priya shares screen.', daysAgo: 7 },
    { userIdx: 14, text: 'Send me the invite link. I\'ll have the notebook set up in advance.', daysAgo: 6 },
    { userIdx: 12, text: 'Quick tip: the missing value pattern in this dataset is MAR, not MCAR. Worth imputing with KNN rather than median.', daysAgo: 3 },
    { userIdx: 3, text: 'Great catch Omar. I was about to go median on everything. Our RMSE just dropped 12%.', daysAgo: 3, replyTo: 5 },
    { userIdx: 0, text: 'We\'re at top 8%. Let\'s push to top 5 before the deadline!', daysAgo: 1 },
  ],
  8: [ // LA Weekend Hikers
    { userIdx: 9, text: 'This Saturday: Solstice Canyon in Malibu. 7 miles out and back, moderate. Meet at the trailhead at 7:30am. Who\'s in?', daysAgo: 7 },
    { userIdx: 2, text: 'In! I\'ll bring the sunscreen and extra water. Can someone carpool from the Valley?', daysAgo: 7, replyTo: 0 },
    { userIdx: 13, text: 'I can drive from Culver City. Picking up 2 more — anyone near me?', daysAgo: 6 },
    { userIdx: 8, text: 'This is my first hike in CA. Is Solstice Canyon ok for beginners?', daysAgo: 6 },
    { userIdx: 9, text: 'Totally beginner-friendly! The ruins at the end are worth every step.', daysAgo: 6, replyTo: 3 },
    { userIdx: 3, text: 'Solstice Canyon recap: 9 of us made it, saw the ruins, nobody died 😂. Best hike yet.', daysAgo: 1 },
    { userIdx: 2, text: 'Next week: Griffith Park loop? Different vibe but good for the group.', daysAgo: 1, replyTo: 5 },
  ],
};

// Posts data [hiveIdx, authorIdx, type, headline, body, eventAt, eventLocation]
const POSTS = [
  [0, 1, 'event', 'SpaceX El Segundo Company Tour', 'We\'re taking a group tour of SpaceX\'s facility in El Segundo. Open to all NSBE LA members. Space is limited to 20. RSVP to secure your spot.', future(18), 'SpaceX HQ, 1 Rocket Road, El Segundo, CA'],
  [0, 4, 'update', 'Scholarship Applications Now Open', 'Five awards at $1,500 each for NSBE LA members pursuing engineering degrees. Deadline is Friday. See the About section for the link.', null, null],
  [1, 0, 'event', 'LeetCode Grind Session — Binary Trees', 'Weekly problem-solving session at the CSUN library. This week: binary trees (medium). Behavioral mock interviews in the second half.', future(3), 'CSUN Oviatt Library, Room 214, Northridge, CA'],
  [6, 3, 'event', 'Kaggle Team Kickoff — EDA Session', 'First sync for the House Prices competition team. We\'ll do exploratory data analysis together on Zoom. Come with the dataset downloaded.', future(2), 'Zoom (link in chat)'],
  [8, 9, 'event', 'Solstice Canyon Hike', 'Saturday morning hike — Solstice Canyon, Malibu. 7 miles, moderate difficulty. Meet at the trailhead at 7:30am.', future(1), 'Solstice Canyon Trailhead, Malibu, CA'],
  [2, 2, 'update', 'Short Film Pre-Production Kickoff', 'We\'re officially in pre-production on "Frequency" — a short about two musicians who meet across a fence in Leimert Park. Seeking a DP and a composer. DM if interested.', null, null],
];

// Reactions [hiveIdx, msgOffset, userIdx, emoji]
const REACTIONS = [
  [0, 1, 1, '🚀'], [0, 1, 7, '🚀'], [0, 1, 0, '🔥'],
  [0, 5, 4, '👏'], [0, 5, 9, '👏'],
  [1, 7, 0, '🎯'], [1, 7, 3, '🎯'], [1, 8, 14, '💯'],
  [6, 7, 3, '🔥'], [6, 7, 12, '🔥'],
  [8, 5, 9, '😂'], [8, 5, 2, '😂'], [8, 5, 3, '🏆'],
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('  TrueHive — seed');
  console.log('────────────────────────────────────────────────────────────');

  // Fail fast if any chip drifted from the real taxonomy
  validateVocabulary();

  if (RESET) {
    console.log('\n  Resetting seeded rows…');
    await q(`DELETE FROM event_rsvps  WHERE post_id IN (SELECT post_id FROM hive_posts WHERE author_user_id IN (SELECT user_id FROM users WHERE email LIKE $1))`, [`%${SEED_DOMAIN}`]);
    await q(`DELETE FROM hive_posts   WHERE author_user_id IN (SELECT user_id FROM users WHERE email LIKE $1)`, [`%${SEED_DOMAIN}`]);
    await q(`DELETE FROM message_reactions WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE $1)`, [`%${SEED_DOMAIN}`]);
    await q(`DELETE FROM messages     WHERE sender_user_id IN (SELECT user_id FROM users WHERE email LIKE $1)`, [`%${SEED_DOMAIN}`]);
    await q(`DELETE FROM join_requests WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE $1)`, [`%${SEED_DOMAIN}`]);
    await q(`DELETE FROM hive_members WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE $1)`, [`%${SEED_DOMAIN}`]);
    await q(`DELETE FROM hive_channels WHERE hive_id IN (SELECT hive_id FROM hives WHERE creator_user_id IN (SELECT user_id FROM users WHERE email LIKE $1))`, [`%${SEED_DOMAIN}`]);
    await q(`DELETE FROM hives        WHERE creator_user_id IN (SELECT user_id FROM users WHERE email LIKE $1)`, [`%${SEED_DOMAIN}`]);
    await q(`DELETE FROM profiles     WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE $1)`, [`%${SEED_DOMAIN}`]);
    await q(`DELETE FROM users        WHERE email LIKE $1`, [`%${SEED_DOMAIN}`]);
    console.log('  ✓ Reset complete');
  }

  // ── 1. Users ──────────────────────────────────────────────────────────────
  console.log('\n  Seeding users…');
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const userIds = [];

  for (const u of USERS) {
    const existing = await q(`SELECT user_id FROM users WHERE email = $1`, [u.email]);
    if (existing.length) {
      userIds.push(existing[0].user_id);
      process.stdout.write('.');
      continue;
    }
    const [row] = await q(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING user_id`,
      [u.email, passwordHash],
    );
    userIds.push(row.user_id);
    process.stdout.write('+');
  }
  console.log(`\n  ✓ ${userIds.length} users`);

  // ── 2. Profiles ───────────────────────────────────────────────────────────
  console.log('  Seeding profiles…');
  for (let i = 0; i < USERS.length; i++) {
    const p   = USERS[i].profile;
    const uid = userIds[i];
    const existing = await q(`SELECT profile_id FROM profiles WHERE user_id = $1`, [uid]);
    if (existing.length) { process.stdout.write('.'); continue; }
    await q(
      `INSERT INTO profiles
         (user_id, full_name, age, location, school_company, bio,
          interests, skills, goals, availability,
          personality_type, connection_preference, connection_purposes,
          group_size_preference, social_preferences)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        uid, p.full_name, p.age, p.location, p.school_company, p.bio,
        JSON.stringify(p.interests), JSON.stringify(p.skills),
        JSON.stringify(p.goals), JSON.stringify(p.availability),
        p.personality_type, p.connection_preference,
        JSON.stringify(p.connection_purposes), p.group_size_preference,
        JSON.stringify(p.social_preferences ?? {}),
      ],
    );
    process.stdout.write('+');
  }
  console.log(`\n  ✓ ${USERS.length} profiles`);

  // ── 3. Categories ─────────────────────────────────────────────────────────
  const catRows = await q(`SELECT category_id, category_name FROM categories`);
  const catMap  = Object.fromEntries(catRows.map(r => [r.category_name, r.category_id]));

  // ── 4. Hives ──────────────────────────────────────────────────────────────
  console.log('  Seeding hives…');
  const hiveIds = [];

  for (const h of HIVES) {
    const creatorId = userIds[h.ownerIdx];
    const catId     = catMap[h.category] ?? null;

    const existing = await q(`SELECT hive_id FROM hives WHERE hive_name = $1 AND creator_user_id = $2`, [h.hive_name, creatorId]);
    if (existing.length) {
      hiveIds.push(existing[0].hive_id);
      process.stdout.write('.');
      continue;
    }
    const [row] = await q(
      `INSERT INTO hives
         (creator_user_id, category_id, hive_name, description, ideal_members, join_policy,
          location_type, location, max_members, cadence, tags,
          pinned_goal, ground_rules, icebreaker, discoverable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING hive_id`,
      [
        creatorId, catId, h.hive_name, h.description, h.ideal_members ?? null,
        h.join_policy, h.location_type, h.location ?? null,
        h.max_members ?? null, h.cadence ?? null,
        JSON.stringify(h.tags ?? []),
        h.pinned_goal ?? null, h.ground_rules ?? null, h.icebreaker ?? null,
        h.discoverable ?? true,
      ],
    );
    hiveIds.push(row.hive_id);
    process.stdout.write('+');
  }
  console.log(`\n  ✓ ${hiveIds.length} hives`);

  // ── 5. Members ────────────────────────────────────────────────────────────
  console.log('  Seeding members…');
  let memCount = 0;

  async function ensureMember(hiveId, userId, role) {
    const ex = await q(
      `SELECT hive_member_id FROM hive_members WHERE hive_id = $1 AND user_id = $2`,
      [hiveId, userId],
    );
    if (ex.length) return;
    await q(
      `INSERT INTO hive_members (hive_id, user_id, role, membership_status) VALUES ($1, $2, $3, 'active')`,
      [hiveId, userId, role],
    );
    memCount++;
  }

  for (let hi = 0; hi < HIVES.length; hi++) {
    const h       = HIVES[hi];
    const hiveId  = hiveIds[hi];
    await ensureMember(hiveId, userIds[h.ownerIdx], 'owner');
    for (const ai of (h.adminIdxs ?? []))  await ensureMember(hiveId, userIds[ai],  'admin');
    for (const mi of (h.memberIdxs ?? [])) await ensureMember(hiveId, userIds[mi],  'member');
  }
  console.log(`  ✓ ${memCount} members inserted`);

  // ── 6. Join requests ──────────────────────────────────────────────────────
  console.log('  Seeding join requests…');
  let reqCount = 0;
  const requestMessages = [
    'I\'d love to join and contribute to the community!',
    'I\'ve been looking for a group like this. Happy to help however I can.',
    'I bring relevant experience and I\'m excited to connect.',
    'Someone recommended this Hive to me — looks like a great fit.',
    'I\'d love to meet more people in this space.',
  ];

  for (let hi = 0; hi < HIVES.length; hi++) {
    const hiveId = hiveIds[hi];
    for (let ri = 0; ri < (HIVES[hi].reqIdxs ?? []).length; ri++) {
      const userId = userIds[HIVES[hi].reqIdxs[ri]];
      const isMember = await q(
        `SELECT 1 FROM hive_members WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
        [hiveId, userId],
      );
      if (isMember.length) continue;
      const ex = await q(
        `SELECT request_id FROM join_requests WHERE hive_id = $1 AND user_id = $2`,
        [hiveId, userId],
      );
      if (ex.length) continue;
      await q(
        `INSERT INTO join_requests (hive_id, user_id, status, request_message) VALUES ($1, $2, 'pending', $3)`,
        [hiveId, userId, requestMessages[reqCount % requestMessages.length]],
      );
      reqCount++;
    }
  }
  console.log(`  ✓ ${reqCount} join requests`);

  // ── 7. Default channels ───────────────────────────────────────────────────
  console.log('  Ensuring default channels…');
  let chanCount = 0;
  for (const hiveId of hiveIds) {
    const ex = await q(`SELECT channel_id FROM hive_channels WHERE hive_id = $1 AND is_default`, [hiveId]);
    if (ex.length) continue;
    await q(
      `INSERT INTO hive_channels (hive_id, name, channel_type, is_default, position) VALUES ($1, 'general', 'text', TRUE, 0)`,
      [hiveId],
    );
    chanCount++;
  }
  console.log(`  ✓ ${chanCount} default channels created`);

  // ── 8. Chat messages ──────────────────────────────────────────────────────
  console.log('  Seeding chat messages…');
  let msgCount = 0;
  const msgIdsByHive = {};

  for (const [hiveIdxStr, thread] of Object.entries(CHAT_THREADS)) {
    const hiveIdx  = Number(hiveIdxStr);
    const hiveId   = hiveIds[hiveIdx];
    const [chan]   = await q(`SELECT channel_id FROM hive_channels WHERE hive_id = $1 AND is_default`, [hiveId]);
    const chanId   = chan?.channel_id ?? null;
    const ids      = [];

    for (let mi = 0; mi < thread.length; mi++) {
      const m        = thread[mi];
      const senderId = userIds[m.userIdx];
      const sentAt   = new Date(Date.now() - m.daysAgo * 86400_000 - (thread.length - mi) * 120_000);
      const replyId  = m.replyTo != null ? (ids[m.replyTo] ?? null) : null;

      const existing = await q(
        `SELECT message_id FROM messages WHERE sender_user_id = $1 AND message_text = $2 AND hive_id = $3`,
        [senderId, m.text, hiveId],
      );
      if (existing.length) { ids.push(existing[0].message_id); continue; }

      const [row] = await q(
        `INSERT INTO messages (hive_id, sender_user_id, message_text, sent_at, channel_id, reply_to_message_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING message_id`,
        [hiveId, senderId, m.text, sentAt.toISOString(), chanId, replyId],
      );
      ids.push(row.message_id);
      msgCount++;
    }
    msgIdsByHive[hiveIdx] = ids;
  }
  console.log(`  ✓ ${msgCount} messages`);

  // ── 9. Reactions ──────────────────────────────────────────────────────────
  console.log('  Seeding reactions…');
  let rxnCount = 0;

  for (const [hiveIdx, msgOffset, userIdx, emoji] of REACTIONS) {
    const msgIds = msgIdsByHive[hiveIdx];
    if (!msgIds || !msgIds[msgOffset]) continue;
    const msgId  = msgIds[msgOffset];
    const userId = userIds[userIdx];
    const ex     = await q(
      `SELECT reaction_id FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [msgId, userId, emoji],
    );
    if (ex.length) continue;
    await q(
      `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)`,
      [msgId, userId, emoji],
    );
    rxnCount++;
  }
  console.log(`  ✓ ${rxnCount} reactions`);

  // ── 10. Posts ─────────────────────────────────────────────────────────────
  console.log('  Seeding posts…');
  let postCount = 0;
  const postIds  = [];

  for (const [hiveIdx, authorIdx, type, headline, body, eventAt, eventLocation] of POSTS) {
    const hiveId   = hiveIds[hiveIdx];
    const authorId = userIds[authorIdx];
    const ex       = await q(
      `SELECT post_id FROM hive_posts WHERE hive_id = $1 AND headline = $2`,
      [hiveId, headline],
    );
    if (ex.length) { postIds.push(ex[0].post_id); continue; }
    const [row] = await q(
      `INSERT INTO hive_posts (hive_id, author_user_id, post_type, headline, body, event_at, event_location)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING post_id`,
      [hiveId, authorId, type, headline, body, eventAt ?? null, eventLocation ?? null],
    );
    postIds.push(row.post_id);
    postCount++;
  }
  console.log(`  ✓ ${postCount} posts`);

  // ── 11. Event RSVPs ───────────────────────────────────────────────────────
  console.log('  Seeding event RSVPs…');
  let rsvpCount = 0;
  const RSVPS = [
    [0, 9], [0, 4], [0, 0], [0, 7],
    [2, 14], [2, 3], [2, 6],
    [4, 2], [4, 13], [4, 3], [4, 8],
    [3, 12], [3, 0], [3, 14],
  ];

  for (const [pi, ui] of RSVPS) {
    const postId = postIds[pi];
    if (!postId) continue;
    const userId = userIds[ui];
    const ex = await q(`SELECT rsvp_id FROM event_rsvps WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    if (ex.length) continue;
    await q(
      `INSERT INTO event_rsvps (post_id, user_id, rsvp_status) VALUES ($1, $2, 'going')`,
      [postId, userId],
    );
    rsvpCount++;
  }
  console.log(`  ✓ ${rsvpCount} RSVPs`);

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n────────────────────────────────────────────────────────────');
  console.log('  Seed complete\n');
  console.log(`  Dev login password for all seeded accounts: ${SEED_PASSWORD}`);
  console.log('  Sample accounts:');
  for (const u of USERS.slice(0, 4)) {
    console.log(`    ${u.email}`);
  }
  console.log('  (and 11 more — all share the same password)\n');
}

main()
  .catch(err => { console.error('\n✗ Seed failed:', err); process.exit(1); })
  .finally(() => pool.end());
