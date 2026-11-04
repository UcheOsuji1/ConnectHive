import assert from 'node:assert/strict';
// Charge balance transactions retain the ORIGINAL application fee. The invoice
// ledger records the fee RETAINED after any separately verified fee reversal.
export function chargeAccounting(charge, applicationFee=null) {
  const tx=charge.balance_transaction;assert(tx&&typeof tx==='object');
  const originalPlatformFee=(tx.fee_details||[]).filter(x=>x.type==='application_fee').reduce((n,x)=>n+x.amount,0);
  assert.equal(tx.net,tx.amount-tx.fee);
  if(originalPlatformFee){assert(applicationFee);assert.equal(applicationFee.amount,originalPlatformFee);assert(applicationFee.amount_refunded>=0&&applicationFee.amount_refunded<=applicationFee.amount);}
  const reversedPlatformFee=applicationFee?.amount_refunded||0;
  const retainedPlatformFee=originalPlatformFee-reversedPlatformFee;
  const processing=tx.fee-originalPlatformFee;
  assert(processing>=0&&retainedPlatformFee>=0);
  return {gross:charge.amount,refunded:charge.amount_refunded,processing,originalPlatformFee,reversedPlatformFee,retainedPlatformFee,
    originalBalanceNet:tx.net,netAfterRefunds:charge.amount-charge.amount_refunded-processing-retainedPlatformFee};
}
