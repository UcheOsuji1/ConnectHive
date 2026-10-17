import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import TrueHiveMark from './components/TrueHiveMark.jsx';
import './styles/globals.css';

// Network blips, not real bugs — don't page anyone over these. Query strings
// are stripped because verify/reset/unsubscribe links carry a bearer token.
const NOISE_PATTERNS = [/Failed to fetch/i, /Load failed/i, /NetworkError/i, /ResizeObserver loop/i];

function stripQuery(url) {
  try {
    const u = new URL(url);
    u.search = '';
    return u.toString();
  } catch {
    return url;
  }
}

function beforeSend(event, hint) {
  const message = hint?.originalException?.message || event.message || '';
  if (NOISE_PATTERNS.some(p => p.test(message))) return null;

  if (event.request?.url) event.request.url = stripQuery(event.request.url);
  if (event.exception?.values) {
    for (const v of event.exception.values) {
      if (v.stacktrace?.frames) {
        for (const frame of v.stacktrace.frames) {
          if (frame.filename) frame.filename = stripQuery(frame.filename);
        }
      }
    }
  }
  return event;
}

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend,
  });
}

function ErrorFallback() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      padding: '24px', background: 'var(--ivory)',
    }}>
      <TrueHiveMark size={64} />
      <h1 style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', margin: '20px 0 12px' }}>
        Something went wrong on this page.
      </h1>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        <a href="/" className="btn btn-ghost">Go home</a>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
          <App />
        </Sentry.ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
