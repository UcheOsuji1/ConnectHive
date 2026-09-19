import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { getInitials } from '../lib/initials.js';
import { SKILL_CATS } from '../data/skillTaxonomy.js';
import { INTEREST_CATS } from '../data/interestTaxonomy.js';
import '../styles/profile-setup.css';
import TrueHiveMark from '../components/TrueHiveMark.jsx';
import TrueHiveWordmark from '../components/TrueHiveWordmark.jsx';

// ── Data ──────────────────────────────────────────────────────

// INTEREST_CATS imported from ../data/interestTaxonomy.js

const PURPOSE_CARDS = [
  { key: 'social',       emoji: '👥', name: 'Social Groups',    desc: 'Make friends and expand your circle.' },
  { key: 'professional', emoji: '💼', name: 'Professional',     desc: 'Meet people in your career field.' },
  { key: 'travel',       emoji: '✈️', name: 'Travel Buddies',   desc: 'Find people to explore with.' },
  { key: 'project',      emoji: '🚀', name: 'Project Collab',   desc: 'Build startups, apps, or creative work.' },
  { key: 'events',       emoji: '🎟️', name: 'Event Buddies',    desc: 'Attend concerts, conferences & more.' },
  { key: 'specialized',  emoji: '⭐', name: 'Specialized',      desc: 'Niche groups for specific purposes.' },
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
const AGE_CHIPS   = ['18–24','25–34','35–44','45–54','55+'];
const STEP_LABELS = ['About','Purpose','Interests','Skills','Vibe','Schedule'];
const FILL_PCT    = [0, 16, 33, 50, 66, 83, 100, 100];

// All chips across all categories (for suggestion search)
const ALL_INTEREST_CHIPS = INTEREST_CATS.flatMap(c => c.chips);
const ALL_SKILL_CHIPS    = SKILL_CATS.flatMap(c => c.chips);

// ── Utilities ─────────────────────────────────────────────────

function normalizeChip(s) {
  return s.trim().replace(/\s+/g, ' ').slice(0, 40);
}

function findSuggestions(input, allChips) {
  const q = normalizeChip(input).toLowerCase();
  if (q.length < 2) return [];
  return allChips.filter(c => c.toLowerCase().includes(q)).slice(0, 6);
}

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

function NavButtons({ step, onBack, onNext, isLast, saving, editMode }) {
  const nextLabel = saving ? 'Saving…'
    : isLast ? (editMode ? 'Save Changes →' : 'Find My Hive →')
    : 'Continue →';
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
        {nextLabel}
      </button>
    </div>
  );
}

