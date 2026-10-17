import Stripe from 'stripe';
let instance;
export function stripe() {
  // Deliberately no live-mode escape hatch. Live activation needs a reviewed change.
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (process.env.BILLING_ENABLED !== 'test' || !key.startsWith('sk_test_')) {
    throw Object.assign(new Error('Billing is not configured for Stripe test mode.'), { status: 503 });
  }
  return instance ||= new Stripe(key, { apiVersion: '2025-02-24.acacia', maxNetworkRetries: 2, timeout: 15000 });
}
export function stripeOptions(account, idempotencyKey) {
  return { ...(account && account !== 'platform' ? { stripeAccount: account } : {}), ...(idempotencyKey ? { idempotencyKey } : {}) };
}
export function clientURL() {
  return (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
}
