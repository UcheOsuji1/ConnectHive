import { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import '../../styles/hive-rides.css';

function fmtPlanDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Tools -> Rides overview (Prompt 66 Part 2) — every upcoming plan with ride
// activity, grouped by plan. The actual board (offer/request/confirm) lives
// on each plan's own page via RidesPlanBlock; this is a directory to it.
export default function HiveRidesPage() {
  const { hiveId } = useOutletContext() ?? {};
  const [plans, setPlans] = useState(null);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/tools/rides/overview`).then(d => setPlans(d.plans ?? [])).catch(() => setPlans([]));
  }, [hiveId]);

  if (plans === null) return <div className="rd-page"><div className="rd-skel" /></div>;

  return (
    <div className="rd-page">
      <div className="rd-head">
        <h2 className="rd-title">Ride board</h2>
        <p className="rd-sub">Coordinate who is driving and who needs a seat, plan by plan.</p>
      </div>

      {plans.length === 0 ? (
        <p className="rd-empty">No rides posted yet. Offer or request a ride from any upcoming plan's page.</p>
      ) : (
        <div className="rd-plan-group">
          {plans.map(p => (
            <Link key={p.post_id} to={`/hive/${hiveId}/events/${p.post_id}`} className="rd-plan-head">
              <div>
                <h3 className="rd-plan-title">{p.headline}</h3>
                <p className="rd-plan-meta">{fmtPlanDate(p.event_at)}{p.event_location ? ` · ${p.event_location}` : ''}</p>
              </div>
              <span className="rd-plan-counts">
                {p.offer_count} offer{p.offer_count === 1 ? '' : 's'} · {p.request_count} request{p.request_count === 1 ? '' : 's'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
