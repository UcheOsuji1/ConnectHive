import { query } from '../db/index.js';
export async function withPaidOffers(hives) {
  if (!hives.length) return hives;
  const ids = hives.map(h => h.hive_id).filter(Boolean);
  if (!ids.length) return hives;
  const { rows } = await query(`SELECT hive_id,state,monthly_price_cents,benefits,cancellation_policy FROM hive_monetization WHERE hive_id=ANY($1::uuid[])`, [ids]);
  const offers = new Map(rows.map(row => [row.hive_id,row]));
  return hives.map(h => ({ ...h, paid_membership: offers.get(h.hive_id) || null }));
}
