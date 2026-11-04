import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db/index.js';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { requireSiteAdmin } from '../lib/siteAdmin.js';
import { stripe, stripeOptions } from '../lib/stripe.js';
import * as service from '../lib/billingService.js';
import { lockSubscription, hasPlus, requireOwner, fail, audit, transaction } from '../lib/billingStore.js';

export const handle = fn => async (req, res) => {
  try { const result = await fn(req, res); if (!res.headersSent) res.json(result); }
  catch (e) {
    const expected = e.status || /^P730/.test(e.code || '');
    if (!expected) console.error('[billing/api] request failed', { route: req.route?.path, code: e.code || 'billing_error' });
    res.status(e.status || (expected ? 409 : 500)).json({ error: expected ? e.message : 'Billing request could not be completed. Please retry.' });
  }
};
const router = Router();
router.use(requireAuth);
for(const param of ['id','requestId','userId'])router.param(param,(req,res,next,value)=>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))return res.status(400).json({error:'Invalid record identifier.'});
  next();
});
router.get('/summary', handle(async req => {
  const { rows: subscriptions } = await query(`SELECT s.id,s.kind,s.hive_id,h.hive_name,s.status,s.interval,s.price_cents,
    s.paid_through,s.access_until,s.cancel_at_period_end,s.cancellation_requested_at,s.access_revoked,
    EXISTS(SELECT 1 FROM billing_disputes d WHERE d.subscription_id=s.id AND d.status NOT IN ('won','lost','warning_closed')) AS disputed,
    COALESCE((SELECT SUM(i.refunded_cents) FROM billing_invoices i WHERE i.subscription_id=s.id),0) AS refunded_cents
    FROM billing_subscriptions s LEFT JOIN hives h USING(hive_id) WHERE s.user_id=$1 ORDER BY s.created_at DESC`, [req.userId]);
  const { rows: invoices } = await query(`SELECT i.stripe_invoice_id,i.amount_paid_cents,i.refunded_cents,i.hosted_invoice_url,i.created_at,h.hive_name
    FROM billing_invoices i JOIN billing_subscriptions s ON s.id=i.subscription_id LEFT JOIN hives h ON h.hive_id=s.hive_id WHERE s.user_id=$1 ORDER BY i.created_at DESC LIMIT 100`, [req.userId]);
  const { rows: ownedHives } = await query(`SELECT m.hive_id,h.hive_name,m.state FROM hive_monetization m JOIN hives h USING(hive_id) WHERE m.owner_id=$1`, [req.userId]);
  const { rows: [connection] } = await query('SELECT status,checked_at FROM billing_accounts WHERE user_id=$1', [req.userId]);
  const {rows:refundRequests}=await query(`SELECT r.id,r.reason,r.state,r.owner_response,h.hive_name FROM billing_refund_requests r JOIN billing_subscriptions s ON s.id=r.subscription_id JOIN hives h ON h.hive_id=s.hive_id WHERE s.user_id=$1 ORDER BY r.created_at DESC LIMIT 100`,[req.userId]);
  const {rows:refunds}=await query(`SELECT r.stripe_refund_id,r.status,r.amount_cents,h.hive_name FROM billing_refunds r JOIN billing_subscriptions s ON s.id=r.subscription_id LEFT JOIN hives h ON h.hive_id=s.hive_id WHERE s.user_id=$1 ORDER BY r.updated_at DESC LIMIT 100`,[req.userId]);
  return { plus: await hasPlus(req.userId), subscriptions, invoices, refunds, refundRequests, ownedHives, connection: connection || null, testMode: process.env.BILLING_ENABLED === 'test' };
}));
const mutations = rateLimit({ windowMs: 60_000, limit: 20, keyGenerator:req=>req.userId, standardHeaders: 'draft-8', legacyHeaders: false });
router.post('/checkout', mutations, requireVerifiedEmail, handle(req => service.checkout(req.userId, req.body)));
router.post('/subscriptions/:id/cancel', mutations, handle(req => service.cancelSubscription(req.userId, req.params.id)));
router.post('/subscriptions/:id/portal', mutations, handle(req => service.portal(req.userId, req.params.id)));
router.post('/subscriptions/:id/refund-request', mutations, handle(async req => {
  if (typeof req.body.reason!=='string' || req.body.reason.trim().length<10 || req.body.reason.length>2000) fail('Explain your refund request in 10–2,000 characters.');
  return transaction(async db=>{
    const local=await lockSubscription(db,req.params.id);
    if(local.user_id!==req.userId)fail('Subscription not found.',404);
    const {rows:[invoice]}=await db.query(`SELECT i.stripe_invoice_id,s.id,m.owner_id,s.hive_id FROM billing_subscriptions s JOIN billing_invoices i ON i.subscription_id=s.id
      JOIN hive_monetization m ON m.hive_id=s.hive_id WHERE s.id=$1 AND s.user_id=$2 AND i.amount_paid_cents>i.refunded_cents ORDER BY i.created_at DESC LIMIT 1`,[req.params.id,req.userId]);
    if(!invoice)fail('No refundable Hive invoice found.',404);
    const {rows:[request]}=await db.query(`INSERT INTO billing_refund_requests(subscription_id,stripe_invoice_id,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`,[invoice.id,invoice.stripe_invoice_id,req.body.reason.trim()]);
    if(!request)fail('A refund request for this invoice has already been recorded.',409);
    await db.query(`INSERT INTO notifications(user_id,hive_id,type,title,body,link) VALUES($1,$2,'billing','Member refund request','Review the refund request and respond according to your policy and applicable law.',$3)`,[invoice.owner_id,invoice.hive_id,`/hive/${invoice.hive_id}/billing`]);
    await audit(db,req.userId,invoice.hive_id,'refund_requested',{requestId:request.id});
    return {requested:true};
  });
}));
router.post('/connect/onboard', mutations, requireVerifiedEmail, handle(req => service.onboard(req.userId)));
router.post('/connect/refresh', mutations, handle(req => service.refreshAccount(req.userId)));
router.get('/hives/:id/offer', handle(async req => {
  const { rows: [offer] } = await query(`SELECT h.hive_id,h.hive_name,h.description AS hive_description,h.max_members,h.hive_status,p.full_name AS owner_name,
    m.state,m.monthly_price_cents,m.benefits,m.description,m.cancellation_policy,
    (m.state='active' AND h.hive_status='active' AND h.join_policy='open' AND billing_has_plus(m.owner_id) AND a.status='connected') AS available
    FROM hives h JOIN hive_monetization m USING(hive_id) LEFT JOIN billing_accounts a ON a.user_id=m.owner_id
    LEFT JOIN profiles p ON p.user_id=m.owner_id WHERE h.hive_id=$1`, [req.params.id]);
  if (!offer) fail('Paid membership not found.', 404);
  return { offer };
}));
router.get('/hives/:id/owner', handle(async req => {
  await requireOwner(req.params.id, req.userId);
  const { rows: [offering] } = await query('SELECT * FROM hive_monetization WHERE hive_id=$1', [req.params.id]);
  const { rows: [connection] } = await query('SELECT status,checked_at FROM billing_accounts WHERE user_id=$1', [req.userId]);
  const { rows: [totals] } = await query(`SELECT COALESCE(SUM(i.amount_paid_cents),0) AS gross_cents,COALESCE(SUM(i.platform_fee_cents),0) AS platform_fee_cents,
    COUNT(*) FILTER(WHERE i.platform_fee_cents IS NULL)::int AS unknown_platform_fee_count,
    SUM(i.processing_fee_cents) AS processing_fee_cents,COUNT(*) FILTER(WHERE i.processing_fee_cents IS NULL)::int AS unknown_processing_count,
    COALESCE(SUM(i.refunded_cents),0) AS refunds_cents FROM billing_invoices i JOIN billing_subscriptions s ON s.id=i.subscription_id WHERE s.hive_id=$1`, [req.params.id]);
  const { rows: [subscribers] } = await query(`SELECT COUNT(*) FILTER(WHERE access_until>NOW() AND NOT access_revoked)::int AS active,MAX(paid_through) AS latest_paid_through,
    COUNT(*) FILTER(WHERE status NOT IN ('canceled','expired','incomplete_expired','refunded') AND NOT cancel_at_period_end)::int AS renewals_pending
    FROM billing_subscriptions WHERE hive_id=$1`, [req.params.id]);
  const { rows: disputes } = await query(`SELECT d.stripe_dispute_id,d.status,d.amount_cents,d.balance_fee_cents,d.balance_net_cents,d.balance_checked_at FROM billing_disputes d JOIN billing_subscriptions s ON s.id=d.subscription_id WHERE s.hive_id=$1`, [req.params.id]);
  const {rows:refundRequests}=await query(`SELECT r.id,r.reason,r.state,r.owner_response,r.created_at FROM billing_refund_requests r JOIN billing_subscriptions s ON s.id=r.subscription_id WHERE s.hive_id=$1 ORDER BY r.created_at DESC LIMIT 100`,[req.params.id]);
  const {rows:refunds}=await query(`SELECT r.stripe_refund_id,r.amount_cents,r.status FROM billing_refunds r JOIN billing_subscriptions s ON s.id=r.subscription_id WHERE s.hive_id=$1 ORDER BY r.updated_at DESC LIMIT 100`,[req.params.id]);
  return { offering: offering || null, connection: connection || null, totals, subscribers, disputes, refunds, refundRequests, plus: await hasPlus(req.userId) };
}));
router.post('/hives/:id/refund-requests/:requestId/respond', mutations, handle(async req=>{
  if(typeof req.body.response!=='string'||req.body.response.trim().length<20||req.body.response.length>2000)fail('Document your response in 20–2,000 characters.');
  return transaction(async db=>{
    await requireOwner(req.params.id,req.userId,db);
    const {rows:[request]}=await db.query(`SELECT r.id,s.user_id FROM billing_refund_requests r JOIN billing_subscriptions s ON s.id=r.subscription_id WHERE r.id=$1 AND s.hive_id=$2 FOR UPDATE OF r`,[req.params.requestId,req.params.id]);
    if(!request)fail('Refund request not found.',404);
    await db.query(`UPDATE billing_refund_requests SET state='resolved',owner_response=$2 WHERE id=$1`,[request.id,req.body.response.trim()]);
    await db.query(`INSERT INTO notifications(user_id,hive_id,type,title,body,link) VALUES($1,$2,'billing','Hive owner replied to your refund request',$3,'/settings#billing')`,[request.user_id,req.params.id,req.body.response.trim()]);
    await audit(db,req.userId,req.params.id,'refund_request_response',{requestId:request.id});
    return {responded:true};
  });
}));
router.put('/hives/:id/configuration', mutations, requireVerifiedEmail, handle(req => service.configure(req.params.id, req.userId, req.body)));
router.post('/hives/:id/publish', mutations, handle(req => service.publish(req.params.id, req.userId)));
router.post('/hives/:id/pause', mutations, handle(async req => {
  await requireOwner(req.params.id, req.userId);
  await query(`UPDATE hive_monetization SET state='paused' WHERE hive_id=$1 AND state='active'`, [req.params.id]);
  return { state: 'paused' };
}));
router.post('/hives/:id/close', mutations, handle(req => {
  if (req.body.confirm !== 'CLOSE') fail('Confirm closure by typing CLOSE.');
  return service.closeHive(req.params.id, req.userId);
}));
router.get('/connect/finances', handle(async req => {
  const { rows: [account] } = await query('SELECT stripe_account_id FROM billing_accounts WHERE user_id=$1', [req.userId]);
  if (!account) fail('Connect account not found.', 404);
  const sdk = stripe(), options = stripeOptions(account.stripe_account_id);
  const balance = await sdk.balance.retrieve({}, options);
  const payouts = await sdk.payouts.list({ limit: 10 }, options);
  return { available: balance.available.map(({amount,currency}) => ({amount,currency})), pending: balance.pending.map(({amount,currency}) => ({amount,currency})), payouts: payouts.data.map(({id,amount,currency,status,arrival_date}) => ({id,amount,currency,status,arrival_date})) };
}));
router.get('/admin/reviews', requireSiteAdmin, handle(async () => ({ reviews: (await query(`SELECT m.*,h.hive_name FROM hive_monetization m JOIN hives h USING(hive_id) WHERE m.state IN ('pending_approval','awaiting_verification','paused') ORDER BY m.updated_at`)).rows })));
router.get('/admin/operations',requireSiteAdmin,handle(async()=>({operations:(await query(`SELECT
 (SELECT COUNT(*)::int FROM billing_tasks WHERE done_at IS NULL) AS pending_tasks,
 (SELECT COUNT(*)::int FROM billing_tasks WHERE done_at IS NULL AND attempts>=3) AS repeatedly_failed_tasks,
 (SELECT COUNT(*)::int FROM billing_checkouts WHERE status IN ('creating','open') AND expires_at<NOW()) AS stale_checkouts,
 (SELECT COUNT(*)::int FROM billing_webhook_attempts WHERE processed_at IS NULL) AS failed_events,
 (SELECT COUNT(*)::int FROM billing_event_inbox WHERE processed_at IS NULL AND failed_at IS NULL) AS queued_events,
 (SELECT COUNT(*)::int FROM billing_event_inbox WHERE failed_at IS NOT NULL) AS quarantined_events,
 (SELECT COUNT(*)::int FROM billing_disputes WHERE balance_checked_at IS NULL) AS unknown_dispute_balances,
 (SELECT MAX(last_succeeded_at) FROM billing_worker_heartbeats) AS last_worker_success`)).rows[0]})));
