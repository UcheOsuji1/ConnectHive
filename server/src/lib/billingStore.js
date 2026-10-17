import { query, getClient } from '../db/index.js';
import { BILLING_DELETE_MESSAGE } from './billingPolicy.js';

export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export async function transaction(fn) {
  const db = await getClient();
  try { await db.query('BEGIN'); const value = await fn(db); await db.query('COMMIT'); return value; }
  catch (e) { await db.query('ROLLBACK'); throw e; }
  finally { db.release(); }
}
// Shared lock order: users (sorted UUIDs), Hive, subscription. Never hold a task
// row lock across Stripe calls; queue claims use expiring leases instead.
export async function lockSubscription(db,id) {
  const {rows:[ref]}=await db.query(`SELECT s.user_id,s.hive_id,m.owner_id FROM billing_subscriptions s
    LEFT JOIN hive_monetization m ON m.hive_id=s.hive_id WHERE s.id=$1`,[id]);
  if(!ref)fail('Subscription not found.',404);
  const users=[...new Set([ref.user_id,ref.owner_id].filter(Boolean))].sort();
  await db.query('SELECT user_id FROM users WHERE user_id=ANY($1::uuid[]) ORDER BY user_id FOR UPDATE',[users]);
  if(ref.hive_id)await db.query('SELECT hive_id FROM hives WHERE hive_id=$1 FOR UPDATE',[ref.hive_id]);
  return (await db.query('SELECT * FROM billing_subscriptions WHERE id=$1 FOR UPDATE',[id])).rows[0];
}
export async function hasPlus(userId, db = { query }) {
  return (await db.query('SELECT billing_has_plus($1) AS plus', [userId])).rows[0].plus;
}
export async function requireOwner(hiveId, userId, db = { query }) {
  const { rows: [hive] } = await db.query(`SELECT h.* FROM hives h JOIN hive_members hm USING(hive_id)
    WHERE h.hive_id=$1 AND hm.user_id=$2 AND hm.role='owner' AND hm.membership_status='active'`, [hiveId, userId]);
  if (!hive) fail('Hive not found or ownership required.', 404);
  return hive;
}
export async function audit(db, actor, hive, action, detail = {}) {
  await db.query('INSERT INTO billing_audit(actor_id,hive_id,action,detail) VALUES($1,$2,$3,$4)', [actor, hive, action, JSON.stringify(detail)]);
}
export async function financialBlockers(userId, db = { query }) {
  const { rows } = await db.query(`SELECT DISTINCT m.hive_id,h.hive_name FROM hive_monetization m JOIN hives h USING(hive_id)
    WHERE m.owner_id=$1 AND (m.state <> 'closed'
      OR EXISTS(SELECT 1 FROM billing_subscriptions s WHERE s.hive_id=m.hive_id AND
        (s.access_until>NOW() OR s.status NOT IN ('canceled','expired','incomplete_expired','refunded')))
      OR EXISTS(SELECT 1 FROM billing_disputes d JOIN billing_subscriptions s ON s.id=d.subscription_id WHERE s.hive_id=m.hive_id AND d.status NOT IN ('won','lost','warning_closed'))
      OR EXISTS(SELECT 1 FROM billing_tasks t JOIN billing_subscriptions s ON s.id=t.subscription_id WHERE s.hive_id=m.hive_id AND t.done_at IS NULL)
      OR EXISTS(SELECT 1 FROM billing_refunds r JOIN billing_subscriptions s ON s.id=r.subscription_id WHERE s.hive_id=m.hive_id AND r.status IN ('pending','requires_action'))
      OR EXISTS(SELECT 1 FROM billing_refund_requests r JOIN billing_subscriptions s ON s.id=r.subscription_id WHERE s.hive_id=m.hive_id AND r.state='requested')
      OR (EXISTS(SELECT 1 FROM billing_invoices i JOIN billing_subscriptions s ON s.id=i.subscription_id WHERE s.hive_id=m.hive_id)
        AND NOT EXISTS(SELECT 1 FROM billing_accounts a WHERE a.user_id=m.owner_id AND a.payouts_resolved)))`, [userId]);
  return rows;
}
export async function assertNoFinancialBlockers(userId, db) {
  if ((await financialBlockers(userId, db)).length) fail(BILLING_DELETE_MESSAGE, 409);
  // A deleting member must end all recurring products first; no orphaned future charges.
  const { rows } = await db.query(`SELECT 1 FROM billing_subscriptions WHERE user_id=$1 AND
    status NOT IN ('canceled','expired','incomplete_expired','refunded') AND NOT cancel_at_period_end`, [userId]);
  if (rows.length) fail('Cancel your subscriptions in Billing & Subscriptions before deleting your account.', 409);
}
export async function expireEntitlements(userId) {
  // Never restore a removed/left membership here. Only invoice verification admits members.
  const { rows } = await query(`UPDATE hive_members hm SET membership_status='expired'
    WHERE hm.role <> 'owner' AND hm.membership_status='active' AND ($1::uuid IS NULL OR hm.user_id=$1)
      AND EXISTS(SELECT 1 FROM hive_monetization m WHERE m.hive_id=hm.hive_id)
      AND NOT EXISTS(SELECT 1 FROM billing_subscriptions s WHERE s.hive_id=hm.hive_id AND s.user_id=hm.user_id
        AND s.access_until>NOW() AND NOT s.access_revoked)
    RETURNING hm.user_id,hm.hive_id`, [userId || null]);
  return rows;
}
