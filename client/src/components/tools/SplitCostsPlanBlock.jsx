import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';

function fmtMoney(cents, currency = 'USD') {
  return ((cents ?? 0) / 100).toLocaleString(undefined, { style: 'currency', currency });
}

// Plan page's Tools stack entry for Split costs (Prompt 62 Part 1) — shows
// the group already linked to this plan, or a CTA to start one.
export default function SplitCostsPlanBlock({ hiveId, postId, canCreate }) {
  const [groups, setGroups] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.get(`/api/hives/${hiveId}/tools/split_costs/groups?planPostId=${postId}`)
      .then(d => setGroups(d.groups)).catch(() => setGroups([]));
  }, [hiveId, postId]);
  useEffect(() => { load(); }, [load]);

  async function startGroup() {
    setCreating(true);
    try {
      await api.post(`/api/hives/${hiveId}/tools/split_costs/groups`, { title: 'Costs for this plan', planPostId: postId });
      load();
    } catch { /* surfaced by the group page itself once opened */ }
    finally { setCreating(false); }
  }

  if (groups === null) return null;

  return (
    <div className="pd-tool-block">
      <div className="pd-tool-block-title">Split costs</div>
      {groups.length === 0 ? (
        canCreate ? (
          <button type="button" className="pd-tool-cta" disabled={creating} onClick={startGroup}>
            {creating ? 'Starting…' : 'Start splitting costs for this plan'}
          </button>
        ) : (
          <p className="pd-tool-empty">No cost group for this plan yet.</p>
        )
      ) : (
        groups.map(g => (
          <Link key={g.group_id} to={`/hive/${hiveId}/tools/split_costs/${g.group_id}`} className="pd-tool-link">
            <span>{g.title}</span>
            <span className={g.your_balance_cents > 0 ? 'pd-tool-balance-owed' : g.your_balance_cents < 0 ? 'pd-tool-balance-owe' : 'pd-tool-balance-even'}>
              {g.your_balance_cents === 0 ? 'Settled' : g.your_balance_cents > 0 ? `+${fmtMoney(g.your_balance_cents, g.currency)}` : `-${fmtMoney(-g.your_balance_cents, g.currency)}`}
            </span>
          </Link>
        ))
      )}
    </div>
  );
}
