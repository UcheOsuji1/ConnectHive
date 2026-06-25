import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Session restore on app mount ─────────────────────────────────────────────
  useEffect(() => {
    api.get('/api/auth/me')
      .then(data => setUser(data.user))
      .catch(() => setUser(null))   // 401 = not logged in — not an error worth logging
      .finally(() => setLoading(false));
  }, []);

  // ── register ─────────────────────────────────────────────────────────────────
  // Throws on validation / duplicate — let callers handle the message.
  const register = useCallback(async (email, password) => {
    const data = await api.post('/api/auth/register', { email, password });
    // register endpoint returns user without hasProfile/hasActiveHive,
    // so fetch /me immediately to get the full shape.
    const me = await api.get('/api/auth/me');
    setUser(me.user);
    return me.user;
  }, []);

  // ── login ─────────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    await api.post('/api/auth/login', { email, password });
    // Always follow up with /me so we get hasProfile + hasActiveHive
    const me = await api.get('/api/auth/me');
    setUser(me.user);
    return me.user;
  }, []);

  // ── logout ────────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
    setUser(null);
  }, []);

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
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
