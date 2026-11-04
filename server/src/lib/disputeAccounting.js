import {fail} from './billingStore.js';
const id=x=>typeof x==='string'?x:x?.id;
export function disputeBalance(dispute){
 if(!Array.isArray(dispute.balance_transactions))return null;
 const seen=new Set();let amount=0,fee=0,net=0;
 for(const tx of dispute.balance_transactions){
  if(!tx?.id||seen.has(tx.id)||tx.currency!=='usd'||![tx.amount,tx.fee,tx.net].every(Number.isSafeInteger)||tx.net!==tx.amount-tx.fee||id(tx.source)!==dispute.id)fail('Invalid dispute balance transaction.',400);
  seen.add(tx.id);amount+=tx.amount;fee+=tx.fee;net+=tx.net;
 }
 return {amount,fee,net,transactions:dispute.balance_transactions.map(t=>({id:t.id,source:id(t.source),currency:t.currency,amount:t.amount,fee:t.fee,net:t.net}))};
}
export async function recordDispute(db,local,dispute){
 if(dispute.currency&&dispute.currency!=='usd')fail('Unexpected dispute currency.',400);
 if(dispute.charge){const {rows}=await db.query('SELECT 1 FROM billing_invoices WHERE subscription_id=$1 AND stripe_account_id=$2 AND charge_id=$3',[local.id,local.stripe_account_id,id(dispute.charge)]);if(!rows.length)fail('Dispute charge does not match subscription.',400);}
 const balance=disputeBalance(dispute);
 const result=await db.query(`INSERT INTO billing_disputes(stripe_dispute_id,subscription_id,status,amount_cents,balance_amount_cents,balance_fee_cents,balance_net_cents,balance_transactions,balance_checked_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8::jsonb IS NOT NULL THEN NOW() END)
  ON CONFLICT(stripe_dispute_id) DO UPDATE SET status=EXCLUDED.status,amount_cents=EXCLUDED.amount_cents,updated_at=NOW(),
   balance_amount_cents=COALESCE(EXCLUDED.balance_amount_cents,billing_disputes.balance_amount_cents),
   balance_fee_cents=COALESCE(EXCLUDED.balance_fee_cents,billing_disputes.balance_fee_cents),
   balance_net_cents=COALESCE(EXCLUDED.balance_net_cents,billing_disputes.balance_net_cents),
   balance_transactions=COALESCE(EXCLUDED.balance_transactions,billing_disputes.balance_transactions),
   balance_checked_at=COALESCE(EXCLUDED.balance_checked_at,billing_disputes.balance_checked_at)
   WHERE billing_disputes.subscription_id=EXCLUDED.subscription_id RETURNING stripe_dispute_id`,
  [dispute.id,local.id,dispute.status,dispute.amount,balance?.amount??null,balance?.fee??null,balance?.net??null,balance?JSON.stringify(balance.transactions):null]);
 if(!result.rows.length)fail('Dispute ownership cannot change.',400);return balance;
}
