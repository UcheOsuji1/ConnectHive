import { reportProblem } from '../lib/reportProblem.js';
import { query } from '../db/index.js';
import { stripe, stripeOptions } from '../lib/stripe.js';
import { transaction, expireEntitlements } from '../lib/billingStore.js';
import { reconcileSubscription } from '../lib/billingEvents.js';
import { disconnectUserSockets } from '../realtime/socket.js';

export async function runBillingMaintenance(sdk = stripe()) {
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
    if (c.stripe_session_id) {
      const session = await sdk.checkout.sessions.retrieve(c.stripe_session_id, {}, stripeOptions(c.stripe_account_id));
      if (session.status === 'open') await sdk.checkout.sessions.expire(session.id, {}, stripeOptions(c.stripe_account_id));
      if (session.status === 'complete') continue; // Webhook/reconciliation owns admission.
    } else if (new Date(c.expires_at) > new Date()) continue; // creation may still be in flight
    await query(`UPDATE billing_checkouts SET status='expired' WHERE id=$1 AND status IN ('creating','open')`, [c.id]);
    await query(`UPDATE billing_subscriptions SET status='expired' WHERE id=$1 AND stripe_subscription_id IS NULL AND status='processing'`, [c.subscription_id]);
  }
  const { rows: tasks } = await query('SELECT id FROM billing_tasks WHERE done_at IS NULL ORDER BY attempts,id LIMIT 100');
  for (const task of tasks) {
    try {
      await transaction(async db => {
        const { rows: [row] } = await db.query(`SELECT t.*,s.stripe_subscription_id,s.stripe_account_id FROM billing_tasks t JOIN billing_subscriptions s ON s.id=t.subscription_id
          WHERE t.id=$1 AND t.done_at IS NULL FOR UPDATE OF t SKIP LOCKED`, [task.id]);
        if (!row?.stripe_subscription_id) return;
        const live = await sdk.subscriptions.retrieve(row.stripe_subscription_id, {}, stripeOptions(row.stripe_account_id));
        if (!['canceled','incomplete_expired'].includes(live.status)) await sdk.subscriptions.update(row.stripe_subscription_id, { cancel_at_period_end: true }, stripeOptions(row.stripe_account_id));
        await db.query('UPDATE billing_subscriptions SET cancel_at_period_end=TRUE WHERE id=$1', [row.subscription_id]);
        await db.query('UPDATE billing_tasks SET done_at=NOW() WHERE id=$1', [row.id]);
      });
    } catch (e) {
      await query('UPDATE billing_tasks SET attempts=attempts+1 WHERE id=$1', [task.id]);
      reportProblem('[billing/job] cancellation needs retry', { taskId: task.id, code: e.code || 'stripe_error' });
    }
  }
  // Periodic retrieval repairs missed webhook delivery, using the same locked path.
  const { rows: unbound } = await query(`SELECT c.id,c.subscription_id,c.stripe_session_id,s.stripe_account_id FROM billing_checkouts c
    JOIN billing_subscriptions s ON s.id=c.subscription_id WHERE s.stripe_subscription_id IS NULL AND s.status='processing'
    AND c.stripe_session_id IS NOT NULL AND c.status IN ('creating','open','complete') LIMIT 100`);
  for (const attempt of unbound) {
    try {
      const session = await sdk.checkout.sessions.retrieve(attempt.stripe_session_id, {}, stripeOptions(attempt.stripe_account_id));
      if (session.status !== 'complete' || !session.subscription) continue;
      await transaction(async db => {
        const { rows: [local] } = await db.query('SELECT * FROM billing_subscriptions WHERE id=$1 FOR UPDATE', [attempt.subscription_id]);
        await reconcileSubscription(db, local, typeof session.subscription==='string' ? session.subscription : session.subscription.id, sdk);
        await db.query(`UPDATE billing_checkouts SET status='complete' WHERE id=$1`, [attempt.id]);
      });
    } catch (e) { reportProblem('[billing/job] checkout reconciliation needs retry', { checkoutId: attempt.id, code: e.code || 'reconcile_error' }); }
  }
  const { rows: subs } = await query(`SELECT id FROM billing_subscriptions WHERE stripe_subscription_id IS NOT NULL
    AND (updated_at<NOW()-INTERVAL '1 hour' OR status='processing') ORDER BY updated_at LIMIT 100`);
  for (const { id } of subs) {
    try { await transaction(async db => {
      const { rows: [local] } = await db.query('SELECT * FROM billing_subscriptions WHERE id=$1 FOR UPDATE', [id]);
      await reconcileSubscription(db, local, local.stripe_subscription_id, sdk);
    }); } catch (e) { reportProblem('[billing/job] reconciliation needs retry', { subscriptionId: id, code: e.code || 'reconcile_error' }); }
  }
  await query(`UPDATE hive_monetization m SET state='closed' WHERE state='closing'
    AND NOT EXISTS(SELECT 1 FROM billing_subscriptions s WHERE s.hive_id=m.hive_id AND
      (s.access_until>NOW() OR s.status NOT IN ('canceled','expired','incomplete_expired','refunded')))
    AND NOT EXISTS(SELECT 1 FROM billing_tasks t JOIN billing_subscriptions s ON s.id=t.subscription_id WHERE s.hive_id=m.hive_id AND t.done_at IS NULL)`);
}
export function startBillingJob() {
  if (process.env.BILLING_ENABLED !== 'test') return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runBillingMaintenance(); }
    catch (e) { reportProblem('[billing/job] maintenance failed', { code: e.code || 'maintenance_error' }); }
    finally { running = false; }
  };
  void tick();
  setInterval(tick, 30_000).unref();
}
