// Supported Stripe API financial integration. Hosted Checkout was accepted
// separately; this runner never fabricates Checkout completion or signatures.
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import dotenv from 'dotenv';import pg from 'pg';import Stripe from 'stripe';import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';import {Budget,PLAN,PLAN_HASH} from './budget.mjs';
import {chargeAccounting} from './accounting.mjs';
import {cleanupOffering} from './cleanup.mjs';
import {waitForRetryDecision,canHoldFailedFixture} from './retrySchedule.mjs';
if(!process.argv.includes('--execute')){console.log(JSON.stringify({mode:'PLAN_ONLY',planHash:PLAN_HASH,plan:PLAN},null,2));process.exit(0);}
const approvalPath=process.argv[process.argv.indexOf('--approval')+1];
if(!process.argv.includes('--approval')||!approvalPath)throw Error('Explicit approved budget file required');
const approval=JSON.parse(fs.readFileSync(approvalPath));
// Validate BEFORE loading credentials, opening DB or constructing SDK.
if(!approval.approved||approval.planHash!==PLAN_HASH||!/^[a-f0-9-]{36}$/.test(approval.runId))throw Error('Invalid budget authorization');
const root=path.resolve('sandbox.local/acceptance',approval.runId);fs.mkdirSync(root,{recursive:true});
const budget=new Budget({approval,stateFile:path.join(root,'journal.json')});
const env=dotenv.parse(fs.readFileSync('.env'));
assert.equal(env.BILLING_ENABLED,'test');assert(env.STRIPE_SECRET_KEY.startsWith('sk_test_'));assert.equal(new URL(env.DATABASE_URL).hostname.split('.')[0].replace(/-pooler$/,''),PLAN.endpoint);
const db=new pg.Client({connectionString:env.DATABASE_URL}),sdk=new Stripe(env.STRIPE_SECRET_KEY,{apiVersion:'2025-02-24.acacia',maxNetworkRetries:2});
const account='acct_1UWppORuxbP8zrXG',ownerId='0b7e7024-f1ae-4561-986b-9ff44e563444';
const lock=fs.openSync(path.join(root,'run.lock'),'wx');
const metadata=extra=>({truehive_acceptance_run:approval.runId,...extra});
const opts=(acct,key)=>({...acct?{stripeAccount:acct}:{},...key?{idempotencyKey:key}:{}});
const wait=async(fn,label)=>{for(let i=0;i<90;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,1000));}throw Error('Timed out: '+label);};
const cookie=id=>'token='+jwt.sign({userId:id,tokenVersion:0},env.JWT_SECRET,{expiresIn:'30m'});
async function api(user,url,body){const r=await fetch('http://localhost:5183/api'+url,{method:body?'POST':'GET',headers:{cookie:cookie(user),'Content-Type':'application/json'},...body?{body:JSON.stringify(body)}:{}});if(!r.ok)throw Error('Backend request failed: '+r.status);return r.json();}
async function mutate(label,effects,params,fn){return budget.operation(label,effects,params,async key=>{const value=await fn(key);return{id:value.id,status:value.status};});}
async function signedEvent(f,type,objectId){
 return wait(async()=>{
  const events=await sdk.events.list({type,limit:100},opts(f.account));
  if(events.has_more)throw Error('Event listing truncated; cannot certify delivery');const event=events.data.find(e=>e.data.object.id===objectId);if(!event)return false;if(event.account)assert.equal(event.account,f.account);
  const {rows:[r]}=await db.query(`SELECT e.event_id,a.processed_at,i.processed_at inbox_processed,i.payload FROM billing_events e JOIN billing_webhook_attempts a USING(event_id) JOIN billing_event_inbox i USING(event_id) WHERE e.event_id=$1 AND e.account_id=$2 AND a.last_error_code IS NULL`,[event.id,f.account||'platform']);
  if(!r?.processed_at||!r.inbox_processed)return false;assert.equal(r.payload.account||'platform',f.account||'platform');assert.equal(r.payload.data.object.id,objectId);return event.id;
 },'actual signed '+type+' delivery');
}
const paidEvent=(f,id)=>signedEvent(f,'invoice.paid',id);
async function duplicates(f,objectId,type='invoice.paid'){
 const events=await sdk.events.list({type,limit:100},opts(f.account));const event=events.data.find(e=>e.data.object.id===objectId);assert(event);const stored=(await db.query('SELECT payload FROM billing_event_inbox WHERE event_id=$1 AND processed_at IS NOT NULL',[event.id])).rows[0]?.payload;assert(stored);assert.equal(stored.account||'platform',f.account||'platform');assert.equal(stored.data.object.id,objectId);
 const snapshot=async()=>JSON.stringify((await db.query(`SELECT (SELECT COUNT(*) FROM billing_subscriptions WHERE user_id=$1) subscriptions,(SELECT COUNT(*) FROM billing_invoices WHERE subscription_id=$2) invoices,(SELECT COUNT(*) FROM billing_refunds WHERE subscription_id=$2) refunds,(SELECT COUNT(*) FROM hive_members WHERE user_id=$1) memberships`,[f.userId,f.localId])).rows);
 const before=await snapshot();Object.assign(process.env,{DATABASE_URL:env.DATABASE_URL,BILLING_ENABLED:'test',STRIPE_SECRET_KEY:env.STRIPE_SECRET_KEY});
 const {processEvent}=await import('../../lib/billingEvents.js');for(let i=0;i<2;i++){const result=await processEvent(stored,sdk);assert.equal(result.duplicate,true);}assert.equal(await snapshot(),before);
 budget.state.evidence.localDuplicateTests??=[];budget.state.evidence.localDuplicateTests.push({event:event.id,type,object:objectId,duplicate:true,origin:'local processor replay of actual event; not Stripe redelivery'});budget.save();
}
async function financialReconcile(f,invoiceId){
 const invoice=await sdk.invoices.retrieve(invoiceId,{expand:['charge.balance_transaction']},opts(f.account));
 assert.equal(invoice.customer,f.customerId);assert.equal(typeof invoice.subscription==='string'?invoice.subscription:invoice.subscription.id,f.subId);
 assert.equal(invoice.status,'paid');assert.equal(invoice.paid_out_of_band,false);assert.equal(invoice.amount_paid,f.amount);
 const charge=invoice.charge;assert.equal(charge.status,'succeeded');assert.equal(charge.livemode,false);
 const tx=charge.balance_transaction;assert(tx&&typeof tx==='object');
 const ledger=await wait(async()=>{const r=(await db.query('SELECT * FROM billing_invoices WHERE subscription_id=$1 AND stripe_invoice_id=$2',[f.localId,invoiceId])).rows[0];return r&&Number(r.refunded_cents)===charge.amount_refunded?r:false;},'financial ledger reconciliation');
 const fee=charge.application_fee?await sdk.applicationFees.retrieve(typeof charge.application_fee==='string'?charge.application_fee:charge.application_fee.id):null;
 const accounting=chargeAccounting(charge,fee);
 assert.equal(Number(ledger.amount_paid_cents),charge.amount);assert.equal(ledger.charge_id,charge.id);
 assert.equal(Number(ledger.platform_fee_cents),accounting.retainedPlatformFee);assert.equal(Number(ledger.processing_fee_cents),accounting.processing);
 assert.equal(tx.net,tx.amount-tx.fee);
 budget.state.evidence??={};budget.state.evidence[invoiceId]={subscription:f.subId,invoice:invoice.id,charge:charge.id,...accounting};budget.save();
}
async function clockTo(f,time){budget.assertOwn('clocks',f.clockId);const sub=await sdk.subscriptions.retrieve(f.subId,{},opts(f.account));
 if(!sub.cancel_at_period_end&&time>=sub.current_period_end&&sub.default_payment_method!==f.failingMethodId)throw Error('Clock could create an unbudgeted successful renewal');
 if(f.failedInvoiceId&&time>=sub.current_period_end)throw Error('Retry scope cannot cross another billing cycle');
 await mutate(f.name+'-clock-'+time,{}, {clock:f.clockId,time},key=>sdk.testHelpers.testClocks.advance(f.clockId,{frozen_time:time},opts(f.account,key)));
 await wait(async()=>(await sdk.testHelpers.testClocks.retrieve(f.clockId,{},opts(f.account))).status==='ready','clock readiness');
}
async function fixture(name,interval='month',hiveId=null,method='pm_card_visa'){
 if(!PLAN.scenarios.includes(name))throw Error('Scenario outside approved scope');
 let f=budget.state.fixtures[name];
 if(!f){const userId=randomUUID(),localId=randomUUID();f=budget.state.fixtures[name]={name,userId,localId,interval,amount:hiveId?1200:interval==='year'?6999:799,account:hiveId?account:null,hiveId};budget.save();}
 if(f.paymentVerified){const live=await sdk.subscriptions.retrieve(f.subId,{},opts(f.account));if(f.name==='retry-exhaustion'&&f.failedInvoiceId&&live.status==='canceled'&&!budget.state.operations['result-retry-exhaustion']?.done)throw Object.assign(Error('Canceled exhaustion fixture cannot be resumed within the consumed financial scope'),{code:'canceled_fixture_requires_new_scope'});assert.equal(live.metadata.truehive_acceptance_run,approval.runId);assert.equal(live.customer,f.customerId);await financialReconcile(f,f.invoiceId);return f;}
 await db.query(`INSERT INTO users(user_id,email,password_hash,email_verified,date_of_birth,terms_accepted_at,terms_policy_version) VALUES($1,$2,'api-only-fixture',TRUE,'1990-01-01',NOW(),'v2-2026-10') ON CONFLICT(user_id) DO NOTHING`,[f.userId,`prompt73a-auto-${approval.runId}-${name}@truehive-test.invalid`]);
 if(!f.clockId){const c=await mutate(name+'-clock',{}, {},key=>sdk.testHelpers.testClocks.create({frozen_time:Math.floor(Date.parse(approval.resumedAt||approval.startedAt)/1000),name:'P73A '+approval.runId+' '+name},opts(f.account,key)));f.clockId=budget.own('clocks',c.id);budget.save();}
 if(!f.customerId){const c=await mutate(name+'-customer',{}, {},key=>sdk.customers.create({test_clock:f.clockId,metadata:metadata({truehive_user_id:f.userId})},opts(f.account,key)));f.customerId=budget.own('customers',c.id);budget.save();}
 if(!f.methodId){const pm=await mutate(name+'-method',{}, {method},key=>sdk.paymentMethods.attach(method,{customer:f.customerId},opts(f.account,key)));f.methodId=pm.id;budget.save();}
 if(!f.priceId){
  if(hiveId){const data=await api(f.userId,'/billing/hives/'+hiveId+'/offer');assert(data.offer?.available);const prices=await sdk.prices.list({active:true,type:'recurring',limit:100,expand:['data.product']},opts(account));assert(!prices.has_more);const matches=prices.data.filter(p=>p.metadata?.truehive_hive_id===hiveId&&p.unit_amount===1200&&p.recurring?.interval==='month');assert.equal(matches.length,1);f.priceId=matches[0].id;}
  else f.priceId=interval==='month'?'price_1UUcbxRuxbB0fH11B5OI9oJy':'price_1UUcgKRuxbB0fH11IQy39oBr';budget.save();
 }
 // This is explicit API-test fixture provisioning, not a fake Checkout. Access
 // dates remain NULL. Only real verified paid events/retrieval may grant access.
 await db.query(`INSERT INTO billing_subscriptions(id,user_id,hive_id,kind,stripe_account_id,interval,price_cents) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,[f.localId,f.userId,f.hiveId,f.hiveId?'hive':'plus',f.account||'platform',interval,f.amount]);
 const owned=(await db.query('SELECT * FROM billing_subscriptions WHERE id=$1',[f.localId])).rows[0];assert.equal(owned.user_id,f.userId);assert.equal(owned.price_cents,f.amount);
 const selected=await sdk.prices.retrieve(f.priceId,{},opts(f.account));assert.equal(selected.livemode,false);assert.equal(selected.active,true);assert.equal(selected.currency,'usd');assert.equal(selected.unit_amount,f.amount);assert.equal(selected.recurring.interval,interval);assert.equal(selected.recurring.interval_count,1);
 if(!f.subId){const created=await mutate(name+'-initial',{charge:f.amount,...name==='dispute'?{dispute:f.amount,disputeFees:5000}:{}},{customer:f.customerId,price:f.priceId},key=>sdk.subscriptions.create({customer:f.customerId,default_payment_method:f.methodId,items:[{price:f.priceId}],payment_behavior:'error_if_incomplete',metadata:metadata({truehive_subscription_id:f.localId}),...f.hiveId?{application_fee_percent:10}:{}},opts(f.account,key)));f.subId=budget.own('subscriptions',created.id);budget.save();}
 // Bind ONLY the run's own server-created subscription. Never write access.
 const sub=await sdk.subscriptions.retrieve(f.subId,{expand:['latest_invoice.charge.balance_transaction']},opts(f.account));assert.equal(sub.metadata.truehive_subscription_id,f.localId);assert.equal(sub.metadata.truehive_acceptance_run,approval.runId);assert.equal(sub.customer,f.customerId);assert.equal(sub.livemode,false);assert.equal(sub.latest_invoice.amount_paid,f.amount);
 assert.equal(sub.latest_invoice.paid_out_of_band,false);assert.equal(sub.latest_invoice.charge.status,'succeeded');assert.equal(sub.latest_invoice.charge.amount,f.amount);assert.equal(sub.latest_invoice.charge.livemode,false);
 await db.query('UPDATE billing_subscriptions SET stripe_subscription_id=$2,stripe_customer_id=$3 WHERE id=$1 AND user_id=$4 AND (stripe_subscription_id IS NULL OR stripe_subscription_id=$2)',[f.localId,sub.id,f.customerId,f.userId]);
 f.invoiceId=sub.latest_invoice.id;f.chargeId=sub.latest_invoice.charge.id;f.periodEnd=sub.current_period_end;budget.save();
 await paidEvent(f,f.invoiceId);
 await wait(async()=>{const row=(await db.query('SELECT * FROM billing_subscriptions WHERE id=$1',[f.localId])).rows[0];return ['active','canceled'].includes(row.status)&&!row.access_revoked&&row.access_until;},'webhook entitlement');
 await financialReconcile(f,f.invoiceId);
 const ledger=(await db.query('SELECT * FROM billing_invoices WHERE subscription_id=$1 AND stripe_invoice_id=$2',[f.localId,f.invoiceId])).rows[0];assert.equal(Number(ledger.amount_paid_cents),f.amount);assert.equal(ledger.charge_id,f.chargeId);
 if(f.hiveId){assert.equal((await db.query('SELECT membership_status FROM hive_members WHERE hive_id=$1 AND user_id=$2',[f.hiveId,f.userId])).rows[0]?.membership_status,'active');assert.equal(sub.application_fee_percent,10);}
 f.paymentVerified=true;budget.save();return f;
}
async function refund(f,amount,feeCents=0){budget.assertOwn('subscriptions',f.subId);budget.assertOwn('customers',f.customerId);const target=await sdk.charges.retrieve(f.chargeId,{},opts(f.account));assert.equal(target.customer,f.customerId);assert.equal(target.invoice,f.invoiceId);assert.equal(target.livemode,false);assert.equal(target.amount,f.amount);assert.equal(target.captured,true);assert.equal(target.disputed,false);if(!budget.state.operations[f.name+'-refund'])assert.equal(target.amount_refunded,0);const result=await mutate(f.name+'-refund',{refund:amount,...feeCents?{feeRefund:feeCents}:{}},{charge:f.chargeId,amount,feeCents},key=>sdk.refunds.create({charge:f.chargeId,amount,reason:'requested_by_customer',...f.account?{refund_application_fee:feeCents>0}:{}},opts(f.account,key)));
 await wait(async()=>{const r=await sdk.refunds.retrieve(result.id,{},opts(f.account));if(r.status==='failed')throw Error('Refund failed');const row=(await db.query('SELECT * FROM billing_refunds WHERE stripe_refund_id=$1',[r.id])).rows[0];return r.status==='succeeded'&&row?.status==='succeeded';},'signed refund processing');
 await signedEvent(f,'charge.refunded',f.chargeId);
 await financialReconcile(f,f.invoiceId);
 const local=await wait(async()=>{const r=(await db.query('SELECT * FROM billing_subscriptions WHERE id=$1',[f.localId])).rows[0];return r.access_revoked===(amount===f.amount)?r:false;},'refund access reconciliation');
 const invoice=(await db.query('SELECT * FROM billing_invoices WHERE subscription_id=$1 AND stripe_invoice_id=$2',[f.localId,f.invoiceId])).rows[0];assert.equal(Number(invoice.refunded_cents),amount);
 if(f.account){const charge=await sdk.charges.retrieve(f.chargeId,{},opts(f.account));const fee=await sdk.applicationFees.retrieve(typeof charge.application_fee==='string'?charge.application_fee:charge.application_fee.id);assert.equal(fee.amount,120);assert.equal(fee.amount_refunded,feeCents);}
}
async function failedRenewal(f){
 const pm=await mutate(f.name+'-failing-method',{}, {},key=>sdk.paymentMethods.attach('pm_card_chargeCustomerFail',{customer:f.customerId},opts(f.account,key)));f.failingMethodId=pm.id;budget.save();
 await mutate(f.name+'-failing-default',{}, {},key=>sdk.subscriptions.update(f.subId,{default_payment_method:pm.id,proration_behavior:'none'},opts(f.account,key)));
 await budget.operation(f.name+'-failed-attempt',{failedAttempt:f.amount},{periodEnd:f.periodEnd},async()=>{await clockTo(f,f.periodEnd);let sub=await sdk.subscriptions.retrieve(f.subId,{expand:['latest_invoice']},opts(f.account));const at=sub.latest_invoice.automatically_finalizes_at||f.periodEnd+3600;await clockTo(f,at+1);return{id:sub.latest_invoice.id};});
 const sub=await wait(async()=>{const s=await sdk.subscriptions.retrieve(f.subId,{expand:['latest_invoice']},opts(f.account));return s.status==='past_due'?s:false;},'failed renewal');
 f.failedInvoiceId=sub.latest_invoice.id;budget.save();await signedEvent(f,'invoice.payment_failed',f.failedInvoiceId);
 await wait(async()=>{const row=(await db.query('SELECT * FROM billing_subscriptions WHERE id=$1',[f.localId])).rows[0];return row.status==='past_due'&&row.access_until.getTime()===row.paid_through.getTime()+259200000;},'grace reconciliation');
}
async function cleanup(){
 const failures=[],held=[];
 for(const f of Object.values(budget.state.fixtures)) {
  try {
   if(!f.customerId)continue;budget.assertOwn('customers',f.customerId);
   // Recover a created subscription even if the process lost its create response.
   const list=await sdk.subscriptions.list({customer:f.customerId,status:'all',limit:100},opts(f.account));assert.equal(list.has_more,false);
   for(const s of list.data){assert.equal(s.metadata.truehive_acceptance_run,approval.runId);assert.equal(s.metadata.truehive_subscription_id,f.localId);budget.own('subscriptions',s.id);
    if(!succeeded&&budget.state.error?.code==='retry_schedule_pending'&&f.name==='retry-exhaustion'){const clock=await sdk.testHelpers.testClocks.retrieve(f.clockId,{},opts(f.account));if(canHoldFailedFixture(f,s,clock,approval.runId)){const customers=await sdk.customers.list({test_clock:f.clockId,limit:100},opts(f.account));assert.equal(customers.has_more,false);assert.equal(customers.data.length,1);assert.equal(customers.data[0].id,f.customerId);held.push({fixture:f.name,clock:f.clockId,frozenTime:clock.frozen_time,reason:'Known declining method and frozen owned clock; preserved for repair'});continue;}}
    if(s.status!=='canceled')await mutate(f.name+'-cleanup',{cleanup:0},{sub:s.id},key=>sdk.subscriptions.cancel(s.id,{invoice_now:false,prorate:false},opts(f.account,key)));
   }
  } catch(error){failures.push({fixture:f.name,code:error.code||error.name});}
 }
 budget.state.cleanupFailures=failures;budget.state.heldForRepair=held;budget.state.cleaned=!failures.length&&!held.length;budget.save();if(failures.length)throw Error('Run-owned cleanup incomplete');
}
const protectedIds=['sub_1UWVXIRuxbB0fH11TSrG8Wmv','sub_1UWpi7RuxbB0fH11DVVWURiK','sub_1UXDaJRuxbP8zrXGcsotD6JT','sub_1UXE6tRuxbB0fH11VWNl0Cx7','sub_1UXERTRuxbB0fH110fVtiWuf','sub_1UXF9VRuxbB0fH116KbIz9W0'];
if(approval.resourceAmendment)for(const name of ['annual-cancellation','plus-partial-refund','hive-full-refund']){const f=budget.state.fixtures[name];assert(f?.subId);protectedIds.push(f.subId);}
async function protectedSnapshot(){
 const rows=(await db.query(`SELECT id,user_id,hive_id,stripe_account_id,stripe_subscription_id,stripe_customer_id,status,interval,price_cents,paid_through,access_until,access_revoked,cancel_at_period_end FROM billing_subscriptions WHERE stripe_subscription_id=ANY($1) ORDER BY id`,[protectedIds])).rows;assert.equal(rows.length,protectedIds.length);
 const invoices=(await db.query(`SELECT stripe_account_id,stripe_invoice_id,subscription_id,charge_id,amount_paid_cents,platform_fee_cents,processing_fee_cents,refunded_cents,paid_through FROM billing_invoices WHERE subscription_id=ANY($1::uuid[]) ORDER BY stripe_invoice_id`,[rows.map(r=>r.id)])).rows;
 const stripe=[];for(const row of rows){const sub=await sdk.subscriptions.retrieve(row.stripe_subscription_id,{},opts(row.stripe_account_id==='platform'?null:row.stripe_account_id));stripe.push({id:sub.id,status:sub.status,customer:sub.customer,cancel:sub.cancel_at_period_end,start:sub.current_period_start,end:sub.current_period_end,clock:sub.test_clock});}
 return JSON.parse(JSON.stringify({rows,invoices,stripe}));
}
let succeeded=false,verified=false,before;

try {
 assert(Number.isFinite(Date.parse(approval.startedAt)));assert(Math.abs(Date.parse(approval.resumedAt||approval.startedAt)-Date.now())<3600000||process.argv.includes('--cleanup-only'));await db.connect();assert.equal((await db.query("SELECT current_setting('neon.branch_id',true) b")).rows[0].b,PLAN.branch);assert.equal((await sdk.accounts.retrieve()).id,PLAN.account);assert.equal((await sdk.balance.retrieve()).livemode,false);assert.equal((await fetch('http://localhost:5183/api/health')).status,200);
 const binding=(await db.query('SELECT stripe_account_id FROM billing_accounts WHERE user_id=$1',[ownerId])).rows[0];assert.equal(binding.stripe_account_id,account);
 const connected=await sdk.accounts.retrieve(account);assert.equal(connected.metadata.truehive_user_id,ownerId);assert(connected.charges_enabled&&connected.payouts_enabled);assert.equal(connected.capabilities.card_payments,'active');assert.equal(connected.capabilities.transfers,'active');assert.equal(connected.requirements.currently_due.length,0);assert.equal(connected.requirements.past_due.length,0);
 const reviewer=JSON.parse(fs.readFileSync('sandbox.local/connect-reviewer-user.json'));await api(reviewer.userId,'/billing/admin/reviews');
 for(const [priceId,amount,interval] of [['price_1UUcbxRuxbB0fH11B5OI9oJy',799,'month'],['price_1UUcgKRuxbB0fH11IQy39oBr',6999,'year']]){const p=await sdk.prices.retrieve(priceId,{expand:['product']});assert.equal(p.livemode,false);assert(p.active&&p.product.active);assert.equal(p.product.name,'TrueHive Plus');assert.equal(p.unit_amount,amount);assert.equal(p.currency,'usd');assert.equal(p.recurring.interval,interval);assert.equal(p.recurring.interval_count,1);}
 verified=true;before=await protectedSnapshot();fs.writeFileSync(path.join(root,approval.resourceAmendment?'protected-resume-before.json':'protected-before.json'),JSON.stringify(before,null,2));
 if(approval.resourceAmendment&&!budget.state.resourceAmendmentApplied){
  const proof=JSON.parse(fs.readFileSync(path.join(root,'verification-after-repair.json')));assert.equal(proof.status,'PASS_COMPLETED_CASES_ONLY');assert.equal(proof.actual.grossCents,8998);assert.equal(proof.actual.successfulCharges,3);assert.equal(proof.actual.refundedCents,1400);assert.equal(proof.actual.feeReversalCents,120);
  assert.deepEqual(budget.state.used.charge,{count:3,cents:8998});assert.deepEqual(budget.state.used.refund,{count:2,cents:1400});assert.deepEqual(budget.state.used.feeRefund,{count:1,cents:120});
  const oldHive=budget.state.hiveId;assert.equal((await db.query('SELECT state FROM hive_monetization WHERE hive_id=$1',[oldHive])).rows[0].state,'closed');
  fs.copyFileSync(path.join(root,'journal.json'),path.join(root,'journal-before-resource-amendment.json'),fs.constants.COPYFILE_EXCL);fs.copyFileSync(path.join(root,'verification-after-repair.json'),path.join(root,'resume-prior-proof.json'),fs.constants.COPYFILE_EXCL);
  for(const id of proof.resources.canonicalProducts)budget.own('products',id);for(const id of proof.resources.canonicalPrices)budget.own('prices',id);
  budget.state.retiredHiveIds=[oldHive];budget.state.hiveId=null;budget.state.previousErrors=[budget.state.error];delete budget.state.error;budget.state.cleaned=false;
  budget.state.operations['result-hive-full-refund']={done:true,result:{status:'PASS_AFTER_READ_ONLY_REPAIR_VERIFICATION'}};
  budget.state.resourceAmendmentApplied={at:new Date().toISOString(),source:'Explicit user replacement Hive/product/price authorization; unchanged financial caps'};budget.save();
 }
 if(approval.resourceAmendment&&budget.state.resourceAmendmentApplied&&budget.state.error){
  budget.state.previousErrors??=[];budget.state.previousErrors.push(budget.state.error);delete budget.state.error;
  budget.state.cleaned=false;budget.state.repairResumes??=[];budget.state.repairResumes.push({at:new Date().toISOString(),reason:'Repair within same explicit amendment, existing journal and unchanged caps'});budget.save();
 }
 if(budget.state.cleaned&&!process.argv.includes('--cleanup-only'))throw Error('Completed/cleaned runs cannot issue further money operations');
 if(budget.state.error&&!process.argv.includes('--cleanup-only'))throw Error('Run stopped; diagnose before resuming; never reset counters');
 for(const name of process.argv.includes('--cleanup-only')?[]:PLAN.scenarios){if(budget.state.operations['result-'+name]?.done)continue;console.log('RUN '+name);
  let hiveId=null;
  if(name.startsWith('hive-')){
   if(!budget.state.hiveId){if((budget.state.resources.hives||[]).length>=budget.resourceLimits.hives||(budget.state.resources.products||[]).length>=budget.resourceLimits.products||(budget.state.resources.prices||[]).length>=budget.resourceLimits.prices)throw Error('Replacement resource cap reached before provisioning');const owner=(await db.query('SELECT billing_has_plus($1) plus',[ownerId])).rows[0];assert(owner.plus);const made=await api(ownerId,'/hives',{name:'P73A '+approval.runId+(approval.resourceAmendment?' replacement':''),category:'social',meetingType:'online',maxMembers:10,discoverable:false,monetization:{mode:'paid',monthlyPriceCents:1200,benefits:'Automated sandbox ongoing membership benefits only.',description:'Synthetic isolated offering for approved billing acceptance.',cancellationPolicy:'Cancel at period end and retain already paid access.'}});budget.state.hiveId=budget.own('hives',made.id);budget.save();
    const reviewer=JSON.parse(fs.readFileSync('sandbox.local/connect-reviewer-user.json'));await api(reviewer.userId,'/billing/admin/hives/'+made.id+'/review',{decision:'approve',note:'Authorized automated sandbox financial acceptance only'});await api(ownerId,'/billing/hives/'+made.id+'/publish',{});const catalog=await sdk.prices.list({active:true,limit:100,expand:['data.product']},opts(account));assert.equal(catalog.has_more,false);const bound=catalog.data.filter(p=>p.metadata?.truehive_hive_id===made.id);assert.equal(bound.length,1);budget.own('prices',bound[0].id);budget.own('products',bound[0].product.id);
   }hiveId=budget.state.hiveId;
  }
  const f=await fixture(name,name==='annual-cancellation'?'year':'month',hiveId,name==='dispute'?'pm_card_createDispute':'pm_card_visa');
  if(name.endsWith('cancellation')){await api(f.userId,'/billing/subscriptions/'+f.localId+'/cancel',{});await clockTo(f,f.periodEnd);const sub=await sdk.subscriptions.retrieve(f.subId,{},opts(f.account));assert.equal(sub.status,'canceled');await signedEvent(f,'customer.subscription.deleted',f.subId);const invoices=await sdk.invoices.list({customer:f.customerId,limit:100},opts(f.account));assert.equal(invoices.has_more,false);assert.equal(invoices.data.length,1);const charges=await sdk.charges.list({customer:f.customerId,limit:100},opts(f.account));assert.equal(charges.has_more,false);assert.equal(charges.data.filter(c=>c.paid).length,1);}
  if(name==='failed-recovery'||name==='retry-exhaustion'){await failedRenewal(f);
   if(name==='failed-recovery'){await mutate(name+'-successful-default',{}, {},key=>sdk.subscriptions.update(f.subId,{default_payment_method:f.methodId,proration_behavior:'none'},opts(f.account,key)));await mutate(name+'-recovery',{charge:f.amount},{invoice:f.failedInvoiceId,method:f.methodId},key=>sdk.invoices.pay(f.failedInvoiceId,{payment_method:f.methodId},opts(f.account,key)));await paidEvent(f,f.failedInvoiceId);await financialReconcile(f,f.failedInvoiceId);await wait(async()=>{const live=await sdk.subscriptions.retrieve(f.subId,{},opts(f.account));const r=(await db.query('SELECT * FROM billing_subscriptions WHERE id=$1',[f.localId])).rows[0];return live.status==='active'&&r.status==='active'&&r.paid_through.getTime()===live.current_period_end*1000&&r.access_until.getTime()===live.current_period_end*1000;},'recovered paid period');}
   else {
    let exhausted=false,afterAttempt=-1;
    const read=async()=>({subscription:await sdk.subscriptions.retrieve(f.subId,{expand:['latest_invoice']},opts(f.account)),clock:await sdk.testHelpers.testClocks.retrieve(f.clockId,{},opts(f.account))});
    for(let i=0;i<PLAN.limits.failedAttempt.count;i++){
     const decision=await waitForRetryDecision(read,{afterAttempt});
     if(decision.terminal){exhausted=true;budget.state.exhaustionEvidence={status:decision.subscription.status,attempts:decision.subscription.latest_invoice.attempt_count,clock:decision.clock.frozen_time};budget.save();break;}
     const {at,subscription}=decision;afterAttempt=subscription.latest_invoice.attempt_count;
     await budget.operation(name+'-retry-at-'+at,{failedAttempt:f.amount},{at},async()=>{await clockTo(f,at+1);return{id:subscription.latest_invoice.id};});
    }
    if(!exhausted)throw Error('Retry exhaustion not reached within approved attempts; scope stopped');
   }
  }
  if(name==='plus-full-refund')await refund(f,799);
  if(name==='plus-partial-refund')await refund(f,200);
  if(name==='hive-full-refund')await refund(f,1200,120);
  if(name==='hive-partial-refund')await refund(f,300,30);
  if(name==='hive-closure'){await api(ownerId,'/billing/hives/'+hiveId+'/close',{confirm:'CLOSE'});await wait(async()=>{const s=await sdk.subscriptions.retrieve(f.subId,{},opts(f.account));return s.cancel_at_period_end||s.status==='canceled';},'closure cancellation');const retained=(await db.query('SELECT paid_through,access_until FROM billing_subscriptions WHERE id=$1',[f.localId])).rows[0];assert.equal(retained.paid_through.getTime(),f.periodEnd*1000);assert.equal(retained.access_until.getTime(),f.periodEnd*1000);assert.equal((await db.query('SELECT membership_status FROM hive_members WHERE hive_id=$1 AND user_id=$2',[hiveId,f.userId])).rows[0].membership_status,'active');}
  if(name==='dispute'){const dispute=await wait(async()=>{const data=await sdk.disputes.list({charge:f.chargeId,limit:100});return data.data[0];},'supported test dispute');const debitFees=(dispute.balance_transactions||[]).reduce((sum,t)=>sum+(t.fee||0),0);if(debitFees>5000)throw Error('Dispute fee scope exceeded');await budget.operation(name+'-dispute',{}, {id:dispute.id},async key=>{const r=await sdk.disputes.update(dispute.id,{evidence:{uncategorized_text:'winning_evidence'},submit:true},{idempotencyKey:key});return{id:r.id,status:r.status};});await wait(async()=>(await sdk.disputes.retrieve(dispute.id)).status==='won','dispute closure');await signedEvent(f,'charge.dispute.closed',dispute.id);await wait(async()=>(await db.query('SELECT status FROM billing_disputes WHERE stripe_dispute_id=$1',[dispute.id])).rows[0]?.status==='won','dispute ledger');}
  await duplicates(f,f.invoiceId);if(name.endsWith('refund'))await duplicates(f,f.chargeId,'charge.refunded');
  budget.state.operations['result-'+name]={done:true,result:{status:'PASS'}};budget.save();console.log('PASS '+name);
 }
 succeeded=true;
}catch(error){budget.state.error={code:error.code||error.type||error.name,message:String(error.message).replace(/(?:sk_test_|sk_live_|whsec_)[A-Za-z0-9_]+/g,'[REDACTED]').slice(0,180)};budget.save();console.log('STOP: '+budget.state.error.code+'; inspect private journal; no automatic scope expansion.');process.exitCode=1;}
finally{try{if(verified){if(!succeeded&&!process.argv.includes('--cleanup-only')){try{await cleanupOffering({budget,ownerId,api});}finally{await cleanup();}}else{await cleanup();await cleanupOffering({budget,ownerId,api,finalize:true});}const after=await protectedSnapshot();fs.writeFileSync(path.join(root,approval.resourceAmendment?'protected-resume-after.json':'protected-after.json'),JSON.stringify(after,null,2));assert.deepEqual(after,before);}}catch{process.exitCode=1;succeeded=false;console.log('Cleanup or preservation verification pending: use --cleanup-only for this run; no more financial scenarios.');}await db.end().catch(()=>{});const {pool}=await import('../../db/index.js');await pool.end().catch(()=>{});fs.closeSync(lock);fs.unlinkSync(path.join(root,'run.lock'));}
console.log(JSON.stringify({status:succeeded?'PASS':'STOPPED',runId:approval.runId,used:budget.state.used,cleaned:!!budget.state.cleaned}));
