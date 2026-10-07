import { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import '../../styles/hive-tools-hub.css';

const ICON = {
  calendar: '📅', checkcircle: '✅', dollar: '💵', clipboard: '📋', doc: '📄',
  target: '🎯', coffee: '☕', mentor: '🧭', briefcase: '💼', tasks: '🗂️',
  map: '🗺️', car: '🚗', bulb: '💡',
};

function FindTimeCount({ hiveId }) {
  const [n, setN] = useState(null);
  useEffect(() => {
    api.get(`/api/hives/${hiveId}/tools/find_time/polls`)
      .then(d => setN((d.polls ?? []).filter(p => p.status === 'open').length))
      .catch(() => setN(null));
  }, [hiveId]);
  if (n === null) return null;
  return <span className="thub-tile-count">{n} open poll{n === 1 ? '' : 's'}</span>;
}

// A tool lives inside each plan's page rather than getting its own hub tile.
const PLAN_SCOPED_NO_TILE = new Set(['checkins', 'split_costs', 'signups', 'itinerary', 'rides']);

export default function HiveToolsHubPage() {
  const { hiveId, hiveTools } = useOutletContext();

  if (hiveTools === null) return <div className="thub-page"><div className="thub-skel" /></div>;

  const tiles = hiveTools.filter(t => t.enabled && !PLAN_SCOPED_NO_TILE.has(t.key));

  return (
    <div className="thub-page">
      <div className="thub-head">
        <h2 className="thub-title">Tools</h2>
        <p className="thub-sub">What this Hive uses to actually get things done.</p>
      </div>

      {tiles.length === 0 ? (
        <p className="thub-empty">No tools with their own page are on yet. An owner can turn some on from Manage Hive.</p>
      ) : (
        <div className="thub-grid">
          {tiles.map(t => (
            <Link key={t.key} to={`/hive/${hiveId}/tools/${t.key}`} className="thub-tile">
              <span className="thub-tile-icon" aria-hidden="true">{ICON[t.icon] ?? '🔧'}</span>
              <span className="thub-tile-name">{t.name}</span>
              <span className="thub-tile-desc">{t.description}</span>
              {t.key === 'find_time' && <FindTimeCount hiveId={hiveId} />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
