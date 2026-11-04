import Stripe from 'stripe';
let instance;
export const STRIPE_API_VERSION='2025-02-24.acacia';
export function stripe() {
  // Deliberately no live-mode escape hatch. Live activation needs a reviewed change.
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (process.env.BILLING_ENABLED !== 'test' || !key.startsWith('sk_test_')) {
    throw Object.assign(new Error('Billing is not configured for Stripe test mode.'), { status: 503 });
  }
  return instance ||= new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 15000 });
}
export function stripeOptions(account, idempotencyKey) {
  return { ...(account && account !== 'platform' ? { stripeAccount: account } : {}), ...(idempotencyKey ? { idempotencyKey } : {}) };
}
export function clientURL() {
  const value=process.env.CLIENT_URL || 'http://localhost:5173';
  try {
    if(/[\u0000-\u0020\u007f\\]/.test(value))throw new Error();
    const url=new URL(value);
    if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||
      (url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new Error();
    return url.origin;
  } catch {throw Object.assign(new Error('CLIENT_URL must be a trusted HTTPS origin, or HTTP loopback for local testing.'),{status:503});}
}
