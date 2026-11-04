import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import express from 'express';import cookieParser from 'cookie-parser';import jwt from 'jsonwebtoken';
import {pool,query} from '../db/index.js';import billingRoutes from '../routes/billing.js';import {cleanupOffering} from './acceptance/cleanup.mjs';
assert(pool.verifiedDevFixture);process.env.JWT_SECRET='isolated-cleanup-check';process.env.BILLING_ENABLED='test';process.env.STRIPE_SECRET_KEY='sk_test_fixture';
let server,n=0;const pass=label=>{n++;console.log('PASS '+label);};
try {
 const owner=randomUUID(),member=randomUUID(),hive=randomUUID();
 for(const id of [owner,member])await query("INSERT INTO users(user_id,email,password_hash,email_verified) VALUES($1,$2,'fixture',TRUE)",[id,id+'@cleanup.invalid']);
 await query("INSERT INTO hives(hive_id,creator_user_id,hive_name) VALUES($1,$2,'Cleanup fixture')",[hive,owner]);
 await query("INSERT INTO hive_members(hive_id,user_id,role,membership_status) VALUES($1,$2,'owner','active')",[hive,owner]);
 await query("INSERT INTO hive_monetization(hive_id,owner_id,state,monthly_price_cents,benefits,description,cancellation_policy,approved_revision) VALUES($1,$2,'active',1200,'Weekly sessions','Synthetic approved offering','Paid-period access retained',1)",[hive,owner]);
 const sub=(await query("INSERT INTO billing_subscriptions(user_id,hive_id,kind,status,price_cents,paid_through,access_until) VALUES($1,$2,'hive','active',1200,NOW()+INTERVAL '30 days',NOW()+INTERVAL '30 days') RETURNING *",[member,hive])).rows[0];
 const app=express();app.use(express.json(),cookieParser());app.use('/api/billing',billingRoutes);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const api=async(user,url,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${url}`,{method:'POST',headers:{cookie:'token='+jwt.sign({userId:user,tokenVersion:0},process.env.JWT_SECRET),'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();};
 const budget={state:{hiveId:hive},assertOwn:(_kind,id)=>assert.equal(id,hive),save:()=>{}};
 await assert.rejects(()=>cleanupOffering({budget,ownerId:member,api}),/HTTP 404/);pass('non-owner cannot pause offering');
 await cleanupOffering({budget,ownerId:owner,api});const paused=(await query('SELECT * FROM hive_monetization WHERE hive_id=$1',[hive])).rows[0];assert.equal(paused.state,'paused');assert.equal(paused.approved_revision,paused.revision);pass('failure cleanup pauses without discarding review approval');
 const kept=(await query('SELECT * FROM billing_subscriptions WHERE id=$1',[sub.id])).rows[0];assert.equal(kept.access_until.getTime(),sub.access_until.getTime());assert.equal(kept.paid_through.getTime(),sub.paid_through.getTime());pass('pause preserves paid entitlement dates');
 await cleanupOffering({budget,ownerId:owner,api});assert.equal((await query('SELECT state FROM hive_monetization WHERE hive_id=$1',[hive])).rows[0].state,'paused');pass('repeated failure cleanup does not irreversibly close Hive');
 await cleanupOffering({budget,ownerId:owner,api,finalize:true});assert.equal((await query('SELECT state FROM hive_monetization WHERE hive_id=$1',[hive])).rows[0].state,'closing');pass('only explicit final cleanup starts closure');
 assert.equal((await query('SELECT COUNT(*)::int n FROM billing_refunds')).rows[0].n,0);assert.equal((await query('SELECT COUNT(*)::int n FROM billing_invoices')).rows[0].n,0);pass('cleanup creates no invoice or refund');
 console.log(`ACCEPTANCE CLEANUP: ${n} HTTP/SQL checks passed; Stripe not called.`);
}finally{if(server)await new Promise(r=>server.close(r));await pool.end();}
