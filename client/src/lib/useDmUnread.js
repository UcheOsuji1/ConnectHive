import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from './api.js';
import { socket } from './socket.js';

// Unread direct-message counts for the Messages nav badge: { inbox, requests }.
// Loaded on mount, focus and route change, and pushed live by the server's
// `dm_unread` event over the one shared socket (connected here if no other
// component has yet — never a second socket).
export function useDmUnread(enabled) {
  const [counts, setCounts] = useState({ inbox: 0, requests: 0 });
  const location = useLocation();

  const refresh = useCallback(() => {
    api.get('/api/dm/unread-count')
      .then(d => setCounts({ inbox: d.inbox ?? 0, requests: d.requests ?? 0 }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!socket.connected) socket.connect();
    function onUnread(d) { setCounts({ inbox: d?.inbox ?? 0, requests: d?.requests ?? 0 }); }
    function onVisible() { if (document.visibilityState === 'visible') refresh(); }
    socket.on('dm_unread', onUnread);
    socket.on('connect', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      socket.off('dm_unread', onUnread);
      socket.off('connect', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  useEffect(() => { if (enabled) refresh(); }, [enabled, location.pathname, refresh]);

  return enabled ? counts : { inbox: 0, requests: 0 };
}
