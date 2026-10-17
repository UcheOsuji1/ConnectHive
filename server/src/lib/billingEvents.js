import { reportProblem } from './reportProblem.js';
import { stripe, stripeOptions } from './stripe.js';
import { GRACE_SECONDS, PLATFORM_FEE_PERCENT } from './billingPolicy.js';
import { transaction, fail, audit } from './billingStore.js';
import { disconnectUserSockets } from '../realtime/socket.js';

const idOf = value => typeof value === 'string' ? value : value?.id;
const date = seconds => seconds ? new Date(seconds * 1000) : null;
async function notify(db, userId, hiveId, title, body) {
  await db.query(`INSERT INTO notifications(user_id,hive_id,type,title,body,link) VALUES($1,$2,'billing',$3,$4,'/settings#billing')`, [userId, hiveId, title, body]);
}
async function recordInvoice(db, local, invoice, sdk) {
  const { rows: [existingInvoice] } = await db.query('SELECT 1 FROM billing_invoices WHERE stripe_account_id=$1 AND stripe_invoice_id=$2', [local.stripe_account_id,invoice.id]);
  const paidEnd = date(Math.max(...(invoice.lines?.data || []).map(line => line.period?.end || 0)));
    const charge = invoice.charge && typeof invoice.charge === 'object' ? invoice.charge : null;
    const balance = charge?.balance_transaction && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
    const fees = balance?.fee_details?.filter(f => f.type !== 'application_fee').reduce((n,f) => n+f.amount,0) ?? null;
    let appFee = local.kind==='hive' ? null : 0;
    if (local.kind === 'hive' && charge?.application_fee) {
      // Application fee lives on platform, not on connected account.
      const fee = await sdk.applicationFees.retrieve(idOf(charge.application_fee));
      appFee = fee.amount - fee.amount_refunded;
    }
    await db.query(`INSERT INTO billing_invoices(stripe_account_id,stripe_invoice_id,subscription_id,charge_id,amount_paid_cents,platform_fee_cents,processing_fee_cents,refunded_cents,paid_through,hosted_invoice_url)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(stripe_account_id,stripe_invoice_id) DO UPDATE SET
      charge_id=EXCLUDED.charge_id,amount_paid_cents=EXCLUDED.amount_paid_cents,platform_fee_cents=EXCLUDED.platform_fee_cents,
      processing_fee_cents=EXCLUDED.processing_fee_cents,refunded_cents=GREATEST(billing_invoices.refunded_cents,EXCLUDED.refunded_cents),hosted_invoice_url=EXCLUDED.hosted_invoice_url`,
    [local.stripe_account_id, invoice.id, local.id, idOf(invoice.charge) || null, invoice.amount_paid, appFee, fees, charge?.amount_refunded || 0, paidEnd, invoice.hosted_invoice_url || null]);

  if (local.hive_id && !existingInvoice) await db.query('UPDATE billing_accounts SET payouts_resolved=FALSE WHERE user_id=(SELECT owner_id FROM hive_monetization WHERE hive_id=$1)', [local.hive_id]);
  return { charge, paidEnd };
}
// Must run under the local subscription row lock, before fetching Stripe's CURRENT
// object. Event timestamps alone cannot resolve delivery order or same-second events.
export async function reconcileSubscription(db, local, stripeId, sdk = stripe()) {
  if (local.stripe_subscription_id && local.stripe_subscription_id !== stripeId) fail('Subscription binding mismatch.');
  if (!local.stripe_subscription_id) {
    const { rows: [attempt] } = await db.query(`SELECT stripe_session_id FROM billing_checkouts WHERE subscription_id=$1 AND stripe_session_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`, [local.id]);
    if (!attempt) fail('Checkout binding is not yet available; retry.', 503);
    const session = await sdk.checkout.sessions.retrieve(attempt.stripe_session_id, {}, stripeOptions(local.stripe_account_id));
    if (idOf(session.subscription) !== stripeId || session.client_reference_id !== local.id) fail('Subscription does not belong to the authorized Checkout Session.');
  }
  const live = await sdk.subscriptions.retrieve(stripeId, { expand: ['latest_invoice.charge.balance_transaction'] }, stripeOptions(local.stripe_account_id));
  if (live.livemode || live.metadata?.truehive_subscription_id !== local.id) fail('Unrecognized subscription.');
  const item = live.items?.data?.[0];
  if (live.items?.data?.length !== 1 || item.quantity !== 1 || item.price?.unit_amount !== local.price_cents || item.price?.currency !== 'usd' || item.price?.recurring?.interval !== local.interval || item.price?.recurring?.interval_count !== 1 || (local.kind === 'hive' && live.application_fee_percent !== PLATFORM_FEE_PERCENT)) fail('Stripe subscription does not match the approved product.');
  const invoice = live.latest_invoice;
  let paidThrough = local.paid_through ? new Date(local.paid_through) : null;
  let revoked = local.access_revoked;
  // Do not equate subscription.active with a paid invoice. Trials/manual-paid
  // invoices are not enabled by this integration.
  if (invoice && typeof invoice !== 'string' && invoice.status === 'paid' && invoice.amount_paid >= local.price_cents && !invoice.paid_out_of_band) {
    const end = Math.max(...(invoice.lines?.data || []).map(line => line.period?.end || 0));
    const paidEnd = date(end);
    if (paidEnd && (!paidThrough || paidEnd > paidThrough)) paidThrough = paidEnd;
    const { charge } = await recordInvoice(db, local, invoice, sdk);
    const {rows:pendingRefunds}=await db.query(`SELECT 1 FROM billing_refunds WHERE subscription_id=$1 AND status IN ('pending','requires_action')`,[local.id]);
    if (charge?.refunded && !pendingRefunds.length && !charge.refunds?.data?.some(r=>r.status!=='succeeded') && paidEnd && paidThrough <= paidEnd) revoked = true;
  }
  let accessUntil = paidThrough;
  if (['past_due','unpaid'].includes(live.status) && paidThrough && !live.cancel_at_period_end) accessUntil = new Date(paidThrough.getTime() + GRACE_SECONDS*1000);
  if (revoked) accessUntil = null;
  const status = revoked ? 'refunded' : live.status;
  await db.query(`UPDATE billing_subscriptions SET stripe_subscription_id=$2,stripe_customer_id=$3,status=$4,
    paid_through=$5,access_until=$6,cancel_at_period_end=$7,access_revoked=$8,updated_at=NOW() WHERE id=$1`,
  [local.id, live.id, idOf(live.customer), status, paidThrough, accessUntil, live.cancel_at_period_end, revoked]);
  if (local.status !== status && ['past_due','unpaid','active','canceled','refunded'].includes(status)) await notify(db, local.user_id, local.hive_id, status === 'active' ? 'Membership payment confirmed' : 'Subscription status updated', `Status: ${status}. Review your paid-through date and billing options in Settings.`);
  if (local.kind === 'hive') {
    const { rows: [m] } = await db.query('SELECT state FROM hive_monetization WHERE hive_id=$1', [local.hive_id]);
    if (m && ['closing','closed'].includes(m.state) || revoked) {
      if (!live.cancel_at_period_end && !['canceled','incomplete_expired'].includes(live.status)) await db.query(`INSERT INTO billing_tasks(subscription_id,action) VALUES($1,'cancel_at_period_end') ON CONFLICT(subscription_id,action) DO UPDATE SET done_at=NULL`, [local.id]);
    }
    if (accessUntil > new Date() && !revoked) {
      // Moderation removals and voluntary exits stay removed; paid invoices do
      // not overwrite role, onboarding progress or an explicit access decision.
      await db.query(`INSERT INTO hive_members(hive_id,user_id,role,membership_status,onboarding_status)
        VALUES($1,$2,'member','active','completed') ON CONFLICT(hive_id,user_id) DO UPDATE SET membership_status='active'
        WHERE hive_members.membership_status='expired'`, [local.hive_id, local.user_id]);
    } else {
      await db.query(`UPDATE hive_members SET membership_status='expired' WHERE hive_id=$1 AND user_id=$2 AND role<>'owner' AND membership_status='active'`, [local.hive_id, local.user_id]);
    }
  }
  return { status, accessUntil };
}

