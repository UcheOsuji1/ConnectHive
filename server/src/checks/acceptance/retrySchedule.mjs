// A retry's attempt_count and next_payment_attempt need not update together.
// Never spend a retry reservation or advance a clock to a stale/past timestamp.
export async function waitForRetryDecision(read,{afterAttempt=-1,tries=90,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  for(let n=0;n<tries;n++){
    const {subscription,clock}=await read();const invoice=subscription.latest_invoice;
    if(['unpaid','canceled'].includes(subscription.status))return {terminal:true,subscription,clock};
    if(clock.status==='ready'&&invoice.attempt_count>afterAttempt&&Number.isInteger(invoice.next_payment_attempt)&&invoice.next_payment_attempt>clock.frozen_time)
      return {terminal:false,at:invoice.next_payment_attempt,subscription,clock};
    await sleep(1000);
  }
  throw Object.assign(Error('Stripe retry schedule has not settled to a future timestamp; clock left frozen'),{code:'retry_schedule_pending'});
}
const id=x=>typeof x==='string'?x:x?.id;
export function canHoldFailedFixture(f,subscription,clock,run){
 return !!f.failedInvoiceId&&f.account===null&&subscription.id===f.subId&&subscription.livemode===false&&subscription.status==='past_due'&&
  subscription.metadata?.truehive_acceptance_run===run&&id(subscription.customer)===f.customerId&&id(subscription.default_payment_method)===f.failingMethodId&&
  id(subscription.latest_invoice)===f.failedInvoiceId&&clock.id===f.clockId&&clock.livemode===false&&clock.status==='ready';
}
