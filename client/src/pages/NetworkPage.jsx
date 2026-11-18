import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar.jsx';
import FollowPersonButton from '../components/FollowPersonButton.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/home-redesign.css';
import '../styles/network.css';

// /network (Prompt 87): Connections / Followers / Following, driven by ?tab=.
// Not in the mockups: the Home th-panel look with the Messages page's row
// styling. Connections come automatically from shared Hives; follow is
// one-way and fills the Home feed.
const TABS = [
  { key: 'connections', label: 'Connections', empty: 'No connections yet. You connect automatically with people in your Hives.' },
  { key: 'followers',   label: 'Followers',   empty: 'No followers yet.' },
  { key: 'following',   label: 'Following',   empty: "You're not following anyone yet." },
];

export default function NetworkPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab') : 'connections';
  const q = params.get('q') ?? '';
  const [draft, setDraft] = useState(q);
  const [people, setPeople] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  const endpoint = useMemo(() => {
    if (tab === 'connections') return `/api/users/me/connections?q=${encodeURIComponent(q)}`;
    return `/api/users/${user?.userId}/${tab}?`;
  }, [tab, q, user?.userId]);

  useEffect(() => { setDraft(q); }, [q]);

  useEffect(() => {
    if (!user?.userId) return undefined;
    let cancelled = false;
    setPeople(null); setError('');
    api.get(endpoint)
      .then(d => { if (!cancelled) { setPeople(d.people ?? []); setHasMore(!!d.has_more); } })
      .catch(() => { if (!cancelled) { setPeople([]); setError('This list could not load. Try again.'); } });
    return () => { cancelled = true; };
  }, [endpoint, user?.userId]);

  // Debounced search into ?q= (Connections only).
  useEffect(() => {
    if (tab !== 'connections' || draft === q) return undefined;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (draft.trim()) next.set('q', draft.trim()); else next.delete('q');
      setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  async function more() {
    const sep = endpoint.includes('?') ? '&' : '?';
    const d = await api.get(`${endpoint}${sep}offset=${people.length}`).catch(() => null);
    if (d) { setPeople(prev => [...prev, ...(d.people ?? [])]); setHasMore(!!d.has_more); }
  }

  function setTab(key) {
    const next = new URLSearchParams();
    next.set('tab', key);
    setParams(next);
  }

  const current = TABS.find(t => t.key === tab);
  return (
    <>
      <Navbar />
      <main className="nw-page">
        <section className="th-panel nw-panel">
          <h1 className="nw-title">Your network</h1>
          <p className="nw-sub">Connections come automatically from shared Hives. Follow is what fills your feed.</p>
          <div className="nw-tabs" role="tablist" aria-label="Network">
            {TABS.map(t => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                      className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>
          {tab === 'connections' && (
            <input className="nw-search" placeholder="Search your connections" value={draft}
                   onChange={e => setDraft(e.target.value)} aria-label="Search your connections" />
          )}
          {error && <p className="nw-muted" role="alert">{error}</p>}
          {people === null ? <p className="nw-muted">Loading…</p>
            : people.length === 0 ? <p className="nw-empty">{q ? 'No matches.' : current.empty}</p>
            : (
              <ul className="nw-list" role="list">
                {people.map(person => (
                  <li key={person.user_id}>
                    <Link to={person.is_me ? '/profile' : `/profile/${person.user_id}`} className="nw-row">
                      <Avatar name={person.full_name} src={person.profile_photo_url} size={42} />
                      <span className="nw-row-body">
                        <span className="nw-row-name">{person.full_name ?? 'Member'}</span>
                        {person.headline && <span className="nw-row-meta">{person.headline}</span>}
                        {tab === 'connections' && <span className="nw-row-meta">{person.via ? `via ${person.via}` : 'Connected'}</span>}
                      </span>
                      {!person.is_me && (
                        <FollowPersonButton
                          userId={person.user_id}
                          following={!!person.is_following}
                          size="sm"
                          onChange={next => setPeople(list => list.map(x => x.user_id === person.user_id ? { ...x, is_following: next } : x))}
                        />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          {hasMore && <button type="button" className="th-outline nw-more" onClick={more}>Show more</button>}
        </section>
      </main>
    </>
  );
}
