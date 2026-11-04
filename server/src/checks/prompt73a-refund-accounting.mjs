import assert from 'node:assert/strict';import {chargeAccounting} from './acceptance/accounting.mjs';
const charge={amount:1200,amount_refunded:1200,balance_transaction:{amount:1200,fee:185,net:1015,fee_details:[{type:'stripe_fee',amount:65},{type:'application_fee',amount:120}]}};
const full=chargeAccounting(charge,{amount:120,amount_refunded:120});assert.equal(full.retainedPlatformFee,0);assert.equal(full.processing,65);assert.equal(full.netAfterRefunds,-65);
const partial=chargeAccounting({...charge,amount_refunded:300},{amount:120,amount_refunded:30});assert.equal(partial.retainedPlatformFee,90);assert.equal(partial.netAfterRefunds,745);
assert.throws(()=>chargeAccounting(charge));assert.throws(()=>chargeAccounting(charge,{amount:120,amount_refunded:121}));
const plus=chargeAccounting({amount:799,amount_refunded:200,balance_transaction:{amount:799,fee:53,net:746,fee_details:[{type:'stripe_fee',amount:53}]}});assert.equal(plus.retainedPlatformFee,0);assert.equal(plus.netAfterRefunds,546);
console.log('REFUND ACCOUNTING: 9 checks passed; no external requests.');
