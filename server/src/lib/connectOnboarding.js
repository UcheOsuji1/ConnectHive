import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { query } from '../db/index.js';
import { stripe, clientURL } from './stripe.js';

const audience = 'truehive-connect-callback';
export const CONNECT_STATE_SECONDS = 900;
function origin() {
  const client = new URL(clientURL());
  const value = process.env.BILLING_CALLBACK_ORIGIN ||
    (client.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(client.hostname)
      ? `http://localhost:${process.env.PORT || 5000}` : '');
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw Error('Invalid billing callback origin');
  return url.origin;
}
function sign(userId, account, purpose, depth) {
  return jwt.sign({ account, purpose, depth }, process.env.JWT_SECRET, {
    algorithm: 'HS256', audience, issuer: 'truehive-billing', subject: userId,
    jwtid: randomUUID(), expiresIn: CONNECT_STATE_SECONDS,
  });
}
export async function validateConnectState(value, purpose, db = { query }) {
  if (typeof value !== 'string' || value.length > 4096) throw Error('Invalid state');
  const state = jwt.verify(value, process.env.JWT_SECRET, { algorithms: ['HS256'], audience, issuer: 'truehive-billing' });
  if (state.purpose !== purpose || typeof state.sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(state.sub) ||
    !Number.isInteger(state.exp) || !Number.isInteger(state.iat) || state.exp - state.iat > CONNECT_STATE_SECONDS ||
    !/^acct_[A-Za-z0-9]+$/.test(state.account) || !Number.isInteger(state.depth) || state.depth < 0 || state.depth > 3 || typeof state.jti !== 'string') throw Error('Invalid state');
  const { rows: [binding] } = await db.query(`SELECT a.stripe_account_id FROM billing_accounts a JOIN users u USING(user_id)
    WHERE a.user_id=$1 AND a.stripe_account_id=$2 AND u.account_status='active'`, [state.sub, state.account]);
  if (!binding) throw Error('Invalid account binding');
  return state;
}
export async function createConnectLink(userId, account, sdk = stripe(), depth = 0) {
  if (!Number.isInteger(depth) || depth < 0 || depth > 3) throw Error('Refresh limit reached');
  const base = `${origin()}/api/billing/connect/callback`;
  return sdk.accountLinks.create({ account, type: 'account_onboarding', collection_options: { fields: 'eventually_due' },
    refresh_url: `${base}/refresh?state=${encodeURIComponent(sign(userId, account, 'refresh', depth))}`,
    return_url: `${base}/return?state=${encodeURIComponent(sign(userId, account, 'return', depth))}` });
}
export async function consumeRefresh(state, db={query}) {
  if(state.depth>=3||state.exp<=Math.floor(Date.now()/1000))throw Error('Refresh expired or limit reached');
  await db.query('DELETE FROM billing_connect_refresh_nonces WHERE expires_at<NOW()');
  const result=await db.query(`INSERT INTO billing_connect_refresh_nonces(nonce,expires_at) VALUES($1,to_timestamp($2))
    ON CONFLICT DO NOTHING RETURNING nonce`,[state.jti,state.exp]);
  if(!result.rows.length)throw Error('Refresh already used');
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function connectStatusPage(account) {
  const requirements = account.requirements || {};
  const due = [...new Set([...(requirements.currently_due || []), ...(requirements.past_due || [])])];
  const pending = requirements.pending_verification || [];
  const eligible = account.details_submitted && account.charges_enabled && account.payouts_enabled &&
    account.capabilities?.card_payments === 'active' && account.capabilities?.transfers === 'active' &&
    !requirements.disabled_reason && !due.length && !pending.length;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TrueHive Stripe onboarding status</title>
    <body><main><h1>${eligible ? 'Stripe account ready' : 'Stripe verification is incomplete'}</h1>
    <p>Stripe returned to TrueHive. This does not by itself confirm identity verification. No TrueHive sign-in is needed to view this status.</p>
    <ul><li>Details submitted: ${Boolean(account.details_submitted)}</li><li>Charges enabled: ${Boolean(account.charges_enabled)}</li>
    <li>Payouts enabled: ${Boolean(account.payouts_enabled)}</li><li>Card payments: ${escape(account.capabilities?.card_payments || 'inactive')}</li>
    <li>Transfers: ${escape(account.capabilities?.transfers || 'inactive')}</li></ul>
    <h2>Outstanding requirements</h2><ul>${due.map(x => `<li>${escape(x)}</li>`).join('') || '<li>None</li>'}</ul>
    <h2>Pending verification</h2><ul>${pending.map(x => `<li>${escape(x)}</li>`).join('') || '<li>None</li>'}</ul>
    ${!eligible && account.type === 'standard' ? '<p>This account has a full Stripe Dashboard. If hosted onboarding returns without collecting an outstanding identity requirement, complete the requirement through Stripe. TrueHive cannot edit hosted-onboarded identity details through the API.</p><p><a href="https://dashboard.stripe.com/test" rel="noreferrer">Open Stripe sandbox Dashboard</a>, select this existing connected account, then open Actions required and the identity requirement. Use the offered submission form, account-specific remediation link, or Stripe Support option. Available actions depend on the account. Use sandbox test data only.</p>' : ''}
    </main></body></html>`;
}
