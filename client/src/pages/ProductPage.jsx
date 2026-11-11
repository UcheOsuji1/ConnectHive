import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import SiteFooter from '../components/SiteFooter.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { goToFindYourHive } from '../components/FindYourHiveCTA.jsx';
import { api } from '../lib/api.js';
import usePageMeta from '../hooks/usePageMeta.js';
import '../styles/product-page.css';

// Six categories — copy, photos and examples match docs/mockups/product-page/
// ProductPage.design.html's renderVals(). `key` is the ?cat= value used by
// the footer and the old landing page (see components/SiteFooter.jsx);
// `dbName` is the real categories.category_name value (categoryConfig.js),
// used to pick which real tools show as chips for this category.
const CATEGORIES = [
  {
    key: 'social', dbName: 'Social Groups', short: 'Social Groups', name: 'Social Groups',
    count: '01 / 06', img: '/product/social.webp', alt: 'Friends laughing together over a meal',
    tagline: 'New friends, standing plans, a crew of your own.',
    lead: 'Social Hives are for the part of life that’s better shared: the brunch regulars, the game-night group, the people you text when something’s happening.',
    perfect: ['Just moved and starting from zero', 'Turning acquaintances into a regular crew', 'Brunch clubs, game nights and run clubs'],
    examples: [{ name: 'LA Social Circle', where: 'In person · Los Angeles' }, { name: 'The Newcomers Club', where: 'In person' }, { name: 'Weekend Social Club', where: 'In person' }],
  },
  {
    key: 'professional', dbName: 'Professional Networking', short: 'Professional', name: 'Professional Networking',
    count: '02 / 06', img: '/product/professional.webp', alt: 'Professionals talking around a table',
    tagline: 'Careers grow through people.',
    lead: 'Meet people in your field, trade advice and referrals, and find mentors who’ve already been where you’re headed, without the cold-message energy.',
    perfect: ['Breaking into a new industry', 'Peer circles for founders, engineers and designers', 'Finding a mentor, or becoming one'],
    examples: [{ name: 'Career Collective', where: 'Hybrid · Online + LA' }, { name: 'Young Professionals', where: 'Hybrid' }],
  },
  {
    key: 'travel', dbName: 'Travel Buddies', short: 'Travel Buddies', name: 'Travel Buddies',
    count: '03 / 06', img: '/product/travel.webp', alt: 'Friends on a trip together',
    tagline: 'The trip in the group chat, actually happening.',
    lead: 'Find people who want to go where you want to go, then plan the whole thing in one place: dates, the itinerary, who owes what.',
    perfect: ['Weekend road trips and day hikes', 'Finding people to split the rental with', 'Big trips planned months ahead'],
    examples: [{ name: 'Weekend Explorers', where: 'In person · Southern California' }, { name: 'Passport Collective', where: 'Worldwide' }],
  },
  {
    key: 'project', dbName: 'Project Collaboration', short: 'Projects', name: 'Project Collaboration',
    count: '04 / 06', img: '/product/projects.webp', alt: 'A team working together on a project',
    tagline: 'Ideas need teams.',
    lead: 'Find the developers, designers, writers and founders who want to build what you’re building, then keep the work moving together.',
    perfect: ['Side projects and early startups', 'Hackathon and portfolio teams', 'Creative collaborations of every kind'],
    examples: [{ name: 'Startup Builders', where: 'Online' }, { name: 'The Creators Studio', where: 'Hybrid' }],
  },
  {
    key: 'events', dbName: 'Event Buddies', short: 'Event Buddies', name: 'Event Buddies',
    count: '05 / 06', img: '/product/events.webp', alt: 'Friends celebrating at a concert',
    tagline: 'Concerts, meetups, and experiences are better with great company.',
    lead: 'Never skip a show again because nobody could make it. Find people who are already going, or who’ll go if you do.',
    perfect: ['Concerts and festivals', 'Games, watch parties and comedy nights', 'Trying the thing you wouldn’t try alone'],
    examples: [{ name: 'Event Circle', where: 'In person · Los Angeles' }, { name: 'Live Music Lovers', where: 'In person · LA' }],
  },
  {
    key: 'specialized', dbName: 'Specialized Groups', short: 'Specialized', name: 'Specialized Groups',
    count: '06 / 06', img: '/product/specialized.webp', alt: 'People painting together in a studio',
    tagline: 'Whatever your niche, find others who care just as much.',
    lead: 'Accountability crews, study circles, language exchanges, book clubs: if it matters to you, there’s room for a Hive built around it.',
    perfect: ['Fitness and habit accountability', 'Study and learning circles', 'Hobbies too specific for anywhere else'],
    examples: [{ name: 'Growth Collective', where: 'Hybrid · Online + local' }, { name: 'Fitness Accountability Crew', where: 'In person' }, { name: 'Study Collective', where: 'Online' }],
  },
];

