import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { getInitials } from '../lib/initials.js';
import '../styles/profile-setup.css';

// ── Data ──────────────────────────────────────────────────────

const PURPOSE_CARDS = [
  { key: 'social',       emoji: '👥', name: 'Social Groups',    desc: 'Make friends and expand your circle.' },
  { key: 'professional', emoji: '💼', name: 'Professional',     desc: 'Meet people in your career field.' },
  { key: 'travel',       emoji: '✈️', name: 'Travel Buddies',   desc: 'Find people to explore with.' },
  { key: 'project',      emoji: '🚀', name: 'Project Collab',   desc: 'Build startups, apps, or creative work.' },
  { key: 'events',       emoji: '🎟️', name: 'Event Buddies',    desc: 'Attend concerts, conferences & more.' },
  { key: 'specialized',  emoji: '⭐', name: 'Specialized',      desc: 'Niche groups for specific purposes.' },
];

const INTEREST_CATS = [
  { key: 'fitness', emoji: '🏋️', name: 'Fitness & Health',  desc: 'What kind of fitness are you into?',
    chips: ['🏃 Running','🏋️ Weightlifting','🧘 Yoga','🥊 Boxing','🚴 Cycling','🏊 Swimming','💃 Dance Fitness','🥋 Martial Arts','⛹️ Calisthenics','🧗 Rock Climbing','🏃 HIIT','🏌️ Golf'] },
  { key: 'gaming',  emoji: '🎮', name: 'Gaming',             desc: 'What types of games do you play?',
    chips: ['🎯 FPS / Shooters','⚔️ RPGs','🏆 Competitive / Esports','🎲 Board Games','🃏 Card Games','🌍 Open World','👾 Indie Games','📱 Mobile Gaming','🕹️ Retro / Classic','🎮 Console Gaming','💻 PC Gaming','🌐 MMORPGs'] },
  { key: 'food',    emoji: '🍜', name: 'Food & Drink',       desc: "What's your relationship with food?",
    chips: ['🍱 Trying new cuisines','🍳 Home cooking','🥗 Healthy eating','🍕 Restaurant hopping','☕ Coffee culture','🍷 Wine & cocktails','🥘 Meal prepping','🌱 Plant-based','🍣 Sushi & Asian food','🧁 Baking & desserts','🌮 Street food','🫗 Mixology'] },
  { key: 'music',   emoji: '🎵', name: 'Music',              desc: 'What music moves you?',
    chips: ['🎤 Hip-Hop / Rap','🎸 Rock / Alternative','🎹 R&B / Soul','🎧 Electronic / EDM','🎻 Classical','🎷 Jazz','🌍 Afrobeats','💃 Latin / Reggaeton','🎵 Pop','🎸 Indie','🎤 Live concerts','🎼 Music production'] },
  { key: 'film',    emoji: '🎬', name: 'Film & TV',          desc: 'What do you love watching or making?',
    chips: ['🎬 Indie films','🦸 Action / Marvel','😂 Comedy','😱 Horror / Thriller','📺 Documentaries','🌸 Anime','🌍 International cinema','📽️ Filmmaking','✍️ Screenwriting','🎭 Drama / Theater','📱 Short-form content','🎥 Streaming culture'] },
  { key: 'tech',    emoji: '💻', name: 'Tech & Innovation',  desc: 'What areas of tech excite you?',
    chips: ['🤖 AI / Machine Learning','📱 Mobile Apps','🌐 Web Development','🔐 Cybersecurity','📊 Data Science','🚀 Startups','🕹️ Game Dev','⛓️ Blockchain / Web3','🤖 Robotics','☁️ Cloud / DevOps','🥽 AR / VR','🔬 Biotech'] },
  { key: 'sports',  emoji: '⚽', name: 'Sports',             desc: 'Do you play, watch, or both?',
    chips: ['🏀 Basketball','⚽ Soccer / Football','🏈 American Football','⚾ Baseball','🎾 Tennis','🏐 Volleyball','🏊 Swimming','🎽 Track & Field','🏒 Hockey','🏉 Rugby','🎱 Pool / Billiards','🏏 Cricket'] },
  { key: 'fashion', emoji: '👗', name: 'Fashion & Style',    desc: "What's your style scene?",
    chips: ['👟 Streetwear','👔 Business / Formal','🧥 Vintage / Thrift','👗 High Fashion','🌱 Sustainable fashion','💄 Beauty & Makeup','💅 Nail art','✂️ Styling / Wardrobe','📸 Fashion photography','🧵 DIY / Sewing'] },
  { key: 'art',     emoji: '🎨', name: 'Art & Creativity',   desc: 'How do you express yourself creatively?',
    chips: ['✏️ Drawing / Illustration','🖌️ Painting','🎭 Acting / Theater','💃 Dance','🖋️ Poetry / Writing','🎤 Spoken word','📸 Photography','🎬 Videography','🏺 Sculpture / Ceramics','🎨 Digital art','🖼️ Museum & gallery hopping','🎪 Improv / Comedy'] },
  { key: 'travel',  emoji: '✈️', name: 'Travel & Adventure', desc: 'What kind of explorer are you?',
    chips: ['🌍 International travel','🏙️ City exploration','🏕️ Camping','🥾 Hiking','🏖️ Beach trips','🍽️ Food tourism','🎒 Backpacking','🚗 Road trips','🧗 Adventure sports','📸 Travel photography'] },
];

