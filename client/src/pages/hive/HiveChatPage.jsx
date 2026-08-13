import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from '../../components/Avatar.jsx';
import EmojiPicker from '../../components/EmojiPicker.jsx';
import { api } from '../../lib/api.js';
import { socket } from '../../lib/socket.js';
import '../../styles/hive-chat.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDay(dateStr) {
  const d = new Date(dateStr);
  const today     = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return 'TODAY';
  if (d.toDateString() === yesterday.toDateString()) return 'YESTERDAY';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function withinGroup(prev, curr) {
  if (!prev || prev.sender_user_id !== curr.sender_user_id) return false;
  return (new Date(curr.sent_at) - new Date(prev.sent_at)) < 5 * 60 * 1000;
}

// Annotate messages with _showDay and _grouped
function annotate(msgs) {
  return msgs.map((msg, i) => {
    const prev     = msgs[i - 1] ?? null;
    const showDay  = !prev || !sameDay(prev.sent_at, msg.sent_at);
    const grouped  = !showDay && withinGroup(prev, msg);
    return { ...msg, _showDay: showDay, _grouped: grouped };
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RoomsRail() {
  return (
    <aside className="hc-rooms-rail" aria-label="Rooms">
      <div className="hc-rail-section-label">Rooms</div>
      <div className="hc-room-item hc-room-item--active"># general</div>
      <div className="hc-room-item"># announcements <span className="hc-room-soon-pill">Soon</span></div>
      <div className="hc-room-item"># resources <span className="hc-room-soon-pill">Soon</span></div>
      <div className="hc-room-item"># planning <span className="hc-room-soon-pill">Soon</span></div>

      <div className="hc-rail-section-label">Voice</div>
      <div className="hc-room-item">🔊 Lounge <span className="hc-room-soon-pill">Soon</span></div>

      <div title="Coming soon" className="hc-add-room">+ Add room</div>
    </aside>
  );
}

function TypingIndicator({ typingUsers, currentUserId }) {
  const others = Object.entries(typingUsers)
    .filter(([id]) => id !== currentUserId)
    .map(([, name]) => name ?? 'Someone');

  if (others.length === 0) return <div className="hc-typing" />;

  let text;
  if (others.length === 1)      text = `${others[0]} is typing`;
  else if (others.length === 2) text = `${others[0]} and ${others[1]} are typing`;
  else                          text = 'Several members are typing…';

  return (
    <div className="hc-typing">
      <span>{text}</span>
      <span className="hc-typing-dots">
        <span /><span /><span />
      </span>
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="hc-skeleton-wrap">
      {[0, 1, 2].map(i => (
        <div key={i} className={`hc-skeleton-row hc-skeleton-row--${i % 2 === 0 ? 'left' : 'right'}`}>
          {i % 2 === 0 && <div className="hc-skel hc-skel--avatar" />}
          <div className="hc-skel-body">
            {i % 2 === 0 && <div className="hc-skel hc-skel--name" />}
            <div className="hc-skel hc-skel--bubble" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageRow({
  msg, isOwn, isLast, members, userId,
  onReply, onEdit, onDelete, onReaction, isOwner,
  editingId, editText, onEditChange, onEditSave, onEditCancel,
  onRetry, onDiscard,
}) {
  const isEditing  = editingId === msg.message_id;
  const isDeleted  = msg.is_deleted;
  const isSending  = msg._status === 'sending';
  const isFailed   = msg._status === 'failed';
  const isTemp     = msg.message_id?.startsWith('temp-');

  const senderName = msg.sender?.full_name ?? 'Member';
  const senderRole = msg.sender?.role;
  const time       = formatTime(msg.sent_at);
  const timeLabel  = msg.edited_at ? `${time} · edited` : time;

  function reactorNames(userIds) {
    return (userIds ?? [])
      .map(id => members.find(m => m.user_id === id)?.full_name ?? 'Someone')
      .join(', ');
  }

  const editRef = useRef(null);
  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [isEditing]);

  function handleEditKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSave(msg.message_id); }
    if (e.key === 'Escape')                onEditCancel();
  }

  const bubbleCls = [
    'hc-bubble',
    isDeleted  ? 'hc-bubble--deleted'  : '',
    isSending  ? 'hc-bubble--sending'  : '',
    isFailed   ? 'hc-bubble--failed'   : '',
  ].filter(Boolean).join(' ');

  const showBadge = !isOwn && (senderRole === 'owner' || senderRole === 'admin');
  const canSelfEdit = isOwn && !isDeleted && !isTemp;
  const canModDelete = isOwner && !isOwn && !isDeleted && !isTemp;

  return (
    <div className={['hc-msg-row', msg._grouped ? '' : 'hc-msg-row--first', isOwn ? 'hc-msg-row--own' : ''].filter(Boolean).join(' ')}>

      {/* Avatar column (other people only) */}
      {!isOwn && (
        msg._grouped
          ? <div className="hc-msg-avatar-placeholder" />
          : <div className="hc-msg-avatar-col">
              <Avatar name={senderName} src={msg.sender?.profile_photo_url} size={32} />
            </div>
      )}

      <div className="hc-msg-body">
        {/* Header */}
        {!msg._grouped && (
          <div className="hc-msg-header">
            {!isOwn && <span className="hc-msg-sender">{senderName}</span>}
            {showBadge && (
              <span className={`hc-msg-badge hc-msg-badge--${senderRole}`}>
                {senderRole.charAt(0).toUpperCase() + senderRole.slice(1)}
              </span>
            )}
            <span className="hc-msg-time">{timeLabel}{isOwn && ' · You'}</span>
          </div>
        )}
        {msg._grouped && isOwn && (
          <div className="hc-msg-header">
            <span className="hc-msg-time">{timeLabel}</span>
          </div>
        )}

        {/* Bubble / edit mode */}
        {isEditing ? (
          <>
            <textarea
              ref={editRef}
              className="hc-edit-area"
              value={editText}
              onChange={e => onEditChange(e.target.value)}
              onKeyDown={handleEditKey}
              maxLength={2000}
              rows={3}
            />
            <div className="hc-edit-btns">
              <button className="hc-edit-save"   onClick={() => onEditSave(msg.message_id)}>Save</button>
              <button className="hc-edit-cancel" onClick={onEditCancel}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className={bubbleCls}>
              {/* Reply quote */}
              {msg.reply_to && !isDeleted && (
                <div className="hc-reply-quote">
                  <div className="hc-reply-quote-name">{msg.reply_to.sender_name}</div>
                  <div className="hc-reply-quote-text">{msg.reply_to.snippet || '[deleted]'}</div>
                </div>
              )}
              {isDeleted
                ? 'Message deleted'
                : msg.message_text ?? ''}
            </div>

            {/* Failed strip */}
            {isFailed && (
              <div className="hc-failed-strip">
                Failed to send ·{' '}
                <button onClick={() => onRetry(msg.message_id)}>Retry</button>
                {' · '}
                <button onClick={() => onDiscard(msg.message_id)}>Discard</button>
              </div>
            )}

            {/* Sent tick — only on the most recent confirmed own message */}
            {isOwn && isLast && !isTemp && !isDeleted && (
              <div className="hc-sent-tick">✓ Sent</div>
            )}

            {/* Reactions */}
            {!isDeleted && (
              <div className="hc-reactions">
                {(msg.reactions ?? []).map(r => {
                  const iMine = (r.user_ids ?? []).includes(userId);
                  return (
                    <button
                      key={r.emoji}
                      className={['hc-reaction-chip', iMine ? 'hc-reaction-chip--mine' : ''].filter(Boolean).join(' ')}
                      title={reactorNames(r.user_ids)}
                      onClick={() => onReaction(msg.message_id, r.emoji)}
                    >
                      {r.emoji} {r.count}
                    </button>
                  );
                })}
                {!isTemp && (
                  <EmojiPicker onSelect={emoji => onReaction(msg.message_id, emoji)} />
                )}
              </div>
            )}

            {/* Hover actions */}
            {!isDeleted && (
              <div className="hc-msg-actions">
                <button className="hc-action-btn" onClick={() => onReply(msg)}>Reply</button>
                {canSelfEdit   && <button className="hc-action-btn" onClick={() => onEdit(msg)}>Edit</button>}
                {(canSelfEdit || canModDelete) && (
                  <button className="hc-action-btn hc-action-btn--del" onClick={() => onDelete(msg.message_id)}>Delete</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Context Rail ──────────────────────────────────────────────────────────────

function ContextRail({ members, onlineUserIds, pinnedGoal }) {
  const sorted = [...members].sort((a, b) => {
    const ao = onlineUserIds.includes(a.user_id) ? 0 : 1;
    const bo = onlineUserIds.includes(b.user_id) ? 0 : 1;
    return ao - bo;
  });

  return (
    <aside className="hc-context-rail" aria-label="Context">
      <div className="hc-ctx-section">
        <div className="hc-ctx-label">Active Now</div>
        {sorted.map(m => {
          const online = onlineUserIds.includes(m.user_id);
          return (
            <div key={m.user_id} className="hc-member-row">
              <Avatar name={m.full_name} src={m.profile_photo_url} size={22} />
              <span className="hc-member-name">{m.full_name ?? 'Member'}</span>
              <span
                className="hc-presence-indicator"
                style={{ background: online ? '#5dcaa5' : '#b4b2a9' }}
                title={online ? 'Online' : 'Offline'}
              />
            </div>
          );
        })}
      </div>

      {pinnedGoal && (
        <div className="hc-pinned-card">
          <div className="hc-pinned-label">Pinned Goal</div>
          <p className="hc-pinned-text">{pinnedGoal}</p>
        </div>
      )}

      <div className="hc-upcoming-slot">
        <span>Upcoming Event</span>
        <span className="hc-upcoming-slot-soon">Soon</span>
      </div>
    </aside>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HiveChatPage() {
  const { hive, hiveId, isOwner, canPost, setChatUnread } = useOutletContext();
  const { user } = useAuth();

  const userId = user?.userId ?? null;

  // Data
  const [messages,      setMessages]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [hasMore,       setHasMore]       = useState(false);
  const [loadingOlder,  setLoadingOlder]  = useState(false);
  const [members,       setMembers]       = useState([]);

  // Real-time
  const [onlineUserIds, setOnlineUserIds] = useState([]);
  const [typingUsers,   setTypingUsers]   = useState({});  // { userId: fullName }
  const [socketError,   setSocketError]   = useState(false);

  // Composer
  const [draftText, setDraftText] = useState('');
  const [replyTo,   setReplyTo]   = useState(null);

  // Edit
  const [editingId,  setEditingId]  = useState(null);
  const [editText,   setEditText]   = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // UI
  const [showContext, setShowContext] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);

  // Refs for stable callbacks
  const scrollAreaRef     = useRef(null);
  const composerRef       = useRef(null);
  const isNearBottomRef   = useRef(true);
  const hasMoreRef        = useRef(false);
  const loadingOlderRef   = useRef(false);
  const typingTimers      = useRef({});
  const lastTypingEmit    = useRef(0);
  const typingIdleTimer   = useRef(null);
  const messagesRef       = useRef([]);

  // Keep refs in sync
  useEffect(() => { hasMoreRef.current      = hasMore; },      [hasMore]);
  useEffect(() => { loadingOlderRef.current = loadingOlder; }, [loadingOlder]);
  useEffect(() => { messagesRef.current     = messages; },     [messages]);

  // ── Mark seen ──────────────────────────────────────────────────────────────
  const markSeen = useCallback(() => {
    api.post(`/api/hives/${hiveId}/seen`, {}).catch(() => {});
    if (typeof setChatUnread === 'function') setChatUnread(0);
  }, [hiveId, setChatUnread]);

  // ── Scroll helpers ─────────────────────────────────────────────────────────
  function scrollToBottom(smooth = false) {
    const el = scrollAreaRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    isNearBottomRef.current = true;
    setNewMsgCount(0);
  }

  function isNearBottom() {
    const el = scrollAreaRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  // ── Load older messages ────────────────────────────────────────────────────
  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);

    const oldest  = messagesRef.current[0];
    const el      = scrollAreaRef.current;
    const prevH   = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop    ?? 0;

    try {
      const data  = await api.get(`/api/hives/${hiveId}/messages?before=${encodeURIComponent(oldest.sent_at)}&limit=50`);
      const older = data.messages ?? [];
      setHasMore(data.has_more ?? false);
      setMessages(prev => {
        const ids = new Set(prev.map(m => m.message_id));
        const fresh = older.filter(m => !ids.has(m.message_id));
        return [...fresh, ...prev];
      });
      requestAnimationFrame(() => {
        if (el) el.scrollTop = prevTop + (el.scrollHeight - prevH);
      });
    } catch { /* silently ignore */ }
    finally {
      setLoadingOlder(false);
      loadingOlderRef.current = false;
    }
  }, [hiveId]);

  // ── Scroll handler ─────────────────────────────────────────────────────────
  function handleScroll() {
    const el = scrollAreaRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    isNearBottomRef.current = near;
    if (near) setNewMsgCount(0);
    if (el.scrollTop < 100) loadOlderMessages();
  }

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/api/hives/${hiveId}/messages?limit=50`),
      api.get(`/api/hives/${hiveId}/members`),
    ]).then(([msgData, memData]) => {
      setMessages(msgData.messages ?? []);
      setHasMore(msgData.has_more ?? false);
      setMembers(memData.members ?? []);
    }).catch(() => {}).finally(() => {
      setLoading(false);
      // Scroll to bottom after first render
      requestAnimationFrame(() => scrollToBottom());
    });
    markSeen();
  }, [hiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when messages first load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.emit('join_hive_room', { hiveId }, (ack) => {
      if (ack?.ok) {
        setOnlineUserIds(ack.online_user_ids ?? []);
      } else {
        setSocketError(true);
      }
    });

    const onReceiveMessage = (msg) => {
      setMessages(prev => {
        if (prev.some(m => m.message_id === msg.message_id)) return prev;
        if (!isNearBottomRef.current) {
          setNewMsgCount(c => c + 1);
        }
        return [...prev, msg];
      });
      if (document.visibilityState === 'visible') {
        markSeen();
        if (isNearBottomRef.current) {
          requestAnimationFrame(() => scrollToBottom(true));
        }
      }
    };

    const onMessageUpdated = (msg) => {
      setMessages(prev => prev.map(m => m.message_id === msg.message_id ? { ...msg, _status: 'sent' } : m));
    };

    const onMessageDeleted = ({ message_id }) => {
      setMessages(prev => prev.map(m =>
        m.message_id === message_id ? { ...m, is_deleted: true, message_text: null } : m,
      ));
    };

    const onReactionUpdated = ({ message_id, reactions }) => {
      setMessages(prev => prev.map(m => m.message_id === message_id ? { ...m, reactions } : m));
    };

    const onPresenceUpdate = ({ online_user_ids }) => {
      setOnlineUserIds(online_user_ids ?? []);
    };

    const onTypingUpdate = ({ user_id, full_name, typing }) => {
      if (user_id === userId) return;
      if (typingTimers.current[user_id]) {
        clearTimeout(typingTimers.current[user_id]);
        delete typingTimers.current[user_id];
      }
      if (typing) {
        setTypingUsers(prev => ({ ...prev, [user_id]: full_name ?? 'Someone' }));
        typingTimers.current[user_id] = setTimeout(() => {
          setTypingUsers(prev => { const { [user_id]: _, ...rest } = prev; return rest; });
          delete typingTimers.current[user_id];
        }, 4000);
      } else {
        setTypingUsers(prev => { const { [user_id]: _, ...rest } = prev; return rest; });
      }
    };

    socket.on('receive_message',  onReceiveMessage);
    socket.on('message_updated',  onMessageUpdated);
    socket.on('message_deleted',  onMessageDeleted);
    socket.on('reaction_updated', onReactionUpdated);
    socket.on('presence_update',  onPresenceUpdate);
    socket.on('typing_update',    onTypingUpdate);

    return () => {
      socket.emit('leave_hive_room', { hiveId });
      socket.off('receive_message',  onReceiveMessage);
      socket.off('message_updated',  onMessageUpdated);
      socket.off('message_deleted',  onMessageDeleted);
      socket.off('reaction_updated', onReactionUpdated);
      socket.off('presence_update',  onPresenceUpdate);
      socket.off('typing_update',    onTypingUpdate);
      // Clear typing timers
      Object.values(typingTimers.current).forEach(clearTimeout);
      typingTimers.current = {};
    };
  }, [hiveId, userId, markSeen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark seen on visibility change
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') markSeen(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markSeen]);

  // ── Typing emit ────────────────────────────────────────────────────────────
  function emitTypingStart() {
    const now = Date.now();
    if (now - lastTypingEmit.current > 2000) {
      lastTypingEmit.current = now;
      socket.emit('typing_start', { hiveId });
    }
    if (typingIdleTimer.current) clearTimeout(typingIdleTimer.current);
    typingIdleTimer.current = setTimeout(() => {
      socket.emit('typing_stop', { hiveId });
    }, 3000);
  }

  function stopTyping() {
    if (typingIdleTimer.current) clearTimeout(typingIdleTimer.current);
    socket.emit('typing_stop', { hiveId });
  }

  // ── Textarea auto-resize ───────────────────────────────────────────────────
  function autoResize(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 5 * 24) + 'px';
  }

  function handleDraftChange(e) {
    setDraftText(e.target.value);
    autoResize(e.target);
    if (e.target.value.trim()) emitTypingStart();
    else stopTyping();
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  async function handleSend() {
    const text = draftText.trim();
    if (!text || text.length > 2000) return;

    const capturedReply = replyTo;
    setDraftText('');
    setReplyTo(null);
    stopTyping();
    if (composerRef.current) { composerRef.current.style.height = 'auto'; composerRef.current.value = ''; }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic = {
      message_id:     tempId,
      hive_id:        hiveId,
      sender_user_id: userId,
      message_text:   text,
      sent_at:        new Date().toISOString(),
      edited_at:      null,
      is_deleted:     false,
      sender: {
        user_id:           userId,
        full_name:         user?.fullName ?? null,
        profile_photo_url: user?.profilePhotoUrl ?? null,
        role:              hive?.my_role ?? 'member',
      },
      reply_to:  capturedReply,
      reactions: [],
      _status:   'sending',
    };

    setMessages(prev => [...prev, optimistic]);
    requestAnimationFrame(() => scrollToBottom());

    try {
      const real = await api.post(`/api/hives/${hiveId}/messages`, {
        message_text:        text,
        reply_to_message_id: capturedReply?.message_id ?? null,
      });
      setMessages(prev => prev.map(m =>
        m.message_id === tempId ? { ...real, _status: 'sent' } : m,
      ));
      markSeen();
    } catch {
      setMessages(prev => prev.map(m =>
        m.message_id === tempId ? { ...m, _status: 'failed' } : m,
      ));
    }
  }

  function handleComposerKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Retry / discard ────────────────────────────────────────────────────────
  async function handleRetry(tempId) {
    const msg = messagesRef.current.find(m => m.message_id === tempId);
    if (!msg) return;
    setMessages(prev => prev.map(m => m.message_id === tempId ? { ...m, _status: 'sending' } : m));
    try {
      const real = await api.post(`/api/hives/${hiveId}/messages`, {
        message_text:        msg.message_text,
        reply_to_message_id: msg.reply_to?.message_id ?? null,
      });
      setMessages(prev => prev.map(m =>
        m.message_id === tempId ? { ...real, _status: 'sent' } : m,
      ));
    } catch {
      setMessages(prev => prev.map(m =>
        m.message_id === tempId ? { ...m, _status: 'failed' } : m,
      ));
    }
  }

  function handleDiscard(tempId) {
    setMessages(prev => prev.filter(m => m.message_id !== tempId));
  }

  // ── Reply ──────────────────────────────────────────────────────────────────
  function startReply(msg) {
    setReplyTo({
      message_id:  msg.message_id,
      sender_name: msg.sender?.full_name ?? 'Unknown',
      snippet:     msg.message_text?.substring(0, 90) ?? '',
    });
    composerRef.current?.focus();
  }

  // ── Edit ───────────────────────────────────────────────────────────────────
  function startEdit(msg) {
    setEditingId(msg.message_id);
    setEditText(msg.message_text ?? '');
  }

  async function saveEdit(messageId) {
    const trimmed = editText.trim();
    if (!trimmed || editSaving) return;
    setEditSaving(true);
    try {
      const updated = await api.patch(`/api/messages/${messageId}`, { message_text: trimmed });
      setMessages(prev => prev.map(m => m.message_id === messageId ? { ...updated, _status: 'sent' } : m));
      setEditingId(null);
    } catch { /* keep edit state on failure */ }
    finally { setEditSaving(false); }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText('');
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(messageId) {
    if (!window.confirm('Delete this message?')) return;
    try {
      await api.delete(`/api/messages/${messageId}`);
      setMessages(prev => prev.map(m =>
        m.message_id === messageId ? { ...m, is_deleted: true, message_text: null } : m,
      ));
    } catch {}
  }

  // ── Reaction ───────────────────────────────────────────────────────────────
  async function handleReaction(messageId, emoji) {
    try {
      const result = await api.post(`/api/messages/${messageId}/reactions`, { emoji });
      setMessages(prev => prev.map(m =>
        m.message_id === messageId ? { ...m, reactions: result.reactions } : m,
      ));
    } catch {}
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const annotated = annotate(messages);

  // Index of last confirmed own message (for ✓ Sent)
  const lastConfirmedOwnIdx = (() => {
    for (let i = annotated.length - 1; i >= 0; i--) {
      const m = annotated[i];
      if (m.sender_user_id === userId && m._status === 'sent' && !m.is_deleted) return i;
    }
    return -1;
  })();

  const memberCount = hive?.member_count ?? members.length;

  return (
    <div className="hc-root">
      <RoomsRail />

      {/* Center */}
      <div className="hc-center">
        {/* Header */}
        <div className="hc-header">
          <div className="hc-header-left">
            <div className="hc-header-room"># general</div>
            <div className="hc-header-meta">
              <span className="hc-presence-dot" />
              <span>{onlineUserIds.length} online · {memberCount} members</span>
            </div>
          </div>
          <button
            type="button"
            className="hc-header-toggle"
            onClick={() => setShowContext(v => !v)}
            aria-label="Toggle context rail"
          >
            {showContext ? '⟩' : '⟨'}
          </button>
        </div>

        {socketError && (
          <div className="hc-socket-error">
            Live updates unavailable — messages still send normally
          </div>
        )}

        {/* Messages + pill wrapper */}
        <div className="hc-messages-wrap">
          <div
            className="hc-messages"
            ref={scrollAreaRef}
            onScroll={handleScroll}
            role="log"
            aria-label="Chat messages"
            aria-live="polite"
          >
            {/* Load older indicator */}
            {loadingOlder && <div className="hc-load-older">Loading older messages…</div>}

            {/* Skeletons */}
            {loading && <MessageSkeleton />}

            {/* Empty state */}
            {!loading && annotated.length === 0 && (
              <div className="hc-empty">
                <div className="hc-empty-glyph">⬡</div>
                <h2 className="hc-empty-title">
                  Welcome to the beginning of {hive?.hive_name ?? 'this Hive'}
                </h2>
                <p className="hc-empty-sub">
                  Every great Hive starts with its first conversation.
                </p>
                {hive?.icebreaker && (
                  <div className="hc-icebreaker-card">
                    <div className="hc-icebreaker-label">Break the ice</div>
                    <p className="hc-icebreaker-text">"{hive.icebreaker}"</p>
                    <button
                      className="hc-icebreaker-btn"
                      onClick={() => {
                        setDraftText(hive.icebreaker);
                        composerRef.current?.focus();
                        autoResize(composerRef.current);
                      }}
                    >
                      Use this icebreaker
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            {!loading && annotated.map((msg, i) => (
              <div key={msg.message_id}>
                {msg._showDay && (
                  <div className="hc-day-divider">
                    <span className="hc-day-pill">{formatDay(msg.sent_at)}</span>
                  </div>
                )}
                <MessageRow
                  msg={msg}
                  isOwn={msg.sender_user_id === userId}
                  isLast={i === lastConfirmedOwnIdx}
                  members={members}
                  userId={userId}
                  isOwner={isOwner}
                  onReply={startReply}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                  onReaction={handleReaction}
                  editingId={editingId}
                  editText={editText}
                  onEditChange={setEditText}
                  onEditSave={saveEdit}
                  onEditCancel={cancelEdit}
                  onRetry={handleRetry}
                  onDiscard={handleDiscard}
                />
              </div>
            ))}
          </div>

          {/* New messages pill */}
          {newMsgCount > 0 && (
            <button className="hc-new-pill" onClick={() => scrollToBottom(true)}>
              ↓ {newMsgCount} new message{newMsgCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* Typing indicator */}
        <TypingIndicator typingUsers={typingUsers} currentUserId={userId} />

        {/* Composer */}
        {!canPost ? (
          <div className="hc-composer-gate">
            Complete onboarding to join the conversation.{' '}
            <Link to={`/welcome/hive/${hiveId}`}>View steps →</Link>
          </div>
        ) : (
          <div className="hc-composer">
            {replyTo && (
              <div className="hc-reply-strip">
                <div className="hc-reply-strip-body">
                  <div className="hc-reply-strip-name">Replying to {replyTo.sender_name}</div>
                  <div className="hc-reply-strip-text">{replyTo.snippet}</div>
                </div>
                <button className="hc-reply-cancel" onClick={() => setReplyTo(null)} aria-label="Cancel reply">✕</button>
              </div>
            )}
            <div className="hc-composer-row">
              <textarea
                ref={composerRef}
                className="hc-textarea"
                placeholder="Message # general…"
                value={draftText}
                onChange={handleDraftChange}
                onKeyDown={handleComposerKey}
                rows={1}
                maxLength={2050}
                aria-label="Message input"
              />
              <button
                className="hc-send-btn"
                onClick={handleSend}
                disabled={!draftText.trim() || draftText.length > 2000}
                aria-label="Send message"
                title="Send"
              >
                ➤
              </button>
            </div>
            <div className="hc-composer-meta">
              <span className="hc-composer-hint">Enter to send · Shift+Enter for new line</span>
              <span className={`hc-char-count${draftText.length > 2000 ? ' hc-char-count--over' : ''}`}>
                {draftText.length} / 2000
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Context rail */}
      {showContext && (
        <ContextRail
          members={members}
          onlineUserIds={onlineUserIds}
          pinnedGoal={hive?.pinned_goal ?? null}
        />
      )}
    </div>
  );
}