// key -> Get together / Go places / Grow / Build, per the mockup's tool-groups.
// A tool not in this map still renders, grouped under "More" (never dropped).
const TOOL_GROUP = {
  find_time: 'Get together', checkins: 'Get together', signups: 'Get together', rides: 'Get together',
  itinerary: 'Go places', split_costs: 'Go places', ideas: 'Go places',
  goals: 'Grow', coffee_chats: 'Grow', mentorship: 'Grow', opportunities: 'Grow',
  tasks: 'Build', docs: 'Build',
};
const GROUP_ORDER = ['Get together', 'Go places', 'Grow', 'Build', 'More'];
const GROUP_INTRO = {
  'Get together': 'Make the plan, then make it happen.',
  'Go places': 'Trips and outings, sorted.',
  Grow: 'Get better, together.',
  Build: 'Keep the work moving.',
  More: 'Still part of every Hive.',
};

const TOOL_ICON = {
  find_time: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  checkins: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  signups: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
  rides: <><path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2.5M19 16v2.5" /><circle cx="8" cy="13.5" r=".6" /><circle cx="16" cy="13.5" r=".6" /></>,
  itinerary: <path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2ZM9 4v14M15 6v14" />,
  split_costs: <path d="M12 3v18M16.5 7.5C16 6 14.3 5 12 5c-2.6 0-4.5 1.3-4.5 3.3 0 4.6 9 2.5 9 7.2 0 2-2 3.5-4.5 3.5-2.5 0-4.3-1.1-4.8-2.8" />,
  ideas: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" />,
  goals: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".8" /></>,
  coffee_chats: <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9ZM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2M11.5 3.5v2" />,
  mentorship: <><circle cx="8" cy="7" r="3" /><circle cx="17" cy="10" r="2.4" /><path d="M2.5 20v-1a5.5 5.5 0 0 1 11 0v1M14 20v-.5a4 4 0 0 1 7.5-1.9" /></>,
  opportunities: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" /></>,
  tasks: <><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="m7.5 9 1.5 1.5L12 7.5M7.5 15l1.5 1.5 3-3M14.5 9.5h3M14.5 15.5h3" /></>,
  docs: <><path d="M7 3h7l5 5v13H7V3Z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>,
};
const DEFAULT_TOOL_ICON = <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4l2.5 2.5" /></>;

const TAB_ICON = [
  <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3 20v-1.5a6 6 0 0 1 12 0V20M15.5 14.4A4.6 4.6 0 0 1 21 19" /></>,
  <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M3 12.5h18" /></>,
  <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" />,
  <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" />,
];

// Mirrors PURPOSE_WEIGHTS, PAIR_WEIGHTS and BLEND in server/src/lib/compatibility.js —
// each bar width here is that factor's weight divided by the largest weight in its
// group (never the raw weight itself; those stay server-only, not exposed via any API).
// Update this if PURPOSE_WEIGHTS, PAIR_WEIGHTS or BLEND change.
const MATCH_FACTORS = {
  blend: { purpose: 60, people: 40 },
  hiveFit: [
    { label: 'Category', width: 100, note: 'The kind of connection you picked' },
    { label: 'Interests', width: 57, note: 'Your interests and the Hive’s tags' },
    { label: 'Goals', width: 57, note: 'What you want and what the Hive values' },
    { label: 'Skills', width: 29, note: 'What you bring and who it’s looking for' },
    { label: 'Location', width: 14, note: 'How close you are' },
    { label: 'Schedule', width: 14, note: 'How often you want to meet, and how often it does' },
    { label: 'Personality', width: 14, note: 'Your style and the Hive’s vibe' },
  ],
  peopleFit: [
    { label: 'Interests', width: 100, note: 'What you’re both into' },
    { label: 'Goals', width: 71, note: 'What you’re both after' },
    { label: 'Personality', width: 57, note: 'How your styles mesh' },
    { label: 'Availability', width: 43, note: 'When you’re both free' },
    { label: 'Age', width: 14, note: 'The age ranges you each prefer' },
  ],
};

function money(v) { return '$' + Math.round(v).toLocaleString('en-US'); }