const SKILL_CATS = [
  { key: 'coding',    emoji: '💻', name: 'Coding & Engineering', desc: 'What do you build or code?',
    chips: ['⚛️ React / Frontend','🐍 Python','☕ Java','📱 iOS / Swift','🤖 Android / Kotlin','🗄️ Backend / APIs','☁️ Cloud / AWS','🤖 AI / ML','🔐 Cybersecurity','🎮 Game Dev','⛓️ Blockchain','🗃️ Databases / SQL'] },
  { key: 'design',    emoji: '🎨', name: 'Design',               desc: 'What kind of design work do you do?',
    chips: ['🖥️ UI/UX Design','🖌️ Graphic Design','🎬 Motion Design','📦 Product Design','🏗️ Industrial Design','🏠 Interior Design','👗 Fashion Design','🖋️ Brand / Identity','🌐 Web Design','🖼️ Illustration','📐 Figma / Prototyping'] },
  { key: 'data',      emoji: '📊', name: 'Data & Analysis',      desc: 'How do you work with data?',
    chips: ['📈 Data Analysis','🤖 Machine Learning','📊 Data Visualization','🗃️ SQL / Databases','🐍 Python / Pandas','📉 Financial Modeling','🔬 Research','📋 Surveys / UX Research'] },
  { key: 'marketing', emoji: '📢', name: 'Marketing & Growth',   desc: 'How do you grow things?',
    chips: ['📱 Social Media Marketing','✍️ Content Marketing','🔍 SEO / SEM','📧 Email Marketing','🤝 Brand Partnerships','📊 Analytics / Growth','🎤 PR / Communications','💰 Paid Ads','🎥 Video Marketing','🌐 Community Building'] },
  { key: 'acting',    emoji: '🎭', name: 'Acting & Performance', desc: "What's your performance background?",
    chips: ['🎭 Stage Acting','🎬 Film / TV Acting','🎙️ Voice Acting','🎤 Hosting / MC','🎪 Improv','😂 Stand-up Comedy','💃 Dance Performance','🎶 Musical Theater','📹 Content Creation / UGC'] },
  { key: 'business',  emoji: '💼', name: 'Business & Leadership', desc: 'How do you lead and build?',
    chips: ['🚀 Entrepreneurship','📋 Project Management','🏆 Leadership','💰 Sales / Negotiation','📊 Business Strategy','💵 Finance / Investing','⚖️ Legal / Contracts','🤝 Operations','🗂️ Event Planning','🎤 Public Speaking'] },
  { key: 'content',   emoji: '🎬', name: 'Content & Media',      desc: 'What kind of content do you create?',
    chips: ['📹 Video Editing','🎙️ Podcasting','✍️ Copywriting','📸 Photography','🎵 Music Production','📱 Short-form video','🖥️ Streaming / Live','📝 Blogging / Journalism','📖 Screenwriting','🎨 Graphic creation'] },
];

const SOCIAL_ENERGY = [
  { key: 'introvert', emoji: '🌙', name: 'Mostly Introverted', desc: 'I recharge alone, connect deeply one-on-one.' },
  { key: 'extrovert', emoji: '☀️', name: 'Mostly Extroverted', desc: 'I thrive around people and group energy.' },
  { key: 'ambivert',  emoji: '⚡', name: 'Ambivert',           desc: 'I adapt — depends on the day and vibe.' },
  { key: 'online',    emoji: '🌐', name: 'Online Preferred',   desc: 'I connect best through screens and DMs.' },
];

const GROUP_ROLES = [
  { key: 'organizer',  emoji: '🧭', name: 'The Organizer',   desc: 'I plan things and keep the group moving.' },
  { key: 'idea',       emoji: '💡', name: 'The Idea Person', desc: 'I bring the concepts and creative energy.' },
  { key: 'builder',    emoji: '🛠️', name: 'The Builder',     desc: 'I execute and get things done quietly.' },
  { key: 'connector',  emoji: '🤝', name: 'The Connector',   desc: 'I bring people together and keep vibes high.' },
  { key: 'researcher', emoji: '📚', name: 'The Researcher',  desc: 'I dig deep and bring receipts to every convo.' },
  { key: 'wildcard',   emoji: '🎭', name: 'The Wildcard',    desc: 'I bring the unexpected energy nobody planned for.' },
];

const COMM_STYLES = [
  { key: 'always',   emoji: '💬', name: 'Always in the chat',  desc: 'I respond fast and stay engaged daily.' },
  { key: 'regular',  emoji: '📅', name: 'Check in regularly',  desc: 'A few times a week works for me.' },
  { key: 'matters',  emoji: '🔔', name: 'When it matters',     desc: 'I tune in for important moments and events.' },
  { key: 'inperson', emoji: '🎙️', name: 'In-person over text', desc: "I'd rather talk face to face than type." },
];

const MATTERS = [
  { key: 'goals',     emoji: '🎯', name: 'Shared Goals' },
  { key: 'vibes',     emoji: '😂', name: 'Good Vibes & Fun' },
  { key: 'growth',    emoji: '🌱', name: 'Personal Growth' },
  { key: 'account',   emoji: '🤝', name: 'Real Accountability' },
  { key: 'diversity', emoji: '🌍', name: 'Diversity of Thought' },
  { key: 'action',    emoji: '⚡', name: 'Action & Results' },
];

