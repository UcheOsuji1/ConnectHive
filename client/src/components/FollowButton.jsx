import { useState } from 'react';
import { api } from '../lib/api';

const BASE_STYLE = {
  borderRadius: '8px',
  padding: '8px 18px',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
  whiteSpace: 'nowrap',
};

const FOLLOW_STYLE = {
  ...BASE_STYLE,
  background: 'linear-gradient(120deg, #e8c84a 0%, #c49a28 100%)',
  border: 'none',
  color: '#1a1508',
};

const FOLLOWING_STYLE = {
  ...BASE_STYLE,
  background: 'transparent',
  border: '1.5px solid #c49a28',
  color: '#c49a28',
};

export default function FollowButton({ hiveId, initialFollowing = false, onChange }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      if (next) {
        await api.post(`/api/hives/${hiveId}/follow`);
      } else {
        await api.delete(`/api/hives/${hiveId}/follow`);
      }
      onChange?.(next);
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      style={{ ...(following ? FOLLOWING_STYLE : FOLLOW_STYLE), opacity: busy ? 0.6 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
    >
      {following ? 'Following' : '+ Follow'}
    </button>
  );
}
