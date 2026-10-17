import { query } from '../db/index.js';
import { stripe, stripeOptions, clientURL } from './stripe.js';
import { accountStatus, PLUS_PRICES, PLATFORM_FEE_PERCENT, validatePaidConfig } from './billingPolicy.js';
import { transaction, fail, hasPlus, requireOwner, audit, lockSubscription } from './billingStore.js';
import { isBlockedEitherWay } from './blocks.js';

export async function refreshAccount(userId, sdk = stripe()) {
  const { rows: [stored] } = await query('SELECT * FROM billing_accounts WHERE user_id=$1', [userId]);
  if (!stored) return null;
  const account = await sdk.accounts.retrieve(stored.stripe_account_id);
  const status = accountStatus(account);
  await query('UPDATE billing_accounts SET status=$2,checked_at=NOW() WHERE user_id=$1', [userId, status]);
  if (status==='connected') await query(`UPDATE hive_monetization SET state='pending_approval',updated_at=NOW() WHERE owner_id=$1 AND state='awaiting_verification'`,[userId]);
  return { status, accountId: stored.stripe_account_id, requirements: {
    currentlyDue: account.requirements?.currently_due?.length || 0,
    pendingVerification: account.requirements?.pending_verification?.length || 0,
  } };
}
export async function onboard(userId, sdk = stripe()) {
  if (!await hasPlus(userId)) fail('TrueHive Plus is required to connect payouts.', 403);
  const account = await transaction(async db => {
    await db.query('SELECT user_id FROM users WHERE user_id=$1 AND account_status=\'active\' FOR UPDATE', [userId]);
    let stored = (await db.query('SELECT * FROM billing_accounts WHERE user_id=$1', [userId])).rows[0];
    if (!stored) {
      const created = await sdk.accounts.create({ type: 'standard', capabilities: { card_payments: { requested: true }, transfers: { requested: true } }, metadata: { truehive_user_id: userId } }, { idempotencyKey: `connect-${userId}` });
      stored = (await db.query('INSERT INTO billing_accounts(user_id,stripe_account_id) VALUES($1,$2) RETURNING *', [userId, created.id])).rows[0];
    }
    return stored;
  });
  return sdk.accountLinks.create({ account: account.stripe_account_id, type: 'account_onboarding', refresh_url: `${clientURL()}/settings?billing=connect`, return_url: `${clientURL()}/settings?billing=connect` });
}
export async function configure(hiveId, userId, body) {
  const config = validatePaidConfig(body);
  return transaction(async db => {
    await db.query('SELECT user_id FROM users WHERE user_id=$1 FOR UPDATE', [userId]);
    const hive = await requireOwner(hiveId, userId, db);
    await db.query('SELECT hive_id FROM hives WHERE hive_id=$1 FOR UPDATE', [hiveId]);
    if (!await hasPlus(userId, db)) fail('An active TrueHive Plus subscription is required.', 403);
    if (hive.hive_status !== 'active') fail('Only active Hives can be monetized.');
    // Explicit first-release admission policy: open admission, with payment required.
    if (hive.join_policy !== 'open') fail('Paid Hives use open admission after payment. Change the join policy to Open before submitting.');
    const { rows: [old] } = await db.query('SELECT * FROM hive_monetization WHERE hive_id=$1', [hiveId]);
    if (old && ['closing','closed'].includes(old.state)) fail('Closed paid Hives cannot be reopened.');
    const { rows: [count] } = await db.query(`SELECT COUNT(*)::int AS n FROM hive_monetization WHERE owner_id=$1 AND hive_id<>$2 AND state<>'closed'`, [userId, hiveId]);
    if (count.n >= 3) fail('Plus owners can operate up to three paid Hives.');
    const { rows: [members] } = await db.query(`SELECT COUNT(*)::int AS n FROM hive_members WHERE hive_id=$1 AND user_id<>$2 AND membership_status='active'`, [hiveId, userId]);
    if (!old && members.n) fail('An existing free Hive with members cannot silently become paid. Create a new paid Hive.');
    if (old) {
      const { rows: [subs] } = await db.query(`SELECT COUNT(*)::int AS n FROM billing_subscriptions WHERE hive_id=$1 AND (access_until>NOW() OR status NOT IN ('canceled','expired','incomplete_expired','refunded'))`, [hiveId]);
      if (subs.n) fail('Pricing and benefits are locked while subscriptions have obligations. Close this offering before creating a replacement.');
    }
    const { rows: [account] } = await db.query('SELECT status FROM billing_accounts WHERE user_id=$1', [userId]);
    const state = account?.status === 'connected' ? 'pending_approval' : 'awaiting_verification';
    const { rows: [saved] } = await db.query(`INSERT INTO hive_monetization(hive_id,owner_id,state,monthly_price_cents,benefits,description,cancellation_policy)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(hive_id) DO UPDATE SET state=EXCLUDED.state,
      monthly_price_cents=EXCLUDED.monthly_price_cents,benefits=EXCLUDED.benefits,description=EXCLUDED.description,
      cancellation_policy=EXCLUDED.cancellation_policy,revision=hive_monetization.revision+1,approved_revision=NULL,updated_at=NOW() RETURNING *`,
    [hiveId, userId, state, config.price, config.benefits, config.description, config.cancellationPolicy]);
    await audit(db, userId, hiveId, 'submitted_for_review', { revision: saved.revision });
    return saved;
  });
}
export async function review(hiveId, adminId, body) {
  if (!['approve','request_changes','decline'].includes(body.decision) || typeof body.note !== 'string' || body.note.trim().length < 5) fail('Choose a decision and provide a review reason.');
  return transaction(async db => {
    const { rows: [m] } = await db.query('SELECT * FROM hive_monetization WHERE hive_id=$1 FOR UPDATE', [hiveId]);
    if (!m || !['pending_approval','awaiting_verification','paused'].includes(m.state)) fail('This offering is not awaiting review.');
    const state = body.decision === 'approve' ? 'approved' : 'draft';
    await db.query(`UPDATE hive_monetization SET state=$2,approved_revision=$3,approved_by=$4,approved_at=NOW(),review_note=$5 WHERE hive_id=$1`, [hiveId, state, state === 'approved' ? m.revision : null, adminId, body.note.trim()]);
    await audit(db, adminId, hiveId, body.decision, { note: body.note.trim(), revision: m.revision });
    return { state };
  });
}
export async function publish(hiveId, userId, sdk = stripe()) {
  const account = await refreshAccount(userId, sdk);
  if (account?.status !== 'connected') fail('Stripe identity verification, payments, and payouts must be enabled.');
  return transaction(async db => {
    const hive = await requireOwner(hiveId, userId, db);
    await db.query('SELECT user_id FROM users WHERE user_id=$1 FOR UPDATE', [userId]);
    if (!await hasPlus(userId, db) || hive.hive_status !== 'active' || hive.join_policy !== 'open') fail('Plus and an active, open-admission Hive are required.');
    const { rows: [m] } = await db.query('SELECT * FROM hive_monetization WHERE hive_id=$1 FOR UPDATE', [hiveId]);
    if (!m || !['approved','paused'].includes(m.state) || m.approved_revision !== m.revision) fail('TrueHive review approval is required before publication.');
    await db.query(`UPDATE hive_monetization SET state='active',updated_at=NOW() WHERE hive_id=$1`, [hiveId]);
    await audit(db, userId, hiveId, 'published');
    return { state: 'active' };
  });
}
export async function checkout(userId, body, sdk = stripe()) {
  if(!body||typeof body!=='object'||Array.isArray(body))fail('Invalid checkout request.');
  if(body.hiveId&&!/^[0-9a-f-]{36}$/i.test(body.hiveId))fail('Invalid Hive identifier.');
  const kind = body.hiveId ? 'hive' : 'plus';
  const interval = kind === 'hive' ? 'month' : body.interval;
  if (!PLUS_PRICES[interval]) fail('Choose monthly or annual billing.');
  let account = 'platform';
  if (kind === 'hive') {
    const { rows: [m] } = await query('SELECT owner_id FROM hive_monetization WHERE hive_id=$1', [body.hiveId]);
    if (!m) fail('Paid Hive not found.', 404);
    const verified = await refreshAccount(m.owner_id, sdk);
    if (verified?.status !== 'connected') fail('This Hive cannot currently accept payments.');
    if (await isBlockedEitherWay(userId, m.owner_id)) fail('This Hive is unavailable.', 403);
    account = verified.accountId;
  }
  // Reservation is durable before the network request. Retrying reuses its UUID/key.
  const reservation = await transaction(async db => {
    const { rows: [user] } = await db.query(`SELECT user_id FROM users WHERE user_id=$1 AND account_status='active' AND email_verified=TRUE FOR UPDATE`, [userId]);
    if (!user) fail('An active account with verified email is required.', 403);
    let price = PLUS_PRICES[interval], name = 'TrueHive Plus';
    if (kind === 'hive') {
      const { rows: [h] } = await db.query(`SELECT h.*,m.state,m.monthly_price_cents,m.owner_id FROM hives h JOIN hive_monetization m USING(hive_id) WHERE h.hive_id=$1 FOR UPDATE OF h`, [body.hiveId]);
      if (!h || h.state !== 'active' || h.hive_status !== 'active' || h.join_policy !== 'open' || !await hasPlus(h.owner_id, db)) fail('This Hive is not accepting subscriptions.');
      if (h.owner_id === userId) fail('Owners cannot subscribe to their own Hive.');
      const { rows: [member] } = await db.query(`SELECT 1 FROM hive_members WHERE hive_id=$1 AND user_id=$2 AND membership_status='active'`, [body.hiveId, userId]);
      if (member) fail('You already belong to this Hive.');
      const { rows: [prior] } = await db.query(`SELECT membership_status FROM hive_members WHERE hive_id=$1 AND user_id=$2`, [body.hiveId,userId]);
      if (prior && !['expired'].includes(prior.membership_status)) fail('Contact the Hive owner to resolve your previous membership before subscribing.', 409);
      price = h.monthly_price_cents; name = h.hive_name;
      const { rows: [capacity] } = await db.query(`SELECT
        (SELECT COUNT(*) FROM hive_members WHERE hive_id=$1 AND membership_status='active') +
        (SELECT COUNT(*) FROM billing_checkouts c JOIN billing_subscriptions s ON s.id=c.subscription_id WHERE s.hive_id=$1 AND ((c.status IN ('creating','open') AND c.expires_at>NOW()) OR (c.status='complete' AND s.status IN ('processing','incomplete'))) AND s.user_id<>$2) AS n`, [body.hiveId, userId]);
      if (h.max_members && Number(capacity.n) >= h.max_members) fail('This Hive is full.');
    }
    const { rows: [existing] } = await db.query(`SELECT * FROM billing_subscriptions WHERE user_id=$1 AND kind=$2 AND ($3::uuid IS NULL OR hive_id=$3)
      AND (access_until>NOW() OR status NOT IN ('canceled','expired','incomplete_expired','refunded')
        OR (status='refunded' AND stripe_subscription_id IS NOT NULL AND NOT cancel_at_period_end)) FOR UPDATE`, [userId, kind, body.hiveId || null]);
    if (existing) {
      const { rows: [attempt] } = await db.query(`SELECT * FROM billing_checkouts WHERE subscription_id=$1 AND status IN ('creating','open') AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1`, [existing.id]);
      if (existing.status === 'processing' && attempt) return { sub: existing, attempt, name };
      fail('You already have a subscription or unresolved checkout. Manage it in Billing & Subscriptions.', 409);
    }
    const { rows: [sub] } = await db.query(`INSERT INTO billing_subscriptions(user_id,hive_id,kind,stripe_account_id,interval,price_cents) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [userId, body.hiveId || null, kind, account, interval, price]);
    const { rows: [attempt] } = await db.query('INSERT INTO billing_checkouts(subscription_id) VALUES($1) RETURNING *', [sub.id]);
    return { sub, attempt, name };
  });
  const { sub, attempt, name } = reservation;
  const options = stripeOptions(sub.stripe_account_id, `checkout-${attempt.id}`);
  const metadata = { truehive_subscription_id: sub.id };
  const session = await sdk.checkout.sessions.create({
    mode: 'subscription', client_reference_id: sub.id, metadata,
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: sub.price_cents, recurring: { interval: sub.interval }, product_data: { name } } }],
    subscription_data: { metadata, ...(sub.kind === 'hive' ? { application_fee_percent: PLATFORM_FEE_PERCENT } : {}) },
    expires_at: Math.floor(new Date(attempt.expires_at).getTime() / 1000),
    success_url: `${clientURL()}/settings?billing=activating`, cancel_url: `${clientURL()}/settings?billing=canceled`,
    consent_collection: { terms_of_service: 'required' },
    custom_text: { terms_of_service_acceptance: { message: `I agree to the [TrueHive billing terms](${clientURL()}/terms). Renews automatically; cancel at period end in Billing & Subscriptions.` } },
  }, options);
  await query(`UPDATE billing_checkouts SET stripe_session_id=$2,status=CASE WHEN status='creating' THEN 'open' ELSE status END WHERE id=$1`, [attempt.id, session.id]);
  if (sub.kind === 'hive') {
    const { rows: [current] } = await query('SELECT state FROM hive_monetization WHERE hive_id=$1', [sub.hive_id]);
    if (current?.state !== 'active') {
      await sdk.checkout.sessions.expire(session.id, {}, stripeOptions(sub.stripe_account_id));
      await query(`UPDATE billing_checkouts SET status='expired' WHERE id=$1`, [attempt.id]);
      await query(`UPDATE billing_subscriptions SET status='expired' WHERE id=$1 AND stripe_subscription_id IS NULL`, [sub.id]);
      fail('This Hive stopped accepting subscriptions while Checkout was being prepared.', 409);
    }
  }
  return { url: session.url };
}
export async function cancelSubscription(userId, id, sdk = stripe()) {
  const sub=await transaction(async db=>{
    const found=(await db.query('SELECT id FROM billing_subscriptions WHERE id=$1 AND user_id=$2',[id,userId])).rows[0];
    if(!found)fail('Subscription not found.',404);
    const locked=await lockSubscription(db,id);
    if(!locked.stripe_subscription_id)fail('Subscription not found.',404);
    await db.query('UPDATE billing_subscriptions SET cancellation_requested_at=COALESCE(cancellation_requested_at,NOW()) WHERE id=$1',[id]);
    await db.query(`INSERT INTO billing_tasks(subscription_id,action) VALUES($1,'cancel_at_period_end') ON CONFLICT(subscription_id,action) DO UPDATE SET done_at=NULL,next_attempt_at=NOW()`,[id]);
    return locked;
  });
  try {
    await sdk.subscriptions.update(sub.stripe_subscription_id,{cancel_at_period_end:true},stripeOptions(sub.stripe_account_id));
    return await transaction(async db=>{
      const local=await lockSubscription(db,id);
      const {reconcileSubscription}=await import('./billingEvents.js');
      const current=await reconcileSubscription(db,local,sub.stripe_subscription_id,sdk);
      if(!current.cancelAtPeriodEnd&&!['canceled','incomplete_expired'].includes(current.status))fail('Stripe has not confirmed cancellation.',503);
      return {cancelAtPeriodEnd:true,paidThrough:sub.paid_through};
    });
  } catch {fail('Your cancellation request is saved. Stripe confirmation is pending; automatic retries will continue.',503);}
}
export async function portal(userId, id, sdk = stripe()) {
  const { rows: [sub] } = await query('SELECT * FROM billing_subscriptions WHERE id=$1 AND user_id=$2', [id, userId]);
  if (!sub?.stripe_customer_id) fail('Billing customer not found.', 404);
  // Never inherit an editable Dashboard default: price changes would break the
  // approved contract. Sensitive methods/invoices stay hosted, cancellation uses
  // our explicit paid-through confirmation flow.
  const config = await sdk.billingPortal.configurations.create({
    business_profile: { privacy_policy_url: `${clientURL()}/privacy`, terms_of_service_url: `${clientURL()}/terms` },
    features: { customer_update: { enabled: false }, invoice_history: { enabled: true }, payment_method_update: { enabled: true }, subscription_cancel: { enabled: false }, subscription_update: { enabled: false } },
  }, stripeOptions(sub.stripe_account_id, `portal-config-v1-${sub.stripe_account_id}`));
  return sdk.billingPortal.sessions.create({ customer: sub.stripe_customer_id, configuration: config.id, return_url: `${clientURL()}/settings` }, stripeOptions(sub.stripe_account_id));
}
export async function closeHive(hiveId, userId) {
  return transaction(async db => {
    await db.query('SELECT user_id FROM users WHERE user_id=$1 FOR UPDATE',[userId]);
    await requireOwner(hiveId, userId, db);
    await db.query('SELECT hive_id FROM hives WHERE hive_id=$1 FOR UPDATE', [hiveId]);
    const { rows: [m] } = await db.query('SELECT * FROM hive_monetization WHERE hive_id=$1 FOR UPDATE', [hiveId]);
    if (!m) fail('Paid Hive not found.', 404);
    await db.query(`UPDATE hive_monetization SET state='closing',closed_at=COALESCE(closed_at,NOW()),updated_at=NOW() WHERE hive_id=$1`, [hiveId]);
    await db.query(`INSERT INTO billing_tasks(subscription_id,action) SELECT id,'cancel_at_period_end' FROM billing_subscriptions WHERE hive_id=$1 AND status NOT IN ('canceled','expired','incomplete_expired','refunded') ON CONFLICT DO NOTHING`, [hiveId]);
    await audit(db, userId, hiveId, 'closure_requested');
    return { state: 'closing' };
  });
}
