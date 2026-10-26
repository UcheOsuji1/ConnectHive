import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import { api } from '../lib/api';
import posthog, { isPostHogEnabled } from '../lib/posthog';

const AuthContext = createContext(null);

// id only — never email or name, matching the server's own sendDefaultPii:false stance.
function syncSentryUser(user) {
  Sentry.setUser(user ? { id: user.userId } : null);
}

function syncPostHogUser(user) {
  if (!isPostHogEnabled) return;

  const identifiedUserId = posthog.get_property('$user_id');
  if (!user?.userId) {
    if (identifiedUserId) posthog.reset();
    return;
  }

  const distinctId = String(user.userId);

  // Do not merge a prior account's activity if a different user signs in on
  // this device. Anonymous activity remains intact for normal login/signup.
  if (identifiedUserId && identifiedUserId !== distinctId) posthog.reset();

  // Identity persists in the SDK, so avoid re-identifying on ordinary user
  // state refreshes while still restoring identity after a page reload.
  // The id alone is enough to link events to an account — same as Sentry,
  // no email ever goes to PostHog.
  if (posthog.get_property('$user_id') !== distinctId) {
    posthog.identify(distinctId);
  }
}

export function AuthProvider({ children }) {
  const [user,    setUserState] = useState(null);
  const [config,  setConfig]    = useState(null);
  const [loading, setLoading]   = useState(true);

  // Every state update also syncs error reporting and product analytics to
  // the authenticated user's stable server-issued id.
  const setUser = useCallback((u) => {
    setUserState(u);
    syncSentryUser(u);
    syncPostHogUser(u);
  }, []);

  // ── Session restore + public config on app mount ──────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/api/auth/me').then(data => setUser(data.user)).catch(() => setUser(null)),
      api.get('/api/config').then(data => setConfig(data)).catch(() => setConfig({})),
    ]).finally(() => setLoading(false));
  }, [setUser]);

  // ── register ─────────────────────────────────────────────────────────────────
  // Throws on validation / duplicate — let callers handle the message.
  const register = useCallback(async (email, password, acceptedTerms, dateOfBirth, newsOptIn) => {
    const data = await api.post('/api/auth/register', { email, password, acceptedTerms, dateOfBirth, newsOptIn });
    // register endpoint returns user without hasProfile/hasActiveHive,
    // so fetch /me immediately to get the full shape.
    const me = await api.get('/api/auth/me');
    setUser(me.user);
    return me.user;
  }, [setUser]);

  // ── login ─────────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    await api.post('/api/auth/login', { email, password });
    // Always follow up with /me so we get hasProfile + hasActiveHive
    const me = await api.get('/api/auth/me');
    setUser(me.user);
    return me.user;
  }, [setUser]);

  // ── logout ────────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
    if (isPostHogEnabled) posthog.reset();
    setUser(null);
  }, [setUser]);

  // ── refreshUser ───────────────────────────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    try {
      const me = await api.get('/api/auth/me');
      setUser(me.user);
      return me.user;
    } catch {
      setUser(null);
      return null;
    }
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ user, config, loading, register, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