function SectionSaveBar({ saving, saved, error, onSave }) {
  return (
    <div className="ps-section-save-bar">
      {error && <span className="ps-section-save-err">{error}</span>}
      {saved && !error && <span className="ps-section-save-ok">Saved ✓</span>}
      <button
        type="button"
        className="ps-section-save-btn"
        onClick={onSave}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

function Accordion({ cats, selected, onToggle, customChips, onAddCustom, onRemoveCustom, allChipsForSuggest }) {
  const [openKey, setOpenKey] = useState(null);
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  function handleInputChange(e) {
    const val = e.target.value;
    setInput(val);
    setSuggestions(findSuggestions(val, allChipsForSuggest));
  }

  function commitCustom(raw) {
    const chip = normalizeChip(raw);
    if (!chip) return;
    // If it matches an existing chip exactly (case-insensitive), find and select it
    const exactMatch = allChipsForSuggest.find(c => c.toLowerCase() === chip.toLowerCase());
    if (exactMatch) {
      // Find which cat it belongs to and toggle it
      for (const cat of cats) {
        if (cat.chips.includes(exactMatch)) {
          if (!(selected[cat.key] || []).includes(exactMatch)) {
            onToggle(cat.key, exactMatch);
          }
          break;
        }
      }
    } else {
      // Case-insensitive dedup against existing custom entries
      const isDup = customChips.some(c => c.toLowerCase() === chip.toLowerCase());
      // Also dedup against already-selected cat chips
      const alreadySelected = Object.values(selected).flat();
      const isDupSelected = alreadySelected.some(c => c.toLowerCase() === chip.toLowerCase());
      if (!isDup && !isDupSelected) {
        onAddCustom(chip);
      }
    }
    setInput('');
    setSuggestions([]);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitCustom(input); }
    if (e.key === 'Escape') { setInput(''); setSuggestions([]); }
  }

  function selectSuggestion(chip) {
    // Find its category and toggle it selected
    for (const cat of cats) {
      if (cat.chips.includes(chip)) {
        if (!(selected[cat.key] || []).includes(chip)) {
          onToggle(cat.key, chip);
        }
        break;
      }
    }
    setInput('');
    setSuggestions([]);
  }

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

      {/* Custom entries */}
      {customChips.length > 0 && (
        <div className="ps-custom-chips-row">
          <span className="ps-custom-chips-label">Your custom entries</span>
          <div className="ps-chips">
            {customChips.map(chip => (
              <button
                key={chip}
                type="button"
                className="ps-chip ps-chip-custom selected"
                onClick={() => onRemoveCustom(chip)}
              >
                {chip} ✕
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Free-text input */}
      <div className="ps-custom-input-wrap">
        <div className="ps-custom-input-row">
          <input
            type="text"
            className="ps-custom-input"
            placeholder="Add your own…"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            maxLength={50}
          />
          <button
            type="button"
            className="ps-custom-add-btn"
            onClick={() => commitCustom(input)}
            disabled={!normalizeChip(input)}
          >
            Add
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="ps-suggestions">
            {suggestions.map(s => (
              <button
                key={s}
                type="button"
                className="ps-suggestion-item"
                onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VibeGrid({ items, value, onChange, cols, multi }) {
  const isSelected = key => multi ? (Array.isArray(value) ? value.includes(key) : false) : value === key;
  const handleClick = key => {
    if (multi) {
      const arr = Array.isArray(value) ? value : [];
      onChange(arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key]);
    } else {
      onChange(value === key ? null : key);
    }
  };
  return (
    <div className="ps-vibe-grid" style={cols === 3 ? { gridTemplateColumns: 'repeat(3,1fr)' } : {}}>
      {items.map(item => (
        <div
          key={item.key}
          className={`ps-vibe-card${isSelected(item.key) ? ' selected' : ''}`}
          onClick={() => handleClick(item.key)}
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

function PrefGrid({ items, value, onChange, multi }) {
  const isSelected = key => multi ? (Array.isArray(value) ? value.includes(key) : false) : value === key;
  const handleClick = key => {
    if (multi) {
      const arr = Array.isArray(value) ? value : [];
      onChange(arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key]);
    } else {
      onChange(value === key ? null : key);
    }
  };
  return (
    <div className="ps-pref-grid">
      {items.map(item => (
        <div
          key={item.key}
          className={`ps-pref-card${isSelected(item.key) ? ' selected' : ''}`}
          onClick={() => handleClick(item.key)}
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
  const isSelected = c => multi ? (Array.isArray(value) ? value.includes(c) : false) : value === c;
  const toggle = c => multi
    ? onChange(Array.isArray(value) ? (value.includes(c) ? value.filter(v => v !== c) : [...value, c]) : [c])
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
            <TrueHiveMark size={44} />
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

        <p className="ps-celeb-subtext">You&apos;ve completed the full TrueHive screening. Your compatibility profile is built. Your Hives are waiting.</p>

        <div className="ps-celeb-badge">
          <span className="ps-celeb-badge-icon">🔐</span>
          <div>
            <strong className="ps-celeb-badge-title">Exclusive Hive Access Unlocked</strong>
            <span className="ps-celeb-badge-body">Only members who complete the full profile screening get matched with verified Hives. You made it.</span>
          </div>
        </div>

        <div className="ps-celeb-card">
          <div className="ps-celeb-card-glow" />
          <TrueHiveMark size={120} className="ps-celeb-card-wm" />
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
  const location = useLocation();
  const isEdit = location.pathname === '/profile/edit';
  const { refreshUser, user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user?.hasProfile && !isEdit) navigate('/find-your-hive', { replace: true });
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const [step, setStep] = useState(1);
  const [hydrating, setHydrating] = useState(false);

  // Step 1
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [form1, setForm1] = useState({ firstName: '', lastName: '', age: '', location: '', school: '', bio: '' });

  // Step 2
  const [purposes, setPurposes] = useState([]);

  // Step 3 — interests + custom entries
  const [interests, setInterests]             = useState({});
  const [customInterests, setCustomInterests] = useState([]);

  // Step 4 — skills + custom entries
  const [skills, setSkills]           = useState({});
  const [customSkills, setCustomSkills] = useState([]);

  // Step 5
  const [socialEnergy, setSocialEnergy] = useState(null);
  const [groupRole, setGroupRole]       = useState(null);
  const [commStyle, setCommStyle]       = useState(null);
  const [energyLevel, setEnergyLevel]   = useState(5);
  const [matters, setMatters]           = useState([]);

  // Step 6 — multi-select for commitment, ageRange
  // genderPref is preserved from the DB but no longer shown or edited in the UI
  const [genderPrefStored, setGenderPrefStored] = useState(undefined);
  const [availability, setAvailability] = useState([]);
  const [groupSize, setGroupSize]       = useState(null);
  const [meetPref, setMeetPref]         = useState(null);
  const [frequency, setFrequency]       = useState(null);
  const [commitment, setCommitment]     = useState([]);
  const [ageRange, setAgeRange]         = useState([]);

  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Per-section save state (edit mode only)
  const [sectionSaving, setSectionSaving] = useState(null);
  const [sectionSaved,  setSectionSaved]  = useState(null);
  const [sectionError,  setSectionError]  = useState(null);

  // In edit mode, fetch saved profile on mount and pre-fill all state.
  useEffect(() => {
    if (!isEdit) return;
    setHydrating(true);
    api.get('/api/users/profile')
      .then(data => {
        const p = data.profile;
        if (!p) return;
        const parts = (p.full_name || '').trim().split(/\s+/);
        setForm1({
          firstName: parts[0] || '',
          lastName:  parts.slice(1).join(' ') || '',
          age:       p.age != null ? String(p.age) : '',
          location:  p.location || '',
          school:    p.school_company || '',
          bio:       p.bio || '',
        });
        setPurposes(Array.isArray(p.connection_purposes) ? p.connection_purposes : []);

        // Interests: map recognized chips to category keys; anything else → custom
        const rawInterests = Array.isArray(p.interests) ? p.interests : [];
        const iMap = {};
        INTEREST_CATS.forEach(cat => {
          const m = rawInterests.filter(c => cat.chips.includes(c));
          if (m.length) iMap[cat.key] = m;
        });
        const knownInterestChips = ALL_INTEREST_CHIPS;
        setInterests(iMap);
        setCustomInterests(rawInterests.filter(c => !knownInterestChips.includes(c)));

        // Skills: map recognized chips to category keys; anything else → custom
        const rawSkills = Array.isArray(p.skills) ? p.skills : [];
        const sMap = {};
        SKILL_CATS.forEach(cat => {
          const m = rawSkills.filter(c => cat.chips.includes(c));
          if (m.length) sMap[cat.key] = m;
        });
        const knownSkillChips = ALL_SKILL_CHIPS;
        setSkills(sMap);
        setCustomSkills(rawSkills.filter(c => !knownSkillChips.includes(c)));

        const sp = p.social_preferences && typeof p.social_preferences === 'object'
          ? p.social_preferences : {};
        setSocialEnergy(sp.socialEnergy ?? null);
        setGroupRole(p.connection_preference ?? null);
        setCommStyle(sp.commStyle ?? null);
        setEnergyLevel(sp.energyLevel ?? 5);
        setMatters(Array.isArray(p.goals) ? p.goals : []);
        setAvailability(Array.isArray(p.availability) ? p.availability : []);
        setGroupSize(p.group_size_preference ?? null);
        setMeetPref(sp.meetPref ?? null);
        setFrequency(sp.frequency ?? null);

        // Multi-select fields: coerce old single-string values to arrays
        const toArr = v => Array.isArray(v) ? v : (v ? [v] : []);
        // Preserve stored genderPref without showing it in the UI
        if (sp.genderPref !== undefined) setGenderPrefStored(sp.genderPref);
        setCommitment(toArr(sp.commitment));
        setAgeRange(toArr(sp.ageRange));
      })
      .catch(() => {})
      .finally(() => setHydrating(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToSection = n => {
    const el = document.getElementById(`ps-s${n}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStep(n);
  };

  const goNext = () => setStep(s => Math.min(s + 1, 6));
  const goBack = () => setStep(s => Math.max(1, s - 1));

  const saveProfile = () => api.post('/api/users/profile/setup', {
    full_name:             [form1.firstName, form1.lastName].filter(Boolean).join(' ') || null,
    age:                   form1.age      || null,
    location:              form1.location || null,
    school_company:        form1.school   || null,
    bio:                   form1.bio      || null,
    profile_photo_url:     null,
    interests:             [...new Set([...Object.values(interests).flat(), ...customInterests])],
    skills:                [...new Set([...Object.values(skills).flat(),    ...customSkills])],
    goals:                 matters,
    availability,
    group_size_preference: groupSize,
    connection_preference: groupRole,
    connection_purposes:   purposes,
    social_preferences: {
      socialEnergy,
      commStyle,
      energyLevel,
      ...(genderPrefStored !== undefined ? { genderPref: genderPrefStored } : {}),
      meetPref,
      frequency,
      commitment,
      ageRange,
    },
  });

  // Wizard finish (step 6 → celebration)
  const handleFinish = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveProfile();
      await refreshUser();
      if (isEdit) {
        navigate('/profile');
      } else {
        setStep(7);
      }
    } catch (err) {
      setSaveError(err.data?.error ?? 'Failed to save profile — please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Per-section save (edit mode)
  const handleSaveSection = async n => {
    setSectionSaving(n);
    setSectionSaved(null);
    setSectionError(null);
    try {
      await saveProfile();
      setSectionSaved(n);
      setTimeout(() => setSectionSaved(s => s === n ? null : s), 2500);
    } catch (err) {
      setSectionError(err.data?.error ?? 'Failed to save — please try again.');
    } finally {
      setSectionSaving(null);
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
    return 'TrueHive Member';
  })();
  const tags      = [...Object.values(interests).flat(), ...customInterests, ...Object.values(skills).flat(), ...customSkills].slice(0, 6);
  const memberId  = user?.memberId || 'CHV-PENDING';
  const totalInterests = Object.values(interests).flat().length + customInterests.length;
  const totalSkills    = Object.values(skills).flat().length    + customSkills.length;

  if (hydrating) {
    return (
      <div className="ps-page">
        <div className="ps-topbar">
          <Link to="/" className="ps-brand"><TrueHiveMark size={28} /><TrueHiveWordmark variant="dark" className="th-wordmark--compact" /></Link>
        </div>
        <div className="ps-card" style={{ textAlign: 'center', padding: '60px 24px', color: '#8a7a5a' }}>
          Loading your profile…
        </div>
      </div>
    );
  }

  // In edit mode every section is visible; in wizard mode only the current step is.
  const show = n => isEdit || step === n;

  return (
    <div className="ps-page">

      {/* ── Top bar ── */}
      <div className="ps-topbar">
        <Link to="/" className="ps-brand">
          <TrueHiveMark size={28} />
          <TrueHiveWordmark variant="dark" className="th-wordmark--compact" />
        </Link>
        {isEdit
          ? <Link to="/profile" className="ps-skip">Cancel</Link>
          : <Link to="/find-your-hive" className="ps-skip">Skip for now →</Link>
        }
      </div>

      {/* ── Progress bar (hidden on completion) ── */}
      {step < 7 && (
        <div className="ps-progress">
          <div className="ps-step-labels">
            {STEP_LABELS.map((label, i) => (
              isEdit
                ? <button
                    key={label}
                    type="button"
                    className={`ps-step-label${step === i + 1 ? ' active' : step > i + 1 ? ' done' : ''}`}
                    onClick={() => scrollToSection(i + 1)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}
                  >
                    {label}
                  </button>
                : <span
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
      <div className={`ps-card${step === 7 ? ' ps-card-dark' : ''}${isEdit ? ' ps-card-edit' : ''}`}>

        {/* ══ STEP 1 — About You ══ */}
        {show(1) && (
          <div id="ps-s1" className={isEdit ? 'ps-edit-section' : ''}>
            {isEdit && <div className="ps-edit-section-title">About You</div>}
            {!isEdit && (
              <StepHeader
                n={1}
                title={<>Let's start with <em>you.</em></>}
                subtitle="The basics help us personalize your experience from day one."
              />
            )}

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

            {isEdit
              ? <SectionSaveBar
                  saving={sectionSaving === 1}
                  saved={sectionSaved === 1}
                  error={sectionSaving === null && sectionError && sectionSaved !== 1 ? sectionError : null}
                  onSave={() => handleSaveSection(1)}
                />
              : <NavButtons step={1} onBack={goBack} onNext={goNext} isLast={false} />
            }
          </div>
        )}

        {/* ══ STEP 2 — Purpose ══ */}
        {show(2) && (
          <div id="ps-s2" className={isEdit ? 'ps-edit-section' : ''}>
            {isEdit && <div className="ps-edit-section-title">Purpose</div>}
            {!isEdit && (
              <StepHeader
                n={2}
                title={<>What kind of <em>Hive</em> are you after?</>}
                subtitle="Select all that apply. This shapes which groups we recommend first."
              />
            )}
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
            {isEdit
              ? <SectionSaveBar
                  saving={sectionSaving === 2}
                  saved={sectionSaved === 2}
                  error={sectionSaving === null && sectionError && sectionSaved !== 2 ? sectionError : null}
                  onSave={() => handleSaveSection(2)}
                />
              : <NavButtons step={2} onBack={goBack} onNext={goNext} isLast={false} />
            }
          </div>
        )}

        {/* ══ STEP 3 — Interests ══ */}
        {show(3) && (
          <div id="ps-s3" className={isEdit ? 'ps-edit-section' : ''}>
            {isEdit && <div className="ps-edit-section-title">Interests</div>}
            {!isEdit && (
              <StepHeader
                n={3}
                title={<>What are you <em>into?</em></>}
                subtitle="Tap a category to expand it, then pick everything that fits. More selections = better matches."
              />
            )}
            <Accordion
              cats={INTEREST_CATS}
              selected={interests}
              onToggle={toggleCat(setInterests)}
              customChips={customInterests}
              onAddCustom={chip => setCustomInterests(prev => [...prev, chip])}
              onRemoveCustom={chip => setCustomInterests(prev => prev.filter(c => c !== chip))}
              allChipsForSuggest={ALL_INTEREST_CHIPS}
            />
            {isEdit
              ? <SectionSaveBar
                  saving={sectionSaving === 3}
                  saved={sectionSaved === 3}
                  error={sectionSaving === null && sectionError && sectionSaved !== 3 ? sectionError : null}
                  onSave={() => handleSaveSection(3)}
                />
              : <NavButtons step={3} onBack={goBack} onNext={goNext} isLast={false} />
            }
          </div>
        )}

        {/* ══ STEP 4 — Skills ══ */}
        {show(4) && (
          <div id="ps-s4" className={isEdit ? 'ps-edit-section' : ''}>
            {isEdit && <div className="ps-edit-section-title">Skills</div>}
            {!isEdit && (
              <StepHeader
                n={4}
                title={<>What do you <em>bring</em> to the table?</>}
                subtitle="Expand each skill area and go deep. This powers your Project Collaboration and Professional matches."
              />
            )}
            <Accordion
              cats={SKILL_CATS}
              selected={skills}
              onToggle={toggleCat(setSkills)}
              customChips={customSkills}
              onAddCustom={chip => setCustomSkills(prev => [...prev, chip])}
              onRemoveCustom={chip => setCustomSkills(prev => prev.filter(c => c !== chip))}
              allChipsForSuggest={ALL_SKILL_CHIPS}
            />
            {isEdit
              ? <SectionSaveBar
                  saving={sectionSaving === 4}
                  saved={sectionSaved === 4}
                  error={sectionSaving === null && sectionError && sectionSaved !== 4 ? sectionError : null}
                  onSave={() => handleSaveSection(4)}
                />
              : <NavButtons step={4} onBack={goBack} onNext={goNext} isLast={false} />
            }
          </div>
        )}

        {/* ══ STEP 5 — Vibe ══ */}
        {show(5) && (
          <div id="ps-s5" className={isEdit ? 'ps-edit-section' : ''}>
            {isEdit && <div className="ps-edit-section-title">Vibe</div>}
            {!isEdit && (
              <StepHeader
                n={5}
                title={<>What's your <em>vibe?</em></>}
                subtitle="The more you tell us, the better we match your energy with the right Hive culture."
              />
            )}

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

            {isEdit
              ? <SectionSaveBar
                  saving={sectionSaving === 5}
                  saved={sectionSaved === 5}
                  error={sectionSaving === null && sectionError && sectionSaved !== 5 ? sectionError : null}
                  onSave={() => handleSaveSection(5)}
                />
              : <NavButtons step={5} onBack={goBack} onNext={goNext} isLast={false} />
            }
          </div>
        )}

        {/* ══ STEP 6 — Schedule ══ */}
        {show(6) && (
          <div id="ps-s6" className={isEdit ? 'ps-edit-section' : ''}>
            {isEdit && <div className="ps-edit-section-title">Schedule &amp; Preferences</div>}
            {!isEdit && (
              <StepHeader
                n={6}
                title={<>Schedule & <em>group preferences.</em></>}
                subtitle="Help us match you with Hives that actually fit your life."
              />
            )}

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

            <SectionLabel>Where do you prefer to meet?</SectionLabel>
            <PrefGrid items={MEET_PREF} value={meetPref} onChange={setMeetPref} />

            <SectionLabel>How often do you want to connect with your Hive?</SectionLabel>
            <ChipRow chips={FREQ_CHIPS} value={frequency} onChange={setFrequency} multi={false} />

            <SectionLabel>Commitment level <span className="ps-multiselect-hint">(select all that apply)</span></SectionLabel>
            <VibeGrid items={COMMITMENT_CARDS} value={commitment} onChange={setCommitment} multi />

            <SectionLabel>Age range preference <span className="ps-multiselect-hint">(leave blank for no preference)</span></SectionLabel>
            <ChipRow chips={AGE_CHIPS} value={ageRange} onChange={setAgeRange} multi />

            {isEdit
              ? <SectionSaveBar
                  saving={sectionSaving === 6}
                  saved={sectionSaved === 6}
                  error={sectionSaving === null && sectionError && sectionSaved !== 6 ? sectionError : null}
                  onSave={() => handleSaveSection(6)}
                />
              : <>
                  {saveError && <p style={{ color: '#c0392b', fontSize: '0.85rem', marginTop: '0.5rem', textAlign: 'center' }}>{saveError}</p>}
                  <NavButtons step={6} onBack={goBack} onNext={handleFinish} isLast saving={saving} editMode={isEdit} />
                </>
            }
          </div>
        )}

        {/* ══ STEP 7 — Celebration (onboarding only) ══ */}
        {step === 7 && !isEdit && (
          <CelebrationScreen
            fullName={fullName}
            initials={initials}
            avatarPreview={avatarPreview}
            typeLine={typeLine}
            tags={tags}
            memberId={memberId}
            purposesCount={purposes.length}
            mattersCount={matters.length}
            interestsTotal={totalInterests}
            skillsTotal={totalSkills}
          />
        )}

      </div>
    </div>
  );
}
