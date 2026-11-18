import { useState } from 'react';
import { api } from '../lib/api.js';

// Follow a person (Prompt 87), as in Profile_Connect_Follow: gold "Follow",
// or a gold-outline "✓ Following" that reads "Unfollow" on hover/focus and
// unfollows on click. Optimistic: flips at once, rolls back on error, and
// reports every change through onChange(next) so a count can move with it.
// (FollowButton.jsx is the Hive follow button — a different thing.)
export default function FollowPersonButton({ userId, following, onChange, size = 'md', className = '' }) {
  const [busy, setBusy] = useState(false);
  const [hot, setHot] = useState(false);

  async function toggle(e) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next = !following;
    onChange?.(next);
    setBusy(true);
    try {
      if (next) await api.post(`/api/users/${userId}/follow`, {});
      else await api.delete(`/api/users/${userId}/follow`);
    } catch {
      onChange?.(!next);
    } finally {
      setBusy(false);
    }
  }

  const label = following ? (hot ? 'Unfollow' : '✓ Following') : 'Follow';
  return (
    <button
      type="button"
      className={`fpb fpb--${size}${following ? ' fpb--on' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={following}
      disabled={busy}
      onClick={toggle}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
    >
      {label}
    </button>
  );
}
