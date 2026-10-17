// Platform application fee events: real SQL, simulated Stripe responses/delivery.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,query} from '../db/index.js';
import {processEvent} from '../lib/billingEvents.js';
if(process.env.P71B_ISOLATED!=='1')throw new Error('Isolated preload required.');
let n=0;const pass=(v,t)=>{assert.ok(v,t);n++;console.log(`PASS ${t}`);};
const event=(type,object)=>({id:`evt_${randomUUID()}`,type,created:1,livemode:false,data:{object}});
try {
 const owner=(await query(`INSERT INTO users(email,password_hash) VALUES($1,'fixture') RETURNING user_id`,[`${randomUUID()}@fees.invalid`])).rows[0].user_id;
 const hive=(await query(`INSERT INTO hives(creator_user_id,hive_name) VALUES($1,'Fee fixture') RETURNING hive_id`,[owner])).rows[0].hive_id;
 await query(`INSERT INTO hive_monetization(hive_id,owner_id,state,monthly_price_cents,benefits,description,cancellation_policy) VALUES($1,$2,'closed',1200,'Ongoing benefits','Ongoing description','Cancel period end')`,[hive,owner]);
 await query(`INSERT INTO billing_accounts(user_id,stripe_account_id,status,payouts_resolved) VALUES($1,'acct_fees','connected',TRUE)`,[owner]);
 const sub=(await query(`INSERT INTO billing_subscriptions(user_id,hive_id,kind,status,price_cents,stripe_account_id) VALUES($1,$2,'hive','canceled',1200,'acct_fees') RETURNING id`,[owner,hive])).rows[0].id;
 await query(`INSERT INTO billing_invoices(stripe_account_id,stripe_invoice_id,subscription_id,charge_id,amount_paid_cents) VALUES('acct_fees','in_old',$1,'ch_old',1200),('acct_fees','in_new',$1,'ch_new',1200)`,[sub]);
 let fee={id:'fee_fixture',account:'acct_fees',charge:'ch_old',amount:120,amount_refunded:0,livemode:false};
 const sdk={applicationFees:{retrieve:async()=>structuredClone(fee)}};
 const net=async()=>Number((await query(`SELECT platform_fee_cents FROM billing_invoices WHERE stripe_invoice_id='in_old'`)).rows[0].platform_fee_cents);
 await processEvent(event('application_fee.created',{id:fee.id}),sdk);pass(await net()===120,'asynchronous fee creation updates invoice');
 fee.amount_refunded=60;const refund=event('application_fee.refunded',{id:fee.id});await processEvent(refund,sdk);
 pass(await net()===60&&(await query(`SELECT platform_fee_cents FROM billing_invoices WHERE stripe_invoice_id='in_new'`)).rows[0].platform_fee_cents===null,'historical fee refund updates correct invoice after later renewal');
 pass((await processEvent(refund,sdk)).duplicate,'duplicate fee refund is idempotent');
 await processEvent(event('application_fee.created',{id:fee.id}),sdk);pass(await net()===60,'older event retrieves current fee instead of restoring refunded amount');
 await assert.rejects(()=>processEvent({...event('application_fee.refunded',{id:fee.id}),account:'acct_fees'},sdk),/platform context/);pass(true,'connected destination cannot substitute platform fee context');
 fee.livemode=true;await assert.rejects(()=>processEvent(event('application_fee.created',{id:fee.id}),sdk),/Live fees/);pass(true,'live fee object rejected');fee.livemode=false;
 fee.charge='ch_missing';const early=event('application_fee.created',{id:fee.id});await assert.rejects(()=>processEvent(early,sdk),/retry/);
 pass(!(await query('SELECT 1 FROM billing_events WHERE event_id=$1',[early.id])).rows.length,'early fee delivery rolls back receipt for retry');
 fee.charge='ch_old';await processEvent(early,sdk);pass(await net()===60&&(await query(`SELECT payouts_resolved FROM billing_accounts WHERE user_id=$1`,[owner])).rows[0].payouts_resolved===false,'fee retry reconciles and invalidates prior financial sign-off');
 console.log(`PROMPT73A fees: ${n} checks passed; Stripe simulated.`);
}finally{await pool.end();}
