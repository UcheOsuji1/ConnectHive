import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../lib/api.js';
import '../styles/search.css';

function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" />
    </svg>
  );
}

export default function SearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';

  const [term, setTerm]       = useState(q);
  const [hives, setHives]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => { setTerm(q); }, [q]);

  useEffect(() => {
    if (q.trim().length < 2) { setHives([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get(`/api/hives/quickfind?q=${encodeURIComponent(q.trim())}&limit=50`)
      .then(d => { if (!cancelled) setHives(d.hives ?? []); })
      .catch(e => { if (!cancelled) setError(e.data?.error ?? 'Search failed. Try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [q]);

  const submit = (e) => {
    e.preventDefault();
    const t = term.trim();
    if (t.length < 2) return;
    setParams({ q: t });
  };

  return (
    <>
      <Navbar />
      <div className="sr-page">
        <div className="sr-inner">

          <div className="sr-eyebrow">Search</div>
          <h1 className="sr-title">
            {q.trim() ? <>Results for <em>{q.trim()}</em></> : 'Find a Hive'}
          </h1>

          <form className="sr-form" onSubmit={submit} role="search">
            <div className="sr-field">
              <SearchIcon />
              <input
                value={term}
                onChange={e => setTerm(e.target.value)}
                placeholder="Hive name or TH- code"
                aria-label="Search Hives by name or code"
              />
            </div>
            <button type="submit" className="sr-submit">Search</button>
          </form>

          {loading && <div className="sr-note">Searching…</div>}

          {!loading && error && <div className="sr-note sr-note--error">{error}</div>}

          {!loading && !error && q.trim().length < 2 && (
            <div className="sr-note">Type at least two characters to search.</div>
          )}

          {!loading && !error && q.trim().length >= 2 && hives.length === 0 && (
            <div className="sr-empty">
              <div className="sr-empty-title">No Hives match “{q.trim()}”.</div>
              <p className="sr-empty-sub">
                Private Hives only appear when you search their exact TH- code.
              </p>
              <Link to="/find-your-hive" className="sr-empty-btn">Browse by purpose →</Link>
            </div>
          )}

          {!loading && !error && hives.length > 0 && (
            <>
              <div className="sr-count">
                {hives.length} Hive{hives.length === 1 ? '' : 's'} found
              </div>
              <ul className="sr-list" role="list">
                {hives.map(h => {
                  const meta = [
                    h.category_name,
                    h.location_type
                      ? h.location_type.charAt(0).toUpperCase() + h.location_type.slice(1)
                      : null,
                    h.location,
                  ].filter(Boolean).join(' · ');
                  const members = Number(h.member_count ?? 0);
                  return (
                    <li key={h.hive_id}>
                      <Link to={`/hive/${h.hive_id}`} className="sr-card">
                        <span className="sr-thumb" aria-hidden="true">
                          {(h.logo_url || h.banner_url)
                            ? <img src={h.logo_url || h.banner_url} alt="" />
                            : initials(h.hive_name)}
                        </span>
                        <span className="sr-body">
                          <span className="sr-name">{h.hive_name}</span>
                          {meta && <span className="sr-meta">{meta}</span>}
                          {h.description && <span className="sr-desc">{h.description}</span>}
                          <span className="sr-facts">
                            {members} member{members === 1 ? '' : 's'}
                            {h.join_policy ? ` · ${h.join_policy} to join` : ''}
                          </span>
                        </span>
                        <span className="sr-code">{h.hive_code}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <button type="button" className="sr-back" onClick={() => navigate('/find-your-hive')}>
            ← Back to Find Your Hive
          </button>

        </div>
      </div>
    </>
  );
}
