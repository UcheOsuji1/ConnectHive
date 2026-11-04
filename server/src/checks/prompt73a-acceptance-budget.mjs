import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {Budget,PLAN_HASH} from './acceptance/budget.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p73a-budget-')),file=path.join(dir,'journal.json');
const approval={approved:true,planHash:PLAN_HASH,runId:randomUUID(),expiresAt:new Date(Date.now()+3600000).toISOString()};let n=0,calls=0;
try {
 assert.throws(()=>new Budget({approval:{},stateFile:file}));n++;
 assert.throws(()=>new Budget({approval:{...approval,expiresAt:'not-a-date'},stateFile:file}));n++;
 const b=new Budget({approval,stateFile:file});await b.operation('initial',{charge:799},{amount:799},async()=>{calls++;return{id:'sub_fixture'};});
 const restarted=new Budget({approval,stateFile:file});await restarted.operation('initial',{charge:799},{amount:799},async()=>{calls++;});assert.equal(calls,1);n++;
 await assert.rejects(()=>restarted.operation('initial',{charge:1200},{amount:1200},async()=>{}));n++;
 await assert.rejects(()=>b.operation('overspend',{charge:20000},{amount:20000},async()=>{}));n++;
 assert.throws(()=>b.assertOwn('subscriptions','sub_protected'));n++;
 b.own('subscriptions','sub_fixture');b.assertOwn('subscriptions','sub_fixture');n++;
 await assert.rejects(()=>b.operation('uncertain',{refund:799},{amount:799},async()=>{throw Error('network lost');}));
 const c=new Budget({approval,stateFile:file});let key;await c.operation('uncertain',{refund:799},{amount:799},async k=>{key=k;return{id:'re_fixture'};});assert.equal(c.state.used.refund.count,1);assert(key.includes(approval.runId));n++;
 const amendment={kind:'one-replacement-hive',basePlanHash:PLAN_HASH,runId:approval.runId,hives:1,products:1,prices:1};
 const amended=new Budget({approval:{...approval,resourceAmendment:amendment},stateFile:file});assert.deepEqual(amended.state.used,c.state.used);n++;
 amended.own('hives','hive_original');amended.own('hives','hive_replacement');assert.throws(()=>amended.own('hives','hive_third'));n++;
 assert.throws(()=>new Budget({approval:{...approval,resourceAmendment:{...amendment,hives:2}},stateFile:file}));n++;
 assert.throws(()=>new Budget({approval:{...approval,resourceAmendment:{...amendment,financialLimits:{charge:999999}}},stateFile:file}));n++;
 assert.equal(amended.resourceLimits.subscriptions,7);await assert.rejects(()=>amended.operation('still-capped',{charge:20000},{},async()=>{}));n++;
 const rename=fs.renameSync;let attempts=0;try{fs.renameSync=(...args)=>{if(attempts++<2)throw Object.assign(Error('temporary reader lock'),{code:'EPERM'});return rename(...args);};amended.save();assert.equal(attempts,3);n++;}finally{fs.renameSync=rename;}
 assert.deepEqual(JSON.parse(fs.readFileSync(file)).used,amended.state.used);n++;
 console.log(`BUDGET: ${n} checks passed; no financial operations.`);
}finally{for(const f of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,f));fs.rmdirSync(dir);}
