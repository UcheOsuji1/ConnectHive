import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import '../styles/find-your-hive.css';

const HEX_DATA = [
  { id: 1, icon: '👥', name: 'Social Groups',  desc: 'Friends, hangouts & expanding your circle', count: '3,240 members' },
  { id: 2, icon: '💼', name: 'Professional',   desc: 'Network, mentors & career connections',      count: '2,810 members' },
  { id: 3, icon: '✈️', name: 'Travel Buddies', desc: 'Explore cities, trips & local adventures',  count: '1,920 members' },
  { id: 4, icon: '🚀', name: 'Project Collab', desc: 'Build startups, apps & creative work',       count: '2,140 members' },
  { id: 5, icon: '🎟️', name: 'Event Buddies',  desc: 'Concerts, conferences & campus events',      count: '1,650 members' },
  { id: 6, icon: '⭐', name: 'Specialized',    desc: 'Niche groups for specific purposes',         count: '980 members'   },
];

const PARTICLE_COLORS = ['#c49a28', '#e8c84a', '#f0d870', '#8a6510'];

function spawnParticles(el) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('div');
    const size = 4 + Math.random() * 5;
    const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const dist = 28 + Math.random() * 36;
    const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length];
    const duration = (0.7 + Math.random() * 0.5).toFixed(2);
    const px = cx + Math.cos(angle) * dist - size / 2;
    const py = cy + Math.sin(angle) * dist - size / 2;
    p.style.cssText =
      `position:fixed;pointer-events:none;border-radius:50%;` +
      `width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;` +
      `background:${color};left:${px.toFixed(1)}px;top:${py.toFixed(1)}px;` +
      `z-index:9999;animation:fyh-floatUp ${duration}s ease-out forwards;`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
}

function HexItem({ hex, isSelected, onToggle }) {
  const handleClick = (e) => {
    if (!isSelected) spawnParticles(e.currentTarget);
    onToggle(hex.name);
  };

  return (
    <div
      className={`fyh-hex-item${isSelected ? ' selected' : ''}`}
      onClick={handleClick}
    >
      <svg className="fyh-hex-bg-svg" viewBox="0 0 196 226" xmlns="http://www.w3.org/2000/svg">
        <polygon className="fyh-hex-shape" points="98,6 185,54 185,172 98,220 11,172 11,54" />
      </svg>
      <div className="fyh-hex-content">
        <div className="fyh-hex-icon-wrap">
          <div className="fyh-hex-icon-ring" />
          <div className="fyh-hex-icon-inner">{hex.icon}</div>
          <div className="fyh-hex-check">
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <div className="fyh-hex-name">{hex.name}</div>
        <div className="fyh-hex-desc">{hex.desc}</div>
        <div className="fyh-hex-count">{hex.count}</div>
      </div>
    </div>
  );
}

const STATS = [
  ['12k+', 'Members'],
  ['850+', 'Active Hives'],
  ['94%',  'Match Rate'],
  ['6',    'Categories'],
];

export default function FindYourHivePage() {
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();

  const toggleHex = useCallback((name) => {
    setSelected(prev => (prev === name ? null : name));
  }, []);

  const removeTag = () => setSelected(null);

  const CATEGORY_KEY = {
    'Social Groups':  'social',
    'Professional':   'professional',
    'Travel Buddies': 'travel',
    'Project Collab': 'project',
    'Event Buddies':  'event',
    'Specialized':    'specialized',
  };

  const findHive = () => {
    if (!selected) return;
    const key = CATEGORY_KEY[selected] ?? selected.toLowerCase().replace(/\s+/g, '-');
    navigate('/category-deep-dive', { state: { category: key } });
  };

  const browseAll = () => navigate('/hive-discovery');

  return (
    <div className="fyh-root">
      <Navbar />
      <div className="fyh-page-wrap">

        {/* ── Page Header ── */}
        <div className="fyh-page-header">
          <div className="fyh-eyebrow-row">
            <div className="fyh-eyebrow-line" />
            <span className="fyh-eyebrow-text">Discover</span>
            <div className="fyh-eyebrow-line" />
          </div>
          <h1 className="fyh-page-title">
            Choose your <em>purpose.</em>
          </h1>
          <p className="fyh-page-subtitle">
            Choose a Hive category. We&apos;ll match you with groups built around
            your goals, interests, and availability.
          </p>
        </div>

        {/* ── Stats Strip ── */}
        <div className="fyh-stats-strip">
          {STATS.map(([num, lbl]) => (
            <div key={lbl} className="fyh-stat-item">
              <span className="fyh-stat-number">{num}</span>
              <span className="fyh-stat-label">{lbl}</span>
            </div>
          ))}
        </div>

        {/* ── Hex Grid ── */}
        <div className="fyh-hex-scene">
          <div className="fyh-hex-row">
            {HEX_DATA.slice(0, 3).map(hex => (
              <HexItem
                key={hex.id}
                hex={hex}
                isSelected={selected === hex.name}
                onToggle={toggleHex}
              />
            ))}
          </div>
          <div className="fyh-hex-row fyh-hex-row-offset">
            {HEX_DATA.slice(3).map(hex => (
              <HexItem
                key={hex.id}
                hex={hex}
                isSelected={selected === hex.name}
                onToggle={toggleHex}
              />
            ))}
          </div>
        </div>

        {/* ── Selection Bar ── */}
        <div className="fyh-sel-bar">
          <div className="fyh-sel-bar-left">
            <div className="fyh-sel-label">Your selected categories</div>
            <div className="fyh-sel-tags">
              {!selected ? (
                <span className="fyh-sel-none">
                  No category selected — tap a hexagon above
                </span>
              ) : (
                <span className="fyh-sel-tag">
                  {selected}
                  <button className="fyh-sel-tag-x" onClick={removeTag}>×</button>
                </span>
              )}
            </div>
          </div>
          <button
            className="fyh-sel-btn"
            disabled={!selected}
            onClick={findHive}
          >
            Find My Hive →
          </button>
        </div>

        {/* ── Footer ── */}
        <div className="fyh-page-footer">
          Already know what you want?{' '}
          <button className="fyh-footer-link" onClick={browseAll}>
            Browse all Hives directly →
          </button>
        </div>

      </div>
    </div>
  );
}
