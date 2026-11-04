// Read-only verification of REAL Stripe sandbox objects. No synthetic responses,
// no database access, no creation/refund/charge, and no credentials/IDs in output.
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
dotenv.config({path:new URL('../../.env.sandbox',import.meta.url)});
const required=['BILLING_ENABLED','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_CONNECT_WEBHOOK_SECRET',
 'P73A_PLUS_MONTH_SESSION','P73A_PLUS_YEAR_SESSION','P73A_HIVE_SESSION','P73A_CONNECTED_ACCOUNT','P73A_HIVE_PRICE_CENTS'];
const missing=required.filter(k=>!process.env[k]);
const report={source:'real Stripe sandbox, read-only contract verification',apiVersion:'2025-02-24.acacia',checks:[],status:'BLOCKED'};
const output=join(tmpdir(),'truehive-73a-sandbox.json');
if(missing.length){report.missing=missing;await writeFile(output,JSON.stringify(report,null,2));console.log(`BLOCKED: configure ${missing.join(', ')} locally. No Stripe request made.`);process.exitCode=2;}
else {
 try {
  const {stripe,stripeOptions,STRIPE_API_VERSION}=await import('../lib/stripe.js');
  const sdk=stripe();assert.equal(STRIPE_API_VERSION,report.apiVersion);
  const account=await sdk.accounts.retrieve(process.env.P73A_CONNECTED_ACCOUNT);
  assert.equal(account.type,'standard');assert.equal(account.charges_enabled,true);assert.equal(account.payouts_enabled,true);
  assert.equal(account.capabilities.card_payments,'active');assert.equal(account.capabilities.transfers,'active');
  report.checks.push('Connected Standard account capabilities verified');
  const hivePrice=Number(process.env.P73A_HIVE_PRICE_CENTS);assert.ok(Number.isSafeInteger(hivePrice)&&hivePrice>0);
  for(const [name,key,amount,interval,connected] of [
   ['Plus monthly','P73A_PLUS_MONTH_SESSION',799,'month',false],
   ['Plus annual','P73A_PLUS_YEAR_SESSION',6999,'year',false],
   ['Paid Hive','P73A_HIVE_SESSION',hivePrice,'month',true]]) {
   const options=stripeOptions(connected?account.id:null);
   const session=await sdk.checkout.sessions.retrieve(process.env[key],{},options);
   assert.equal(session.livemode,false);assert.equal(session.mode,'subscription');assert.equal(session.status,'complete');assert.equal(session.payment_status,'paid');
   assert.equal(session.lastResponse.apiVersion,STRIPE_API_VERSION);
   const sub=await sdk.subscriptions.retrieve(typeof session.subscription==='string'?session.subscription:session.subscription.id,{expand:['latest_invoice.charge.balance_transaction']},options);
   assert.equal(sub.livemode,false);assert.equal(sub.customer,session.customer);assert.ok(Number.isInteger(sub.current_period_end));
   assert.equal(sub.items.data.length,1);const item=sub.items.data[0];assert.equal(item.quantity,1);
   assert.equal(item.price.unit_amount,amount);assert.equal(item.price.currency,'usd');assert.equal(item.price.recurring.interval,interval);
   if(connected)assert.equal(sub.application_fee_percent,10);
   const invoice=sub.latest_invoice;assert.equal(invoice.status,'paid');assert.equal(invoice.paid_out_of_band,false);assert.equal(invoice.amount_paid,amount);
   assert.ok(invoice.charge&&typeof invoice.charge==='object');assert.ok(invoice.charge.balance_transaction&&typeof invoice.charge.balance_transaction==='object');
   if(connected){assert.ok(invoice.charge.application_fee);const fee=await sdk.applicationFees.retrieve(typeof invoice.charge.application_fee==='string'?invoice.charge.application_fee:invoice.charge.application_fee.id);assert.equal(fee.amount,Math.round(amount*.1));assert.equal(fee.account,account.id);}
   report.checks.push(`${name}: real completed Checkout, pinned response, subscription, invoice, charge and fee contract verified`);
  }
  report.status='PASS';report.limitations='Does not prove hosted onboarding, actual webhook delivery, local entitlement activation, renewals, SCA, refund/dispute or dunning flows. Follow the staging runbook.';
 } catch(error){report.status='FAIL';report.errorCode=error.code||error.name||'verification_failed';process.exitCode=1;}
 await writeFile(output,JSON.stringify(report,null,2));console.log(`${report.status}: ${report.checks.length} real sandbox contract checks. Sanitized report: ${output}`);
}
