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

// "$84 owed to you" style live count (Prompt 62 Part 1) — sums every group's
// your_balance_cents the viewer is owed, across the whole Hive.
function SplitCostsCount({ hiveId }) {
  const [text, setText] = useState(null);
  useEffect(() => {
    api.get(`/api/hives/${hiveId}/tools/split_costs/groups`)
      .then(d => {
        const owed = (d.groups ?? []).reduce((n, g) => n + Math.max(0, g.your_balance_cents), 0);
        setText(owed > 0 ? `$${(owed / 100).toFixed(2)} owed to you` : 'All settled');
      })
      .catch(() => setText(null));
  }, [hiveId]);
  if (text === null) return null;
  return <span className="thub-tile-count">{text}</span>;
}

function SignupsCount({ hiveId }) {
  const [n, setN] = useState(null);
  useEffect(() => {
    api.get(`/api/hives/${hiveId}/tools/signups/lists`)
      .then(d => setN((d.lists ?? []).reduce((sum, l) => sum + Math.max(0, l.total_slots - l.claimed_slots), 0)))
      .catch(() => setN(null));
  }, [hiveId]);
  if (n === null) return null;
  return <span className="thub-tile-count">{n} open slot{n === 1 ? '' : 's'}</span>;
}

function DocsCount({ hiveId }) {
  const [n, setN] = useState(null);
  useEffect(() => {
    api.get(`/api/hives/${hiveId}/tools/docs/docs`)
      .then(d => setN((d.docs ?? []).length))
      .catch(() => setN(null));
  }, [hiveId]);
  if (n === null) return null;
  return <span className="thub-tile-count">{n} doc{n === 1 ? '' : 's'}</span>;
}

function GoalsCount({ hiveId }) {
  const [text, setText] = useState(null);
  useEffect(() => {
    api.get(`/api/hives/${hiveId}/tools/goals/goals`)
      .then(d => {
        const active = (d.goals ?? []).filter(g => !g.completed_at && !g.archived_at);
        setText(active.length === 0 ? null : `${active.length} active`);
      })
      .catch(() => setText(null));
  }, [hiveId]);
  if (text === null) return null;
  return <span className="thub-tile-count">{text}</span>;
}

const TILE_COUNT = { find_time: FindTimeCount, split_costs: SplitCostsCount, signups: SignupsCount, docs: DocsCount, goals: GoalsCount };

// A tool lives inside each plan's page rather than getting its own hub tile.
const PLAN_SCOPED_NO_TILE = new Set(['checkins', 'itinerary', 'rides']);

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
              {(() => { const Count = TILE_COUNT[t.key]; return Count ? <Count hiveId={hiveId} /> : null; })()}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
