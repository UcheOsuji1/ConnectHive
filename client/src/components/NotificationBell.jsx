import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

const POLL_MS = 30_000;

const TYPE_ICON = {
  member_joined:    '👋',
  request_accepted: '✓',
  join_request:     '✉',
};

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
                  <span className="nb-icon">{TYPE_ICON[n.type] ?? '•'}</span>
                  <div className="nb-content">
                    <div className="nb-title">{n.title}</div>
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
