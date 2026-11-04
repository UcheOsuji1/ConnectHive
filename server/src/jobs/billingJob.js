import { randomUUID } from 'node:crypto';
import { reportProblem } from '../lib/reportProblem.js';
import { query } from '../db/index.js';
import { stripe, stripeOptions } from '../lib/stripe.js';
import { transaction, expireEntitlements, lockSubscription } from '../lib/billingStore.js';
import { reconcileSubscription, processEvent } from '../lib/billingEvents.js';
import { drainBillingInbox } from '../lib/billingInbox.js';
import { disconnectUserSockets } from '../realtime/socket.js';
import {recordDispute} from '../lib/disputeAccounting.js';

export async function reconcileUnknownDisputeBalances(sdk=stripe()) {
 const {rows}=await query(`SELECT s.id,d.stripe_dispute_id FROM billing_disputes d JOIN billing_subscriptions s ON s.id=d.subscription_id
  WHERE d.balance_checked_at IS NULL ORDER BY d.updated_at LIMIT 20`);
 for(const row of rows)try{await transaction(async db=>{const local=await lockSubscription(db,row.id);const dispute=await sdk.disputes.retrieve(row.stripe_dispute_id,{},stripeOptions(local.stripe_account_id));await recordDispute(db,local,dispute);});}
 catch(error){reportProblem('[billing/job] dispute balance needs reconciliation',{disputeId:row.stripe_dispute_id,code:error.code||'stripe_error'});}
 return rows.length;
}

