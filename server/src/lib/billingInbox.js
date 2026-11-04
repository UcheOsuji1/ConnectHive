import {randomUUID} from 'node:crypto';
import {query} from '../db/index.js';

// Called only after constructEvent and destination checks. Never overwrite the
// first verified envelope on redelivery. Retried envelopes need no new signature:
// their trust derives from verified ingress, not a fabricated Stripe delivery.
export async function enqueueVerifiedEvent(event) {
  if(event.livemode!==false || !event.id || !event.type || !event.data?.object)
    throw Object.assign(new Error('Invalid sandbox envelope'),{status:400});
  const account=event.account||'platform';
  await query(`INSERT INTO billing_event_inbox(event_id,account_id,payload) VALUES($1,$2,$3)
    ON CONFLICT(event_id) DO NOTHING`,[event.id,account,JSON.stringify(event)]);
  const {rows:[stored]}=await query('SELECT account_id,payload FROM billing_event_inbox WHERE event_id=$1',[event.id]);
  if(stored.account_id!==account || stored.payload.type!==event.type || stored.payload.data.object.id!==event.data.object.id)
    throw Object.assign(new Error('Event identity conflict'),{status:400});
}

export function retryableEventError(error) {
  if(error.status>=400 && error.status<500 && error.status!==429)return false;
  if(['StripeInvalidRequestError','StripeAuthenticationError','StripePermissionError'].includes(error.type))return false;
  return true; // Dependency 503, SQL rollback/deadlock, transport and unknown failures stay recoverable.
}

export async function drainBillingInbox(process,limit=25) {
  const token=randomUUID();
  const {rows}=await query(`UPDATE billing_event_inbox SET claim_token=$1,lease_until=NOW()+INTERVAL '5 minutes',attempts=attempts+1
    WHERE event_id IN (SELECT event_id FROM billing_event_inbox WHERE processed_at IS NULL AND failed_at IS NULL
      AND next_attempt_at<=NOW() AND (lease_until IS NULL OR lease_until<NOW())
      ORDER BY next_attempt_at,event_id FOR UPDATE SKIP LOCKED LIMIT $2) RETURNING event_id,payload`,[token,Math.max(1,Math.min(100,limit))]);
  for(const row of rows) {
    try {
      await process(row.payload);
      await query(`UPDATE billing_event_inbox SET processed_at=NOW(),failed_at=NULL,claim_token=NULL,lease_until=NULL,last_error_code=NULL
        WHERE event_id=$1 AND claim_token=$2`,[row.event_id,token]);
      await query(`UPDATE billing_webhook_attempts SET processed_at=NOW(),last_error_code=NULL WHERE event_id=$1`,[row.event_id]);
    } catch(error) {
      const code=String(error.code||error.type||'processing_error').replace(/[^a-zA-Z0-9_]/g,'').slice(0,64);
      await query(`UPDATE billing_event_inbox SET claim_token=NULL,lease_until=NULL,last_error_code=$3,
        failed_at=CASE WHEN $4 THEN NULL ELSE NOW() END,
        next_attempt_at=NOW()+LEAST(3600,5*POWER(2,LEAST(attempts,10)))*INTERVAL '1 second'
        WHERE event_id=$1 AND claim_token=$2 AND processed_at IS NULL`,[row.event_id,token,code,retryableEventError(error)]);
    }
  }
  return rows.length;
}