const SIZE_OPTIONS = [
  { key: 's', num: '3–5',  label: 'Small' },
  { key: 'm', num: '6–10', label: 'Medium' },
  { key: 'l', num: '11+',  label: 'Large' },
  { key: 'a', num: 'Any',  label: 'No Pref' },
];

const GENDER_PREF = [
  { key: 'coed',  emoji: '🌍',    name: 'Co-ed (Mixed)',      desc: 'Open to all genders — the more diverse the better.' },
  { key: 'same',  emoji: '🙋',    name: 'Same Gender',        desc: 'I prefer groups that are primarily my gender.' },
  { key: 'none',  emoji: '👤',    name: 'No Preference',      desc: "It doesn't matter — just match me well." },
  { key: 'lgbtq', emoji: '🏳️‍🌈', name: 'LGBTQ+ Inclusive',   desc: 'I want a space that is explicitly inclusive.' },
];

const MEET_PREF = [
  { key: 'online',   emoji: '🏠', name: 'Online Only',     desc: 'Video calls, chats, and virtual hangouts.' },
  { key: 'inperson', emoji: '📍', name: 'In-Person Only',  desc: 'Real meetups, local events, face-to-face.' },
  { key: 'hybrid',   emoji: '🔀', name: 'Hybrid',          desc: 'Mix of online and in-person depending on the plan.' },
  { key: 'global',   emoji: '🌍', name: 'Global / Remote', desc: "Location doesn't matter — connect worldwide." },
];

const COMMITMENT_CARDS = [
  { key: 'casual',  emoji: '🌊', name: 'Casual & Low-Key',    desc: 'Join when I can, no pressure or obligations.' },
  { key: 'regular', emoji: '📅', name: 'Consistent & Regular', desc: 'Show up reliably — I want real commitment.' },
  { key: 'high',    emoji: '🚀', name: 'High Commitment',      desc: "Fully in — let's build something serious together." },
  { key: 'depends', emoji: '🔀', name: 'Depends on the Hive',  desc: "I'll decide once I see what I'm joining." },
];

const AVAIL_CHIPS = ['Weekdays','Weekends','Mornings','Afternoons','Evenings','Late Nights','Flexible'];
const FREQ_CHIPS  = ['Daily','A few times a week','Weekly','Bi-weekly','Monthly','As needed'];
const AGE_CHIPS   = ['18–22','21–25','25–30','30–40','Any age'];
const STEP_LABELS = ['About','Purpose','Interests','Skills','Vibe','Schedule'];
const FILL_PCT    = [0, 16, 33, 50, 66, 83, 100, 100];

// ── Helper components ─────────────────────────────────────────

function StepHeader({ n, title, subtitle }) {
  return (
    <>
      <div className="ps-eyebrow">
        <div className="ps-eyebrow-dash" />
        <span className="ps-eyebrow-text">STEP {n} OF 6</span>
      </div>
      <h2 className="ps-title">{title}</h2>
      <p className="ps-subtitle">{subtitle}</p>
    </>
  );
}

function NavButtons({ step, onBack, onNext, isLast, saving }) {
  return (
    <div className="ps-nav">
      <button
        type="button"
        className="ps-btn-back"
        onClick={onBack}
        style={{ visibility: step === 1 ? 'hidden' : 'visible' }}
      >
        ← Back
      </button>
      <span className="ps-step-count">Step {step} of 6</span>
      <button type="button" className="ps-btn-next" onClick={onNext} disabled={saving}>
        {saving ? 'Saving…' : isLast ? 'Find My Hive →' : 'Continue →'}
      </button>
    </div>
  );
}

