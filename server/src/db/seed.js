/**
 * ConnectHive — dev seed script
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

// ── Seed data ─────────────────────────────────────────────────────────────────

const USERS = [
  {
    email: `jordan.carter${SEED_DOMAIN}`,
    profile: {
      full_name: 'Jordan Carter',
      age: 22, location: 'Northridge, CA', school_company: 'CSUN',
      bio: 'CS junior at CSUN. I build mobile apps on the weekends and I\'m looking for people to collaborate on side projects.',
      interests: ['software development', 'mobile apps', 'hackathons', 'gaming', 'music production'],
      skills: ['React Native', 'Python', 'Figma', 'Firebase'],
      goals: ['land a tech internship', 'ship my first app', 'network in the LA tech scene'],
      availability: ['weekday evenings', 'weekends'],
      personality_type: 'INTJ',
      connection_preference: 'both',
      connection_purposes: ['networking', 'collaboration', 'learning'],
      group_size_preference: 'small',
    },
  },
  {
    email: `nia.washington${SEED_DOMAIN}`,
    profile: {
      full_name: 'Nia Washington',
      age: 24, location: 'Los Angeles, CA', school_company: 'NSBE - Greater LA',
      bio: 'Mechanical engineering grad, now at an aerospace startup in El Segundo. NSBE chapter officer and proud Hive co-founder.',
      interests: ['aerospace', 'engineering outreach', 'leadership', 'yoga', 'afrobeats'],
      skills: ['CAD/SolidWorks', 'project management', 'public speaking', 'Python'],
      goals: ['grow NSBE chapter', 'mentor undergrads', 'move into product engineering'],
      availability: ['weekend mornings', 'weekday evenings'],
      personality_type: 'ENFJ',
      connection_preference: 'in-person',
      connection_purposes: ['networking', 'mentorship', 'community'],
      group_size_preference: 'medium',
    },
  },
  {
    email: `marcus.reynolds${SEED_DOMAIN}`,
    profile: {
      full_name: 'Marcus Reynolds',
      age: 26, location: 'Inglewood, CA', school_company: 'Self-employed',
      bio: 'Freelance videographer and content creator. I shoot for brands, events, and documentaries. Looking to collaborate with creatives in LA.',
      interests: ['filmmaking', 'photography', 'streetwear', 'basketball', 'travel'],
      skills: ['Premiere Pro', 'DaVinci Resolve', 'cinematography', 'drone operation'],
      goals: ['direct my first short film', 'build a production team', 'land a brand deal'],
      availability: ['flexible', 'weekends'],
      personality_type: 'ENFP',
      connection_preference: 'both',
      connection_purposes: ['collaboration', 'creative projects', 'social'],
      group_size_preference: 'medium',
    },
  },
  {
    email: `priya.nair${SEED_DOMAIN}`,
    profile: {
      full_name: 'Priya Nair',
      age: 23, location: 'Sherman Oaks, CA', school_company: 'CSUN',
      bio: 'Data science MS student. I love Kaggle competitions, boardgames, and trying every new ramen spot in the Valley.',
      interests: ['machine learning', 'data visualization', 'boardgames', 'food', 'hiking'],
      skills: ['Python', 'TensorFlow', 'SQL', 'Tableau', 'R'],
      goals: ['publish a research paper', 'join a DS team at a tech company', 'compete in NeurIPS'],
      availability: ['weekends', 'weekday evenings'],
      personality_type: 'INTP',
      connection_preference: 'both',
      connection_purposes: ['learning', 'collaboration', 'social'],
      group_size_preference: 'small',
    },
  },
  {
    email: `darius.bell${SEED_DOMAIN}`,
    profile: {
      full_name: 'Darius Bell',
      age: 27, location: 'Compton, CA', school_company: 'Northrop Grumman',
      bio: 'Electrical engineer by day, community builder always. NSBE alumni. I want to connect Black engineers in LA and give back.',
      interests: ['electrical engineering', 'community building', 'mentorship', 'chess', 'jazz'],
      skills: ['circuit design', 'MATLAB', 'Python', 'leadership', 'grant writing'],
      goals: ['start a STEM program in Compton', 'grow my professional network', 'become a principal engineer'],
      availability: ['weekday evenings', 'saturday mornings'],
      personality_type: 'ENTJ',
      connection_preference: 'both',
      connection_purposes: ['networking', 'mentorship', 'community'],
      group_size_preference: 'large',
    },
  },
  {
    email: `sofia.ramirez${SEED_DOMAIN}`,
    profile: {
      full_name: 'Sofia Ramirez',
      age: 21, location: 'Van Nuys, CA', school_company: 'CSUN',
      bio: 'Business admin junior, minoring in marketing. I run a small Etsy shop and I\'m obsessed with brand strategy.',
      interests: ['entrepreneurship', 'marketing', 'small business', 'Latinx culture', 'dance'],
      skills: ['social media marketing', 'Canva', 'Google Analytics', 'copywriting'],
      goals: ['grow my Etsy shop to $10k/month', 'find a marketing internship', 'build a brand'],
      availability: ['weekends', 'weekday afternoons'],
      personality_type: 'ESFP',
      connection_preference: 'both',
      connection_purposes: ['entrepreneurship', 'networking', 'social'],
      group_size_preference: 'medium',
    },
  },
  {
    email: `alex.nguyen${SEED_DOMAIN}`,
    profile: {
      full_name: 'Alex Nguyen',
      age: 25, location: 'Reseda, CA', school_company: 'Google (contractor)',
      bio: 'UX designer who transitioned from graphic design. I geek out on accessibility, design systems, and making things work for everyone.',
      interests: ['UX design', 'accessibility', 'design systems', 'coffee', 'cycling'],
      skills: ['Figma', 'user research', 'prototyping', 'HTML/CSS', 'Storybook'],
      goals: ['join a full-time design team', 'contribute to an open-source design system', 'speak at a design conference'],
      availability: ['weekday evenings', 'sunday afternoons'],
      personality_type: 'INFP',
      connection_preference: 'online',
      connection_purposes: ['learning', 'networking', 'collaboration'],
      group_size_preference: 'small',
    },
  },
  {
    email: `kezia.okafor${SEED_DOMAIN}`,
    profile: {
      full_name: 'Kezia Okafor',
      age: 23, location: 'Chatsworth, CA', school_company: 'CSUN',
      bio: 'Pre-med junior doing research in the biology department. Founding member of NSBE pre-med chapter at CSUN.',
      interests: ['medicine', 'biomedical research', 'advocacy', 'track & field', 'cooking'],
      skills: ['data collection', 'grant writing', 'lab techniques', 'public speaking'],
      goals: ['get into medical school', 'publish a research paper', 'build community among pre-med students of color'],
      availability: ['weekend afternoons', 'thursday evenings'],
      personality_type: 'ENFJ',
      connection_preference: 'both',
      connection_purposes: ['mentorship', 'community', 'learning'],
      group_size_preference: 'medium',
    },
  },
  {
    email: `tyler.brooks${SEED_DOMAIN}`,
    profile: {
      full_name: 'Tyler Brooks',
      age: 28, location: 'Burbank, CA', school_company: 'Warner Bros. Discovery',
      bio: 'Junior producer at WBD. New to LA from Atlanta. Looking for people to explore the city with and maybe start a film club.',
      interests: ['film', 'television production', 'comedy writing', 'food tours', 'running'],
      skills: ['production coordination', 'scriptwriting', 'Final Cut Pro', 'scheduling'],
      goals: ['become a showrunner', 'make LA feel like home', 'run a half marathon'],
      availability: ['weekends', 'friday evenings'],
      personality_type: 'ENFP',
      connection_preference: 'in-person',
      connection_purposes: ['social', 'networking', 'creative projects'],
      group_size_preference: 'medium',
    },
  },
  {
    email: `amara.diallo${SEED_DOMAIN}`,
    profile: {
      full_name: 'Amara Diallo',
      age: 24, location: 'Torrance, CA', school_company: 'SpaceX (intern → FTE)',
      bio: 'Propulsion engineer at SpaceX. First-gen, NSBE member, obsessed with making aerospace more accessible. Let\'s build something.',
      interests: ['aerospace', 'propulsion', 'STEM education', 'afrofuturism', 'climbing'],
      skills: ['propulsion systems', 'MATLAB', 'thermodynamics', 'mentoring', 'Python'],
      goals: ['work on Mars mission hardware', 'launch a STEM camp for girls', 'write a book someday'],
      availability: ['weekends', 'remote weekday evenings'],
      personality_type: 'ISTJ',
      connection_preference: 'both',
      connection_purposes: ['mentorship', 'networking', 'community'],
      group_size_preference: 'small',
    },
  },
  {
    email: `will.chen${SEED_DOMAIN}`,
    profile: {
      full_name: 'William Chen',
      age: 22, location: 'Granada Hills, CA', school_company: 'CSUN',
      bio: 'Finance senior prepping for the CFA. I run a stock-picking club on campus and love a good debate about macroeconomics.',
      interests: ['finance', 'investing', 'economics', 'tennis', 'traveling'],
      skills: ['financial modeling', 'Excel', 'Bloomberg Terminal', 'valuation', 'Python'],
      goals: ['pass CFA Level 1', 'land a finance role in LA', 'build an investment portfolio'],
      availability: ['weekday evenings', 'saturday mornings'],
      personality_type: 'ESTJ',
      connection_preference: 'both',
      connection_purposes: ['learning', 'networking', 'accountability'],
      group_size_preference: 'medium',
    },
  },
  {
    email: `jade.morris${SEED_DOMAIN}`,
    profile: {
      full_name: 'Jade Morris',
      age: 26, location: 'Long Beach, CA', school_company: 'Freelance / Cal State Long Beach alum',
      bio: 'Graphic designer and muralist. I\'ve painted walls in Leimert Park and done branding for local restaurants. Art is how I connect.',
      interests: ['visual art', 'muralism', 'typography', 'community art', 'R&B music'],
      skills: ['Adobe Illustrator', 'Photoshop', 'mural painting', 'brand identity', 'UI design'],
      goals: ['get a public art commission', 'teach art workshops', 'collaborate with a tech company on design'],
      availability: ['flexible', 'weekends'],
      personality_type: 'ISFP',
      connection_preference: 'in-person',
      connection_purposes: ['creative projects', 'community', 'social'],
      group_size_preference: 'small',
    },
  },
  {
    email: `omar.hassan${SEED_DOMAIN}`,
    profile: {
      full_name: 'Omar Hassan',
      age: 25, location: 'Glendale, CA', school_company: 'Amazon Web Services',
      bio: 'Cloud engineer at AWS. I contribute to open-source projects and I\'m building a SaaS app on the side. Let\'s hack together.',
      interests: ['cloud computing', 'open source', 'SaaS', 'soccer', 'cooking'],
      skills: ['AWS', 'Kubernetes', 'Terraform', 'Go', 'Python'],
      goals: ['launch my SaaS', 'contribute to a major open-source project', 'get AWS Solutions Architect cert'],
      availability: ['weekday evenings', 'saturday afternoons'],
      personality_type: 'INTP',
      connection_preference: 'online',
      connection_purposes: ['collaboration', 'learning', 'accountability'],
      group_size_preference: 'small',
    },
  },
  {
    email: `camille.fontenot${SEED_DOMAIN}`,
    profile: {
      full_name: 'Camille Fontenot',
      age: 27, location: 'Culver City, CA', school_company: 'Sony Pictures',
      bio: 'Entertainment lawyer turned legal tech enthusiast. New to LA, trying to find my people at the intersection of law, tech, and culture.',
      interests: ['legal tech', 'entertainment law', 'policy', 'jazz', 'art collecting'],
      skills: ['contract drafting', 'IP law', 'negotiation', 'legal research', 'Python basics'],
      goals: ['transition to legal tech', 'build a network in the LA entertainment industry', 'do pro bono work for creatives'],
      availability: ['weekday evenings', 'weekend afternoons'],
      personality_type: 'ENTJ',
      connection_preference: 'both',
      connection_purposes: ['networking', 'learning', 'social'],
      group_size_preference: 'medium',
    },
  },
  {
    email: `dev.patel${SEED_DOMAIN}`,
    profile: {
      full_name: 'Dev Patel',
      age: 23, location: 'Woodland Hills, CA', school_company: 'CSUN',
      bio: 'Computer science senior who loves competitive programming and anything distributed systems. Also trying to get into hiking.',
      interests: ['competitive programming', 'distributed systems', 'hiking', 'cricket', 'anime'],
      skills: ['Java', 'C++', 'system design', 'algorithms', 'Kafka'],
      goals: ['crack a FAANG interview', 'build a distributed key-value store', 'hike Mt. Baldy'],
      availability: ['weekend mornings', 'weekday evenings'],
      personality_type: 'ISTP',
      connection_preference: 'both',
      connection_purposes: ['learning', 'accountability', 'social'],
      group_size_preference: 'small',
    },
  },
];

// ── Hive definitions (category_name must match migrate.js seeds) ──────────────

const HIVES = [
  {
    hive_name:    'NSBE Los Angeles',
    category:     'Professional Networking',
    description:  'The official Hive for NSBE Greater LA chapter members. We organize career fairs, company tours, and the annual scholarship fundraiser.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'Los Angeles, CA',
    max_members:  80,
    cadence:      'Monthly',
    tags:         ['engineering', 'NSBE', 'professional development', 'Black engineers'],
    pinned_goal:  'Place 10 members in engineering roles by year-end.',
    ground_rules: 'Respect everyone. Share opportunities. No spam.',
    discoverable: true,
    ownerIdx:     1,  // nia.washington
    adminIdxs:    [4, 9], // darius.bell, amara.diallo
    memberIdxs:   [0, 7],
    reqIdxs:      [6, 10],
  },
  {
    hive_name:    'CSUN SWE Study Circle',
    category:     'Project Collaboration',
    description:  'Weekly problem-solving sessions for CSUN software engineering students. We tackle LeetCode, system design, and peer-review each other\'s code.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'Northridge, CA',
    max_members:  20,
    cadence:      'Weekly',
    tags:         ['coding', 'LeetCode', 'CSUN', 'interview prep'],
    pinned_goal:  'Every member gets an internship offer by May.',
    icebreaker:   'What\'s the first program you ever wrote?',
    discoverable: true,
    ownerIdx:     0,  // jordan.carter
    adminIdxs:    [14],
    memberIdxs:   [3, 6, 10],
    reqIdxs:      [11],
  },
  {
    hive_name:    'LA Creative Collective',
    category:     'Social Groups',
    description:  'Filmmakers, designers, musicians, and writers in LA who want to create together. Monthly meetups, collabs, and portfolio feedback sessions.',
    join_policy:  'request',
    location_type:'in-person',
    location:     'Los Angeles, CA',
    max_members:  30,
    cadence:      'Monthly',
    tags:         ['creative', 'filmmaking', 'design', 'music', 'LA'],
    pinned_goal:  'Produce one collaborative short film this year.',
    ground_rules: 'Constructive feedback only. Credit your collaborators.',
    discoverable: true,
    ownerIdx:     2,  // marcus.reynolds
    adminIdxs:    [11],
    memberIdxs:   [6, 8],
    reqIdxs:      [5],
  },
  {
    hive_name:    'SideProject Builders',
    category:     'Project Collaboration',
    description:  'A remote-first group for engineers, designers, and PMs who are building side projects. Accountability sprints, feedback, and demo days.',
    join_policy:  'open',
    location_type:'online',
    location:     null,
    max_members:  25,
    cadence:      'Biweekly',
    tags:         ['side project', 'SaaS', 'indie hacker', 'build in public'],
    pinned_goal:  'Each member ships something in 90 days.',
    icebreaker:   'What are you building and why?',
    discoverable: true,
    ownerIdx:     12, // omar.hassan
    adminIdxs:    [0],
    memberIdxs:   [3, 6, 14],
    reqIdxs:      [10],
  },
  {
    hive_name:    'Valley New Arrivals',
    category:     'Social Groups',
    description:  'A welcoming space for people who recently moved to the San Fernando Valley. We explore the neighborhood, share tips, and build real friendships.',
    join_policy:  'open',
    location_type:'in-person',
    location:     'San Fernando Valley, CA',
    max_members:  40,
    cadence:      'Biweekly',
    tags:         ['community', 'new to LA', 'social', 'valley'],
    icebreaker:   'Where did you move from and what surprised you most about the Valley?',
    discoverable: true,
    ownerIdx:     8,  // tyler.brooks (from Atlanta)
    adminIdxs:    [1],
    memberIdxs:   [5, 13],
    reqIdxs:      [],
  },
  {
    hive_name:    'Afro-STEM Network',
    category:     'Professional Networking',
    description:  'A community for Black professionals in STEM — aerospace, software, biomedical, and beyond. Monthly panels, resume reviews, and coffee chats.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'Los Angeles, CA',
    max_members:  60,
    cadence:      'Monthly',
    tags:         ['STEM', 'Black professionals', 'networking', 'NSBE', 'aerospace'],
    discoverable: true,
    ownerIdx:     4,  // darius.bell
    adminIdxs:    [1, 9],
    memberIdxs:   [7, 0],
    reqIdxs:      [5, 6],
  },
  {
    hive_name:    'Data Science LA',
    category:     'Project Collaboration',
    description:  'Kaggle competitions, reading groups, and data projects for ML/DS folks in LA. From beginners to PhDs — everyone is welcome.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'Los Angeles, CA',
    max_members:  35,
    cadence:      'Biweekly',
    tags:         ['data science', 'machine learning', 'Kaggle', 'Python', 'statistics'],
    pinned_goal:  'Win a Kaggle Featured competition as a team.',
    icebreaker:   'What\'s the most interesting dataset you\'ve worked with?',
    discoverable: true,
    ownerIdx:     3,  // priya.nair
    adminIdxs:    [12],
    memberIdxs:   [0, 10, 14],
    reqIdxs:      [6],
  },
  {
    hive_name:    'Pre-Med CSUN Hub',
    category:     'Social Groups',
    description:  'Study groups, MCAT prep, shadowing coordination, and moral support for pre-med students at CSUN and surrounding campuses.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'Northridge, CA',
    max_members:  25,
    cadence:      'Weekly',
    tags:         ['pre-med', 'MCAT', 'CSUN', 'healthcare', 'study group'],
    pinned_goal:  'Every member submits their med school application.',
    icebreaker:   'What made you want to go into medicine?',
    discoverable: true,
    ownerIdx:     7,  // kezia.okafor
    adminIdxs:    [],
    memberIdxs:   [1, 5, 10],
    reqIdxs:      [],
  },
  {
    hive_name:    'LA Weekend Hikers',
    category:     'Event Buddies',
    description:  'Weekend hikes around LA — Griffith, Malibu Creek, Mt. Wilson, Santa Monica Mountains. All skill levels. We carpool when possible.',
    join_policy:  'open',
    location_type:'in-person',
    location:     'Greater Los Angeles, CA',
    max_members:  30,
    cadence:      'Weekly',
    tags:         ['hiking', 'outdoors', 'fitness', 'LA', 'nature'],
    icebreaker:   'What\'s your favourite hike you\'ve done in California?',
    discoverable: true,
    ownerIdx:     9,  // amara.diallo
    adminIdxs:    [2],
    memberIdxs:   [3, 8, 13],
    reqIdxs:      [11],
  },
  {
    hive_name:    'UX/Design Crit Circle',
    category:     'Project Collaboration',
    description:  'A biweekly design critique session for UX designers, product designers, and anyone working on interfaces. Show your work, get real feedback.',
    join_policy:  'request',
    location_type:'online',
    location:     null,
    max_members:  15,
    cadence:      'Biweekly',
    tags:         ['UX', 'design', 'critique', 'Figma', 'product design'],
    ground_rules: 'Be specific. Reference design principles. No personal jabs.',
    discoverable: true,
    ownerIdx:     6,  // alex.nguyen
    adminIdxs:    [11],
    memberIdxs:   [2, 5],
    reqIdxs:      [13],
  },
  {
    hive_name:    'Black Business Builders',
    category:     'Professional Networking',
    description:  'Entrepreneurs, freelancers, and business owners in LA\'s Black community. Referrals, funding resources, and pop-up market coordination.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'Los Angeles, CA',
    max_members:  50,
    cadence:      'Monthly',
    tags:         ['entrepreneurship', 'Black business', 'LA', 'networking'],
    discoverable: true,
    ownerIdx:     11, // jade.morris
    adminIdxs:    [5],
    memberIdxs:   [2, 8, 13],
    reqIdxs:      [],
  },
  {
    hive_name:    'Finance Nerds SFV',
    category:     'Specialized Groups',
    description:  'Stock picks, macro debates, CFA study groups, and real-money portfolio challenges for finance-minded folks in the San Fernando Valley.',
    join_policy:  'open',
    location_type:'hybrid',
    location:     'San Fernando Valley, CA',
    max_members:  20,
    cadence:      'Weekly',
    tags:         ['finance', 'investing', 'CFA', 'stocks', 'economics'],
    icebreaker:   'What\'s a stock you own and why?',
    discoverable: true,
    ownerIdx:     10, // will.chen
    adminIdxs:    [12],
    memberIdxs:   [0, 14],
    reqIdxs:      [3],
  },
  {
    hive_name:    'Aerospace Lunch Club',
    category:     'Event Buddies',
    description:  'Monthly lunches for aerospace engineers and enthusiasts across El Segundo, Torrance, and Long Beach. SpaceX, Northrop, Boeing — all welcome.',
    join_policy:  'open',
    location_type:'in-person',
    location:     'El Segundo / Torrance / Long Beach, CA',
    max_members:  null,
    cadence:      'Monthly',
    tags:         ['aerospace', 'engineering', 'lunch', 'networking', 'LA'],
    discoverable: true,
    ownerIdx:     9,  // amara.diallo (also owns Hikers — allowed)
    adminIdxs:    [4, 1],
    memberIdxs:   [0, 7],
    reqIdxs:      [],
  },
  {
    hive_name:    'Legal Tech Explorers',
    category:     'Specialized Groups',
    description:  'Lawyers, technologists, and policy wonks unpacking AI in the courtroom, e-discovery, and the future of legal practice.',
    join_policy:  'request',
    location_type:'online',
    location:     null,
    max_members:  20,
    cadence:      'Monthly',
    tags:         ['legal tech', 'AI', 'law', 'policy', 'technology'],
    discoverable: true,
    ownerIdx:     13, // camille.fontenot
    adminIdxs:    [12],
    memberIdxs:   [6],
    reqIdxs:      [10],
  },
  {
    hive_name:    'Leimert Park Art Walks',
    category:     'Event Buddies',
    description:  'Celebrating the art and culture of Leimert Park. We organize monthly gallery walks, meet local artists, and commission community murals.',
    join_policy:  'open',
    location_type:'in-person',
    location:     'Leimert Park, Los Angeles, CA',
    max_members:  null,
    cadence:      'Monthly',
    tags:         ['art', 'Leimert Park', 'community', 'murals', 'culture'],
    icebreaker:   'What piece of art stopped you in your tracks?',
    discoverable: true,
    ownerIdx:     11, // jade.morris (also owns BBB)
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

// Reactions to add [hiveIdx, msgOffset, userIdx, emoji]
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
  console.log('  ConnectHive — seed');
  console.log('────────────────────────────────────────────────────────────');

  if (RESET) {
    console.log('\n  Resetting seeded rows…');
    // Delete in dependency order
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

  // ── 1. Users ─────────────────────────────────────────────────────────────────
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

  // ── 2. Profiles ───────────────────────────────────────────────────────────────
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
          personality_type, connection_preference, connection_purposes, group_size_preference)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        uid, p.full_name, p.age, p.location, p.school_company, p.bio,
        JSON.stringify(p.interests), JSON.stringify(p.skills),
        JSON.stringify(p.goals), JSON.stringify(p.availability),
        p.personality_type, p.connection_preference,
        JSON.stringify(p.connection_purposes), p.group_size_preference,
      ],
    );
    process.stdout.write('+');
  }
  console.log(`\n  ✓ ${USERS.length} profiles`);

  // ── 3. Categories (look up by name) ──────────────────────────────────────────
  const catRows = await q(`SELECT category_id, category_name FROM categories`);
  const catMap  = Object.fromEntries(catRows.map(r => [r.category_name, r.category_id]));

  // ── 4. Hives ──────────────────────────────────────────────────────────────────
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
         (creator_user_id, category_id, hive_name, description, join_policy,
          location_type, location, max_members, cadence, tags,
          pinned_goal, ground_rules, icebreaker, discoverable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING hive_id`,
      [
        creatorId, catId, h.hive_name, h.description, h.join_policy,
        h.location_type, h.location ?? null, h.max_members ?? null,
        h.cadence ?? null, JSON.stringify(h.tags ?? []),
        h.pinned_goal ?? null, h.ground_rules ?? null, h.icebreaker ?? null,
        h.discoverable ?? true,
      ],
    );
    hiveIds.push(row.hive_id);
    process.stdout.write('+');
  }
  console.log(`\n  ✓ ${hiveIds.length} hives`);

  // ── 5. Members ────────────────────────────────────────────────────────────────
  console.log('  Seeding members…');
  let memCount = 0;

  async function ensureMember(hiveId, userId, role) {
    const ex = await q(
      `SELECT hive_member_id FROM hive_members WHERE hive_id = $1 AND user_id = $2`,
      [hiveId, userId],
    );
    if (ex.length) return;
    await q(
      `INSERT INTO hive_members (hive_id, user_id, role, membership_status)
       VALUES ($1, $2, $3, 'active')`,
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

  // ── 6. Join requests ──────────────────────────────────────────────────────────
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
      if (isMember.length) continue; // skip if already a member
      const ex = await q(
        `SELECT request_id FROM join_requests WHERE hive_id = $1 AND user_id = $2`,
        [hiveId, userId],
      );
      if (ex.length) continue;
      await q(
        `INSERT INTO join_requests (hive_id, user_id, status, request_message)
         VALUES ($1, $2, 'pending', $3)`,
        [hiveId, userId, requestMessages[reqCount % requestMessages.length]],
      );
      reqCount++;
    }
  }
  console.log(`  ✓ ${reqCount} join requests`);

  // ── 7. Default channels (for hives created above) ─────────────────────────────
  console.log('  Ensuring default channels…');
  let chanCount = 0;
  for (const hiveId of hiveIds) {
    const ex = await q(`SELECT channel_id FROM hive_channels WHERE hive_id = $1 AND is_default`, [hiveId]);
    if (ex.length) continue;
    await q(
      `INSERT INTO hive_channels (hive_id, name, channel_type, is_default, position)
       VALUES ($1, 'general', 'text', TRUE, 0)`,
      [hiveId],
    );
    chanCount++;
  }
  console.log(`  ✓ ${chanCount} default channels created`);

  // ── 8. Chat messages ──────────────────────────────────────────────────────────
  console.log('  Seeding chat messages…');
  let msgCount = 0;
  // hiveIdx → array of inserted message_ids in order
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

  // ── 9. Reactions ──────────────────────────────────────────────────────────────
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

  // ── 10. Posts ─────────────────────────────────────────────────────────────────
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

  // ── 11. Event RSVPs ───────────────────────────────────────────────────────────
  console.log('  Seeding event RSVPs…');
  let rsvpCount = 0;
  // RSVPs: [postIdx, userIdx]
  const RSVPS = [
    [0, 9], [0, 4], [0, 0], [0, 7],   // SpaceX tour
    [2, 14], [2, 3], [2, 6],            // LeetCode session
    [4, 2], [4, 13], [4, 3], [4, 8],   // Hike
    [3, 12], [3, 0], [3, 14],           // Kaggle kickoff
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

  // ── Done ──────────────────────────────────────────────────────────────────────
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