export async function processEvent(event, sdk = stripe()) {
  if (event.livemode) fail('Live events are disabled.', 400);
  const account = event.account || 'platform';
  const result = await transaction(async db => {
    const inserted = await db.query(`INSERT INTO billing_events(event_id,account_id,event_type,event_created) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id`, [event.id, account, event.type, event.created]);
    if (!inserted.rows.length) return { duplicate: true };
    const obj = event.data.object;
    if (event.type === 'account.updated' || event.type === 'account.application.deauthorized') {
      const accountId = event.type === 'account.updated' ? obj.id : event.account;
      const { accountStatus } = await import('./billingPolicy.js');
      const status = event.type === 'account.application.deauthorized' ? 'restricted' : accountStatus(await sdk.accounts.retrieve(accountId));
      const { rows: [owner] } = await db.query('UPDATE billing_accounts SET status=$2,checked_at=NOW() WHERE stripe_account_id=$1 RETURNING user_id', [accountId, status]);
      if (owner && status !== 'connected') {
        await db.query(`UPDATE hive_monetization SET state='paused' WHERE owner_id=$1 AND state='active'`, [owner.user_id]);
        await notify(db, owner.user_id, null, 'Stripe account needs attention', 'New paid memberships are paused. Review your account with Stripe.');
      }
      return { processed: true };
    }
    if (event.type.startsWith('checkout.session.')) {
      const { rows: [attempt] } = await db.query(`SELECT c.*,s.stripe_account_id FROM billing_checkouts c JOIN billing_subscriptions s ON s.id=c.subscription_id
        WHERE c.stripe_session_id=$1 AND c.subscription_id::text=$2 AND s.stripe_account_id=$3 FOR UPDATE OF c`, [obj.id, obj.client_reference_id || '', account]);
      if (!attempt) {
        if (obj.metadata?.truehive_subscription_id) fail('Checkout record is not yet available; retry.', 503);
        return { ignored: true };
      }
      if (event.type === 'checkout.session.expired') {
        await db.query(`UPDATE billing_checkouts SET status='expired' WHERE id=$1 AND status<>'complete'`, [attempt.id]);
        await db.query(`UPDATE billing_subscriptions SET status='expired' WHERE id=$1 AND stripe_subscription_id IS NULL AND status='processing'`, [attempt.subscription_id]);
      } else if (event.type === 'checkout.session.completed') {
        await db.query(`UPDATE billing_checkouts SET status='complete',stripe_session_id=$2 WHERE id=$1`, [attempt.id, obj.id]);
        // Binding only. Redirect and Checkout completion NEVER grant access.
        await db.query(`UPDATE billing_subscriptions SET stripe_subscription_id=COALESCE(stripe_subscription_id,$2),stripe_customer_id=COALESCE(stripe_customer_id,$3) WHERE id=$1`, [attempt.subscription_id, idOf(obj.subscription), idOf(obj.customer)]);
      }
      return { processed: true };
    }
    let stripeId;
    if (event.type.startsWith('customer.subscription.')) stripeId = obj.id;
    else if (event.type.startsWith('invoice.')) stripeId = idOf(obj.subscription) || idOf(obj.parent?.subscription_details?.subscription);
    if (stripeId) {
      // Current metadata is trusted only in combination with a matching local
      // reservation, product, and connected account.
      const snapshot = await sdk.subscriptions.retrieve(stripeId, {}, stripeOptions(account));
      const localId = snapshot.metadata?.truehive_subscription_id;
      if (!localId || !/^[0-9a-f-]{36}$/i.test(localId)) return { ignored: true };
      const { rows: [local] } = await db.query('SELECT * FROM billing_subscriptions WHERE id=$1 AND stripe_account_id=$2 FOR UPDATE', [localId, account]);
      if (!local) return { ignored: true };
      const reconciled = await reconcileSubscription(db, local, stripeId, sdk);
      // An older paid invoice can arrive after a newer renewal. Preserve its
      // ledger independently of the current entitlement snapshot.
      if (event.type.startsWith('invoice.') && obj.id && sdk.invoices) {
        const historical = await sdk.invoices.retrieve(obj.id, { expand: ['charge.balance_transaction'] }, stripeOptions(account));
        if (idOf(historical.subscription) !== stripeId) fail('Invoice subscription mismatch.');
        if (historical.status === 'paid' && historical.currency === 'usd') await recordInvoice(db, local, historical, sdk);
      }
      await db.query('UPDATE billing_subscriptions SET last_event_created=GREATEST(last_event_created,$2) WHERE id=$1', [local.id, event.created]);
      if (event.type === 'invoice.payment_failed' && ['past_due','unpaid','incomplete'].includes(reconciled.status)) await notify(db, local.user_id, local.hive_id, 'Payment needs attention', 'Update your payment method in Billing & Subscriptions. Previously paid access is retained, with a three-day renewal grace period.');
      return { processed: true, disconnectUserId: reconciled.accessUntil > new Date() ? null : local.user_id };
    }
    if (event.type === 'charge.refunded' || event.type.startsWith('charge.dispute.') || event.type.startsWith('refund.')) {
      let chargeId = event.type === 'charge.refunded' ? obj.id : idOf(obj.charge);
      if (!chargeId && obj.payment_intent) chargeId = idOf((await sdk.paymentIntents.retrieve(idOf(obj.payment_intent), {}, stripeOptions(account))).latest_charge);
      const { rows: [invoice] } = await db.query('SELECT * FROM billing_invoices WHERE stripe_account_id=$1 AND charge_id=$2', [account, chargeId]);
      // A relevant refund before invoice delivery must be retried, not discarded.
      if (!invoice) {
        const charge = chargeId && await sdk.charges.retrieve(chargeId, {}, stripeOptions(account));
        if (charge?.invoice) fail('Invoice has not been reconciled yet; retry event.', 503);
        return { ignored: true };
      }
      const { rows: [local] } = await db.query('SELECT * FROM billing_subscriptions WHERE id=$1 FOR UPDATE', [invoice.subscription_id]);
      if (local.hive_id) await db.query('UPDATE billing_accounts SET payouts_resolved=FALSE WHERE user_id=(SELECT owner_id FROM hive_monetization WHERE hive_id=$1)', [local.hive_id]);
      if (event.type.startsWith('charge.dispute.')) {
        const dispute = await sdk.disputes.retrieve(obj.id, {}, stripeOptions(account));
        await db.query(`INSERT INTO billing_disputes(stripe_dispute_id,subscription_id,status,amount_cents) VALUES($1,$2,$3,$4)
          ON CONFLICT(stripe_dispute_id) DO UPDATE SET status=EXCLUDED.status,updated_at=NOW()`, [dispute.id, local.id, dispute.status, dispute.amount]);
        await audit(db, null, local.hive_id, 'dispute_review_required', { disputeId: dispute.id, status: dispute.status });
        await notify(db, local.user_id, local.hive_id, 'Payment dispute under review', 'Contact the Hive owner about your payment. Access is reviewed separately.');
        if (local.hive_id) {
          const { rows: [owner] } = await db.query('SELECT owner_id FROM hive_monetization WHERE hive_id=$1', [local.hive_id]);
          await notify(db, owner.owner_id, local.hive_id, 'Payment dispute needs review', 'Review the dispute and evidence deadlines in your Stripe Dashboard.');
        }
      } else {
        const charge = await sdk.charges.retrieve(chargeId, {}, stripeOptions(account));
        let refunds = charge.refunds?.data || [];
        if (charge.refunds?.has_more) {
          refunds = await sdk.refunds.list({charge:chargeId,limit:100},stripeOptions(account)).autoPagingToArray({limit:1000});
          if (refunds.length===1000) fail('Refund pagination needs manual reconciliation.',503);
        }
        if (event.type.startsWith('refund.')) {
          const refund = await sdk.refunds.retrieve(obj.id,{},stripeOptions(account));
          refunds = [...refunds.filter(r=>r.id!==refund.id),refund];
        }
        for (const refund of refunds) await db.query(`INSERT INTO billing_refunds(stripe_refund_id,subscription_id,amount_cents,status) VALUES($1,$2,$3,$4)
          ON CONFLICT(stripe_refund_id) DO UPDATE SET status=EXCLUDED.status,amount_cents=EXCLUDED.amount_cents,updated_at=NOW()`,[refund.id,local.id,refund.amount,refund.status]);
        await db.query('UPDATE billing_invoices SET refunded_cents=$3 WHERE stripe_account_id=$1 AND stripe_invoice_id=$2', [account, invoice.stripe_invoice_id, charge.amount_refunded]);
        if (charge.application_fee) {
          const fee = await sdk.applicationFees.retrieve(idOf(charge.application_fee));
          await db.query('UPDATE billing_invoices SET platform_fee_cents=$3 WHERE stripe_account_id=$1 AND stripe_invoice_id=$2', [account, invoice.stripe_invoice_id, fee.amount-fee.amount_refunded]);
        }
        if (charge.refunded && !refunds.some(r=>r.status!=='succeeded') && new Date(invoice.paid_through) >= new Date(local.paid_through || 0)) {
          await db.query(`UPDATE billing_subscriptions SET access_revoked=TRUE,access_until=NULL,status='refunded' WHERE id=$1`, [local.id]);
          await db.query(`UPDATE hive_members SET membership_status='expired' WHERE hive_id=$1 AND user_id=$2 AND role<>'owner' AND membership_status='active'`, [local.hive_id, local.user_id]);
          await db.query(`INSERT INTO billing_tasks(subscription_id,action) VALUES($1,'cancel_at_period_end') ON CONFLICT(subscription_id,action) DO UPDATE SET done_at=NULL`, [local.id]);
        }
        const pending = refunds.some(r=>['pending','requires_action'].includes(r.status));
        const failed = refunds.some(r=>r.status==='failed');
        await notify(db, local.user_id, local.hive_id, 'Refund status updated', pending ? 'A refund is pending in Stripe. Your owner can review its status.' : failed ? 'A refund attempt failed. Contact your Hive owner to resolve it.' : charge.refunded ? 'Your payment was fully refunded. Review access and cancellation in Billing & Subscriptions.' : 'A partial refund was recorded. Your paid-through access is unchanged.');
      }
      return { processed: true, disconnectUserId: event.type.startsWith('charge.dispute.') ? null : local.user_id };
    }
    return { ignored: true };
  });
  if (result.disconnectUserId) disconnectUserSockets(result.disconnectUserId);
  return result;
}

export async function webhook(req, res) {
  let event;
  try {
    if (process.env.BILLING_ENABLED!=='test') return res.status(503).json({error:'Billing webhook processing is disabled.'});
    const secret = req.params.source === 'connect' ? process.env.STRIPE_CONNECT_WEBHOOK_SECRET : process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: 'Webhook is not configured.' });
    event = stripe().webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
    if ((req.params.source === 'connect') !== Boolean(event.account)) return res.status(400).json({ error: 'Incorrect event destination.' });
  } catch { return res.status(400).json({ error: 'Invalid Stripe signature or configuration.' }); }
  try { res.json(await processEvent(event)); }
  catch (e) {
    // Do not log Stripe error payloads, raw events, signatures, or customer data.
    reportProblem('[billing/webhook] processing failed', { eventId: event.id, eventType: event.type, code: e.code || 'processing_error' });
    res.status(503).json({ error: 'Event processing failed; safe to retry.' });
  }
}
