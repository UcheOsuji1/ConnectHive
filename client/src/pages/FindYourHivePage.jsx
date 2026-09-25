import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../lib/api';
import '../styles/hive-discovery.css';
import '../styles/find-your-hive.css';

// ── Category data ────────────────────────────────────────────────────────────
// icon paths are reused verbatim from the reference mock (discover.html) —
// monoline, stroked in gold, viewBox 0 0 24 24.
const CATEGORIES = [
  {
    key: 'social', name: 'Social Groups', dbName: 'Social Groups',
    desc: 'Friends, hangouts and expanding your circle',
    icon: (
      <>
        <circle cx="9" cy="8" r="3.2" /><circle cx="16.5" cy="9.5" r="2.4" />
        <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        <path d="M15 14.2c2.6.2 4.5 2.1 4.5 4.8" />
      </>
    ),
  },
  {
    key: 'professional', name: 'Professional', dbName: 'Professional Networking',
    desc: 'Network, mentors and career connections',
    icon: (
      <>
        <rect x="3" y="7.5" width="18" height="12" rx="2" />
        <path d="M9 7.5V6a2 2 0 012-2h2a2 2 0 012 2v1.5" />
        <path d="M3 12.5h18" />
      </>
    ),
  },
  {
    key: 'travel', name: 'Travel Buddies', dbName: 'Travel Buddies',
    desc: 'Explore cities, trips and local adventures',
    icon: <path d="M3 13.5l18-6-3.5 9-4-2.5-2 4-1.5-5z" />,
  },
  {
    key: 'project', name: 'Project Collab', dbName: 'Project Collaboration',
    desc: 'Build startups, apps and creative work',
    icon: (
      <>
        <path d="M12 3c3.5 2.5 5 6 5 9.5L12 21l-5-8.5C7 9 8.5 5.5 12 3z" />
        <circle cx="12" cy="10.5" r="2" />
      </>
    ),
  },
  {
    key: 'event', name: 'Event Buddies', dbName: 'Event Buddies',
    desc: 'Concerts, conferences and campus events',
    icon: (
      <>
        <path d="M3 9.5a2 2 0 002-2h14a2 2 0 002 2v1a2 2 0 000 4v1a2 2 0 00-2 2H5a2 2 0 00-2-2v-1a2 2 0 000-4z" />
        <path d="M12 7.5v9" strokeDasharray="2 2" />
      </>
    ),
  },
  {
    key: 'specialized', name: 'Specialized', dbName: 'Specialized Groups',
    desc: 'Niche groups for specific purposes',
    icon: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.9 6.7 19.6l1.1-5.8L3.5 9.7l5.9-.8z" />,
  },
];

const CADENCE_LABELS = {
  daily: 'Daily', weekly: 'Weekly', biweekly: 'Biweekly',
  monthly: 'Monthly', flexible: 'Flexible',
};
const SIZE_LABELS = { small: 'Small (3–10)', medium: 'Medium (11–30)', large: 'Large (30+)' };
const CONN_LABELS = { online: 'Online', 'in-person': 'In-person', hybrid: 'Hybrid' };

// ── One hex cell ─────────────────────────────────────────────────────────────
// Rendered as a real <button> — not a div with an onClick — so Tab reaches it
// and Enter/Space activate it for free. No custom key handling needed.
function HexCell({ cat, index, isSelected, count, onToggle }) {
  return (
    <div className="cellw" style={{ '--i': index }}>
      <div className="hexpad">
        <button
          type="button"
          className={`hexout${isSelected ? ' on' : ''}`}
          onClick={() => onToggle(cat.name)}
          aria-pressed={isSelected}
        >
          <div className="hexin">
            {/*
              Category photo slot: Uche is adding these later. Drop an
              <img className="hex-photo" src={cat.photoUrl} alt="" /> here,
              directly above this comment and below nothing — it sits behind
              the .hex-scrim and the content below via z-index, and never
              touches .hexout/.hexin geometry (clip-path, size) at all.
            */}
            {cat.photoUrl && <img className="hex-photo" src={cat.photoUrl} alt="" />}
            {cat.photoUrl && <div className="hex-scrim" aria-hidden="true" />}
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">{cat.icon}</svg>
            <div className="nm">{cat.name}</div>
            <div className="ds">{cat.desc}</div>
            <div className="ct">{count === null ? '—' : count === 1 ? '1 HIVE' : `${count} HIVES`}</div>
          </div>
        </button>
      </div>
    </div>
  );
}

