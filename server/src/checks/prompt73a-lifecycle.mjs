// Isolated PostgreSQL with simulated current Stripe state. No payment/API calls.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,query} from '../db/index.js';
import {processEvent} from '../lib/billingEvents.js';
import {subscriptionAccess} from '../lib/billingPolicy.js';
if(process.env.P71B_ISOLATED!=='1')throw Error('Isolated preload required');
let n=0;const check=(v,t)=>{assert.ok(v,t);n++;console.log('PASS '+t);};
try {
 for(const [kind,interval,price] of [['plus','month',799],['plus','year',6999],['hive','month',1200]]) {
  const label=kind+' '+interval;
  const user=(await query(`INSERT INTO users(email,password_hash) VALUES($1,'fixture') RETURNING user_id`,[randomUUID()+'@lifecycle.invalid'])).rows[0].user_id;
  let hive=null;
  if(kind==='hive') {
   hive=(await query(`INSERT INTO hives(creator_user_id,hive_name) VALUES($1,'Lifecycle fixture') RETURNING hive_id`,[user])).rows[0].hive_id;
   await query(`INSERT INTO hive_monetization(hive_id,owner_id,state,monthly_price_cents,benefits,description,cancellation_policy) VALUES($1,$2,'active',1200,'Fixture benefits','Fixture description','Cancel at period end')`,[hive,user]);
  }
  const stripeId='sub_'+randomUUID(),account=kind==='hive'?'acct_lifecycle':'platform';
  const local=(await query(`INSERT INTO billing_subscriptions(user_id,hive_id,kind,interval,price_cents,status,stripe_account_id,stripe_subscription_id) VALUES($1,$2,$3,$4,$5,'processing',$6,$7) RETURNING id`,[user,hive,kind,interval,price,account,stripeId])).rows[0].id;
  const now=Math.floor(Date.now()/1000),end=now+86400;
  const charge={id:'ch_'+randomUUID(),amount:price,amount_refunded:0,refunded:false,refunds:{data:[]},balance_transaction:{fee_details:[{type:'stripe_fee',amount:45}]}};
  const live={id:stripeId,livemode:false,metadata:{truehive_subscription_id:local},customer:'cus_fixture',status:'past_due',cancel_at_period_end:false,application_fee_percent:kind==='hive'?10:undefined,items:{data:[{quantity:1,price:{unit_amount:price,currency:'usd',recurring:{interval,interval_count:1}}}]},latest_invoice:{id:'in_'+randomUUID(),status:'open',amount_paid:0}};
  let refundStatus='failed',disputeStatus='needs_response';
  const sdk={subscriptions:{retrieve:async()=>structuredClone(live)},charges:{retrieve:async()=>structuredClone(charge)},refunds:{retrieve:async()=>({id:'re_'+local,amount:price,status:refundStatus})},disputes:{retrieve:async()=>({id:'dp_'+local,status:disputeStatus,amount:price})}};
  const send=type=>processEvent({id:'evt_'+randomUUID(),created:now,type,livemode:false,account:account==='platform'?undefined:account,data:{object:type.startsWith('customer.')?{id:stripeId}:type.startsWith('invoice.')?{subscription:stripeId}:type.startsWith('charge.dispute.')?{id:'dp_'+local,charge:charge.id}:type.startsWith('refund.')?{id:'re_'+local,charge:charge.id}:charge}},sdk);
  const row=async()=>(await query('SELECT * FROM billing_subscriptions WHERE id=$1',[local])).rows[0];
  await send('invoice.payment_failed');check(!subscriptionAccess(await row()),label+': initial failure never grants access');
  live.status='active';await send('customer.subscription.updated');check(!subscriptionAccess(await row()),label+': active/method-update state without paid evidence grants no access');
  live.latest_invoice={id:'in_'+randomUUID(),status:'paid',amount_paid:price,paid_out_of_band:false,charge,lines:{data:[{period:{end}}]}};
  await send('invoice.paid');check(subscriptionAccess(await row()),label+': verified paid evidence activates access');
  live.status='past_due';live.latest_invoice={id:'in_failed',status:'open',amount_paid:0};await send('invoice.payment_failed');check(new Date((await row()).access_until).getTime()===(end+3*86400)*1000,label+': failed renewal adds exactly three-day grace');
  await query(`UPDATE billing_subscriptions SET paid_through=NOW()-INTERVAL '5 days' WHERE id=$1`,[local]);live.status='unpaid';await send('customer.subscription.updated');check(!subscriptionAccess(await row()),label+': retry exhaustion beyond grace expires access');
  charge.id='ch_'+randomUUID();live.status='active';live.latest_invoice={id:'in_'+randomUUID(),status:'paid',amount_paid:price,paid_out_of_band:false,charge,lines:{data:[{period:{end:end+86400}}]}};await send('invoice.paid');check(subscriptionAccess(await row()),label+': payment after expiration restores access');
  live.cancel_at_period_end=true;await send('customer.subscription.updated');check(subscriptionAccess(await row())&&(await row()).cancel_at_period_end,label+': scheduled cancellation preserves paid period');
  live.status='canceled';await send('customer.subscription.deleted');check(subscriptionAccess(await row()),label+': canceled status retains already-paid access');
  charge.amount_refunded=100;await send('charge.refunded');check(subscriptionAccess(await row()),label+': partial refund preserves access');
  await send('refund.failed');check((await query('SELECT status FROM billing_refunds WHERE subscription_id=$1',[local])).rows[0].status==='failed'&&subscriptionAccess(await row()),label+': failed refund recorded without access revocation');
  await send('charge.dispute.created');disputeStatus='won';await send('charge.dispute.closed');check((await query('SELECT status FROM billing_disputes WHERE subscription_id=$1',[local])).rows[0].status==='won'&&subscriptionAccess(await row()),label+': dispute closure updates ledger without automatic revocation');
  refundStatus='succeeded';await send('refund.updated');charge.amount_refunded=price;charge.refunded=true;charge.refunds.data=[{id:'re_'+local,amount:price,status:'succeeded'}];await send('charge.refunded');check(!subscriptionAccess(await row()),label+': full current-period refund revokes access');
 }
 console.log(`PROMPT73A lifecycle: ${n} checks passed; all Stripe transitions simulated.`);
}finally{await pool.end();}
