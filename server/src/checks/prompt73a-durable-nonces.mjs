import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {pool,query} from '../db/index.js';import {consumeRefresh} from '../lib/connectOnboarding.js';
assert.equal(pool.verifiedDevFixture,true);
try {
 const state={depth:0,jti:randomUUID(),exp:Math.floor(Date.now()/1000)+900};
 const outcomes=await Promise.allSettled(Array.from({length:8},()=>consumeRefresh(state)));
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 console.log('PASS concurrent workers consume refresh nonce exactly once');
 const {consumeRefresh:fresh}=await import('../lib/connectOnboarding.js?restart='+randomUUID());
 await assert.rejects(()=>fresh(state));console.log('PASS fresh module instance cannot reuse persisted nonce');
 await assert.rejects(()=>consumeRefresh({...state,jti:randomUUID(),exp:1}));
 assert.equal((await query('SELECT COUNT(*)::int n FROM billing_connect_refresh_nonces')).rows[0].n,1);
 console.log('PASS expired state rejected without inserting nonce');
}finally{await pool.end();}