function Honeycomb({ rows, selected, counts, onToggle, startIndex = 0 }) {
  let i = startIndex;
  return (
    <>
      {rows.map((row, ri) => (
        <div className="crow" key={ri}>
          {row.map(cat => {
            const idx = i++;
            return (
              <HexCell
                key={cat.key}
                cat={cat}
                index={idx}
                isSelected={selected === cat.name}
                count={counts[cat.dbName] ?? null}
                onToggle={onToggle}
              />
            );
          })}
        </div>
      ))}
    </>
  );
}

// ── Quick find ───────────────────────────────────────────────────────────────
function QuickFind({ navigate }) {
  const [q, setQ]           = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { hives } = await api.get(`/api/hives/quickfind?q=${encodeURIComponent(q.trim())}`);
        setResults(hives);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const goTo = (hive) => {
    setOpen(false);
    setQ('');
    navigate(`/hive/${hive.hive_id}`);
  };

  return (
    <div className="card">
      <div className="lbl">QUICK FIND</div>
      <div className="qwrap" ref={wrapRef}>
        <div className="qf">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" /></svg>
          <input
            placeholder="Hive name or TH- code"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            aria-label="Search Hives by name or code"
          />
        </div>
        {open && q.trim().length >= 2 && (
          <div className="drop">
            {loading && <div className="dr-empty">Searching…</div>}
            {!loading && results.length === 0 && <div className="dr-empty">No Hives found.</div>}
            {!loading && results.map(h => (
              <div className="dr" key={h.hive_id} onClick={() => goTo(h)} role="button" tabIndex={0}
                   onKeyDown={(e) => e.key === 'Enter' && goTo(h)}>
                <div className="dhex" />
                <div>
                  <b>{h.hive_name}</b>
                  <span>{h.category_name || 'Hive'}{h.location ? ` · ${h.location}` : ''}</span>
                </div>
                <div className="dcode">{h.hive_code}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="hint">Go straight to a Hive you already know. To be matched, pick a purpose on the right.</p>
    </div>
  );
}

// ── Refine rail ──────────────────────────────────────────────────────────────
function RefineRail({ filters, setFilters, facets }) {
  const toggleMulti = (dim, value) => {
    setFilters(prev => {
      const cur = prev[dim];
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
      return { ...prev, [dim]: next };
    });
  };

  return (
    <div className="card">
      <div className="lbl">REFINE</div>

      <div className="fg">
        <h4>Location</h4>
        <select
          className="sel"
          value={filters.location}
          onChange={(e) => setFilters(prev => ({ ...prev, location: e.target.value }))}
        >
          <option value="">Anywhere</option>
          {facets.locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
        </select>
      </div>

      <div className="fg">
        <h4>Connection type</h4>
        {facets.connectionOptions.map(opt => (
          <label key={opt.value} className={`fo${opt.count === 0 ? ' off' : ''}`}>
            <input
              type="checkbox"
              disabled={opt.count === 0}
              checked={filters.connection.includes(opt.value)}
              onChange={() => toggleMulti('connection', opt.value)}
            />
            {CONN_LABELS[opt.value] ?? opt.value}
            <span className="n">{opt.count}</span>
          </label>
        ))}
      </div>

      <div className="fg">
        <h4>Group size</h4>
        {facets.sizeOptions.map(opt => (
          <label key={opt.value} className={`fo${opt.count === 0 ? ' off' : ''}`}>
            <input
              type="checkbox"
              disabled={opt.count === 0}
              checked={filters.groupSize.includes(opt.value)}
              onChange={() => toggleMulti('groupSize', opt.value)}
            />
            {SIZE_LABELS[opt.value] ?? opt.value}
            <span className="n">{opt.count}</span>
          </label>
        ))}
      </div>

      <div className="fg">
        <h4>Availability</h4>
        {facets.cadenceOptions.map(opt => (
          <label key={opt.value} className={`fo${opt.count === 0 ? ' off' : ''}`}>
            <input
              type="checkbox"
              disabled={opt.count === 0}
              checked={filters.cadence.includes(opt.value)}
              onChange={() => toggleMulti('cadence', opt.value)}
            />
            {CADENCE_LABELS[opt.value] ?? opt.value}
            <span className="n">{opt.count}</span>
          </label>
        ))}
        {facets.cadenceOptions.length === 0 && (
          <p className="hint" style={{ marginTop: 4 }}>No cadence data yet.</p>
        )}
      </div>
    </div>
  );
}

// ── Create a Hive card ───────────────────────────────────────────────────────
function CreateHiveCard({ navigate }) {
  return (
    <div className="card mk">
      <h4>Can&apos;t find the right Hive?</h4>
      <p>Create your own and build a community around your purpose.</p>
      <button type="button" className="mkbtn" onClick={() => navigate('/create-hive')}>
        Create a Hive →
      </button>
      <div className="mkart">
        <svg viewBox="0 0 48 48">
          <circle cx="24" cy="14" r="6" /><path d="M13 36c0-6 5-10.5 11-10.5S35 30 35 36" />
          <circle cx="9.5" cy="19" r="4.2" /><path d="M2.5 34c0-4.4 3.2-7.6 7-7.6" />
          <circle cx="38.5" cy="19" r="4.2" /><path d="M45.5 34c0-4.4-3.2-7.6-7-7.6" />
        </svg>
      </div>
    </div>
  );
}

// ── Might suit you ───────────────────────────────────────────────────────────
function SuggestCard({ hive, navigate }) {
  return (
    <div className="hmd-card fyh-suggest-card">
      <div className="hmd-card-head">
        <div className="hmd-card-title-row">
          <span className="hmd-hive-name">{hive.hive_name}</span>
          {hive.category_name && <span className="hmd-cat-badge">{hive.category_name}</span>}
        </div>
        <span className="hmd-score-pill">{hive.match_score}% Match</span>
      </div>
      <div className="hmd-stats">
        <span className="hmd-stat">{hive.member_count} member{hive.member_count === 1 ? '' : 's'}</span>
        {hive.location && <span className="hmd-stat">{hive.location}</span>}
      </div>
      {hive.reasons?.[0] && <div className="why">{hive.reasons[0]}</div>}
      {Array.isArray(hive.tags) && hive.tags.length > 0 && (
        <div className="hmd-tags">
          {hive.tags.slice(0, 3).map((t, i) => <span key={i} className="hmd-tag">{t}</span>)}
        </div>
      )}
      <div className="fyh-suggest-row">
        <button type="button" className="fyh-suggest-view" onClick={() => navigate(`/hive/${hive.hive_id}`)}>
          View
        </button>
      </div>
    </div>
  );
}

function MightSuitYou({ navigate }) {
  const [hives, setHives]     = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { hives: h } = await api.get('/api/hives/suggestions');
      setHives(h);
    } catch {
      setHives([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!loading && hives.length === 0) return null;

  return (
    <section className="sugg">
      <div className="shead">
        <h2>Might suit <em>you.</em></h2>
        <button type="button" className="reshuffle" onClick={load}>&#8635; Show me others</button>
      </div>
      <p className="sub">Drawn from your profile alone — no category needed.</p>
      <div className="grid3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="hmd-card fyh-suggest-skel" />)
          : hives.map(h => <SuggestCard key={h.hive_id} hive={h} navigate={navigate} />)}
      </div>
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function FindYourHivePage() {
  const [selected, setSelected] = useState(null);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [filters, setFilters] = useState({ location: '', connection: [], groupSize: [], cadence: [] });
  const [facets, setFacets] = useState({ locations: [], connectionOptions: [], sizeOptions: [], cadenceOptions: [] });
  const [refineOpen, setRefineOpen] = useState(false); // mobile accordion
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/hives/category-counts')
      .then(({ counts }) => {
        const map = {};
        counts.forEach(c => { map[c.category_name] = c.hive_count; });
        setCategoryCounts(map);
      })
      .catch(() => setCategoryCounts({}));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.location) params.set('location', filters.location);
    if (filters.connection.length) params.set('connection', filters.connection.join(','));
    if (filters.groupSize.length) params.set('groupSize', filters.groupSize.join(','));
    if (filters.cadence.length) params.set('cadence', filters.cadence.join(','));
    api.get(`/api/hives/filter-facets?${params.toString()}`)
      .then(setFacets)
      .catch(() => {});
  }, [filters]);

  const toggleHex = useCallback((name) => {
    setSelected(prev => (prev === name ? null : name));
  }, []);

  const removeTag = () => setSelected(null);

  const CATEGORY_KEY = useMemo(() => Object.fromEntries(CATEGORIES.map(c => [c.name, c.key])), []);

  const findHive = () => {
    if (!selected) return;
    const key = CATEGORY_KEY[selected] ?? selected.toLowerCase().replace(/\s+/g, '-');
    navigate('/category-deep-dive', { state: { category: key } });
  };

  const desktopRows = [CATEGORIES.slice(0, 3), CATEGORIES.slice(3, 6)];
  const mobileRows   = [CATEGORIES.slice(0, 2), CATEGORIES.slice(2, 4), CATEGORIES.slice(4, 6)];

  return (
    <div className="fyh-root">
      <Navbar />
      <div className="shell">

        {/* ── Mobile-only quick find (full width, ahead of everything) ── */}
        <div className="fyh-mobile-only fyh-quickfind-wrap">
          <QuickFind navigate={navigate} />
        </div>

        <aside className="side">
          <div className="fyh-desktop-only">
            <QuickFind navigate={navigate} />
          </div>

          {/* Refine — plain card on desktop, collapsed accordion on mobile */}
          <div className="fyh-desktop-only">
            <RefineRail filters={filters} setFilters={setFilters} facets={facets} />
          </div>
          <div className="fyh-mobile-only fyh-accordion">
            <button type="button" className="fyh-accordion-head" onClick={() => setRefineOpen(v => !v)}
                    aria-expanded={refineOpen}>
              Refine <span>{refineOpen ? '−' : '+'}</span>
            </button>
            {refineOpen && <RefineRail filters={filters} setFilters={setFilters} facets={facets} />}
          </div>

          <div className="fyh-create-wrap">
            <CreateHiveCard navigate={navigate} />
          </div>
        </aside>

        <main className="main">
          <div className="fyh-title-block">
            <div className="eyebrow">DISCOVER</div>
            <h1>Choose your <em>purpose.</em></h1>
            <p className="lede">
              Pick a category and we&apos;ll match you to groups built around your goals, interests and availability.
            </p>
          </div>

          <div className="comb fyh-desktop-only">
            <Honeycomb rows={desktopRows} selected={selected} counts={categoryCounts} onToggle={toggleHex} />
          </div>
          <div className="comb fyh-comb-mobile fyh-mobile-only">
            <Honeycomb rows={mobileRows} selected={selected} counts={categoryCounts} onToggle={toggleHex} />
          </div>

          <div className="selbar">
            <div>
              <div className="lb">YOUR SELECTED CATEGORY</div>
              {!selected
                ? <span className="fyh-sel-none">No category selected — tap a hexagon above</span>
                : <span className="chip">{selected}<button className="fyh-sel-x" onClick={removeTag} aria-label="Clear selection">×</button></span>}
            </div>
            <button type="button" className="go" disabled={!selected} onClick={findHive}>
              FIND MY HIVE →
            </button>
          </div>

          <MightSuitYou navigate={navigate} />

          <div className="fyh-page-footer">
            Already know what you want?{' '}
            <button className="fyh-footer-link" onClick={() => navigate('/hive-discovery')}>
              Browse all Hives directly →
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
