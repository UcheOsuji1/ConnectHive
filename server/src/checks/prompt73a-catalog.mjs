// No external requests: catalog/account/legacy-binding and idempotent publish contracts.
import assert from 'node:assert/strict';
import {hiveCatalogPrice,ensureHiveCatalogPrice} from '../lib/hiveCatalog.js';
import {pool} from '../db/index.js';
let n=0,rows=[],items=[],truncated=false,creates=[];
const pass=t=>{n++;console.log('PASS '+t);};
const target={hiveId:'fixture-hive',account:'acct_fixture',amount:1200,revision:1,name:'Fixture'};
const price=()=>({id:'price_fixture',active:true,livemode:false,type:'recurring',currency:'usd',unit_amount:1200,recurring:{interval:'month',interval_count:1},metadata:{truehive_hive_id:target.hiveId},product:{id:'prod_fixture',active:true,livemode:false}});
const db={query:async()=>({rows})};
const sdk={prices:{list:async(_p,o)=>{assert.equal(o.stripeAccount,target.account);return{data:items,has_more:truncated};},create:async(p,o)=>{creates.push(o.idempotencyKey);const result={...price(),...p,recurring:{...p.recurring,interval_count:1}};items=[{...result,product:{id:p.product,active:true,livemode:false,metadata:{truehive_hive_id:target.hiveId}}}];return result;}},subscriptions:{retrieve:async(_id,_p,o)=>{assert.equal(o.stripeAccount,target.account);return{id:'sub_fixture',livemode:false,customer:'cus_fixture',metadata:{truehive_subscription_id:'local_fixture'},items:{data:[{quantity:1,price:{id:'price_fixture'}}]}};}},products:{retrieve:async()=>{throw{code:'resource_missing'};},create:async(p,o)=>{creates.push(o.idempotencyKey);return{...p,active:true,livemode:false};}}};
try {
 items=[price()];assert.equal(await hiveCatalogPrice(target,sdk,db),'price_fixture');pass('metadata-bound price reused in exact connected-account context');
 items=[{...price(),metadata:{truehive_hive_id:'other'}}];await assert.rejects(()=>hiveCatalogPrice(target,sdk,db));pass('another Hive price rejected');
 for(const change of [{livemode:true},{currency:'eur'},{unit_amount:1},{active:false},{recurring:{interval:'year',interval_count:1}},{product:{active:false,livemode:false}}]){items=[{...price(),...change}];await assert.rejects(()=>hiveCatalogPrice(target,sdk,db));}pass('live, wrong amount/currency/interval and inactive catalog rejected');
 items=[price(),{...price(),id:'price_second'}];await assert.rejects(()=>hiveCatalogPrice(target,sdk,db));pass('ambiguous price rejected');
 truncated=true;await assert.rejects(()=>hiveCatalogPrice(target,sdk,db));truncated=false;pass('truncated catalog fails closed');
 items=[{...price(),metadata:{}}];rows=[{id:'local_fixture',stripe_subscription_id:'sub_fixture',stripe_customer_id:'cus_fixture'}];assert.equal(await hiveCatalogPrice(target,sdk,db),'price_fixture');pass('legacy inline price reused only through proven local reservation/customer');
 rows[0].stripe_customer_id='cus_other';await assert.rejects(()=>hiveCatalogPrice(target,sdk,db));pass('legacy customer mismatch rejected');
 rows[0].stripe_customer_id='cus_fixture';items=[];assert.equal(await hiveCatalogPrice({...target,allowMissing:true},sdk,db),null);pass('archived inline legacy price requires canonical provisioning rather than unsafe reactivation');
 rows=[];items=[];assert.equal(await ensureHiveCatalogPrice(target,sdk,db),'price_fixture');assert.deepEqual(creates,[`hive-product-${target.hiveId}`,`hive-${target.hiveId}-r1-usd-1200-month`]);pass('new approved offering provisions deterministic product and lookup/idempotency price');
 await ensureHiveCatalogPrice(target,sdk,db);assert.equal(creates.length,2);pass('repeated publication reuses catalog without another create');
 console.log(`CATALOG: ${n} checks passed; Stripe simulated.`);
}finally{await pool.end();}
