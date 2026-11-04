// Synthetic security tests. Real Express/JWT/SDK signatures, no Stripe network.
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
import {pool,query} from '../db/index.js';
import {stripe,clientURL,STRIPE_API_VERSION} from '../lib/stripe.js';
import billingRoutes from '../routes/billing.js';
import {webhook} from '../lib/billingEvents.js';
import {trustedStripeURL} from '../../../client/src/lib/billingLinks.js';
if(process.env.P71B_ISOLATED!=='1')throw new Error('Isolated preload required.');
let n=0;const pass=(v,t)=>{assert.ok(v,t);n++;console.log(`PASS ${t}`);};
for(const value of ['javascript:alert(1)','//evil.invalid','https://checkout.stripe.com.evil.invalid','https://checkout.stripe.com@evil.invalid','https://evil.invalid/?next=checkout.stripe.com','http://checkout.stripe.com','https://checkout.stripe.com:444/','https://checkout.stripe.com\\@evil.invalid',' https://checkout.stripe.com/'])pass(!trustedStripeURL(value,'checkout'),'untrusted hosted URL rejected');
for(const [url,kind] of [['https://checkout.stripe.com/c/pay/test','checkout'],['https://billing.stripe.com/p/session/test','portal'],['https://connect.stripe.com/setup/test','connect'],['https://invoice.stripe.com/i/test','invoice']])pass(trustedStripeURL(url,kind),'appropriate Stripe-hosted origin accepted');
for(const value of ['https://user:password@example.invalid','http://example.invalid','https://truehive.app/unsafe','https://truehive.app/?next=evil','https://truehive.app\\@evil.invalid']){process.env.CLIENT_URL=value;assert.throws(clientURL);pass(true,'unsafe configured return origin rejected');}
process.env.CLIENT_URL='http://127.0.0.1:5176';pass(clientURL()==='http://127.0.0.1:5176','local return origin is explicitly permitted');
process.env.BILLING_ENABLED='test';process.env.STRIPE_SECRET_KEY='sk_live_fixture';assert.throws(stripe,/test mode/);pass(true,'live key remains blocked');
process.env.STRIPE_SECRET_KEY='sk_test_fixture';process.env.BILLING_ENABLED='live';assert.throws(stripe,/test mode/);pass(true,'live flag remains blocked');process.env.BILLING_ENABLED='test';pass(STRIPE_API_VERSION==='2025-02-24.acacia','API version unchanged');
process.env.JWT_SECRET='security-fixture';process.env.STRIPE_WEBHOOK_SECRET='whsec_security';process.env.SITE_ADMIN_EMAILS='staff@73a.invalid';
const uid=(await query(`INSERT INTO users(email,password_hash) VALUES($1,'fixture') RETURNING user_id`,[`${randomUUID()}@73a.invalid`])).rows[0].user_id;
const second=(await query(`INSERT INTO users(email,password_hash) VALUES($1,'fixture') RETURNING user_id`,[`${randomUUID()}@73a.invalid`])).rows[0].user_id;
const cookie=id=>`token=${jwt.sign({userId:id},process.env.JWT_SECRET)}`;
const app=express();app.post('/webhook/:source',express.raw({type:'application/json'}),webhook);app.use(express.json(),cookieParser());app.use('/api/billing',billingRoutes);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
try {
 pass((await fetch(`${base}/api/billing/hives/not-a-uuid/owner`,{headers:{cookie:cookie(uid)}})).status===400,'malformed identifiers fail without database error disclosure');
 const post=()=>fetch(`${base}/api/billing/hives/${randomUUID()}/close`,{method:'POST',headers:{cookie:cookie(uid),'Content-Type':'application/json'},body:'{"confirm":"invalid"}'});
 for(let i=0;i<20;i++)await post();pass((await post()).status===429,'billing mutations are rate limited');
 pass((await fetch(`${base}/api/billing/hives/${randomUUID()}/close`,{method:'POST',headers:{cookie:cookie(second),'Content-Type':'application/json'},body:'{"confirm":"invalid"}'})).status===400,'one user cannot exhaust another user billing limit on same IP');
 pass((await fetch(`${base}/api/billing/admin/operations`,{headers:{cookie:cookie(uid)}})).status===404,'operational financial diagnostics remain staff-only');
 const payload=JSON.stringify({id:`evt_${randomUUID()}`,type:'fixture.unknown',created:Math.floor(Date.now()/1000),livemode:false,data:{object:{}}});
 const signed=stripe().webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});
 const deliver=()=>fetch(`${base}/webhook/platform`,{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signed},body:payload});
 const originalConnect=pool.connect.bind(pool);let failCommit=true;
 const wrap=client=>{const run=client.query.bind(client);client.query=(sql,...args)=>{if(sql==='COMMIT'&&failCommit){failCommit=false;return Promise.reject(Object.assign(new Error('Injected commit failure'),{code:'fixture_commit_failure'}));}return run(sql,...args);};return client;};
 // Real pg Pool.query uses connect(callback); preserve both callback and Promise APIs.
 pool.connect=callback=>callback
   ? originalConnect((error,client,release)=>callback(error,error?client:wrap(client),release))
   : originalConnect().then(wrap);
 pass((await deliver()).status===503,'failed event commit returns retryable status');pool.connect=originalConnect;
 const eventId=JSON.parse(payload).id;pass(!(await query('SELECT 1 FROM billing_events WHERE event_id=$1',[eventId])).rows.length,'failed commit does not acknowledge financial event');
 pass((await query('SELECT last_error_code FROM billing_webhook_attempts WHERE event_id=$1',[eventId])).rows[0].last_error_code==='fixture_commit_failure','sanitized failed delivery is observable outside rolled-back transaction');
 pass((await deliver()).status===200,'verified webhook retries successfully after commit failure');pass((await query('SELECT attempts,processed_at FROM billing_webhook_attempts WHERE event_id=$1',[eventId])).rows[0].attempts===2,'webhook attempt ledger records retry and completion');
 console.log(`PROMPT73A security: ${n} checks passed. Stripe delivery synthetic.`);
}finally{await new Promise(r=>server.close(r));await pool.end();}
