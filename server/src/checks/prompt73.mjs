// Isolated PostgreSQL/WASM + simulated Stripe. NO live accounts or real charges.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { query, pool } from '../db/index.js';
import { configure, publish, review, checkout, cancelSubscription, closeHive, onboard, refreshAccount, portal } from '../lib/billingService.js';
import { processEvent, webhook } from '../lib/billingEvents.js';
import { financialBlockers, assertNoFinancialBlockers, transaction, expireEntitlements, hasPlus } from '../lib/billingStore.js';
import { accountStatus, subscriptionAccess, PLUS_PRICES } from '../lib/billingPolicy.js';
import { createHive, requestToJoin, deleteHive } from '../controllers/hivesController.js';
import { stripe } from '../lib/stripe.js';
import billingRoutes from '../routes/billing.js';
import { runBillingMaintenance } from '../jobs/billingJob.js';
import { requireMembership } from '../lib/hiveMembership.js';
import { initSocket } from '../realtime/socket.js';
import { createRequire } from 'node:module';
const clientRequire=createRequire(new URL('../../../client/package.json',import.meta.url));
const {io:socketClient}=clientRequire('socket.io-client');
if (process.env.P71B_ISOLATED !== '1') throw new Error('Requires the isolated preload.');
process.env.BILLING_ENABLED='test';process.env.STRIPE_SECRET_KEY='sk_test_fixture';process.env.JWT_SECRET='prompt73-fixture';
process.env.STRIPE_WEBHOOK_SECRET='whsec_fixture_platform';process.env.STRIPE_CONNECT_WEBHOOK_SECRET='whsec_fixture_connect';
process.env.SITE_ADMIN_EMAILS='admin@fixture.invalid';
let count=0;
function check(ok,name){assert.ok(ok,name);count++;console.log(`PASS ${name}`);}
async function rejects(fn,pattern,name){await assert.rejects(fn,pattern);check(true,name);}
async function user(name){return (await query(`INSERT INTO users(email,password_hash,email_verified,last_login) VALUES($1,'fixture',TRUE,NOW()) RETURNING user_id`,[`${name}-${randomUUID()}@fixture.invalid`])).rows[0].user_id;}
async function plus(id){await query(`INSERT INTO billing_subscriptions(user_id,kind,status,price_cents,paid_through,access_until) VALUES($1,'plus','active',799,NOW()+INTERVAL '30 days',NOW()+INTERVAL '30 days')`,[id]);}
async function controller(fn,req){const res={code:200,status(c){this.code=c;return this;},json(d){this.data=d;return this;}};await fn(req,res);return res;}
async function hive(owner,name='Fixture Hive',monetization){const r=await controller(createHive,{userId:owner,body:{name,category:'social',meetingType:'online',maxMembers:10,monetization}});return r;}
const config={monthlyPriceCents:1200,benefits:'Weekly coaching sessions and a curated resource library.',description:'Structured community programming with monthly workshops.',cancellationPolicy:'Cancel at the end of your current paid period. Access continues until then.'};
const accounts=new Map(), liveSubs=new Map(), charges=new Map(), sessions=new Map(), calls=[];
const now=Math.floor(Date.now()/1000), end=now+30*86400;
const connected={id:'acct_owner',charges_enabled:true,payouts_enabled:true,details_submitted:true,capabilities:{card_payments:'active',transfers:'active'},requirements:{currently_due:[],pending_verification:[]}};
const sdk={accounts:{retrieve:async id=>accounts.get(id)},applicationFees:{retrieve:async()=>({amount:120,amount_refunded:0})},
 checkout:{sessions:{create:async(params,options)=>{calls.push({params,options});const id=`cs_${params.client_reference_id}`;const session={id,url:'https://checkout.stripe.com/fixture',status:'open',...params};sessions.set(id,session);return session;},retrieve:async id=>sessions.get(id),expire:async id=>{sessions.get(id).status='expired';return sessions.get(id);}}},
 subscriptions:{retrieve:async id=>{const s=liveSubs.get(id);if(!s)throw new Error('Unknown mock subscription');return structuredClone(s);},update:async(id,params)=>{Object.assign(liveSubs.get(id),params);return structuredClone(liveSubs.get(id));}},
 charges:{retrieve:async id=>structuredClone(charges.get(id))},disputes:{retrieve:async id=>({id,status:'needs_response',amount:1200})}};
