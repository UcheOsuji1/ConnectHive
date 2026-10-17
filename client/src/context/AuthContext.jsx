import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

// id only — never email or name, matching the server's own sendDefaultPii:false stance.
function syncSentryUser(user) {
  Sentry.setUser(user ? { id: user.userId } : null);
}

export function AuthProvider({ children }) {
  const [user,    setUserState] = useState(null);
  const [config,  setConfig]    = useState(null);
  const [loading, setLoading]   = useState(true);

  // Every state update also syncs Sentry's user context, so a crash report
  // is tagged with whoever was signed in when it happened.
  const setUser = useCallback((u) => {
    setUserState(u);
    syncSentryUser(u);
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
