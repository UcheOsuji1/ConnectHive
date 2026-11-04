// Actual canceled Stripe fixture; isolated SQL/HTTP time-aware acceptance.
// Delivery of the historical event below is LOCAL, not a Stripe-origin retry.
import fs from 'node:fs';import dotenv from 'dotenv';import assert from 'node:assert/strict';import Stripe from 'stripe';
import express from 'express';import cookieParser from 'cookie-parser';import jwt from 'jsonwebtoken';
import {pool,query} from '../db/index.js';import {hasPlus} from '../lib/billingStore.js';
import {subscriptionAccess} from '../lib/billingPolicy.js';import {processEvent} from '../lib/billingEvents.js';
import billingRoutes from '../routes/billing.js';import {requireAuth} from '../middleware/auth.js';import {createHive} from '../controllers/hivesController.js';
assert.equal(process.env.P71B_ISOLATED,'1');assert.equal(pool.verifiedDevFixture,true);
const env=dotenv.parse(fs.readFileSync(process.env.P73A_ENV_FILE || '.env'));assert(env.STRIPE_SECRET_KEY.startsWith('sk_test_'));
const evidence=JSON.parse(fs.readFileSync('sandbox.local/phase4b-period-end-actual.json'));
assert.equal(evidence.report.status,'PASS');const original=evidence.local;
assert.equal(original.stripe_subscription_id,'sub_1UXE6tRuxbB0fH11VWNl0Cx7');assert.equal(original.status,'canceled');
const sdk=new Stripe(env.STRIPE_SECRET_KEY,{apiVersion:'2025-02-24.acacia'});
// Only the read required by the current-state event reconciler is exposed.
const reader={subscriptions:{retrieve:async(id,params,options)=>{assert.equal(id,original.stripe_subscription_id);assert(!options?.stripeAccount);return sdk.subscriptions.retrieve(id,params,options);}}};
process.env.BILLING_ENABLED='test';process.env.JWT_SECRET='isolated-time-aware-acceptance-only';
let server,n=0;const pass=(ok,label)=>{assert.ok(ok,label);n++;console.log('PASS '+label);};
const report={status:'FAIL',scope:'isolated schema; actual canceled Stripe fixture; local historical-event delivery',checks:[]};
try {
 const {rows:[context]}=await query('SELECT current_schema() s,current_schemas(false) schemas');assert.match(context.s,/^p73a_system_[a-f0-9]{32}$/);assert(!context.schemas.includes('public'));
 const end=new Date(original.paid_through).getTime();assert.equal(new Date(original.access_until).getTime(),end);assert(Date.now()<end);
 await query(`INSERT INTO users(user_id,email,password_hash,email_verified) VALUES($1,'expiry-harness@truehive-test.invalid','fixture',TRUE)`,[original.user_id]);
 await query(`INSERT INTO billing_subscriptions(id,user_id,kind,status,interval,price_cents,stripe_account_id,stripe_subscription_id,stripe_customer_id,paid_through,access_until,cancel_at_period_end,cancellation_requested_at)
 VALUES($1,$2,'plus','canceled','month',799,'platform',$3,$4,$5,$6,$7,$8)`,[original.id,original.user_id,original.stripe_subscription_id,original.stripe_customer_id,original.paid_through,original.access_until,original.cancel_at_period_end,original.cancellation_requested_at]);
 await query('CREATE TABLE acceptance_clock(now_at TIMESTAMPTZ NOT NULL)');await query('INSERT INTO acceptance_clock VALUES($1)',[new Date(end-1)]);
 await query(`CREATE FUNCTION acceptance_now() RETURNS TIMESTAMPTZ LANGUAGE SQL STABLE AS 'SELECT now_at FROM acceptance_clock'`);
 const definition=(await query("SELECT pg_get_functiondef('billing_has_plus(uuid)'::regprocedure) d")).rows[0].d;
 assert.match(definition,/NOW\(\)/i);
 // Only this fixture's billing_has_plus clock dependency is replaced. Its
 // entitlement predicate, real data and application code stay unchanged.
 await query(definition.replace(/NOW\(\)/gi,'acceptance_now()'));
 pass(await hasPlus(original.user_id)&&subscriptionAccess(original,end-1),'access remains available one millisecond before actual paid boundary');
 const app=express();app.use(express.json(),cookieParser());app.use('/api/billing',billingRoutes);app.post('/api/hives',requireAuth,createHive);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const cookie='token='+jwt.sign({userId:original.user_id,tokenVersion:0},process.env.JWT_SECRET,{expiresIn:'5m'});
 const summary=async()=>{const res=await fetch(base+'/api/billing/summary',{headers:{cookie}});assert.equal(res.status,200);return res.json();};
 pass((await summary()).plus===true,'real authenticated billing route reports Plus before boundary in isolated clock harness');
 await query('UPDATE acceptance_clock SET now_at=$1',[new Date(end)]);
 pass(!await hasPlus(original.user_id)&&!subscriptionAccess(original,end),'SQL and application access deny at exact paid boundary');
 await query('UPDATE acceptance_clock SET now_at=$1',[new Date(end+1000)]);
 pass(!await hasPlus(original.user_id)&&!(await summary()).plus&&!subscriptionAccess(original,end+1000),'authenticated summary and policy deny Plus after paid period');
 const protectedAttempt=await fetch(base+'/api/hives',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({name:'Must not create paid Hive',category:'social',monetization:{mode:'paid',monthlyPriceCents:1200,benefits:'Ongoing test benefits for this isolated acceptance fixture.',description:'A synthetic ongoing membership used only for access testing.',cancellationPolicy:'Cancel at period end while keeping your already-paid access.'}})});
 pass(protectedAttempt.status===403,'real paid-Hive controller denies expired Plus owner with HTTP 403');
 const stale=evidence.staleEvent;assert.equal(stale.data.object.status,'active');assert.equal(stale.data.object.id,original.stripe_subscription_id);
 await processEvent(stale,reader);
 let current=(await query('SELECT * FROM billing_subscriptions WHERE id=$1',[original.id])).rows[0];
 pass(current.status==='canceled'&&new Date(current.paid_through).getTime()===end&&new Date(current.access_until).getTime()===end&&!await hasPlus(original.user_id)&&!(await summary()).plus,'locally delayed real active-state payload reconciles current Stripe cancellation without reactivation');
 pass((await processEvent(stale,reader)).duplicate&&!await hasPlus(original.user_id),'local duplicate delivery remains idempotent after expiry');
 pass((await query('SELECT NOW() real_now')).rows[0].real_now.getTime()<end&&Date.now()<end,'database NOW and system clock remain unchanged');
 pass((await query('SELECT COUNT(*)::int n FROM hives')).rows[0].n===0,'denied paid action creates no Hive');
 Object.assign(report,{status:'PASS',checksPassed:n,postExpirationEntitlement:'PASS',exactBoundaryDenied:true,afterBoundaryDenied:true,protectedFeatureStatus:protectedAttempt.status,stalePayloadStatus:stale.data.object.status,currentStripeStatus:current.status,paidThroughUnchanged:true,actualWallClockChanged:false,realPaymentEvidence:evidence.report.webhook.eventId});
}catch(e){report.errorCode=e.code||e.type||e.name;process.exitCode=1;}finally{if(server)await new Promise(r=>server.close(r));await pool.end();}
fs.writeFileSync('sandbox.local/phase4b-expiry-harness.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
