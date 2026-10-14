import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import Avatar from './Avatar.jsx';

const POLL_MS = 30_000;

const TYPE_ICON = {
  member_joined:    '👋',
  request_accepted: '✓',
  join_request:     '✉',
};

// N1's 5 kinds: mentions/replies and member/join events show the actor's
// own avatar (a specific person did this); grouped room activity has no
// single actor worth naming (the group_count can span several senders), so
// it shows the Hive's own hex tile instead. Same small palette as
// HiveDashboardLayout.jsx's / HomePage.jsx's own HexTile — not shared as a
// component, same as those two don't share one with each other.
const CAT_CFG = {
  'Social Groups':           { color: '#5dcaa5', icon: '👥' },
  'Professional Networking': { color: '#c49a28', icon: '💼' },
  'Travel Buddies':          { color: '#4db6c4', icon: '✈️' },
  'Project Collaboration':   { color: '#f08a4b', icon: '🚀' },
  'Event Buddies':           { color: '#e86a7c', icon: '🎟️' },
  'Specialized Groups':      { color: '#a59ae8', icon: '⭐' },
};

function HexTile({ categoryName, logoUrl, size = 32 }) {
  const cfg = CAT_CFG[categoryName] ?? { color: '#8a8070', icon: '✦' };
  if (logoUrl) {
    return (
      <img src={logoUrl} alt="" style={{
        width: size, height: size, flexShrink: 0, objectFit: 'cover',
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
      }} />
    );
  }
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 36 36" width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        <polygon points="18,2 33,10 33,26 18,34 3,26 3,10" fill={cfg.color} fillOpacity="0.22" stroke={cfg.color} strokeWidth="1.5" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45 }}>
        {cfg.icon}
      </div>
    </div>
  );
}

// 'room_activity' is the one kind with no single actor worth naming; every
// other kind (mentions, pair activity, new posts, member/join events) shows
// whoever actually did the thing.
function NotifAvatar({ n }) {
  if (n.type === 'room_activity') {
    return <HexTile categoryName={n.hive_category_name} logoUrl={n.hive_logo_url} />;
  }
  if (n.actor_user_id) {
    return <Avatar name={n.actor_name ?? 'Member'} src={n.actor_photo} size={32} />;
  }
  return <span className="nb-icon">{TYPE_ICON[n.type] ?? '•'}</span>;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [open,          setOpen]          = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingList,   setLoadingList]   = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  // Poll unread count
  useEffect(() => {
    let cancelled = false;
    function poll() {
      api.get('/api/notifications/unread-count')
        .then(d => { if (!cancelled) setUnreadCount(d.unread_count ?? 0); })
        .catch(() => {});
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoadingList(true);
      api.get('/api/notifications')
        .then(d => {
          setNotifications(d.notifications ?? []);
          setUnreadCount(d.unread_count ?? 0);
        })
        .catch(() => {})
        .finally(() => setLoadingList(false));
    }
  }

  async function handleMarkAll() {
    await api.post('/api/notifications/read-all').catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  async function handleRow(n) {
    if (!n.read) {
      api.post(`/api/notifications/${n.notification_id}/read`).catch(() => {});
      setNotifications(prev =>
        prev.map(x => x.notification_id === n.notification_id ? { ...x, read: true } : x)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  const hasUnread = notifications.some(n => !n.read);

  return (
    <div className="nb-wrap" ref={ref}>
      <button className="nb-bell" onClick={handleToggle} aria-label="Notifications">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="nb-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="nb-panel">
          <div className="nb-panel-header">
            <span className="nb-panel-title">Notifications</span>
            {hasUnread && (
              <button className="nb-mark-all" onClick={handleMarkAll}>
                Mark all read
              </button>
            )}
          </div>

          {loadingList ? (
            <div className="nb-empty">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="nb-empty">You're all caught up.</div>
          ) : (
            <div className="nb-list">
              {notifications.map(n => (
                <button
                  key={n.notification_id}
                  className={`nb-row${n.read ? '' : ' nb-unread'}`}
                  onClick={() => handleRow(n)}
                >
                  <NotifAvatar n={n} />
                  <div className="nb-content">
                    <div className="nb-title">
                      {n.title}
                      {n.group_count > 1 && <span className="nb-count-chip">{n.group_count}</span>}
                    </div>
                    {n.body && <div className="nb-body">{n.body}</div>}
                    <div className="nb-time">{timeAgo(n.created_at)}</div>
                  </div>
                  {!n.read && <span className="nb-dot" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
