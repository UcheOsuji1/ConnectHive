// Real PostgreSQL worker startup/heartbeat; empty synthetic schema, NO Stripe requests.
import assert from 'node:assert/strict';
import {pool,query} from '../db/index.js';
import {startBillingJob} from '../jobs/billingJob.js';
process.env.BILLING_ENABLED='test';process.env.STRIPE_SECRET_KEY='sk_test_fixture_no_network';
process.env.BILLING_WORKER_MODE='external';
try {
 startBillingJob();
 assert.equal((await query('SELECT COUNT(*)::int n FROM billing_worker_heartbeats')).rows[0].n,0);
 console.log('PASS external mode suppresses API worker');
 startBillingJob({standalone:true});
 let heartbeat;
 for(let i=0;i<50;i++){
  heartbeat=(await query('SELECT * FROM billing_worker_heartbeats WHERE last_succeeded_at IS NOT NULL')).rows[0];
  if(heartbeat)break;await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(heartbeat?.worker_id.startsWith('worker-'));
 console.log('PASS standalone worker records durable successful heartbeat');
 assert.equal(heartbeat.last_error_code,null);
 console.log('PASS healthy worker has no residual error code');
 console.log('PROMPT73A worker: 3 checks passed; real PostgreSQL, empty queue, no Stripe API calls.');
}finally{await pool.end();}
