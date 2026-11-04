// Real failed-renewal fixture; isolated clock seam and local delayed-event test.
import fs from 'node:fs';import dotenv from 'dotenv';import Stripe from 'stripe';import assert from 'node:assert/strict';
import {pool,query} from '../db/index.js';import {hasPlus} from '../lib/billingStore.js';import {subscriptionAccess} from '../lib/billingPolicy.js';import {processEvent} from '../lib/billingEvents.js';
assert.equal(process.env.P71B_ISOLATED,'1');assert.equal(pool.verifiedDevFixture,true);
const e=dotenv.parse(fs.readFileSync('.env'));assert(e.STRIPE_SECRET_KEY.startsWith('sk_test_'));
const evidence=JSON.parse(fs.readFileSync('sandbox.local/phase4b-renewal-failed-actual.json'));assert.equal(evidence.report.status,'PASS');const local=evidence.local;
assert.equal(local.stripe_subscription_id,'sub_1UXERTRuxbB0fH110fVtiWuf');assert.equal(local.status,'past_due');
const sdk=new Stripe(e.STRIPE_SECRET_KEY,{apiVersion:'2025-02-24.acacia'});const reader={subscriptions:{retrieve:async(id,p,o)=>{assert.equal(id,local.stripe_subscription_id);assert(!o?.stripeAccount);return sdk.subscriptions.retrieve(id,p,o);}}};
let n=0;const pass=(v,t)=>{assert.ok(v,t);n++;console.log('PASS '+t);};const report={status:'FAIL',scope:'isolated time-aware harness; actual failed-renewal fixture; local delayed events'};
try {
 const schema=(await query('SELECT current_schema() s')).rows[0].s;assert.match(schema,/^p73a_system_[a-f0-9]{32}$/);
 const paid=Date.parse(local.paid_through),end=Date.parse(local.access_until);assert.equal(end,paid+3*86400000);
 await query(`INSERT INTO users(user_id,email,password_hash,email_verified) VALUES($1,'renewal-grace-harness@truehive-test.invalid','fixture',TRUE)`,[local.user_id]);
 await query(`INSERT INTO billing_subscriptions(id,user_id,kind,status,interval,price_cents,stripe_account_id,stripe_subscription_id,stripe_customer_id,paid_through,access_until) VALUES($1,$2,'plus','past_due','month',799,'platform',$3,$4,$5,$6)`,[local.id,local.user_id,local.stripe_subscription_id,local.stripe_customer_id,local.paid_through,local.access_until]);
 await query('CREATE TABLE acceptance_clock(now_at TIMESTAMPTZ NOT NULL)');await query('INSERT INTO acceptance_clock VALUES($1)',[new Date(paid+1000)]);
 await query(`CREATE FUNCTION acceptance_now() RETURNS TIMESTAMPTZ LANGUAGE SQL STABLE AS 'SELECT now_at FROM acceptance_clock'`);
 const def=(await query("SELECT pg_get_functiondef('billing_has_plus(uuid)'::regprocedure) d")).rows[0].d;assert.match(def,/NOW\(\)/i);await query(def.replace(/NOW\(\)/gi,'acceptance_now()'));
 pass(await hasPlus(local.user_id)&&subscriptionAccess(local,paid+1000),'actual unpaid renewal retains previously-paid access inside grace');
 await query('UPDATE acceptance_clock SET now_at=$1',[new Date(end-1)]);pass(await hasPlus(local.user_id)&&subscriptionAccess(local,end-1),'access allowed one millisecond before three-day grace ends');
 await query('UPDATE acceptance_clock SET now_at=$1',[new Date(end)]);pass(!await hasPlus(local.user_id)&&!subscriptionAccess(local,end),'access denied at exact grace end without recovery payment');
 await query('UPDATE acceptance_clock SET now_at=$1',[new Date(end+1000)]);pass(!await hasPlus(local.user_id)&&!subscriptionAccess(local,end+1000),'access denied after grace even while Stripe remains past_due');
 // Local envelope based on the earlier real paid event, not a new Stripe delivery.
 // Its original event ID comes from the verified initial paid invoice receipt.
 const initial=JSON.parse(fs.readFileSync('sandbox.local/phase4b-renewal-verification.json'));
 const paidEvent=initial.webhooks.find(x=>x.type==='invoice.paid');assert(paidEvent);
 const originalEvent=await sdk.events.retrieve(paidEvent.id);assert.equal(originalEvent.livemode,false);assert.equal(originalEvent.data.object.id,initial.invoiceId);
 await processEvent(originalEvent,reader);
 const current=(await query('SELECT * FROM billing_subscriptions WHERE id=$1',[local.id])).rows[0];
 if(current.status==='past_due') {
  pass(current.paid_through.getTime()===paid&&current.access_until.getTime()===end&&!await hasPlus(local.user_id),'locally delayed original invoice.paid cannot turn unpaid renewal into paid access');
  pass((await processEvent(originalEvent,reader)).duplicate&&!await hasPlus(local.user_id),'local duplicate paid event remains idempotent and cannot bypass expiry');
  pass((await query('SELECT COUNT(*)::int n FROM billing_invoices')).rows[0].n===0,'unpaid current renewal creates no paid ledger entry in reconciliation');
 } else {
  // This real fixture was subsequently recovered with explicit authorization.
  // Re-running must honor current verified paid evidence, not assert past_due.
  const recovery=JSON.parse(fs.readFileSync('sandbox.local/phase4b-recovery-verification.json'));
  assert.equal(recovery.status,'PASS');assert.equal(recovery.subscriptionId,current.stripe_subscription_id);
  pass(current.status==='active'&&current.paid_through.toISOString()===recovery.paidThrough&&current.access_until.toISOString()===recovery.accessUntil&&await hasPlus(local.user_id),'current real paid recovery legitimately extends access; historical payload cannot regress it');
  pass((await processEvent(originalEvent,reader)).duplicate&&await hasPlus(local.user_id),'local duplicate retains only the verified recovered period');
  const ledger=(await query('SELECT * FROM billing_invoices')).rows;
  pass(ledger.length===1&&ledger[0].stripe_invoice_id===recovery.invoiceId&&Number(ledger[0].amount_paid_cents)===799,'only actual current paid recovery invoice is reconciled');
 }
 pass(Date.now()<paid&&(await query('SELECT NOW() n')).rows[0].n.getTime()<paid,'global system and SQL clocks unchanged');
 Object.assign(report,{status:'PASS',checksPassed:n,graceSeconds:3*86400,paidThrough:new Date(paid).toISOString(),graceEnd:new Date(end).toISOString(),duringGrace:true,atAndAfterGraceDeniedWithoutRecovery:true,delayedEventUsesVerifiedCurrentState:true,currentStripeStatus:current.status,realStripeRetryExhaustion:'NOT RUN',newRecoveryPayment:'NOT RUN'});
}catch(error){report.errorCode=error.code||error.type||error.name;process.exitCode=1;}finally{await pool.end();}
fs.writeFileSync('sandbox.local/phase4b-renewal-grace-harness.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
