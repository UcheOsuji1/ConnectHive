// Offline HTTP/state tests. Never opens an Account Link or contacts Stripe/Neon.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import express from 'express';
process.env.DATABASE_URL = 'postgresql://fixture@127.0.0.1/fixture';
process.env.JWT_SECRET = 'offline-connect-callback-fixture-secret';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.BILLING_CALLBACK_ORIGIN = 'http://localhost:5183';
const { createConnectLink, validateConnectState, consumeRefresh } = await import('../lib/connectOnboarding.js');
const { connectCallbacks } = await import('../routes/connectCallbacks.js');
const { pool } = await import('../db/index.js');
const user = randomUUID(), account = 'acct_fixture';
let parameters, creates = 0, retrieves = 0, checks = 0;
const sdk = {
  accountLinks: { create: async p => { parameters = p; creates++; return { url: `https://connect.stripe.com/setup/fixture${creates}` }; } },
  accounts: { retrieve: async id => { assert.equal(id, account); retrieves++; return { type: 'standard', metadata: { truehive_user_id: user }, details_submitted: true, charges_enabled: false, payouts_enabled: false, capabilities: { card_payments: 'inactive', transfers: 'active' }, requirements: { currently_due: ['individual.id_number', '<script>'], pending_verification: [] } }; } },
};
const nonces=new Set();
const db={query:async(sql,params)=>{
 if(sql.startsWith('DELETE'))return {rows:[]};
 if(sql.startsWith('INSERT')){if(nonces.has(params[0]))return {rows:[]};nonces.add(params[0]);return {rows:[{nonce:params[0]}]};}
 return {rows:params[0]===user&&params[1]===account?[{stripe_account_id:account}]:[]};
}};
const validate = (token, purpose) => validateConnectState(token, purpose, db);
function pass(value, message) { assert.ok(value, message); checks++; console.log('PASS ' + message); }
await createConnectLink(user, account, sdk);
const initial = { ...parameters };
const app = express();
app.use('/api/billing/connect/callback', connectCallbacks({ sdk: () => sdk, validate, consume:state=>consumeRefresh(state,db) }));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const call = url => fetch(base + new URL(url, 'http://localhost').pathname + new URL(url, 'http://localhost').search, { redirect: 'manual' });
try {
  pass(initial.account === account && initial.type === 'account_onboarding' && initial.collection_options.fields === 'eventually_due', 'same-account onboarding collects due requirements');
  pass(new URL(initial.refresh_url).origin === 'http://localhost:5183' && initial.refresh_url !== initial.return_url, 'fixed API origin and distinct callbacks');
  const returned = await call(initial.return_url);
  const html = await returned.text();
  pass(returned.status === 200 && html.includes('individual.id_number') && !html.includes('<script>') && html.includes('&lt;script&gt;'), 'unauthenticated return displays escaped requirements');
  pass(returned.headers.get('cache-control') === 'no-store' && returned.headers.get('referrer-policy') === 'no-referrer', 'state/status protected from caching and referrer leakage');
  pass((await call(initial.return_url.replace('state=', 'state=tampered'))).status === 400, 'tampered state rejected');
  pass((await call(initial.refresh_url.replace('/refresh?', '/return?'))).status === 400, 'refresh state cannot be used as return state');
  const token = (claims, opts = {}) => jwt.sign(claims, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: 'truehive-billing', audience: 'truehive-connect-callback', subject: user, jwtid: randomUUID(), expiresIn: 900, ...opts });
  const prefix = '/api/billing/connect/callback/return?state=';
  pass((await call(prefix + token({ account, purpose: 'return', depth: 0 }, { expiresIn: -1 }))).status === 400, 'expired state rejected');
  pass((await call(prefix + token({ account: 'acct_other', purpose: 'return', depth: 0 }))).status === 400, 'unbound account rejected');
  pass((await call(prefix + token({ account, purpose: 'return', depth: 0 }, { audience: 'other' }))).status === 400, 'wrong audience rejected');
  const before = creates;
  const refreshed = await call(initial.refresh_url + '&account=acct_other&next=https://evil.invalid');
  pass(refreshed.status === 303 && parameters.account === account && creates === before + 1 && new URL(refreshed.headers.get('location')).hostname === 'connect.stripe.com', 'refresh reissues same account link and ignores account/redirect manipulation');
  pass((await call(initial.refresh_url)).status === 503 && creates === before + 1, 'refresh token replay does not mint another link');
  let next = parameters.refresh_url;
  for (let i = 0; i < 2; i++) { assert.equal((await call(next)).status, 303); next = parameters.refresh_url; }
  const atLimit = creates;
  pass((await call(next)).status === 503 && creates === atLimit, 'automatic refresh depth bounded to prevent redirect loop');
  pass(retrieves === 1, 'invalid states never retrieve account identity');
  sdk.accountLinks.create = async p => { parameters = p; return { url: 'https://connect.stripe.com.evil.invalid/setup' }; };
  await createConnectLink(user, account, sdk);
  const unsafe = await call(parameters.refresh_url);
  pass(unsafe.status === 503 && !unsafe.headers.get('location'), 'unexpected Stripe destination cannot become an open redirect');
  process.env.BILLING_CALLBACK_ORIGIN = 'https://user:password@evil.invalid/path';
  await assert.rejects(() => createConnectLink(user, account, sdk));
  pass(true, 'unsafe callback origin rejected');
  console.log(`CONNECT CALLBACKS: ${checks} checks passed; no external services used.`);
} finally { await new Promise(resolve => server.close(resolve)); await pool.end(); }
