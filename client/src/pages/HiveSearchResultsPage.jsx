import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import HoneycombBg from '../components/HoneycombBg.jsx';
import { api } from '../lib/api.js';
import '../styles/hive-search.css';

export default function HiveSearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const query = params.get('q') ?? '';
  const [input, setInput] = useState(query);
  const [hives, setHives] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setInput(query);
    if (query.trim().length < 2) { setHives([]); setLoading(false); return; }
    let live = true;
    setLoading(true);
    api.get(`/api/hives/quickfind?q=${encodeURIComponent(query.trim())}`)
      .then(async ({ hives: found }) => {
        const enriched = await Promise.all((found ?? []).map(async h => {
          try {
            const d = await api.get(`/api/hives/${h.hive_id}`);
            return { ...h, ...d.hive };
          } catch { return h; }
        }));
        if (live) setHives(enriched);
      })
      .catch(() => live && setHives([]))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [query]);

  const submit = e => {
    e.preventDefault();
    const q = input.trim();
    if (q.length >= 2) setParams({ q });
  };

  return (
    <>
      <Navbar />
      <main className="hsr-page">
        <div className="hsr-inner">
          <div className="hsr-eyebrow">DISCOVER</div>
          <h1>Search <em>Hives.</em></h1>
          <p className="hsr-sub">Find a community by Hive name or TrueHive code.</p>

          <form className="hsr-search" onSubmit={submit}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
            <input value={input} onChange={e => setInput(e.target.value)} autoFocus placeholder="Search Hive name or TH- code" />
            <button type="submit" disabled={input.trim().length < 2}>Search</button>
          </form>

          <div className="hsr-head">
            <div><strong>{loading ? 'Searching…' : `${hives.length} result${hives.length === 1 ? '' : 's'}`}</strong>{query && <span> for “{query}”</span>}</div>
            <Link to="/find-your-hive">← Back to Find Your Hive</Link>
          </div>

          {!loading && hives.length === 0 && (
            <div className="hsr-empty">
              <h2>No Hives found.</h2>
              <p>Try another name or a full TH- code.</p>
            </div>
          )}

          <div className="hsr-grid">
            {hives.map(h => (
              <article className="hsr-card" key={h.hive_id}>
                <div className="hsr-media">
                  {h.banner_url ? <img src={h.banner_url} alt="" /> : <HoneycombBg id={`search-${h.hive_id}`} />}
                  <div className="hsr-logo">
                    {h.logo_url ? <img src={h.logo_url} alt="" /> : <span>{(h.hive_name || '?').slice(0,2).toUpperCase()}</span>}
                  </div>
                </div>
                <div className="hsr-body">
                  <div className="hsr-title-row"><h2>{h.hive_name}</h2><span>{h.hive_code}</span></div>
                  <div className="hsr-meta">{[h.category_name, h.location_type, h.location].filter(Boolean).join(' · ')}</div>
                  {h.description && <p>{h.description}</p>}
                  <div className="hsr-bottom">
                    {h.member_count != null && <span>{h.member_count} member{Number(h.member_count) === 1 ? '' : 's'}</span>}
                    <button onClick={() => navigate(`/hive/${h.hive_id}`)}>View Hive →</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