let seq=0;
const event=(type,obj,account='acct_owner',created=now)=>({id:`evt_fixture_${++seq}`,type,created,livemode:false,account:account==='platform'?undefined:account,data:{object:obj}});
let server;
try{
 check(PLUS_PRICES.month===799&&PLUS_PRICES.year===6999,'approved Plus prices are integer minor units');
 check(accountStatus({...connected,requirements:{disabled_reason:'rejected.fraud'}})==='restricted','restricted Connect account');
 check(accountStatus({...connected,requirements:{currently_due:['individual.verification.document']}})==='action_required','actual Stripe requirements determine onboarding status');
 check(accountStatus({...connected,requirements:{pending_verification:['individual']}})==='verification_pending','pending identity verification is not connected');
 const free=await user('free'),owner=await user('owner'),member=await user('member'),other=await user('other');
 await rejects(()=>onboard(free,sdk),/Plus/,'Connect onboarding requires Plus');
 const newOwner=await user('new-connect-owner');await plus(newOwner);
 sdk.accounts.create=async()=>{accounts.set('acct_new',connected);return {id:'acct_new'};};
 sdk.accountLinks={create:async params=>({url:'https://connect.stripe.com/fixture',account:params.account})};
 check((await onboard(newOwner,sdk)).account==='acct_new','Stripe-hosted onboarding uses the connected account');
 check((await query('SELECT status FROM billing_accounts WHERE user_id=$1',[newOwner])).rows[0].status==='verification_pending','onboarding redirect alone does not verify owner');
 check((await refreshAccount(newOwner,sdk)).status==='connected','return flow retrieves actual Stripe capability state');
 for (const interval of ['month','year']) {
   const buyer=await user(`plus-${interval}`);await checkout(buyer,{interval},sdk);const request=calls.at(-1);
   check(request.params.line_items[0].price_data.unit_amount===PLUS_PRICES[interval]&&!request.options.stripeAccount&&!request.params.subscription_data.application_fee_percent,`Plus ${interval} is billed on platform separately from Hive fees`);
   const pending=(await query(`SELECT id FROM billing_subscriptions WHERE user_id=$1`,[buyer])).rows[0];
   await processEvent(event('checkout.session.expired',{id:`cs_${pending.id}`,client_reference_id:pending.id},'platform'),sdk);
   check(!await hasPlus(buyer),'abandoned Plus Checkout grants no entitlement');
 }
 const noPlus=await hive(free,'Forbidden paid Hive',{mode:'paid',...config});check(noPlus.code===403,'free owner cannot create paid Hive');
 check((await hive(free)).code===201,'free owner can create one free Hive');check((await hive(free,'Second Hive')).code===409,'free creation limit enforced in database');
 await plus(owner);const made=await hive(owner,'Workshop Circle',{mode:'paid',...config});check(made.code===201,'Plus owner can create a paid draft atomically');const hiveId=made.data.id;
 check((await hive(owner,'Second')).code===201&&(await hive(owner,'Third')).code===201,'Plus owner can create three active Hives');check((await hive(owner,'Fourth')).code===409,'fourth active Hive rejected');
 await rejects(()=>configure(hiveId,other,config),/ownership/,'cross-owner configuration denied');
 await query(`INSERT INTO billing_accounts(user_id,stripe_account_id,status) VALUES($1,'acct_owner','verification_pending')`,[owner]);accounts.set('acct_owner',{...connected,charges_enabled:false});
 await rejects(()=>publish(hiveId,owner,sdk),/verification/,'incomplete Stripe account cannot publish');
 accounts.set('acct_owner',connected);await rejects(()=>publish(hiveId,owner,sdk),/approval/,'Stripe completion alone cannot publish');
 await configure(hiveId,owner,config);const admin=await user('admin');await review(hiveId,admin,{decision:'approve',note:'Ongoing benefits and terms reviewed.'});await publish(hiveId,owner,sdk);
 check((await query('SELECT state FROM hive_monetization WHERE hive_id=$1',[hiveId])).rows[0].state==='active','approved and Stripe-verified Plus owner publishes');
 for(let i=0;i<5;i++){const creator=await user(`free-owner-${i}`),r=await hive(creator,`Free ${i}`);await query(`INSERT INTO hive_members(hive_id,user_id) VALUES($1,$2)`,[r.data.id,member]);}
 const extraOwner=await user('extra-owner'),extra=await hive(extraOwner,'Sixth free');await rejects(()=>query(`INSERT INTO hive_members(hive_id,user_id) VALUES($1,$2)`,[extra.data.id,member]),/five free/,'sixth free membership rejected');
 check((await hive(member,'Sixth via creation')).code===409,'owning a new free Hive cannot bypass the five-membership cap');
 check((await query('SELECT 1 FROM hives WHERE creator_user_id=$1',[member])).rows.length===0,'failed owner admission rolls back Hive creation without an orphan');
 check(!await hasPlus(member),'paid member has no Plus requirement');
 await rejects(()=>query(`INSERT INTO hive_members(hive_id,user_id) VALUES($1,$2)`,[hiveId,member]),/verified paid/,'direct membership insertion cannot bypass verified billing');
 check((await controller(requestToJoin,{userId:member,params:{id:hiveId},body:{}})).code===402,'legacy join route cannot bypass payment');
 await checkout(member,{hiveId,price:1,platformFee:0},sdk);const call=calls.at(-1);check(call.params.line_items[0].price_data.unit_amount===1200&&call.params.subscription_data.application_fee_percent===10,'Checkout ignores client price and applies 10% fee');
 check(call.options.stripeAccount==='acct_owner'&&call.params.subscription_data.metadata.truehive_subscription_id,'direct charge and server-side reservation metadata');
 const local=(await query(`SELECT * FROM billing_subscriptions WHERE user_id=$1 AND kind='hive'`,[member])).rows[0];
 check(!subscriptionAccess(local),'Checkout creation or success redirect grants no access');
 await checkout(member,{hiveId},sdk);check(calls.at(-1).options.idempotencyKey===call.options.idempotencyKey,'checkout retry reuses durable idempotency key');
 const charge={id:'ch_fixture',amount:1200,amount_refunded:0,refunded:false,invoice:'in_fixture',application_fee:'fee_fixture',balance_transaction:{fee_details:[{type:'stripe_fee',amount:45},{type:'application_fee',amount:120}]}};charges.set(charge.id,charge);
 const live={id:'sub_fixture',livemode:false,metadata:{truehive_subscription_id:local.id},customer:'cus_fixture',status:'active',cancel_at_period_end:false,application_fee_percent:10,items:{data:[{quantity:1,price:{unit_amount:1200,currency:'usd',recurring:{interval:'month',interval_count:1}}}]},latest_invoice:{id:'in_fixture',status:'paid',amount_paid:1200,paid_out_of_band:false,lines:{data:[{period:{end}}]},charge}};liveSubs.set(live.id,live);
 await processEvent(event('checkout.session.completed',{id:`cs_${local.id}`,client_reference_id:local.id,subscription:live.id,customer:'cus_fixture'}),sdk);
 check(!(await query(`SELECT 1 FROM hive_members WHERE hive_id=$1 AND user_id=$2`,[hiveId,member])).rows.length,'verified Checkout completion alone still does not admit');
 const paidEvent=event('invoice.paid',{id:'in_fixture',subscription:live.id});await processEvent(paidEvent,sdk);
 check((await requireMembership(hiveId,member)).membership_status==='active','verified paid invoice activates Hive access despite five free memberships');
 check((await processEvent(paidEvent,sdk)).duplicate,'duplicate webhook is idempotent');
 sdk.billingPortal={configurations:{create:async params=>{check(!params.features.subscription_update.enabled&&!params.features.subscription_cancel.enabled,'hosted portal cannot change approved prices or cancellation rules');return{id:'bpc_fixture'};}},sessions:{create:async(params,options)=>{check(params.customer==='cus_fixture'&&options.stripeAccount==='acct_owner','member portal is scoped to correct Stripe customer and account');return{url:'https://billing.stripe.com/fixture'};}}};
 await portal(member,local.id,sdk);await rejects(()=>portal(other,local.id,sdk),/not found/,'cannot open another member billing portal');
 const invoice=(await query('SELECT * FROM billing_invoices WHERE subscription_id=$1',[local.id])).rows[0];check(Number(invoice.platform_fee_cents)===120&&Number(invoice.processing_fee_cents)===45,'actual platform and processing costs are separate');
 await rejects(()=>checkout(member,{hiveId},sdk),/already belong|already have/,'duplicate active subscription blocked');
 await rejects(()=>cancelSubscription(other,local.id,sdk),/not found/,'cannot cancel another member subscription');
 await rejects(()=>configure(hiveId,owner,{...config,monthlyPriceCents:1500}),/locked/,'live price changes cannot silently alter subscriber contract');
 live.status='past_due';live.latest_invoice={id:'in_failed',status:'open',amount_paid:0};await processEvent(event('invoice.payment_failed',{subscription:live.id}),sdk);
 const overdue=(await query('SELECT * FROM billing_subscriptions WHERE id=$1',[local.id])).rows[0];check(new Date(overdue.access_until).getTime()===end*1000+3*86400000,'failed renewal retains paid access plus three-day grace');
 charge.id='ch_recovered';charges.set(charge.id,charge);
 live.status='active';live.latest_invoice={...structuredClone(liveSubs.get(live.id).latest_invoice),id:'in_recovered',status:'paid',amount_paid:1200,lines:{data:[{period:{end:end+30*86400}}]},charge};await processEvent(event('invoice.paid',{subscription:live.id}),sdk);
 await processEvent(event('customer.subscription.updated',{id:live.id},'acct_owner',now-300),sdk);check((await query('SELECT status FROM billing_subscriptions WHERE id=$1',[local.id])).rows[0].status==='active','old event reconciles current Stripe state instead of regressing status');
 await cancelSubscription(member,local.id,sdk);check(live.cancel_at_period_end&&Boolean(await requireMembership(hiveId,member)),'member cancellation stops renewal and preserves access');
 charge.amount_refunded=300;await processEvent(event('charge.refunded',charge),sdk);check(Boolean(await requireMembership(hiveId,member)),'partial refund preserves paid access');
 let refundState='pending';sdk.refunds={retrieve:async()=>({id:'re_fixture',amount:300,status:refundState})};
 await processEvent(event('refund.created',{id:'re_fixture',charge:charge.id}),sdk);
 check((await query('SELECT status FROM billing_refunds WHERE stripe_refund_id=$1',['re_fixture'])).rows[0].status==='pending','pending refunds are persisted as unresolved obligations');
 refundState='succeeded';await processEvent(event('refund.updated',{id:'re_fixture',charge:charge.id}),sdk);
 check((await query('SELECT status FROM billing_refunds WHERE stripe_refund_id=$1',['re_fixture'])).rows[0].status==='succeeded','refund status follows current verified Stripe state');
 await processEvent(event('charge.dispute.created',{id:'dp_fixture',charge:charge.id}),sdk);check(Boolean(await requireMembership(hiveId,member)),'dispute records review without automatic access revocation');
 check((await financialBlockers(owner)).length===1,'unresolved subscriptions and disputes block owner deletion');
 await rejects(()=>transaction(db=>assertNoFinancialBlockers(owner,db)),/cannot delete/,'account deletion blocker enforced server-side');
 const deletion=await controller(deleteHive,{userId:owner,params:{id:hiveId},body:{confirmName:'Workshop Circle'}});check(deletion.code===409,'paid Hive delete is blocked to preserve history');
 // A second subscription uses an independent renewal boundary.
 await checkout(other,{hiveId},sdk);const second=(await query(`SELECT * FROM billing_subscriptions WHERE user_id=$1 AND kind='hive'`,[other])).rows[0];
 const live2={...structuredClone(live),id:'sub_second',metadata:{truehive_subscription_id:second.id},customer:'cus_second',cancel_at_period_end:false,latest_invoice:{...structuredClone(live.latest_invoice),id:'in_second',lines:{data:[{period:{end:end+5*86400}}]},charge:null}};liveSubs.set(live2.id,live2);sessions.get(`cs_${second.id}`).subscription=live2.id;sessions.get(`cs_${second.id}`).status='complete';
 await processEvent(event('invoice.paid',{subscription:live2.id}),sdk);await closeHive(hiveId,owner);
 await rejects(async()=>checkout(await user('late'),{hiveId},sdk),/not accepting/,'closed/closing Hive blocks new purchases');
 const updateSubscription=sdk.subscriptions.update;let failOnce=true;sdk.subscriptions.update=async(...args)=>{if(failOnce){failOnce=false;throw Object.assign(new Error('Simulated Stripe outage'),{code:'fixture_outage'});}return updateSubscription(...args);};
 await runBillingMaintenance(sdk);check((await query('SELECT 1 FROM billing_tasks WHERE done_at IS NULL AND attempts>0')).rows.length>0,'failed Stripe cancellation remains queued for retry');
 await query('UPDATE billing_tasks SET next_attempt_at=NOW() WHERE done_at IS NULL');
 await runBillingMaintenance(sdk);check(live2.cancel_at_period_end&&live.cancel_at_period_end,'closure worker retries and cancels individual renewals');
 const boundaries=(await query('SELECT paid_through FROM billing_subscriptions WHERE hive_id=$1 ORDER BY paid_through',[hiveId])).rows;check(new Date(boundaries[0].paid_through).getTime()!==new Date(boundaries[1].paid_through).getTime(),'closure retains different paid-through dates');
 check(Boolean(await requireMembership(hiveId,other)),'closing does not revoke already paid access');
 charge.amount_refunded=1200;charge.refunded=true;await processEvent(event('charge.refunded',charge),sdk);await rejects(()=>requireMembership(hiveId,member),/must be a member/,'full current-period refund revokes refunded access');
 await query(`UPDATE billing_subscriptions SET access_until=NOW()-INTERVAL '1 day',paid_through=NOW()-INTERVAL '1 day' WHERE id=$1`,[second.id]);await expireEntitlements(other);await rejects(()=>requireMembership(hiveId,other),/must be a member/,'expired paid period denies access without needing webhook');
 // Real Stripe SDK signature verification + real Express routes, simulated API only.
 const real=stripe();Object.assign(real.accounts,sdk.accounts);Object.assign(real.subscriptions,sdk.subscriptions);
 const app=express();app.post('/webhook/:source',express.raw({type:'application/json'}),webhook);app.use(express.json(),cookieParser());app.use('/api/billing',billingRoutes);
 server=app.listen(0,'127.0.0.1');const socketServer=initSocket(server,['http://localhost']);await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const socketUser=await user('socket-expiry');
 await query(`INSERT INTO billing_subscriptions(user_id,hive_id,kind,status,price_cents,paid_through,access_until) VALUES($1,$2,'hive','active',1200,clock_timestamp()+INTERVAL '3 seconds',clock_timestamp()+INTERVAL '3 seconds')`,[socketUser,hiveId]);
 await query(`INSERT INTO hive_members(hive_id,user_id) VALUES($1,$2)`,[hiveId,socketUser]);
 const socket=socketClient(base,{transports:['websocket'],extraHeaders:{Cookie:`token=${jwt.sign({userId:socketUser},process.env.JWT_SECRET)}`},reconnection:false});
 try {
   await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
   const ack=await new Promise(resolve=>socket.emit('join_hive_room',{hiveId},resolve));check(ack.ok,'paid member can join a real Socket.IO Hive room');
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Paid socket did not expire')),6000);socket.once('disconnect',()=>{clearTimeout(timer);resolve();});});
   check(!socket.connected,'connected socket stops receiving paid content at entitlement expiry');
 } finally {socket.disconnect();}
 const post=async(payload,signature,source='connect')=>fetch(`${base}/webhook/${source}`,{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signature},body:payload});
 const payload=JSON.stringify(event('fixture.unknown',{}));
 check((await post(payload,'invalid')).status===400,'invalid raw-body webhook signature rejected');
 await rejects(()=>processEvent({...event('fixture.unknown',{}),livemode:true},sdk),/Live events/,'live-money events rejected');
 const header=real.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_CONNECT_WEBHOOK_SECRET});check((await post(payload,header)).status===200,'valid signed webhook accepted');
 const old=real.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_CONNECT_WEBHOOK_SECRET,timestamp:now-1000});check((await post(payload,old)).status===400,'stale signature rejected by timestamp tolerance');
 check((await fetch(`${base}/api/billing/summary`)).status===401,'billing API requires authenticated session');
 const cookie=`token=${jwt.sign({userId:member},process.env.JWT_SECRET)}`;
 const jsonHeaders={cookie,'Content-Type':'application/json'};
 const requestRefund=await fetch(`${base}/api/billing/subscriptions/${local.id}/refund-request`,{method:'POST',headers:jsonHeaders,body:JSON.stringify({reason:'The scheduled workshop was canceled. Please review my payment.'})});
 check(requestRefund.status===200,'member can request a refund for their own invoice after access ends');
 check((await fetch(`${base}/api/billing/subscriptions/${local.id}/refund-request`,{method:'POST',headers:jsonHeaders,body:JSON.stringify({reason:'Please review this duplicate refund request.'})})).status===409,'duplicate refund requests cannot spam the owner');
 const otherCookie=`token=${jwt.sign({userId:other},process.env.JWT_SECRET)}`;
 check((await fetch(`${base}/api/billing/subscriptions/${local.id}/refund-request`,{method:'POST',headers:{cookie:otherCookie,'Content-Type':'application/json'},body:JSON.stringify({reason:'Attempt to request another member payment.'})})).status===404,'refund request is isolated to the paying member');
 const summary=await (await fetch(`${base}/api/billing/summary`,{headers:{cookie}})).json();check(summary.subscriptions.every(s=>s.kind==='hive')&&!JSON.stringify(summary).includes('acct_owner'),'member summary isolates subscriptions and hides connected account identifiers');
 check((await fetch(`${base}/api/billing/hives/${hiveId}/owner`,{headers:{cookie}})).status===404,'member cannot access owner financial API');
 check((await fetch(`${base}/api/billing/admin/reviews`,{headers:{cookie}})).status===404,'non-staff cannot access moderation queue');
 await pool.isolatedExec(await (await import('node:fs/promises')).readFile(new URL('../db/billing.sql',import.meta.url),'utf8'));
 check((await query('SELECT 1 FROM billing_invoices WHERE subscription_id=$1',[local.id])).rows.length>0,'structural billing migration reruns without erasing financial history');
 check((await query('SELECT COUNT(*)::int AS n FROM billing_events WHERE event_id=$1',[paidEvent.id])).rows[0].n===1,'one durable processed record per webhook');
 const oldInvoice={id:'in_older_late',subscription:live2.id,currency:'usd',status:'paid',amount_paid:1200,lines:{data:[{period:{end:now-86400}}]},charge:null};
 sdk.invoices={retrieve:async()=>structuredClone(oldInvoice)};await processEvent(event('invoice.paid',{id:oldInvoice.id,subscription:live2.id}),sdk);
 check((await query('SELECT 1 FROM billing_invoices WHERE stripe_invoice_id=$1',[oldInvoice.id])).rows.length===1,'late historical invoice is recorded independently of current renewal');
 delete sdk.invoices;
 const emptyOwner=await user('empty-draft-owner');await plus(emptyOwner);const emptyDraft=await hive(emptyOwner,'Never published',{mode:'paid',...config});await closeHive(emptyDraft.data.id,emptyOwner);await runBillingMaintenance(sdk);
 check((await financialBlockers(emptyOwner)).length===0,'closed unpaid draft without a payout account does not create permanent financial deletion blocker');
 const tampered={...structuredClone(live2),items:{data:[{quantity:1,price:{unit_amount:1,currency:'usd',recurring:{interval:'month',interval_count:1}}}]}};liveSubs.set(live2.id,tampered);const bad=event('customer.subscription.updated',{id:live2.id});await rejects(()=>processEvent(bad,sdk),/approved product/,'tampered Stripe product fails closed');check(!(await query('SELECT 1 FROM billing_events WHERE event_id=$1',[bad.id])).rows.length,'failed processing rolls back event receipt for safe retry');
 console.log(`PROMPT73: ${count} checks passed. Stripe simulated; SQL, HTTP, authorization, and signatures real. No production access.`);
}finally{if(server)await new Promise(r=>server.close(r));await pool.end();}
