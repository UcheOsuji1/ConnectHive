// Loaded via `node --import ./src/instrument.js src/index.js` — before any
// other module, including env.js, so this loads its own .env first.
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import * as Sentry from '@sentry/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Routes whose request body can carry a password, a verification/reset
// token, or bulk email content — scrubbed even though sendDefaultPii is
// already off, as defense in depth against a future change re-enabling it.
const SENSITIVE_BODY_ROUTES = /^\/api\/(auth|account)(\/|$)|^\/api\/admin\/newsletter(\/|$)/;

function beforeSend(event) {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
    if (event.request.url && SENSITIVE_BODY_ROUTES.test(new URL(event.request.url, 'http://x').pathname)) {
      delete event.request.data;
    }
  }
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }
  return event;
}

if (!process.env.SENTRY_DSN) {
  console.log('[sentry] SENTRY_DSN not set, error tracking off');
} else {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.RENDER_GIT_COMMIT,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend,
  });
}