export async function processCancellationTasks(sdk = stripe(), limit=100) {
  const token=randomUUID();
  const {rows:tasks}=await query(`UPDATE billing_tasks SET claim_token=$1,lease_until=NOW()+INTERVAL '5 minutes',attempts=attempts+1
    WHERE id IN (SELECT id FROM billing_tasks WHERE done_at IS NULL AND next_attempt_at<=NOW()
      AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT $2)
    RETURNING id,subscription_id`,[token,Math.min(100,Math.max(1,limit))]);
  for(const task of tasks) {
    try {
      const {rows:[sub]}=await query('SELECT * FROM billing_subscriptions WHERE id=$1',[task.subscription_id]);
      if(!sub?.stripe_subscription_id)throw Object.assign(new Error('Awaiting subscription binding'),{code:'awaiting_binding'});
      const live=await sdk.subscriptions.retrieve(sub.stripe_subscription_id,{},stripeOptions(sub.stripe_account_id));
      if(!['canceled','incomplete_expired'].includes(live.status)&&!live.cancel_at_period_end)
        await sdk.subscriptions.update(sub.stripe_subscription_id,{cancel_at_period_end:true},stripeOptions(sub.stripe_account_id));
      await transaction(async db=>{
        const local=await lockSubscription(db,sub.id);
        const current=await reconcileSubscription(db,local,sub.stripe_subscription_id,sdk);
        if(!current.cancelAtPeriodEnd&&!['canceled','incomplete_expired'].includes(current.stripeStatus))
          throw Object.assign(new Error('Stripe has not confirmed cancellation'),{code:'cancellation_unconfirmed'});
        await db.query(`UPDATE billing_subscriptions SET cancel_at_period_end=TRUE WHERE id=$1`,[sub.id]);
        await db.query(`UPDATE billing_tasks SET done_at=NOW(),claim_token=NULL,lease_until=NULL,last_error_code=NULL
          WHERE id=$1 AND claim_token=$2`,[task.id,token]);
      });
    } catch(error) {
      const code=String(error.code||'stripe_error').replace(/[^a-zA-Z0-9_]/g,'').slice(0,64);
      await query(`UPDATE billing_tasks SET claim_token=NULL,lease_until=NULL,last_error_code=$3,
        next_attempt_at=NOW()+LEAST(300,30*attempts)*INTERVAL '1 second' WHERE id=$1 AND claim_token=$2`,[task.id,token,code]);
      reportProblem('[billing/job] cancellation needs retry',{taskId:task.id,code});
    }
  }
  return tasks.length;
}
export async function runBillingMaintenance(sdk = stripe()) {
  await drainBillingInbox(event=>processEvent(event,sdk));
  // Expiry never depends solely on a delayed webhook.
  const expired = await expireEntitlements();
  for (const userId of new Set(expired.map(r => r.user_id))) disconnectUserSockets(userId);
  await query(`UPDATE hive_monetization SET state='paused' WHERE state='active' AND NOT billing_has_plus(owner_id)`);
  await query(`INSERT INTO billing_tasks(subscription_id,action)
    SELECT s.id,'cancel_at_period_end' FROM billing_subscriptions s JOIN hive_monetization m ON m.hive_id=s.hive_id
    WHERE NOT billing_has_plus(m.owner_id) AND s.status NOT IN ('canceled','expired','incomplete_expired','refunded') AND NOT s.cancel_at_period_end ON CONFLICT(subscription_id,action) DO UPDATE SET done_at=NULL`);
  // Expire outstanding Checkout Sessions when an offering closes. Sessions
  // that have completed are reconciled and canceled via the durable task queue.
  const { rows: checkouts } = await query(`SELECT c.*,s.stripe_account_id FROM billing_checkouts c JOIN billing_subscriptions s ON s.id=c.subscription_id
    LEFT JOIN hive_monetization m ON m.hive_id=s.hive_id WHERE c.status IN ('creating','open') AND
    (c.expires_at<NOW() OR m.state IN ('paused','closing','closed'))`);
  for (const c of checkouts) {
    try {
    if (c.stripe_session_id) {
      const session = await sdk.checkout.sessions.retrieve(c.stripe_session_id, {}, stripeOptions(c.stripe_account_id));
      if (session.status === 'open') await sdk.checkout.sessions.expire(session.id, {}, stripeOptions(c.stripe_account_id));
      if (session.status === 'complete') continue; // Webhook/reconciliation owns admission.
    } else if (new Date(c.expires_at) > new Date()) continue; // creation may still be in flight
    await query(`UPDATE billing_checkouts SET status='expired' WHERE id=$1 AND status IN ('creating','open')`, [c.id]);
    await query(`UPDATE billing_subscriptions SET status='expired' WHERE id=$1 AND stripe_subscription_id IS NULL AND status='processing'`, [c.subscription_id]);
    } catch(error) {reportProblem('[billing/job] Checkout expiry needs retry',{checkoutId:c.id,code:error.code||'stripe_error'});}
  }
  await processCancellationTasks(sdk);
  await reconcileUnknownDisputeBalances(sdk);
  // Periodic retrieval repairs missed webhook delivery, using the same locked path.
  const { rows: unbound } = await query(`SELECT c.id,c.subscription_id,c.stripe_session_id,s.stripe_account_id FROM billing_checkouts c
    JOIN billing_subscriptions s ON s.id=c.subscription_id WHERE s.stripe_subscription_id IS NULL AND s.status='processing'
    AND c.stripe_session_id IS NOT NULL AND c.status IN ('creating','open','complete') LIMIT 100`);
  for (const attempt of unbound) {
    try {
      const session = await sdk.checkout.sessions.retrieve(attempt.stripe_session_id, {}, stripeOptions(attempt.stripe_account_id));
      if (session.status !== 'complete' || !session.subscription) continue;
      await transaction(async db => {
        const local=await lockSubscription(db,attempt.subscription_id);
        await reconcileSubscription(db, local, typeof session.subscription==='string' ? session.subscription : session.subscription.id, sdk);
        await db.query(`UPDATE billing_checkouts SET status='complete' WHERE id=$1`, [attempt.id]);
      });
    } catch (e) { reportProblem('[billing/job] checkout reconciliation needs retry', { checkoutId: attempt.id, code: e.code || 'reconcile_error' }); }
  }
  const { rows: subs } = await query(`SELECT id FROM billing_subscriptions WHERE stripe_subscription_id IS NOT NULL
    AND (updated_at<NOW()-INTERVAL '1 hour' OR status='processing') ORDER BY updated_at LIMIT 100`);
  for (const { id } of subs) {
    try { await transaction(async db => {
      const local=await lockSubscription(db,id);
      await reconcileSubscription(db, local, local.stripe_subscription_id, sdk);
    }); } catch (e) { reportProblem('[billing/job] reconciliation needs retry', { subscriptionId: id, code: e.code || 'reconcile_error' }); }
  }
  await query(`UPDATE hive_monetization m SET state='closed' WHERE state='closing'
    AND NOT EXISTS(SELECT 1 FROM billing_subscriptions s WHERE s.hive_id=m.hive_id AND
      (s.access_until>NOW() OR s.status NOT IN ('canceled','expired','incomplete_expired','refunded')))
    AND NOT EXISTS(SELECT 1 FROM billing_tasks t JOIN billing_subscriptions s ON s.id=t.subscription_id WHERE s.hive_id=m.hive_id AND t.done_at IS NULL)`);
}
export function startBillingJob({standalone=false}={}) {
  if (process.env.BILLING_ENABLED !== 'test' || (!standalone&&process.env.BILLING_WORKER_MODE==='external')) return;
  const workerId=`${standalone?'worker':'api'}-${randomUUID()}`;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await query(`INSERT INTO billing_worker_heartbeats(worker_id) VALUES($1) ON CONFLICT(worker_id) DO UPDATE SET last_started_at=NOW()`,[workerId]);
      await runBillingMaintenance();
      await query(`UPDATE billing_worker_heartbeats SET last_succeeded_at=NOW(),last_error_code=NULL WHERE worker_id=$1`,[workerId]);
    }
    catch (e) {
      const code=e.code || 'maintenance_error';
      try {await query('UPDATE billing_worker_heartbeats SET last_error_code=$2 WHERE worker_id=$1',[workerId,code]);} catch {}
      reportProblem('[billing/job] maintenance failed', { code });
    }
    finally { running = false; }
  };
  void tick();
  setInterval(tick, 30_000).unref();
}
