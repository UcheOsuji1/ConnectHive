import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { stripe } from '../lib/stripe.js';
import { createConnectLink, validateConnectState, consumeRefresh, connectStatusPage } from '../lib/connectOnboarding.js';

export function connectCallbacks({ sdk = stripe, validate = validateConnectState, consume = consumeRefresh } = {}) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
    next();
  });
  router.use(rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
  for (const purpose of ['refresh', 'return']) router.get('/' + purpose, async (req, res) => {
    let state;
    try { state = await validate(req.query.state, purpose); }
    catch { return res.status(400).type('html').send('<h1>Invalid or expired onboarding link</h1><p>Resume Connect from your authenticated TrueHive account.</p>'); }
    try {
      if (purpose === 'refresh') {
        await consume(state);
        const link = await createConnectLink(state.sub, state.account, sdk(), state.depth + 1);
        const url = new URL(link.url);
        if (url.protocol !== 'https:' || url.hostname !== 'connect.stripe.com' || url.username || url.password || url.port) throw Error('Invalid Stripe URL');
        console.log('[connect/callback] refresh: replacement link created');
        return res.redirect(303, link.url);
      }
      const account = await sdk().accounts.retrieve(state.account);
      if (account.metadata?.truehive_user_id !== state.sub) throw Error('Account owner mismatch');
      console.log('[connect/callback] return: account status displayed');
      return res.type('html').send(connectStatusPage(account));
    } catch {
      return res.status(503).type('html').send('<h1>Onboarding could not continue</h1><p>The refresh link may already have been used or its retry limit reached. Resume Connect from your authenticated TrueHive account. No verification was bypassed.</p>');
    }
  });
  return router;
}
export default connectCallbacks();
