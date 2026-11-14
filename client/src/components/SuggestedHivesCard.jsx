import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getInitials } from '../lib/initials.js';

function HiveAvatar({ hive }) {
  if (hive.logo_url) {
    return <img src={hive.logo_url} alt={hive.hive_name} className="shc-avatar-img" loading="lazy" />;
  }
  return (
    <div className="shc-avatar-fallback">
      <span>{getInitials(hive.hive_name)}</span>
    </div>
  );
}

function HiveRow({ hive }) {
  const [joinState, setJoinState] = useState(hive.request_pending ? 'pending' : 'idle');
  const [joinError, setJoinError] = useState(null);

  async function handleJoin(e) {
    e.stopPropagation();
    if (joinState !== 'idle') return;
    setJoinState('loading');
    setJoinError(null);
    try {
      const result = await api.post(`/api/hives/${hive.hive_id}/request`, {});
      setJoinState(result.joined ? 'joined' : 'pending');
    } catch (err) {
      setJoinError(err.data?.error ?? 'Something went wrong.');
      setJoinState('idle');
    }
  }

  const fit = Number.isFinite(hive.match_score) ? Math.round(hive.match_score) : null;

  return (
    <div className="shc-row">
      <HiveAvatar hive={hive} />
      <div className="shc-row-mid">
        <Link to={`/hive/${hive.hive_id}`} className="shc-hive-name">{hive.hive_name}</Link>
        <div className="shc-meta">
          {hive.category_name}
        </div>
        <div className="shc-meta">{hive.member_count != null ? `${hive.member_count} members` : ''}{hive.location ? ` · ${hive.location}` : ''}</div>
        {joinError && <div className="shc-join-error">{joinError}</div>}
      </div>
      {fit !== null && <div className="th-match-ring" style={{ '--match': `${Math.max(0, Math.min(100, fit))}%` }} aria-label={`${fit}% compatibility`}><strong>{fit}%</strong><small>match</small></div>}
      {joinState === 'joined' ? (
        <button type="button" className="shc-join-btn shc-join-btn--done" disabled>Joined</button>
      ) : joinState === 'pending' ? (
        <button type="button" className="shc-join-btn shc-join-btn--done" disabled>Requested</button>
      ) : (
        <button
          type="button"
          className="shc-join-btn"
          disabled={joinState === 'loading'}
          onClick={handleJoin}
        >
          {joinState === 'loading' ? '…' : hive.join_policy === 'request' ? 'Request' : 'Join →'}
        </button>
      )}
    </div>
  );
}

export default function SuggestedHivesCard() {
  const [hives, setHives] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.post('/api/hives/match', {})
      .then(d => setHives((d.hives ?? []).slice(0, 3)))
      .catch(() => { setHives([]); setError(true); });
  }, []);


  return (
    <div className="home-card-shell">
      <div className="shc-header-row">
        <div className="home-card-label" style={{ marginBottom: 0 }}>Recommended Hives for You</div>
        <Link to="/hive-discovery" className="shc-discover-link">Discover more →</Link>
      </div>
      <div className="shc-rows">
        {hives === null ? <p role="status">Finding your matches…</p> : hives.length ? hives.map(hive => <HiveRow key={hive.hive_id} hive={hive} />) : <p>{error ? 'Recommendations could not load. Please refresh to try again.' : 'Complete your profile to discover Hives that fit your interests.'}</p>}
      </div>
    </div>
  );
}