router.post('/admin/hives/:id/review', requireSiteAdmin, handle(req => service.review(req.params.id, req.userId, req.body)));
router.post('/admin/accounts/:userId/resolve', requireSiteAdmin, handle(async req => {
  if (req.body.confirm !== 'ALL_FINANCIAL_OBLIGATIONS_RESOLVED' || typeof req.body.note !== 'string' || req.body.note.trim().length < 20) fail('Document the financial review and explicitly confirm all obligations are resolved.');
  await transaction(async db => {
    await db.query('SELECT user_id FROM users WHERE user_id=$1 FOR UPDATE',[req.params.userId]);
    const { rows: [account] } = await db.query('SELECT * FROM billing_accounts WHERE user_id=$1', [req.params.userId]);
    if (!account) fail('Account not found.', 404);
    const { rows: obligations } = await db.query(`SELECT 1 FROM hive_monetization m WHERE m.owner_id=$1 AND
      (m.state<>'closed' OR EXISTS(SELECT 1 FROM billing_subscriptions s WHERE s.hive_id=m.hive_id AND
        (s.access_until>NOW() OR s.status NOT IN ('canceled','expired','incomplete_expired','refunded')))
      OR EXISTS(SELECT 1 FROM billing_disputes d JOIN billing_subscriptions s ON s.id=d.subscription_id WHERE s.hive_id=m.hive_id AND d.status NOT IN ('won','lost','warning_closed'))
      OR EXISTS(SELECT 1 FROM billing_refunds r JOIN billing_subscriptions s ON s.id=r.subscription_id WHERE s.hive_id=m.hive_id AND r.status IN ('pending','requires_action'))
      OR EXISTS(SELECT 1 FROM billing_refund_requests r JOIN billing_subscriptions s ON s.id=r.subscription_id WHERE s.hive_id=m.hive_id AND r.state='requested')
      OR EXISTS(SELECT 1 FROM billing_tasks t JOIN billing_subscriptions s ON s.id=t.subscription_id WHERE s.hive_id=m.hive_id AND t.done_at IS NULL))`, [req.params.userId]);
    if (obligations.length) fail('Resolve Hive, subscription, dispute, and cancellation obligations before financial sign-off.');
    const balance = await stripe().balance.retrieve({}, stripeOptions(account.stripe_account_id));
    if ([...balance.available,...balance.pending].some(v => v.amount !== 0)) fail('Resolve remaining positive or negative Stripe balances first.');
    await db.query('UPDATE billing_accounts SET payouts_resolved=TRUE WHERE user_id=$1', [req.params.userId]);
    await audit(db, req.userId, null, 'financial_obligations_reviewed', { ownerId: req.params.userId, note: req.body.note.trim() });
  });
  return { resolved: true };
}));
export default router;
