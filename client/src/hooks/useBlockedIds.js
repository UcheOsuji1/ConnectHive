import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';

// Loads GET /api/blocks once per mount and keeps a Set of blocked user ids —
// used by chat (R5, collapsing a blocked sender's messages) and anywhere
// else that needs a quick "is this person blocked" check client-side. The
// server is still the enforcement point everywhere it matters; this is
// purely for rendering.
export default function useBlockedIds() {
  const [blockedIds, setBlockedIds] = useState(() => new Set());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    return api.get('/api/blocks')
      .then(d => setBlockedIds(new Set((d.blocked ?? []).map(b => b.user_id))))
      .catch(() => setBlockedIds(new Set()))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { blockedIds, loaded, refresh };
}
