// Actual existing dispute; only Stripe retrieval. Local event order in private SQL.
import assert from 'node:assert/strict';import fs from 'node:fs';import dotenv from 'dotenv';import pg from 'pg';import Stripe from 'stripe';
import {pool,query} from '../db/index.js';import {recordDispute,disputeBalance} from '../lib/disputeAccounting.js';import {processEvent} from '../lib/billingEvents.js';
assert(pool.verifiedDevFixture);const e=dotenv.parse(fs.readFileSync('.env')),source=new pg.Client({connectionString:e.DATABASE_URL}),s=new Stripe(e.STRIPE_SECRET_KEY,{apiVersion:'2025-02-24.acacia'});
const root='sandbox.local/acceptance/e10e371c-16fc-4314-8cc0-956a8b06246f/',j=JSON.parse(fs.readFileSync(root+'journal.json')),f=j.fixtures.dispute;let n=0;const pass=t=>{n++;console.log('PASS '+t);};
try{
 await source.connect();assert.equal((await source.query("SELECT current_setting('neon.branch_id',true) b")).rows[0].b,'br-holy-poetry-atkl4gsc');
 const dispute=await s.disputes.retrieve(j.operations['dispute-dispute'].result.id);assert.equal(dispute.status,'won');assert.equal(dispute.charge,f.chargeId);
 await query("INSERT INTO users(user_id,email,password_hash) VALUES($1,'dispute-accounting@fixture.invalid','fixture')",[f.userId]);
 const local=(await query("INSERT INTO billing_subscriptions(id,user_id,kind,status,price_cents,stripe_subscription_id) VALUES($1,$2,'plus','active',799,$3) RETURNING *",[f.localId,f.userId,f.subId])).rows[0];
 await query("INSERT INTO billing_invoices(stripe_account_id,stripe_invoice_id,subscription_id,charge_id,amount_paid_cents,processing_fee_cents,platform_fee_cents) VALUES('platform',$1,$2,$3,799,53,0)",[f.invoiceId,f.localId,f.chargeId]);
 const accounting=await recordDispute({query},local,dispute);assert.equal(accounting.amount,0);assert.equal(accounting.fee,1500);assert.equal(accounting.net,-1500);pass('won dispute retains actual 1500-cent fee separately from restored principal');
 await recordDispute({query},local,dispute);assert.equal((await query('SELECT COUNT(*)::int n FROM billing_disputes')).rows[0].n,1);pass('reconciliation upserts one dispute without duplicate financial effects');
 const events=(await source.query(`SELECT payload FROM billing_event_inbox WHERE processed_at IS NOT NULL AND payload->'data'->'object'->>'id'=$1 ORDER BY received_at DESC`,[dispute.id])).rows.map(r=>r.payload);assert(events.some(x=>x.type==='charge.dispute.closed'));
 const reader={disputes:{retrieve:async(id)=>{assert.equal(id,dispute.id);return s.disputes.retrieve(id);}}};for(const event of events)await processEvent(event,reader);
 const row=(await query('SELECT * FROM billing_disputes')).rows[0];assert.equal(row.status,'won');assert.equal(Number(row.balance_fee_cents),1500);assert.equal(Number(row.balance_net_cents),-1500);pass('local reverse delivery uses CURRENT Stripe won state and retained fee');
 for(const event of events)assert.equal((await processEvent(event,reader)).duplicate,true);pass('local duplicate dispute deliveries are idempotent');
 assert.equal(Number((await query('SELECT amount_paid_cents FROM billing_invoices')).rows[0].amount_paid_cents),799);pass('dispute adjustments do not rewrite original invoice gross');
 assert.equal(disputeBalance({id:'du_unknown'}),null);pass('unretrieved balance remains unknown instead of zero');
 assert.throws(()=>disputeBalance({...dispute,balance_transactions:[dispute.balance_transactions[0],dispute.balance_transactions[0]]}));pass('duplicate balance transaction rejected');
 assert.throws(()=>disputeBalance({...dispute,balance_transactions:[{...dispute.balance_transactions[0],currency:'eur'}]}));pass('unexpected balance currency rejected');
 assert.throws(()=>disputeBalance({...dispute,balance_transactions:[{...dispute.balance_transactions[0],source:'du_other'}]}));pass('foreign dispute balance source rejected');
 await assert.rejects(()=>recordDispute({query},{...local,id:'00000000-0000-0000-0000-000000000000'},dispute),/does not match/);pass('foreign subscription charge binding rejected');
 await assert.rejects(()=>recordDispute({query},local,{...dispute,currency:'eur'}),/currency/);pass('foreign dispute currency rejected before ledger write');
 fs.writeFileSync(root+'local-dispute-accounting.json',JSON.stringify({status:'PASS',checks:n,dispute:dispute.id,accounting,scope:'isolated SQL and local actual events; Stripe GET only'},null,2));console.log(`DISPUTE ACCOUNTING: ${n} checks passed; no new financial operations.`);
}finally{await source.end();await pool.end();}