export default function ProductPage() {
  usePageMeta('Product', 'TrueHive matches you with Hives — small, purpose-based groups with the chat, plans and tools to make it happen.');

  useEffect(() => { document.title = 'Product | TrueHive'; }, []);

  const { user } = useAuth();
  const navigate = useNavigate();

  const [cat, setCat] = useState(0);
  const [price, setPrice] = useState(12);
  const [members, setMembers] = useState(24);

  const [productInfo, setProductInfo] = useState(null);
  const [productInfoFailed, setProductInfoFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/public/product-info')
      .then(data => { if (!cancelled) setProductInfo(data); })
      .catch(err => {
        console.error('[ProductPage] failed to load /api/public/product-info:', err);
        if (!cancelled) setProductInfoFailed(true);
      });
    return () => { cancelled = true; };
  }, []);

  const tools = productInfo?.tools ?? [];
  const toolsReady = productInfo != null;
  const toolCount = toolsReady ? tools.length : null;
  const feePercent = productInfo?.platformFeePercent ?? null;
  const keepPercent = feePercent != null ? 100 - feePercent : null;

  const activeCat = CATEGORIES[cat];
  const chips = toolsReady ? tools.filter(t => t.defaultOn.includes(activeCat.dbName)).map(t => t.name) : [];

  const groups = GROUP_ORDER.map(g => ({
    name: g,
    intro: GROUP_INTRO[g],
    tools: tools.filter(t => (TOOL_GROUP[t.key] ?? 'More') === g),
  })).filter(g => g.tools.length > 0);

  const gross = price * members;
  const fee = feePercent != null ? gross * (feePercent / 100) : null;
  const stripeFee = (price * 0.029 + 0.30) * members;
  const keep = fee != null ? gross - fee - stripeFee : null;

  return (
    <>
      <Navbar />
      <div className="pp">

        {/* HERO */}
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <div className="eyebrow">The product</div>
              <h1>Find your people.<br /><em>Then do something together.</em></h1>
              <p className="lead" style={{ maxWidth: 540 }}>TrueHive matches you with Hives: small, purpose-based groups built around what you actually want to do. Then it gives every Hive the chat, plans and tools to make it happen.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 36 }}>
                <button type="button" className="btn-gold" onClick={() => goToFindYourHive({ user, navigate, label: 'Find Your Hive', source: 'product' })}>
                  Find Your Hive <span aria-hidden="true">→</span>
                </button>
                <button type="button" className="btn-ghost" onClick={() => navigate('/create-hive')}>Start a Hive</button>
              </div>
              <div className="hero-facts">
                <div className="fact"><strong>6</strong><span>Ways to connect</span></div>
                <div className="fact"><strong>{toolCount ?? '—'}</strong><span>Built-in Hive tools</span></div>
                <div className="fact"><strong>Free</strong><span>To join and create</span></div>
              </div>
            </div>

            <div className="comb" aria-label="The six TrueHive categories" role="img">
              <div className="hx" style={{ left: 90, top: 0 }}><div className="hx-in"><img src="/product/social.webp" alt="" /><div className="hx-label">Social<br />Groups</div></div></div>
              <div className="hx" style={{ left: 270, top: 0 }}><div className="hx-in"><img src="/product/professional.webp" alt="" /><div className="hx-label">Professional<br />Networking</div></div></div>
              <div className="hx" style={{ left: 0, top: 156 }}><div className="hx-in"><img src="/product/specialized.webp" alt="" /><div className="hx-label">Specialized<br />Groups</div></div></div>
              <div className="hx hx-core" style={{ left: 180, top: 156 }}><div className="hx-in">
                <svg width="62" height="62" viewBox="0 0 40 40" fill="none" stroke="#f5d699" strokeWidth="1.6" aria-hidden="true"><path d="M11.5 2 21 7.5v11L11.5 24 2 18.5v-11z M28.5 2 38 7.5v11L28.5 24 19 18.5v-11z M20 18l9.5 5.5v11L20 40l-9.5-5.5v-11z" /></svg>
                <span>Your Hive</span>
              </div></div>
              <div className="hx" style={{ left: 360, top: 156 }}><div className="hx-in"><img src="/product/travel.webp" alt="" /><div className="hx-label">Travel<br />Buddies</div></div></div>
              <div className="hx" style={{ left: 90, top: 312 }}><div className="hx-in"><img src="/product/events.webp" alt="" /><div className="hx-label">Event<br />Buddies</div></div></div>
              <div className="hx" style={{ left: 270, top: 312 }}><div className="hx-in"><img src="/product/projects.webp" alt="" /><div className="hx-label">Project<br />Collaboration</div></div></div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="sec" style={{ background: '#0a0705' }}>
          <div className="wrap">
            <div className="sec-head">
              <div>
                <div className="eyebrow">How a Hive works</div>
                <h2>From “I wish I knew people who…” <em>to plans on the calendar.</em></h2>
              </div>
              <p className="lead">No endless feeds and no strangers in a giant server. Just a short path from who you are to a small group worth showing up for.</p>
            </div>
            <div className="steps">
              <div className="step"><span className="step-no">01</span><h3>Tell us what you’re looking for</h3><p>Your interests, what you want out of a group, and where you are. It takes a few minutes and shapes everything after.</p></div>
              <div className="step"><span className="step-no">02</span><h3>See how well each Hive fits</h3><p>Every Hive shows a fit score built from two things: how well its purpose matches yours, and how well you match the people already in it. <a href="#matching" style={{ fontWeight: 700, textDecoration: 'none' }}>How matching works →</a></p></div>
              <div className="step"><span className="step-no">03</span><h3>Request to join</h3><p>The owner sees why you’d be a good fit and welcomes you in. Every Hive stays a group of people who chose each other.</p></div>
              <div className="step"><span className="step-no">04</span><h3>Show up together</h3><p>Chat, post, make plans and RSVP, with tools picked for what your Hive actually does.</p></div>
            </div>
          </div>
        </section>

        {/* MATCHMAKING */}
        <section className="sec" id="matching" style={{ background: 'linear-gradient(180deg,#0d0907,#0a0705)', scrollMarginTop: 'var(--header-h)' }}>
          <div className="wrap">
            <div className="sec-head">
              <div>
                <div className="eyebrow">Matchmaking</div>
                <h2>Matched on purpose. <em>And on people.</em></h2>
              </div>
              <p className="lead">Most apps match you to a topic or to a person. TrueHive checks both: whether a Hive is built for what you want, and whether you’ll click with the people already in it.</p>
            </div>

            <div className="mx">
              <div className="mx-card">
                <div className="mx-top"><h3>Hive fit</h3><div className="mx-share"><strong>{MATCH_FACTORS.blend.purpose}%</strong><span>of your score</span></div></div>
                <p className="mx-q">Is this Hive built for what you want?</p>
                <div className="fx">
                  {MATCH_FACTORS.hiveFit.map(f => (
                    <div className="fx-row" key={f.label}><b>{f.label}</b><span className="fx-bar"><i style={{ width: `${f.width}%` }} /></span><small>{f.note}</small></div>
                  ))}
                </div>
                <p style={{ margin: '18px 0 0', fontSize: 13, lineHeight: 1.55, color: '#a99884' }}>Project Collab and Professional Hives use their own factors: open roles, skills, pay, stage and hours for projects; industry and career stage for professional.</p>
              </div>

              <div className="mx-core">
                <div className="mx-hex"><div><strong>92%</strong><span>Your match</span></div></div>
                <span className="mx-plus">HIVE FIT + PEOPLE FIT</span>
                <p>One score from 0 to 100, shown on every Hive before you ask to join.</p>
              </div>

              <div className="mx-card">
                <div className="mx-top"><h3>People fit</h3><div className="mx-share"><strong>{MATCH_FACTORS.blend.people}%</strong><span>of your score</span></div></div>
                <p className="mx-q">Will you click with the people in it?</p>
                <div className="fx">
                  {MATCH_FACTORS.peopleFit.map(f => (
                    <div className="fx-row" key={f.label}><b>{f.label}</b><span className="fx-bar"><i style={{ width: `${f.width}%` }} /></span><small>{f.note}</small></div>
                  ))}
                </div>
                <p style={{ margin: '18px 0 0', fontSize: 13, lineHeight: 1.55, color: '#a99884' }}>Compared with every current member, one by one.</p>
              </div>
            </div>

            <div className="mx-rules">
              <div className="rule"><svg viewBox="0 0 24 24" aria-hidden="true">{TAB_ICON[0]}</svg><strong>One clash counts</strong><p>Your people fit isn’t just an average. If you’d clash with even one member, the score drops, so every Hive stays comfortable for the people already in it.</p></div>
              <div className="sample" aria-label="Example match card">
                <div className="sample-top"><b>LA Social Circle</b><span className="pill-green">92% match</span></div>
                <small>Why it’s a match · Example</small>
                <ul className="reasons">
                  <li>Strong interest overlap with this Hive</li>
                  <li>Shared goals alignment</li>
                  <li>Great location fit</li>
                  <li>Great personal chemistry with Maya</li>
                </ul>
                <p className="sample-note">Every score comes with the reasons behind it.</p>
              </div>
              <div className="rule"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></svg><strong>Blocked means never matched</strong><p>Anyone you block is never matched with you, and you’re never shown to them.</p></div>
            </div>

            <div className="ways">
              <div className="way"><span className="step-no">QF</span><div><strong>Quick Find</strong><p>Answer a few questions and get your best matches, ranked.</p></div></div>
              <div className="way"><span className="step-no">DD</span><div><strong>Deep Dive</strong><p>Explore one category at a time, with filters for distance, age ranges, and in person or online.</p></div></div>
              <div className="way"><span className="step-no"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-1.5a7 7 0 0 1 14 0V21" /></svg></span><div><strong>Owners see it too</strong><p>When you ask to join, the owner sees your Hive fit and personal compatibility, so great matches stand out.</p></div></div>
            </div>
          </div>
        </section>

        {/* AI (COMING SOON) */}
        <section className="sec ai" id="ai">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <span className="soon">Coming soon</span>
                <h2 style={{ marginTop: 22 }}>AI that explains. <em>People still decide.</em></h2>
              </div>
              <p className="lead">The match score stays simple and transparent. AI adds what numbers can’t: the why, in plain words, for the people joining and the people running each Hive.</p>
            </div>

            <div className="ai-grid">
              <div className="ai-feats">
                <div className="ai-feat"><span className="ai-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></svg></span><div><em className="who">For people finding a Hive</em><h3>Why this Hive fits you</h3><p>Open any Hive and get a short, personal explanation of why it matches you, plus the highlights worth knowing.</p></div></div>
                <div className="ai-feat"><span className="ai-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 20v-1.5a6 6 0 0 1 12 0V20M16 11l2 2 4-4" /></svg></span><div><em className="who">For Hive owners</em><h3>AI Fit Analysis</h3><p>When someone asks to join, get a two or three sentence summary, their top strengths, and one thing to consider.</p></div></div>
                <div className="ai-feat"><span className="ai-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h4M4 12h10M4 6h16M17 15l3 3-3 3" /></svg></span><div><em className="who">For everyone</em><h3>Smarter ranking</h3><p>AI reads Hive descriptions and profiles more like a person would, then reorders your top matches so the best ones rise.</p></div></div>
              </div>

              <div className="fit" aria-label="Example of an AI Fit Analysis an owner would see">
                <div className="fit-head"><span>Join request</span><span>Example</span></div>
                <div className="fit-body">
                  <div className="fit-who"><span className="avatar">AR</span><div><b>Alex Rivera</b><small>wants to join LA Creative Collective</small></div></div>
                  <div className="scores">
                    <div className="score"><span>Hive fit</span><strong>88%</strong></div>
                    <div className="score"><span>Personal compatibility</span><strong>81%</strong></div>
                  </div>
                  <div className="ai-box">
                    <div className="lbl"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /></svg>AI Fit Analysis</div>
                    <p>Alex’s design and photography background lines up closely with what this Hive is looking for, and their goal of collaborating on real projects matches its focus. Their availability fits the weekly meetups.</p>
                    <ul>
                      <li>Shared interest in photography and visual design</li>
                      <li>Wants to collaborate, which the Hive values</li>
                      <li>Strong personal compatibility with current members</li>
                    </ul>
                    <p className="consider"><b>To consider:</b> Alex is new to LA, so in-person attendance may take a few weeks to settle.</p>
                  </div>
                  <div className="fit-actions"><span>Decline</span><span className="ok">Accept</span></div>
                  <p className="fit-foot">AI never accepts or declines anyone. You do.</p>
                </div>
              </div>
            </div>

            <div className="ai-rules">
              <div className="rule"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-1.5a7 7 0 0 1 14 0V21" /></svg><strong>People decide</strong><p>AI explains and suggests. Owners decide who joins, and you decide where you go.</p></div>
              <div className="rule"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10.5" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></svg><strong>Your profile, not your chats</strong><p>It only reads what’s in profiles, Hive descriptions and join requests. Never your private messages.</p></div>
              <div className="rule"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /></svg><strong>Always labeled</strong><p>Anything written by AI is marked as AI, so you always know what you’re reading.</p></div>
            </div>
          </div>
        </section>

        {/* CATEGORIES */}
        <section className="sec cats" id="categories">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <div className="eyebrow">Six ways to connect</div>
                <h2>Every Hive starts <em>with a purpose.</em></h2>
              </div>
              <p className="lead">Pick the kind of connection you want. Each category comes with its own set of tools switched on, so a travel crew and a study group never feel like the same app.</p>
            </div>

            <div className="tabs" role="group" aria-label="Choose a category">
              {CATEGORIES.map((c, i) => (
                <button
                  key={c.key}
                  type="button"
                  className={`tab${i === cat ? ' is-on' : ''}`}
                  aria-pressed={i === cat}
                  onClick={() => setCat(i)}
                >
                  <span className="tab-hex"><svg viewBox="0 0 24 24" aria-hidden="true">{TAB_ICON[i]}</svg></span>
                  {c.name}
                </button>
              ))}
            </div>

            <article className="panel" aria-live="polite">
              <div className="panel-photo">
                <img src={activeCat.img} alt={activeCat.alt} />
                <div className="panel-cap">
                  <div className="count">{activeCat.count}</div>
                  <h3>{activeCat.name}</h3>
                  <p>{activeCat.tagline}</p>
                </div>
              </div>
              <div className="panel-body">
                <p className="lead" style={{ fontSize: 17, color: '#efe3d2' }}>{activeCat.lead}</p>
                <div>
                  <div className="label">Perfect for</div>
                  <ul className="perfect">
                    {activeCat.perfect.map(line => <li key={line}>{line}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="label">Tools switched on from day one</div>
                  <div className="chips">
                    {toolsReady
                      ? chips.map(name => <span key={name} className="chip">{name}</span>)
                      : <span className="chip" aria-hidden="true">…</span>}
                  </div>
                </div>
                <div>
                  <div className="label">Example Hives</div>
                  <div className="ex">
                    {activeCat.examples.map(ex => (
                      <div key={ex.name} className="ex-row"><span>{ex.name}</span><small>{ex.where}</small></div>
                    ))}
                  </div>
                </div>
                <div className="panel-foot">
                  <small>Owners can turn any of the {toolCount ?? '—'} tools on or off.</small>
                  <button
                    type="button"
                    className="btn-gold"
                    onClick={() => goToFindYourHive({ user, navigate, label: `Explore ${activeCat.short}`, category: activeCat.key, source: 'product' })}
                  >
                    Explore {activeCat.short} <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* TOOLS */}
        <section className="sec" style={{ background: '#050505' }}>
          <div className="wrap">
            <div className="sec-head">
              <div>
                <div className="eyebrow">Inside every Hive</div>
                <h2>Built for doing things, <em>not just talking about them.</em></h2>
              </div>
              <p className="lead">Every Hive gets the essentials. Then {toolCount ?? '—'} tools cover the rest of what groups actually do, from finding a time that works to splitting the bill after.</p>
            </div>

            <div className="tools-base">
              <div className="base"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z" /></svg><strong>Group chat</strong><span>Real-time rooms for the whole Hive, plus private chats when people pair up.</span></div>
              <div className="base"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8 9h8M8 13h8M8 17h5" /></svg><strong>Hive feed</strong><span>Posts, reactions and threaded comments, so news doesn’t get buried in chat.</span></div>
              <div className="base"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17M8.5 15l2 2 4-4" /></svg><strong>Plans &amp; RSVPs</strong><span>Suggest a plan, vote on it, and see who’s going, maybe or out.</span></div>
              <div className="base"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-1.5a7 7 0 0 1 14 0V21" /></svg><strong>Members &amp; roles</strong><span>Owners and admins run the Hive; everyone knows who’s who.</span></div>
            </div>

            <div className="tool-groups">
              {toolsReady ? groups.map(g => (
                <div className="tg" key={g.name}>
                  <h3>{g.name}</h3><p>{g.intro}</p>
                  {g.tools.map(t => (
                    <div className="tool" key={t.key}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">{TOOL_ICON[t.key] ?? DEFAULT_TOOL_ICON}</svg>
                      <div><strong>{t.name}</strong><span>{t.description}</span></div>
                    </div>
                  ))}
                </div>
              )) : <p className="lead" style={{ fontSize: 15 }}>{productInfoFailed ? '' : 'Loading tools…'}</p>}
            </div>
          </div>
        </section>

        {/* PAID HIVES */}
        <section className="sec paid" id="paid">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <div className="eyebrow dark">Paid Hives</div>
                <h2>Turn your community <em>into a membership.</em></h2>
              </div>
              <p className="lead">Most Hives are free, and always will be. When you’re ready to offer more, like workshops, coaching, resources or a members-only space, you can charge a monthly membership.</p>
            </div>

            <div className="paid-grid">
              <div>
                <div className="label" style={{ color: '#8a6116' }}>For owners · four steps</div>
                <div className="owner-steps">
                  <div className="ostep"><span className="step-no">01</span><div><h3>Get TrueHive Plus</h3><p>Paid Hives are part of <b>TrueHive Plus</b>. Plans and pricing live on the Subscriptions page.</p></div></div>
                  <div className="ostep"><span className="step-no">02</span><div><h3>Connect payouts with Stripe</h3><p>Stripe verifies your identity and pays out to your bank. TrueHive never sees a card number.</p></div></div>
                  <div className="ostep"><span className="step-no">03</span><div><h3>Set your price and your promise</h3><p>Choose a monthly price, then describe what members get and your cancellation terms, so everyone knows the deal before they pay.</p></div></div>
                  <div className="ostep"><span className="step-no">04</span><div><h3>Publish and grow</h3><p>Members join through Stripe’s secure checkout. You keep <b>{keepPercent != null ? `${keepPercent}%` : '…'}</b> of every membership, minus card processing.</p></div></div>
                </div>
              </div>

              <div className="calc" aria-label="Membership earnings estimator">
                <div className="label">Estimate your monthly earnings</div>
                <h3>What could your <em>Hive earn?</em></h3>
                <div className="calc-row">
                  <div className="calc-top"><label htmlFor="pp-price">Monthly price</label><output htmlFor="pp-price">${price}/mo</output></div>
                  <input id="pp-price" type="range" min="1" max="50" step="1" value={price} onInput={e => setPrice(Number(e.target.value))} onChange={e => setPrice(Number(e.target.value))} />
                </div>
                <div className="calc-row">
                  <div className="calc-top"><label htmlFor="pp-members">Paying members</label><output htmlFor="pp-members">{members}</output></div>
                  <input id="pp-members" type="range" min="5" max="200" step="1" value={members} onInput={e => setMembers(Number(e.target.value))} onChange={e => setMembers(Number(e.target.value))} />
                </div>
                <div className="ledger">
                  <div><span>Members pay</span><span>{money(gross)}</span></div>
                  <div><span>TrueHive fee ({feePercent ?? '…'}%)</span><span>− {fee != null ? money(fee) : '…'}</span></div>
                  <div><span>Card processing (est.)</span><span>− {money(stripeFee)}</span></div>
                  <div className="keep"><span>You keep ≈</span><strong>{keep != null ? money(keep) : '…'}</strong></div>
                </div>
                <p className="calc-note">Estimate per month. Card processing assumes Stripe’s standard U.S. rate (2.9% + 30¢ per charge); actual fees vary by card and country. Not a guarantee of earnings.</p>
              </div>
            </div>

            <div className="compare" role="table" aria-label="Free and Paid Hives compared">
              <div className="cmp-row" role="row"><div role="columnheader">&nbsp;</div><div role="columnheader">Free Hive</div><div role="columnheader">Paid Hive</div></div>
              <div className="cmp-row" role="row"><div role="rowheader">Cost to join</div><div role="cell">Free</div><div role="cell">Monthly membership, set by the owner</div></div>
              <div className="cmp-row" role="row"><div role="rowheader">Chat, feed, plans and all {toolCount ?? '—'} tools</div><div role="cell" className="yes">Included</div><div role="cell" className="yes">Included</div></div>
              <div className="cmp-row" role="row"><div role="rowheader">Members-only benefits</div><div role="cell">Not included</div><div role="cell" className="yes">Workshops, resources, sessions: your call</div></div>
              <div className="cmp-row" role="row"><div role="rowheader">Owner earns</div><div role="cell">Not applicable</div><div role="cell">{keepPercent != null ? `${keepPercent}%` : '…'} of each membership, minus card processing</div></div>
              <div className="cmp-row" role="row"><div role="rowheader">Who can create one</div><div role="cell">Anyone</div><div role="cell">TrueHive Plus members</div></div>
            </div>

            <div className="label" style={{ color: '#8a6116', marginTop: 64 }}>For members</div>
            <div className="members" style={{ marginTop: 0 }}>
              <div className="mem"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10.5h18M7 15h4" /></svg><strong>Secure checkout</strong><p>You pay through Stripe. TrueHive never stores your card details.</p></div>
              <div className="mem"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg><strong>In as soon as you’ve paid</strong><p>Your access starts the moment Stripe confirms your payment.</p></div>
              <div className="mem"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" /></svg><strong>Cancel anytime</strong><p>Stop renewing whenever you like and keep access until the end of the month you paid for. If a Hive closes, billing stops right away.</p></div>
            </div>
          </div>
        </section>

        {/* SAFETY */}
        <section className="sec" id="safety" style={{ background: '#0a0705' }}>
          <div className="wrap">
            <div className="sec-head">
              <div>
                <div className="eyebrow">Safety &amp; control</div>
                <h2>Small groups, <em>clear rules.</em></h2>
              </div>
              <p className="lead">Every Hive has an owner who decides who joins and how it runs, and everyone has the tools to step away from anyone, anytime.</p>
            </div>
            <div className="safe-grid">
              <div className="safe"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 20v-1.5a6 6 0 0 1 12 0V20M17 8h5M19.5 5.5v5" /></svg><strong>Join requests</strong><p>Owners review who wants in before welcoming them.</p></div>
              <div className="safe"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6.5v5.5c0 4.6 3.1 7.7 7.5 9.2 4.4-1.5 7.5-4.6 7.5-9.2V6.5L12 3Z" /></svg><strong>Owners &amp; admins</strong><p>Clear roles for the people who keep the Hive running well.</p></div>
              <div className="safe"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 .5c5-3 9 3 14 0v10c-5 3-9-3-14 0" /></svg><strong>Report &amp; block</strong><p>Report a person, post, message or Hive. Blocked users can’t see you, message you or be matched with you.</p></div>
              <div className="safe"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10.5" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></svg><strong>Adults only</strong><p>TrueHive is for people 18 and over, and you can delete your account whenever you want.</p></div>
            </div>
            <a href="/safety" style={{ display: 'inline-flex', marginTop: 30, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>Read our Safety Guidelines →</a>
          </div>
        </section>

        {/* FAQ */}
        <section className="sec" style={{ background: '#050505', paddingTop: 40 }}>
          <div className="wrap">
            <div className="eyebrow">Questions</div>
            <h2 style={{ fontSize: 'clamp(36px,4vw,54px)', margin: '20px 0 40px' }}>Good to know</h2>
            <div className="faq">
              <details open><summary>Is TrueHive free?</summary><p>Yes. Joining Hives and creating free Hives costs nothing. Paid Hives are optional memberships that individual owners choose to offer.</p></details>
              <details><summary>How does matching work?</summary><p>Every Hive gets one score built from two parts. Hive fit (60%) checks how well its purpose matches yours. People fit (40%) checks how well you match the members already in it. You see the score and the reasons behind it before you ask to join.</p></details>
              <details><summary>Does TrueHive use AI?</summary><p>Not yet, but it’s coming. AI will explain matches in plain language and help owners review join requests. It never decides who gets in: owners do. And it only reads what’s in profiles and join requests, never your private chats.</p></details>
              <details><summary>Can I be in more than one Hive?</summary><p>Yes. Most people mix a few: a social crew, a professional circle, a trip they’re planning.</p></details>
              <details><summary>Who can start a Paid Hive?</summary><p>Anyone with TrueHive Plus, once they’ve connected payouts through Stripe and described what members get.</p></details>
              <details><summary>What happens if I cancel a membership?</summary><p>It stops renewing and you keep access until the end of the period you already paid for. No surprise charges.</p></details>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="cta">
          <div className="wrap">
            <div className="eyebrow" style={{ justifyContent: 'center' }}>Your next chapter</div>
            <h2 style={{ margin: '22px auto 20px', maxWidth: 820 }}>Your people are out there. <em>Go find your Hive.</em></h2>
            <p className="lead" style={{ maxWidth: 560, margin: '0 auto' }}>It’s free to join, and the first Hive is usually the hardest one to find. We’ll help with that.</p>
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 14, marginTop: 36 }}>
              <button type="button" className="btn-gold" onClick={() => goToFindYourHive({ user, navigate, label: 'Find Your Hive', source: 'product' })}>
                Find Your Hive <span aria-hidden="true">→</span>
              </button>
              <button type="button" className="btn-ghost" onClick={() => navigate('/create-hive')}>Create a Hive</button>
            </div>
          </div>
        </section>

      </div>
      <SiteFooter />
    </>
  );
}