function Accordion({ cats, selected, onToggle }) {
  const [openKey, setOpenKey] = useState(null);
  return (
    <div className="ps-accordion">
      {cats.map(cat => {
        const isOpen = openKey === cat.key;
        const count  = (selected[cat.key] || []).length;
        return (
          <div key={cat.key}>
            <button
              type="button"
              className={`ps-acc-header${isOpen ? ' open' : ''}`}
              onClick={() => setOpenKey(isOpen ? null : cat.key)}
            >
              <div className="ps-acc-left">
                <span className="ps-acc-emoji">{cat.emoji}</span>
                <span className="ps-acc-name">{cat.name}</span>
                {count > 0 && <span className="ps-count-badge">{count}</span>}
              </div>
              <span className={`ps-acc-arrow${isOpen ? ' open' : ''}`}>▾</span>
            </button>
            {isOpen && (
              <div className="ps-acc-body">
                <p className="ps-acc-desc">{cat.desc}</p>
                <div className="ps-chips">
                  {cat.chips.map(chip => (
                    <button
                      key={chip}
                      type="button"
                      className={`ps-chip${(selected[cat.key] || []).includes(chip) ? ' selected' : ''}`}
                      onClick={() => onToggle(cat.key, chip)}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VibeGrid({ items, value, onChange, cols }) {
  return (
    <div className="ps-vibe-grid" style={cols === 3 ? { gridTemplateColumns: 'repeat(3,1fr)' } : {}}>
      {items.map(item => (
        <div
          key={item.key}
          className={`ps-vibe-card${value === item.key ? ' selected' : ''}`}
          onClick={() => onChange(value === item.key ? null : item.key)}
        >
          <div className="ps-vibe-icon">{item.emoji}</div>
          <div>
            <div className="ps-vibe-name">{item.name}</div>
            {item.desc && <div className="ps-vibe-desc">{item.desc}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PrefGrid({ items, value, onChange }) {
  return (
    <div className="ps-pref-grid">
      {items.map(item => (
        <div
          key={item.key}
          className={`ps-pref-card${value === item.key ? ' selected' : ''}`}
          onClick={() => onChange(value === item.key ? null : item.key)}
        >
          <span className="ps-pref-emoji">{item.emoji}</span>
          <div className="ps-pref-name">{item.name}</div>
          <div className="ps-pref-desc">{item.desc}</div>
        </div>
      ))}
    </div>
  );
}

function ChipRow({ chips, value, onChange, multi }) {
  const isSelected = c => multi ? value.includes(c) : value === c;
  const toggle = c => multi
    ? onChange(value.includes(c) ? value.filter(v => v !== c) : [...value, c])
    : onChange(value === c ? null : c);
  return (
    <div className="ps-chip-row">
      {chips.map(c => (
        <button
          key={c}
          type="button"
          className={`ps-avail-chip${isSelected(c) ? ' selected' : ''}`}
          onClick={() => toggle(c)}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function EnergySlider({ value, onChange }) {
  const pct = Math.round(((value - 1) / 9) * 100);
  return (
    <div className="ps-slider-wrap">
      <div className="ps-slider-labels">
        <span className="ps-slider-label-text">🧘 Very chill</span>
        <span className="ps-slider-label-text">🔥 High energy</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="ps-energy-slider"
        style={{ background: `linear-gradient(90deg, #c49a28 ${pct}%, #e8e0d0 ${pct}%)` }}
      />
    </div>
  );
}

function SectionLabel({ children }) {
  return <div className="ps-section-label">{children}</div>;
}

// ── Logo SVG (shared between TopBar and Completion) ───────────
const LogoSVG = ({ size = 28 }) => (
  <svg width={size} height={Math.round(size * 0.93)} viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="ps-lg1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#e8c84a"/>
        <stop offset="50%" stopColor="#c49a28"/>
        <stop offset="100%" stopColor="#8a6510"/>
      </linearGradient>
      <linearGradient id="ps-lg2" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#e8c84a"/>
        <stop offset="50%" stopColor="#c49a28"/>
        <stop offset="100%" stopColor="#8a6510"/>
      </linearGradient>
      <linearGradient id="ps-lg3" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#8a6510"/>
        <stop offset="50%" stopColor="#c49a28"/>
        <stop offset="100%" stopColor="#e8c84a"/>
      </linearGradient>
    </defs>
    <polygon points="60,2 88,18 88,48 60,64 32,48 32,18"     fill="none" stroke="url(#ps-lg1)" strokeWidth="9" strokeLinejoin="round"/>
    <polygon points="32,46 60,62 60,92 32,108 4,92 4,62"     fill="none" stroke="url(#ps-lg2)" strokeWidth="9" strokeLinejoin="round"/>
    <polygon points="88,46 116,62 116,92 88,108 60,92 60,62" fill="none" stroke="url(#ps-lg3)" strokeWidth="9" strokeLinejoin="round"/>
  </svg>
);

// ── CelebrationScreen ─────────────────────────────────────────
function CelebrationScreen({ fullName, initials, avatarPreview, typeLine, tags, memberId, purposesCount, mattersCount, interestsTotal, skillsTotal }) {
  const canvasRef = useRef(null);
  const [counts, setCounts] = useState({ interests: '0', skills: '0' });

  useEffect(() => {
    // Orbiting dots
    const orbitEl = document.getElementById('ps-orbit-dots');
    if (orbitEl) {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * 2 * Math.PI - Math.PI / 2;
        const x = 70 + 65 * Math.cos(angle);
        const y = 70 + 65 * Math.sin(angle);
        const dot = document.createElement('div');
        dot.style.cssText = `position:absolute;width:5px;height:5px;border-radius:50%;background:#c49a28;left:${(x-2.5).toFixed(1)}px;top:${(y-2.5).toFixed(1)}px;animation:ps-twinkle 2s ease-in-out infinite;animation-delay:${i*0.25}s`;
        orbitEl.appendChild(dot);
      }
    }

    // Confetti
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 700;
    canvas.height = canvas.offsetHeight || 600;
    const colors = ['#c49a28','#e8c84a','#8a6510','#faf8f4','#d4aa38'];
    const particles = [];
    let frame = 0, animId;
    const rnd = (a, b) => a + Math.random() * (b - a);
    function spawn() {
      particles.push({ x: Math.random()*canvas.width, y:-10, r:rnd(2,6),
        color:colors[Math.floor(Math.random()*colors.length)],
        vx:rnd(-1,1), vy:rnd(1,3), opacity:1,
        rotation:rnd(0,360), rotSpeed:rnd(-4,4),
        shape:Math.random()>0.5?'hex':'rect' });
    }
    function hexPath(c, r) {
      c.beginPath();
      for (let i=0;i<6;i++){const a=(Math.PI/3)*i-Math.PI/6;i===0?c.moveTo(r*Math.cos(a),r*Math.sin(a)):c.lineTo(r*Math.cos(a),r*Math.sin(a));}
      c.closePath(); c.fill();
    }
    function tick() {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      const n = frame<20?8:frame<80?3:0;
      for(let i=0;i<n;i++) spawn();
      frame++;
      for(let i=particles.length-1;i>=0;i--){
        const p=particles[i];
        p.x+=p.vx; p.y+=p.vy; p.opacity-=0.005; p.rotation+=p.rotSpeed;
        if(p.opacity<=0||p.y>canvas.height){particles.splice(i,1);continue;}
        ctx.save(); ctx.globalAlpha=p.opacity; ctx.fillStyle=p.color;
        ctx.translate(p.x,p.y); ctx.rotate(p.rotation*Math.PI/180);
        p.shape==='hex'?hexPath(ctx,p.r):ctx.fillRect(-p.r/2,-p.r*2,p.r,p.r*4);
        ctx.restore();
      }
      if(frame<80||particles.length>0) animId=requestAnimationFrame(tick);
    }
    animId = requestAnimationFrame(tick);

    // Counters
    const ease = t => 1 - Math.pow(1-t, 3);
    function countUp(key, target, suffix, duration) {
      let st = null;
      const step = ts => {
        if(!st) st=ts;
        const p = Math.min((ts-st)/duration, 1);
        setCounts(prev => ({...prev, [key]: Math.round(ease(p)*target)+suffix}));
        if(p<1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    const tid = setTimeout(() => {
      countUp('interests', interestsTotal, '', 1000);
      countUp('skills',    skillsTotal,    '',  900);
    }, 900);

    return () => { cancelAnimationFrame(animId); clearTimeout(tid); };
  }, []);

  return (
    <div className="ps-celeb">
      <canvas ref={canvasRef} className="ps-celeb-canvas" />
      <svg className="ps-celeb-hex-bg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="ps-hex-bg" x="0" y="0" width="32" height="54" patternUnits="userSpaceOnUse">
            <polygon points="16,0 32,9 32,27 16,36 0,27 0,9"      fill="none" stroke="#c49a28" strokeWidth="0.8"/>
            <polygon points="0,27 16,36 16,54 0,63 -16,54 -16,36" fill="none" stroke="#c49a28" strokeWidth="0.8"/>
            <polygon points="32,27 48,36 48,54 32,63 16,54 16,36" fill="none" stroke="#c49a28" strokeWidth="0.8"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ps-hex-bg)"/>
      </svg>
      <div className="ps-celeb-glow" />

      <div className="ps-celeb-content">

        <div className="ps-celeb-stamp">
          <span className="ps-celeb-stamp-dot" />
          <span className="ps-celeb-stamp-text">Profile Verified · Member Unlocked</span>
        </div>

        <div className="ps-celeb-ring-wrap">
          <div id="ps-orbit-dots" className="ps-celeb-orbit-dots" />
          <div className="ps-celeb-outer-ring" />
          <div className="ps-celeb-inner-circle">
            <svg width="44" height="40" viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ps-cl1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#e8c84a"/><stop offset="50%" stopColor="#c49a28"/><stop offset="100%" stopColor="#8a6510"/></linearGradient>
                <linearGradient id="ps-cl2" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#e8c84a"/><stop offset="50%" stopColor="#c49a28"/><stop offset="100%" stopColor="#8a6510"/></linearGradient>
                <linearGradient id="ps-cl3" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#8a6510"/><stop offset="50%" stopColor="#c49a28"/><stop offset="100%" stopColor="#e8c84a"/></linearGradient>
              </defs>
              <polygon points="60,2 88,18 88,48 60,64 32,48 32,18"     fill="none" stroke="url(#ps-cl1)" strokeWidth="9" strokeLinejoin="round"/>
              <polygon points="32,46 60,62 60,92 32,108 4,92 4,62"     fill="none" stroke="url(#ps-cl2)" strokeWidth="9" strokeLinejoin="round"/>
              <polygon points="88,46 116,62 116,92 88,108 60,92 60,62" fill="none" stroke="url(#ps-cl3)" strokeWidth="9" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="ps-celeb-sparkle" style={{top:'4px',right:'10px',animationDelay:'0s'}}>✦</span>
          <span className="ps-celeb-sparkle" style={{bottom:'6px',left:'8px',animationDelay:'0.7s'}}>✦</span>
          <span className="ps-celeb-sparkle" style={{top:'10px',left:'12px',animationDelay:'1.3s',fontSize:'8px'}}>✦</span>
        </div>

        <div className="ps-celeb-eyebrow">
          <div className="ps-celeb-eyebrow-line" />
          <span>Profile Complete</span>
          <div className="ps-celeb-eyebrow-line" />
        </div>

        <h2 className="ps-celeb-headline">You&apos;re <em>in.</em></h2>

        <p className="ps-celeb-subtext">You&apos;ve completed the full ConnectHive screening. Your compatibility profile is built. Your Hives are waiting.</p>

        <div className="ps-celeb-badge">
          <span className="ps-celeb-badge-icon">🔐</span>
          <div>
            <strong className="ps-celeb-badge-title">Exclusive Hive Access Unlocked</strong>
            <span className="ps-celeb-badge-body">Only members who complete the full profile screening get matched with verified Hives. You made it.</span>
          </div>
        </div>

        <div className="ps-celeb-card">
          <div className="ps-celeb-card-glow" />
          <svg className="ps-celeb-card-wm" width="120" viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg">
            <polygon points="60,2 88,18 88,48 60,64 32,48 32,18"     fill="none" stroke="#c49a28" strokeWidth="9" strokeLinejoin="round"/>
            <polygon points="32,46 60,62 60,92 32,108 4,92 4,62"     fill="none" stroke="#c49a28" strokeWidth="9" strokeLinejoin="round"/>
            <polygon points="88,46 116,62 116,92 88,108 60,92 60,62" fill="none" stroke="#c49a28" strokeWidth="9" strokeLinejoin="round"/>
          </svg>
          <div className="ps-celeb-card-top">
            <div className="ps-celeb-avatar">
              <div className="ps-celeb-avatar-ring" />
              {avatarPreview
                ? <img src={avatarPreview} alt={fullName} className="ps-celeb-avatar-img" style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} />
                : <span className="ps-celeb-initials">{initials}</span>}
            </div>
            <div className="ps-celeb-name-block">
              <div className="ps-celeb-name">{fullName}</div>
              <div className="ps-celeb-type">{typeLine}</div>
            </div>
          </div>
          <div className="ps-celeb-divider" />
          <div className="ps-celeb-tags">
            {tags.map((t, i) => (
              <span key={t + i} className={`ps-celeb-tag${i < 2 ? ' ps-celeb-tag-gold' : ''}`}>{t}</span>
            ))}
          </div>
          {/* Phase 5: swap stats 1–2 to real Match Score + Hives Found from matching results */}
          <div className="ps-celeb-stats">
            <div className="ps-celeb-stat"><span className="ps-celeb-stat-num">{purposesCount}</span><span className="ps-celeb-stat-lbl">Purposes Chosen</span></div>
            <div className="ps-celeb-stat"><span className="ps-celeb-stat-num">{mattersCount}</span><span className="ps-celeb-stat-lbl">Goals Set</span></div>
            <div className="ps-celeb-stat"><span className="ps-celeb-stat-num">100%</span><span className="ps-celeb-stat-lbl">Profile Complete</span></div>
          </div>
          <div className="ps-celeb-member-row">
            <span className="ps-celeb-member-lbl">Member ID</span>
            <span className="ps-celeb-member-val">{memberId}</span>
          </div>
        </div>

        <div className="ps-celeb-pills-row">
          <div className="ps-celeb-pill-card"><span className="ps-celeb-pill-num">6</span><span className="ps-celeb-pill-lbl">Steps Complete</span></div>
          <div className="ps-celeb-pill-card"><span className="ps-celeb-pill-num">{counts.interests}</span><span className="ps-celeb-pill-lbl">Interests Tagged</span></div>
          <div className="ps-celeb-pill-card"><span className="ps-celeb-pill-num">{counts.skills}</span><span className="ps-celeb-pill-lbl">Skills Logged</span></div>
        </div>

        <Link to="/find-your-hive" className="ps-celeb-cta">ENTER THE HIVE — SEE YOUR MATCHES →</Link>

      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function ProfileSetupPage() {
  const navigate = useNavigate();
  const { refreshUser, user } = useAuth();
  const [step, setStep] = useState(1);

  // Step 1
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [form1, setForm1] = useState({ firstName: '', lastName: '', age: '', location: '', school: '', bio: '' });

  // Step 2
  const [purposes, setPurposes] = useState([]);

  // Step 3
  const [interests, setInterests] = useState({});

  // Step 4
  const [skills, setSkills] = useState({});

  // Step 5
  const [socialEnergy, setSocialEnergy] = useState(null);
  const [groupRole, setGroupRole]       = useState(null);
  const [commStyle, setCommStyle]       = useState(null);
  const [energyLevel, setEnergyLevel]   = useState(5);
  const [matters, setMatters]           = useState([]);

  // Step 6
  const [availability, setAvailability] = useState([]);
  const [groupSize, setGroupSize]       = useState(null);
  const [genderPref, setGenderPref]     = useState(null);
  const [meetPref, setMeetPref]         = useState(null);
  const [frequency, setFrequency]       = useState(null);
  const [commitment, setCommitment]     = useState(null);
  const [ageRange, setAgeRange]         = useState(null);

  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState(null);

  const goNext = () => setStep(s => Math.min(s + 1, 6));
  const goBack = () => setStep(s => Math.max(1, s - 1));

  const handleFinish = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.post('/api/users/profile/setup', {
        full_name:             [form1.firstName, form1.lastName].filter(Boolean).join(' ') || null,
        age:                   form1.age      || null,
        location:              form1.location || null,
        school_company:        form1.school   || null,
        bio:                   form1.bio      || null,
        profile_photo_url:     null,
        interests:             Object.values(interests).flat(),
        skills:                Object.values(skills).flat(),
        goals:                 matters,
        availability,
        group_size_preference: groupSize,
        connection_preference: groupRole,
        connection_purposes:   purposes,
        social_preferences: {
          socialEnergy,
          commStyle,
          energyLevel,
          genderPref,
          meetPref,
          frequency,
          commitment,
          ageRange,
        },
      });
      await refreshUser();
      setStep(7);
    } catch (err) {
      setSaveError(err.data?.error ?? 'Failed to save profile — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const togglePurpose = key =>
    setPurposes(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key]);

  const toggleCat = setter => (catKey, chip) =>
    setter(prev => {
      const arr = prev[catKey] || [];
      return { ...prev, [catKey]: arr.includes(chip) ? arr.filter(c => c !== chip) : [...arr, chip] };
    });

  const toggleMatters = key =>
    setMatters(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key]);

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  const f1 = (field, val) => setForm1(p => ({ ...p, [field]: val }));

  // ── Celebration screen derivations ──────────────────────────
  const fullName  = `${form1.firstName} ${form1.lastName}`.trim() || 'New Member';
  const initials  = getInitials(fullName, user?.email);
  const typeLine  = (() => {
    const roleLabel    = groupRole    ? GROUP_ROLES.find(r => r.key === groupRole)?.name    : null;
    const purposeLabel = purposes[0] ? PURPOSE_CARDS.find(p => p.key === purposes[0])?.name : null;
    if (roleLabel && purposeLabel) return `${roleLabel} · ${purposeLabel}`;
    if (roleLabel)    return roleLabel;
    if (purposeLabel) return purposeLabel;
    return 'ConnectHive Member';
  })();
  const tags     = [...Object.values(interests).flat(), ...Object.values(skills).flat()].slice(0, 6);
  const memberId = user?.memberId || 'CHV-PENDING';

  return (
    <div className="ps-page">

      {/* ── Top bar ── */}
      <div className="ps-topbar">
        <Link to="/" className="ps-brand">
          <LogoSVG size={28} />
          <span className="ps-wordmark">CONNECTHIVE</span>
        </Link>
        <Link to="/find-your-hive" className="ps-skip">Skip for now →</Link>
      </div>

      {/* ── Progress bar (hidden on completion) ── */}
      {step < 7 && (
        <div className="ps-progress">
          <div className="ps-step-labels">
            {STEP_LABELS.map((label, i) => (
              <span
                key={label}
                className={`ps-step-label${step === i + 1 ? ' active' : step > i + 1 ? ' done' : ''}`}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="ps-track-wrap">
            <div className="ps-fill" style={{ width: `${FILL_PCT[step]}%` }} />
          </div>
        </div>
      )}

      {/* ── Card ── */}
      <div className={`ps-card${step === 7 ? ' ps-card-dark' : ''}`}>

        {/* ══ STEP 1 — About You ══ */}
        {step === 1 && (
          <>
            <StepHeader
              n={1}
              title={<>Let's start with <em>you.</em></>}
              subtitle="The basics help us personalize your experience from day one."
            />

            {/* Photo upload */}
            <div className="ps-photo-row">
              <input
                type="file"
                accept="image/jpeg,image/png"
                id="ps-photo-input"
                style={{ display: 'none' }}
                onChange={handlePhotoChange}
              />
              <label htmlFor="ps-photo-input" className="ps-avatar-circle">
                {avatarPreview
                  ? <img src={avatarPreview} alt="Profile" className="ps-avatar-img" />
                  : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c49a28" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4"/>
                      <path d="M20 21a8 8 0 1 0-16 0"/>
                    </svg>
                }
              </label>
              <div>
                <div className="ps-hint-bold">Add a profile photo</div>
                <div className="ps-hint-sub">Helps others recognize you in your Hive. JPG or PNG, max 5MB.</div>
              </div>
            </div>

            <div className="ps-row-2col">
              <div className="ps-field">
                <label className="ps-label">First Name</label>
                <input type="text" className="ps-input" placeholder="Jordan" value={form1.firstName} onChange={e => f1('firstName', e.target.value)}/>
              </div>
              <div className="ps-field">
                <label className="ps-label">Last Name</label>
                <input type="text" className="ps-input" placeholder="Blake" value={form1.lastName} onChange={e => f1('lastName', e.target.value)}/>
              </div>
            </div>

            <div className="ps-row-2col">
              <div className="ps-field">
                <label className="ps-label">Age</label>
                <input type="number" className="ps-input" placeholder="24" min="18" max="99" value={form1.age} onChange={e => f1('age', e.target.value)}/>
              </div>
              <div className="ps-field">
                <label className="ps-label">Location</label>
                <input type="text" className="ps-input" placeholder="Los Angeles, CA" value={form1.location} onChange={e => f1('location', e.target.value)}/>
              </div>
            </div>

            <div className="ps-field">
              <label className="ps-label">School or Company <span className="ps-label-opt">(optional)</span></label>
              <input type="text" className="ps-input" placeholder="UCLA / Google" value={form1.school} onChange={e => f1('school', e.target.value)}/>
            </div>

            <div className="ps-field">
              <label className="ps-label">Short Bio</label>
              <textarea
                className="ps-textarea"
                placeholder="I'm a CS student interested in AI, fitness, acting, and entrepreneurship. Looking to build and network."
                value={form1.bio}
                onChange={e => f1('bio', e.target.value)}
              />
            </div>

            <NavButtons step={1} onBack={goBack} onNext={goNext} isLast={false} />
          </>
        )}

        {/* ══ STEP 2 — Purpose ══ */}
        {step === 2 && (
          <>
            <StepHeader
              n={2}
              title={<>What kind of <em>Hive</em> are you after?</>}
              subtitle="Select all that apply. This shapes which groups we recommend first."
            />
            <div className="ps-purpose-grid">
              {PURPOSE_CARDS.map(card => (
                <div
                  key={card.key}
                  className={`ps-purpose-card${purposes.includes(card.key) ? ' selected' : ''}`}
                  onClick={() => togglePurpose(card.key)}
                >
                  <div className="ps-check-badge">
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                      <polyline points="1.5,5 4,7.5 8.5,2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="ps-purpose-emoji">{card.emoji}</span>
                  <div className="ps-purpose-name">{card.name}</div>
                  <div className="ps-purpose-desc">{card.desc}</div>
                </div>
              ))}
            </div>
            <NavButtons step={2} onBack={goBack} onNext={goNext} isLast={false} />
          </>
        )}

        {/* ══ STEP 3 — Interests ══ */}
        {step === 3 && (
          <>
            <StepHeader
              n={3}
              title={<>What are you <em>into?</em></>}
              subtitle="Tap a category to expand it, then pick everything that fits. More selections = better matches."
            />
            <Accordion
              cats={INTEREST_CATS}
              selected={interests}
              onToggle={toggleCat(setInterests)}
            />
            <NavButtons step={3} onBack={goBack} onNext={goNext} isLast={false} />
          </>
        )}

        {/* ══ STEP 4 — Skills ══ */}
        {step === 4 && (
          <>
            <StepHeader
              n={4}
              title={<>What do you <em>bring</em> to the table?</>}
              subtitle="Expand each skill area and go deep. This powers your Project Collaboration and Professional matches."
            />
            <Accordion
              cats={SKILL_CATS}
              selected={skills}
              onToggle={toggleCat(setSkills)}
            />
            <NavButtons step={4} onBack={goBack} onNext={goNext} isLast={false} />
          </>
        )}

        {/* ══ STEP 5 — Vibe ══ */}
        {step === 5 && (
          <>
            <StepHeader
              n={5}
              title={<>What's your <em>vibe?</em></>}
              subtitle="The more you tell us, the better we match your energy with the right Hive culture."
            />

            <SectionLabel>Your social energy</SectionLabel>
            <VibeGrid items={SOCIAL_ENERGY} value={socialEnergy} onChange={setSocialEnergy} />

            <SectionLabel>How you show up in a group</SectionLabel>
            <VibeGrid items={GROUP_ROLES} value={groupRole} onChange={setGroupRole} />

            <SectionLabel>Your communication style</SectionLabel>
            <VibeGrid items={COMM_STYLES} value={commStyle} onChange={setCommStyle} />

            <SectionLabel>Your energy level in a group setting</SectionLabel>
            <EnergySlider value={energyLevel} onChange={setEnergyLevel} />

            <SectionLabel>What matters most to you in a Hive?</SectionLabel>
            <div className="ps-matters-grid">
              {MATTERS.map(item => (
                <div
                  key={item.key}
                  className={`ps-matters-card${matters.includes(item.key) ? ' selected' : ''}`}
                  onClick={() => toggleMatters(item.key)}
                >
                  <span className="ps-matters-icon">{item.emoji}</span>
                  <span className="ps-matters-name">{item.name}</span>
                </div>
              ))}
            </div>

            <NavButtons step={5} onBack={goBack} onNext={goNext} isLast={false} />
          </>
        )}

        {/* ══ STEP 6 — Schedule ══ */}
        {step === 6 && (
          <>
            <StepHeader
              n={6}
              title={<>Schedule & <em>group preferences.</em></>}
              subtitle="Help us match you with Hives that actually fit your life."
            />

            <SectionLabel>When are you usually available?</SectionLabel>
            <ChipRow chips={AVAIL_CHIPS} value={availability} onChange={setAvailability} multi />

            <SectionLabel>Preferred group size</SectionLabel>
            <div className="ps-size-grid">
              {SIZE_OPTIONS.map(opt => (
                <div
                  key={opt.key}
                  className={`ps-size-card${groupSize === opt.key ? ' selected' : ''}`}
                  onClick={() => setGroupSize(groupSize === opt.key ? null : opt.key)}
                >
                  <span className="ps-size-num">{opt.num}</span>
                  <div className="ps-size-label">{opt.label}</div>
                </div>
              ))}
            </div>

            <SectionLabel>Group gender preference</SectionLabel>
            <PrefGrid items={GENDER_PREF} value={genderPref} onChange={setGenderPref} />

            <SectionLabel>Where do you prefer to meet?</SectionLabel>
            <PrefGrid items={MEET_PREF} value={meetPref} onChange={setMeetPref} />

            <SectionLabel>How often do you want to connect with your Hive?</SectionLabel>
            <ChipRow chips={FREQ_CHIPS} value={frequency} onChange={setFrequency} multi={false} />

            <SectionLabel>Commitment level</SectionLabel>
            <VibeGrid items={COMMITMENT_CARDS} value={commitment} onChange={setCommitment} />

            <SectionLabel>Age range preference for your Hive</SectionLabel>
            <ChipRow chips={AGE_CHIPS} value={ageRange} onChange={setAgeRange} multi={false} />

            {saveError && <p style={{ color: '#c0392b', fontSize: '0.85rem', marginTop: '0.5rem', textAlign: 'center' }}>{saveError}</p>}
            <NavButtons step={6} onBack={goBack} onNext={handleFinish} isLast saving={saving} />
          </>
        )}

        {/* ══ STEP 7 — Celebration ══ */}
        {step === 7 && (
          <CelebrationScreen
            fullName={fullName}
            initials={initials}
            avatarPreview={avatarPreview}
            typeLine={typeLine}
            tags={tags}
            memberId={memberId}
            purposesCount={purposes.length}
            mattersCount={matters.length}
            interestsTotal={Object.values(interests).flat().length}
            skillsTotal={Object.values(skills).flat().length}
          />
        )}

      </div>
    </div>
  );
}
