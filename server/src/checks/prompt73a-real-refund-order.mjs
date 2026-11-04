// Real saved refund envelopes, LOCAL reordered delivery in a private dev schema.
// Only read-only Stripe SDK methods are exposed. No new Stripe refund/delivery.
import fs from 'node:fs';import dotenv from 'dotenv';import pg from 'pg';import Stripe from 'stripe';import assert from 'node:assert/strict';
import {pool,query} from '../db/index.js';import {processEvent} from '../lib/billingEvents.js';
assert(pool.verifiedDevFixture);assert.equal(process.env.P71B_ISOLATED,'1');
const e=dotenv.parse(fs.readFileSync(process.env.P73A_ENV_FILE || '.env')),source=new pg.Client({connectionString:e.DATABASE_URL}),s=new Stripe(e.STRIPE_SECRET_KEY,{apiVersion:'2025-02-24.acacia'});
const run='e10e371c-16fc-4314-8cc0-956a8b06246f',root=`sandbox.local/acceptance/${run}/`,j=JSON.parse(fs.readFileSync(root+'journal.json')),f=j.fixtures['hive-full-refund'];
let n=0;const pass=label=>{n++;console.log('PASS '+label);};
try{
 await source.connect();assert.equal((await source.query("SELECT current_setting('neon.branch_id',true) b")).rows[0].b,'br-holy-poetry-atkl4gsc');
 const local=(await source.query('SELECT * FROM billing_subscriptions WHERE id=$1',[f.localId])).rows[0];
 const paid=(await source.query('SELECT * FROM billing_invoices WHERE subscription_id=$1',[f.localId])).rows[0];
 const events=(await source.query(`SELECT payload FROM billing_event_inbox WHERE processed_at IS NOT NULL AND payload->'data'->'object'->>'charge'=$1 AND payload->>'type' IN ('refund.created','refund.updated') ORDER BY payload->>'type' DESC`,[f.chargeId])).rows.map(r=>r.payload);assert.equal(events.length,2);
 const chargeEvent=(await source.query(`SELECT payload FROM billing_event_inbox WHERE processed_at IS NOT NULL AND payload->'data'->'object'->>'id'=$1 AND payload->>'type'='charge.refunded'`,[f.chargeId])).rows[0].payload;events.push(chargeEvent);
 const owner=(await source.query('SELECT creator_user_id FROM hives WHERE hive_id=$1',[f.hiveId])).rows[0].creator_user_id;
 for(const id of [owner,f.userId])await query("INSERT INTO users(user_id,email,password_hash) VALUES($1,$2,'fixture')",[id,id+'@refund-order.invalid']);
 await query("INSERT INTO hives(hive_id,creator_user_id,hive_name) VALUES($1,$2,'Refund ordering fixture')",[f.hiveId,owner]);
 // Reconstruct only the isolated paid baseline from the actual paid ledger.
 // Shared dev rows remain in their current refunded state throughout.
 await query(`INSERT INTO billing_subscriptions(id,user_id,hive_id,kind,status,stripe_account_id,stripe_subscription_id,stripe_customer_id,price_cents,paid_through,access_until) VALUES($1,$2,$3,'hive','active',$4,$5,$6,1200,$7,$7)`,[f.localId,f.userId,f.hiveId,f.account,f.subId,f.customerId,local.paid_through]);
 await query(`INSERT INTO hive_members(hive_id,user_id,role,membership_status) VALUES($1,$2,'member','active')`,[f.hiveId,f.userId]);
 await query(`INSERT INTO billing_invoices(stripe_account_id,stripe_invoice_id,subscription_id,charge_id,amount_paid_cents,platform_fee_cents,processing_fee_cents,paid_through) VALUES($1,$2,$3,$4,1200,120,65,$5)`,[f.account,f.invoiceId,f.localId,f.chargeId,paid.paid_through]);
 const reader={charges:{retrieve:async(id,p,o)=>{assert.equal(id,f.chargeId);assert.equal(o.stripeAccount,f.account);return s.charges.retrieve(id,p,o);}},refunds:{retrieve:async(id,p,o)=>{assert.equal(id,j.operations['hive-full-refund-refund'].result.id);assert.equal(o.stripeAccount,f.account);return s.refunds.retrieve(id,p,o);}},applicationFees:{retrieve:async(id)=>s.applicationFees.retrieve(id)}};
 assert.equal(events[0].type,'refund.updated');pass('actual refund.updated delivered locally before created/charge events');
 for(const event of events){assert.equal(event.account,f.account);assert.equal(event.livemode,false);await processEvent(event,reader);}
 const row=(await query('SELECT * FROM billing_subscriptions WHERE id=$1',[f.localId])).rows[0];assert(row.access_revoked&&row.status==='refunded'&&row.access_until===null);pass('current Stripe refund state revokes access despite reordered events');
 const ledger=(await query('SELECT * FROM billing_invoices')).rows;assert.equal(ledger.length,1);assert.equal(Number(ledger[0].refunded_cents),1200);assert.equal(Number(ledger[0].platform_fee_cents),0);assert.equal(Number(ledger[0].processing_fee_cents),65);pass('gross/refund/retained fee/processing ledger matches current actual objects');
 assert.equal((await query('SELECT membership_status FROM hive_members')).rows[0].membership_status,'expired');pass('full refund expires paid membership');
 for(const event of [...events].reverse())assert.equal((await processEvent(event,reader)).duplicate,true);pass('reverse-order duplicates remain duplicates');
 assert.equal((await query('SELECT COUNT(*)::int n FROM billing_refunds')).rows[0].n,1);pass('one refund row after reordered and duplicate events');
 assert.equal((await source.query('SELECT access_revoked FROM billing_subscriptions WHERE id=$1',[f.localId])).rows[0].access_revoked,true);pass('shared dev fixture unchanged by isolated acceptance');
 fs.writeFileSync(root+'local-refund-order.json',JSON.stringify({status:'PASS',checks:n,scope:'local reordered real payloads in isolated schema; not new Stripe deliveries',events:events.map(x=>x.id),newFinancialCalls:0},null,2));console.log(`REAL REFUND ORDER: ${n} checks passed; local delivery, real read-only Stripe state.`);
}finally{await source.end();await pool.end();}
