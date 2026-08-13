import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getInitials } from '../lib/initials.js';

function HiveAvatar({ hive }) {
  if (hive.logo_url) {
    return <img src={hive.logo_url} alt={hive.hive_name} className="shc-avatar-img" />;
  }
  return (
    <div className="shc-avatar-fallback">
      <span>{getInitials(hive.hive_name)}</span>
    </div>
  );
}

function HiveRow({ hive }) {
  const navigate = useNavigate();
  const [joinState, setJoinState] = useState(hive.request_pending ? 'pending' : 'idle');

  async function handleJoin(e) {
    e.stopPropagation();
    if (joinState !== 'idle') return;
    setJoinState('loading');
    try {
      const result = await api.post(`/api/hives/${hive.hive_id}/request`, {});
      setJoinState(result.joined ? 'joined' : 'pending');
    } catch {
      setJoinState('idle');
    }
  }

  const fit = Number.isFinite(hive.match_score) ? Math.round(hive.match_score) : null;

  return (
    <div className="shc-row" role="button" tabIndex={0} onClick={() => navigate(`/hive/${hive.hive_id}`)}>
      <HiveAvatar hive={hive} />
      <div className="shc-row-mid">
        <div className="shc-hive-name">{hive.hive_name}</div>
        <div className="shc-meta">
          {hive.category_name}{fit !== null ? ` · ${fit}% fit` : ''}
        </div>
      </div>
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
          {joinState === 'loading' ? '…' : 'Join'}
        </button>
      )}
    </div>
  );
}

export default function SuggestedHivesCard() {
  const [hives, setHives] = useState(null);

  useEffect(() => {
    api.post('/api/hives/match', {})
      .then(d => setHives((d.hives ?? []).slice(0, 2)))
      .catch(() => setHives([]));
  }, []);

  if (!hives || hives.length === 0) return null;

  return (
    <div className="home-card-shell">
      <div className="shc-header-row">
        <div className="home-card-label" style={{ marginBottom: 0 }}>You May Like</div>
        <Link to="/hive-discovery" className="shc-discover-link">Discover more →</Link>
      </div>
      <div className="shc-rows">
        {hives.map(hive => <HiveRow key={hive.hive_id} hive={hive} />)}
      </div>
    </div>
  );
}
