// Real PostgreSQL inbox/worker tests; simulated processor, no Stripe requests.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pool,query} from '../db/index.js';
import {enqueueVerifiedEvent,drainBillingInbox,retryableEventError} from '../lib/billingInbox.js';
import {processEvent} from '../lib/billingEvents.js';
if(process.env.P71B_ISOLATED!=='1')throw Error('Isolated schema required');
let n=0;const pass=t=>{n++;console.log('PASS '+t);};
const event=()=>({id:'evt_'+randomUUID(),type:'fixture.ignored',livemode:false,created:1,data:{object:{id:'obj_fixture'}}});
try {
 const early=event();await enqueueVerifiedEvent(early);
 let ready=false,calls=0;
 const processor=async e=>{calls++;if(!ready)throw Object.assign(Error('Dependency not committed'),{status:503});return processEvent(e,{});};
 await drainBillingInbox(processor);assert.equal(calls,1);assert.equal((await query('SELECT processed_at FROM billing_event_inbox WHERE event_id=$1',[early.id])).rows[0].processed_at,null);pass('transient dependency retained durably');
 ready=true;await drainBillingInbox(processor);assert.equal(calls,1);pass('backoff prevents hot retry');
 await query(`UPDATE billing_event_inbox SET next_attempt_at=NOW(),claim_token=$2,lease_until=NOW()-INTERVAL '1 second' WHERE event_id=$1`,[early.id,randomUUID()]);
 // A fresh Node process, using the same isolated search_path, drains the saved envelope.
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',`import {drainBillingInbox} from './src/lib/billingInbox.js';import {processEvent} from './src/lib/billingEvents.js';import {pool} from './src/db/index.js';try{await drainBillingInbox(e=>processEvent(e,{}));}finally{await pool.end();}`],{env:process.env,windowsHide:true,stdio:'ignore'});child.on('error',reject);child.on('exit',c=>c===0?resolve():reject(Error('Worker process failed')));});
 assert.ok((await query('SELECT processed_at FROM billing_event_inbox WHERE event_id=$1',[early.id])).rows[0].processed_at);pass('fresh worker process recovers persisted event and expired lease automatically');
 const duplicate=event();await Promise.all(Array.from({length:6},()=>enqueueVerifiedEvent(duplicate)));
 await Promise.all(Array.from({length:4},()=>drainBillingInbox(e=>processEvent(e,{}))));
 assert.equal((await query('SELECT COUNT(*)::int n FROM billing_events WHERE event_id=$1',[duplicate.id])).rows[0].n,1);pass('concurrent duplicate ingress and workers produce one committed event');
 await assert.rejects(()=>enqueueVerifiedEvent({...duplicate,account:'acct_other'}));pass('same event cannot cross account boundaries');
 await assert.rejects(()=>enqueueVerifiedEvent({...event(),livemode:true}));pass('live envelopes rejected');
 const bad=event();await enqueueVerifiedEvent(bad);await drainBillingInbox(async()=>{throw Object.assign(Error('Binding mismatch'),{status:400});});
 assert.ok((await query('SELECT failed_at FROM billing_event_inbox WHERE event_id=$1',[bad.id])).rows[0].failed_at);pass('permanent validation failure quarantined');
 assert.equal(retryableEventError({code:'40P01'}),true);assert.equal(retryableEventError({type:'StripeConnectionError'}),true);assert.equal(retryableEventError({type:'StripePermissionError'}),false);pass('deadlocks and transport retry; permission failures require intervention');
 console.log(`PROMPT73A inbox: ${n} checks passed; Stripe simulated.`);
} finally {await pool.end();}
