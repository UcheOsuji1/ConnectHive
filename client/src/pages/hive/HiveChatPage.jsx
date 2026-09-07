import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext, useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from '../../components/Avatar.jsx';
import EmojiPicker from '../../components/EmojiPicker.jsx';
import { api } from '../../lib/api.js';
import { socket } from '../../lib/socket.js';
import '../../styles/hive-chat.css';

const MAX_ATTACHMENTS       = 6;
const MAX_ATTACHMENT_BYTES  = 25 * 1024 * 1024;
const AUTO_AWAY_MS          = 5 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDay(dateStr) {
  const d         = new Date(dateStr);
  const today     = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return 'TODAY';
  if (d.toDateString() === yesterday.toDateString()) return 'YESTERDAY';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatBytes(bytes) {
  if (bytes < 1024)            return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function withinGroup(prev, curr) {
  if (!prev || prev.sender_user_id !== curr.sender_user_id) return false;
  return (new Date(curr.sent_at) - new Date(prev.sent_at)) < 5 * 60 * 1000;
}

function annotate(msgs) {
  return msgs.map((msg, i) => {
    const prev    = msgs[i - 1] ?? null;
    const showDay = !prev || !sameDay(prev.sent_at, msg.sent_at);
    const grouped = !showDay && withinGroup(prev, msg);
    return { ...msg, _showDay: showDay, _grouped: grouped };
  });
}

function presenceColor(status) {
  if (status === 'online')  return '#5dcaa5';
  if (status === 'away')    return '#c49a28';
  if (status === 'busy')    return '#c9584f';
  return '#b4b2a9';
}

function statusLabel(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Online';
}

// ── AttachmentGrid ────────────────────────────────────────────────────────────

function AttachmentGrid({ attachments }) {
  if (!attachments?.length) return null;
  const count = Math.min(attachments.length, 4);
  return (
    <div className={`hc-att-grid hc-att-grid--${count}`}>
      {attachments.map((att, i) => {
        if (att.resource_type === 'image') {
          return (
            <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="hc-att-img-wrap">
              <img src={att.url} alt={att.file_name ?? 'Image'} className="hc-att-img" loading="lazy" />
            </a>
          );
        }
        if (att.resource_type === 'video') {
          return (
            <video key={i} className="hc-att-video" controls preload="metadata">
              <source src={att.url} />
            </video>
          );
        }
        return (
          <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="hc-att-file-card">
            <span className="hc-att-file-icon">📎</span>
            <div className="hc-att-file-info">
              <span className="hc-att-file-name">{att.file_name ?? 'File'}</span>
              {att.bytes != null && <span className="hc-att-file-size">{formatBytes(Number(att.bytes))}</span>}
            </div>
          </a>
        );
      })}
    </div>
  );
}

// ── StagedFileChips ───────────────────────────────────────────────────────────

function StagedFileChips({ files, onRemove }) {
  if (!files.length) return null;
  return (
    <div className="hc-staged-tray">
      {files.map(f => (
        <div key={f.id} className={`hc-staged-chip hc-staged-chip--${f.status}`}>
          {f.status === 'uploading' && <span className="hc-staged-spinner" aria-label="Uploading" />}
          {f.status === 'done'      && <span className="hc-staged-check">✓</span>}
          {f.status === 'error'     && <span className="hc-staged-err" title={f.errorMsg}>!</span>}
          <span className="hc-staged-name" title={f.file.name}>{f.file.name}</span>
          <button className="hc-staged-remove" onClick={() => onRemove(f.id)} aria-label="Remove attachment">✕</button>
        </div>
      ))}
    </div>
  );
}

// ── RoomsRail ─────────────────────────────────────────────────────────────────

const CHANNEL_ICON = (
  <svg className="hc-room-icon" width="11" height="11" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
  </svg>
);

function RoomsRail({ channels, activeChannelId, unreadChannels, onSelect, onAddRoom, canManage }) {
  const textChannels  = channels.filter(c => ['text', 'announcement', 'resource', 'planning'].includes(c.channel_type));
  const voiceChannels = channels.filter(c => ['voice', 'video'].includes(c.channel_type));

  return (
    <aside className="hc-rooms-rail" aria-label="Rooms">
      <div className="hc-rail-section-label">Rooms</div>

      {textChannels.map(ch => (
        <button
          key={ch.channel_id}
          className={[
            'hc-room-item',
            ch.channel_id === activeChannelId ? 'hc-room-item--active' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => onSelect(ch.channel_id)}
          aria-current={ch.channel_id === activeChannelId ? 'page' : undefined}
        >
          {CHANNEL_ICON}
          <span className="hc-room-name">{ch.name}</span>
          {unreadChannels.has(ch.channel_id) && (
            <span className="hc-room-unread" aria-label="Unread messages" />
          )}
        </button>
      ))}

      {voiceChannels.length > 0 && (
        <>
          <div className="hc-rail-section-label">Voice</div>
          {voiceChannels.map(ch => (
            <div key={ch.channel_id} className="hc-room-item hc-room-item--disabled">
              🔊 <span className="hc-room-name">{ch.name}</span>
              <span className="hc-room-soon-pill">Soon</span>
            </div>
          ))}
        </>
      )}

      {canManage && (
        <button className="hc-add-room" onClick={onAddRoom}>
          + Add room
        </button>
      )}
    </aside>
  );
}

// ── CreateChannelModal ────────────────────────────────────────────────────────

const CHANNEL_TYPES = [
  { value: 'text',         label: 'Text' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'resource',     label: 'Resources' },
  { value: 'planning',     label: 'Planning' },
];

function CreateChannelModal({ hiveId, onClose, onCreated }) {
  const [name,     setName]     = useState('');
  const [type,     setType]     = useState('text');
  const [creating, setCreating] = useState(false);
  const [error,    setError]    = useState('');

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Room name is required.'); return; }
    setCreating(true);
    setError('');
    try {
      const ch = await api.post(`/api/hives/${hiveId}/channels`, {
        name:         trimmed,
        channel_type: type,
      });
      onCreated(ch);
    } catch (err) {
      setError(err.message || 'Failed to create room.');
    } finally {
      setCreating(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter')  handleCreate();
    if (e.key === 'Escape') onClose();
  }

  return (
    <div className="hc-modal-overlay" onClick={onClose}>
      <div className="hc-modal" onClick={e => e.stopPropagation()}>
        <div className="hc-modal-header">
          <h2>Create Room</h2>
          <button className="hc-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="hc-modal-body">
          <label className="hc-modal-label" htmlFor="hc-new-room-name">Room name</label>
          <input
            id="hc-new-room-name"
            className="hc-modal-input"
            placeholder="e.g. project-updates"
            value={name}
            onChange={e => setName(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
            onKeyDown={handleKey}
            maxLength={32}
            autoFocus
          />
          <label className="hc-modal-label">Room type</label>
          <div className="hc-modal-types">
            {CHANNEL_TYPES.map(t => (
              <button
                key={t.value}
                className={`hc-modal-type${type === t.value ? ' hc-modal-type--active' : ''}`}
                onClick={() => setType(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {error && <p className="hc-modal-error">{error}</p>}
        </div>
        <div className="hc-modal-footer">
          <button className="hc-modal-btn hc-modal-btn--cancel" onClick={onClose}>Cancel</button>
          <button
            className="hc-modal-btn hc-modal-btn--create"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Create Room'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TypingIndicator ───────────────────────────────────────────────────────────

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
      <span className="hc-typing-dots"><span /><span /><span /></span>
    </div>
  );
}

// ── MessageSkeleton ───────────────────────────────────────────────────────────

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

// ── MessageRow ────────────────────────────────────────────────────────────────

function MessageRow({
  msg, isOwn, isLast, members, userId,
  onReply, onEdit, onDelete, onReaction, isOwner,
  editingId, editText, onEditChange, onEditSave, onEditCancel,
  onRetry, onDiscard,
}) {
  const isEditing       = editingId === msg.message_id;
  const isDeleted       = msg.is_deleted;
  const isSending       = msg._status === 'sending';
  const isFailed        = msg._status === 'failed';
  const isTemp          = msg.message_id?.startsWith('temp-');
  const hasAttachments  = (msg.attachments?.length ?? 0) > 0;
  const isAttachOnly    = !msg.message_text && hasAttachments;

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
    isDeleted    ? 'hc-bubble--deleted'     : '',
    isSending    ? 'hc-bubble--sending'     : '',
    isFailed     ? 'hc-bubble--failed'      : '',
    isAttachOnly ? 'hc-bubble--transparent' : '',
  ].filter(Boolean).join(' ');

  const showBadge    = !isOwn && (senderRole === 'owner' || senderRole === 'admin');
  const canSelfEdit  = isOwn && !isDeleted && !isTemp;
  const canModDelete = isOwner && !isOwn && !isDeleted && !isTemp;

  return (
    <div className={['hc-msg-row', msg._grouped ? '' : 'hc-msg-row--first', isOwn ? 'hc-msg-row--own' : ''].filter(Boolean).join(' ')}>

      {!isOwn && (
        msg._grouped
          ? <div className="hc-msg-avatar-placeholder" />
          : <div className="hc-msg-avatar-col">
              <Avatar name={senderName} src={msg.sender?.profile_photo_url} size={32} />
            </div>
      )}

      <div className="hc-msg-body">
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
              {msg.reply_to && !isDeleted && (
                <div className="hc-reply-quote">
                  <div className="hc-reply-quote-name">{msg.reply_to.sender_name}</div>
                  <div className="hc-reply-quote-text">{msg.reply_to.snippet || '[deleted]'}</div>
                </div>
              )}
              {isDeleted
                ? 'Message deleted'
                : msg.message_text ?? null}
              {!isDeleted && hasAttachments && (
                <AttachmentGrid attachments={msg.attachments} />
              )}
            </div>

            {isFailed && (
              <div className="hc-failed-strip">
                Failed to send ·{' '}
                <button onClick={() => onRetry(msg.message_id)}>Retry</button>
                {' · '}
                <button onClick={() => onDiscard(msg.message_id)}>Discard</button>
              </div>
            )}

            {isOwn && isLast && !isTemp && !isDeleted && (
              <div className="hc-sent-tick">✓ Sent</div>
            )}

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

// ── ContextRail ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['online', 'away', 'busy', 'invisible'];
const STATUS_HINTS   = { invisible: ' — appear offline' };

function ContextRail({ members, presenceData, myStatus, onStatusChange, pinnedGoal }) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const statusMap = Object.fromEntries((presenceData ?? []).map(p => [p.user_id, p.status]));

  const statusOrder = { online: 0, away: 1, busy: 2 };
  const sorted = [...members].sort((a, b) => {
    const as = statusOrder[statusMap[a.user_id]] ?? 3;
    const bs = statusOrder[statusMap[b.user_id]] ?? 3;
    return as - bs;
  });

  return (
    <aside className="hc-context-rail" aria-label="Context">

      {/* Status picker */}
      <div className="hc-status-picker">
        <button
          className="hc-status-btn"
          onClick={() => setShowStatusMenu(v => !v)}
          aria-haspopup="listbox"
          aria-expanded={showStatusMenu}
        >
          <span className="hc-presence-dot-sm" style={{ background: presenceColor(myStatus) }} />
          <span className="hc-status-label">{statusLabel(myStatus)}</span>
          <span className="hc-status-chevron">▾</span>
        </button>
        {showStatusMenu && (
          <div className="hc-status-menu" role="listbox">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                role="option"
                aria-selected={myStatus === s}
                className={`hc-status-option${myStatus === s ? ' hc-status-option--active' : ''}`}
                onClick={() => { onStatusChange(s); setShowStatusMenu(false); }}
              >
                <span className="hc-presence-dot-sm" style={{ background: presenceColor(s) }} />
                {statusLabel(s)}
                {STATUS_HINTS[s] && <span className="hc-status-hint">{STATUS_HINTS[s]}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="hc-ctx-section">
        <div className="hc-ctx-label">Active Now</div>
        {sorted.map(m => {
          const status = statusMap[m.user_id] ?? 'offline';
          return (
            <div key={m.user_id} className="hc-member-row">
              <Avatar name={m.full_name} src={m.profile_photo_url} size={22} />
              <span className="hc-member-name">{m.full_name ?? 'Member'}</span>
              <span
                className="hc-presence-indicator"
                style={{ background: presenceColor(status) }}
                title={statusLabel(status)}
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
  const { channelId: routeChannelId } = useParams();
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const userId = user?.userId ?? null;

  // Channels
  const [channels,          setChannels]          = useState([]);
  const [channelsLoading,   setChannelsLoading]   = useState(true);
  const [activeChannelId,   setActiveChannelId]   = useState(null);
  const [unreadChannels,    setUnreadChannels]     = useState(new Set());
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const activeChannelIdRef  = useRef(null);
  const msgCacheRef         = useRef(new Map()); // channelId → { messages, hasMore }

  // Data
  const [messages,     setMessages]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [hasMore,      setHasMore]      = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [members,      setMembers]      = useState([]);

  // Real-time
  const [onlineUserIds, setOnlineUserIds] = useState([]);
  const [presenceData,  setPresenceData]  = useState([]); // [{ user_id, status }]
  const [myStatus,      setMyStatus]      = useState('online');
  const [typingUsers,   setTypingUsers]   = useState({});
  const [socketError,   setSocketError]   = useState(false);

  // Attachments
  const [stagedFiles, setStagedFiles] = useState([]);

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
  const scrollAreaRef    = useRef(null);
  const composerRef      = useRef(null);
  const fileInputRef     = useRef(null);
  const isNearBottomRef  = useRef(true);
  const hasMoreRef       = useRef(false);
  const loadingOlderRef  = useRef(false);
  const typingTimers     = useRef({});
  const lastTypingEmit   = useRef(0);
  const typingIdleTimer  = useRef(null);
  const messagesRef      = useRef([]);
  const objectUrlsRef    = useRef([]);   // tracks every object URL for cleanup
  const myStatusRef      = useRef('online');
  const isAutoAwayRef    = useRef(false);
  const autoAwayTimer    = useRef(null);

  // Keep refs in sync with state
  useEffect(() => { hasMoreRef.current        = hasMore; },         [hasMore]);
  useEffect(() => { loadingOlderRef.current   = loadingOlder; },    [loadingOlder]);
  useEffect(() => { messagesRef.current       = messages; },        [messages]);
  useEffect(() => { myStatusRef.current       = myStatus; },        [myStatus]);
  useEffect(() => { activeChannelIdRef.current = activeChannelId; }, [activeChannelId]);

  // Revoke all object URLs on unmount — empty deps captures the ref, not the array
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // ── Status emit (stable via ref) ───────────────────────────────────────────
  const emitSetStatusRef = useRef(null);
  emitSetStatusRef.current = (status) => {
    setMyStatus(status); // optimistic
    socket.emit('set_status', { status }, (ack) => {
      if (ack?.ok) setMyStatus(ack.status);
    });
  };

  function handleStatusChange(status) {
    isAutoAwayRef.current = false; // manual change clears auto-away flag
    emitSetStatusRef.current(status);
  }

  // ── Auto-away ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function resetTimer() {
      if (autoAwayTimer.current) clearTimeout(autoAwayTimer.current);
      autoAwayTimer.current = setTimeout(() => {
        const s = myStatusRef.current;
        if (s === 'online') {
          emitSetStatusRef.current('away');
          isAutoAwayRef.current = true;
        }
      }, AUTO_AWAY_MS);
    }

    function onActivity() {
      if (isAutoAwayRef.current && myStatusRef.current === 'away') {
        emitSetStatusRef.current('online');
        isAutoAwayRef.current = false;
      }
      resetTimer();
    }

    const EVENTS = ['mousemove', 'keydown', 'click', 'touchstart'];
    EVENTS.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));
    resetTimer();
    return () => {
      EVENTS.forEach(ev => window.removeEventListener(ev, onActivity));
      if (autoAwayTimer.current) clearTimeout(autoAwayTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      const chParam = activeChannelIdRef.current ? `&channel_id=${activeChannelIdRef.current}` : '';
      const data  = await api.get(`/api/hives/${hiveId}/messages?before=${encodeURIComponent(oldest.sent_at)}&limit=50${chParam}`);
      const older = data.messages ?? [];
      setHasMore(data.has_more ?? false);
      setMessages(prev => {
        const ids   = new Set(prev.map(m => m.message_id));
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

  function handleScroll() {
    const el = scrollAreaRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    isNearBottomRef.current = near;
    if (near) setNewMsgCount(0);
    if (el.scrollTop < 100) loadOlderMessages();
  }

  // ── Load channels once per hive ───────────────────────────────────────────
  useEffect(() => {
    setChannelsLoading(true);
    api.get(`/api/hives/${hiveId}/channels`)
      .then(data => setChannels(data.channels ?? []))
      .catch(() => {})
      .finally(() => setChannelsLoading(false));
  }, [hiveId]);

  // ── Load members once per hive ────────────────────────────────────────────
  useEffect(() => {
    api.get(`/api/hives/${hiveId}/members`)
      .then(data => setMembers(data.members ?? []))
      .catch(() => {});
  }, [hiveId]);

  // ── Redirect to default channel when channels are ready ───────────────────
  useEffect(() => {
    if (channelsLoading || channels.length === 0) return;

    const validChannel = channels.find(c => c.channel_id === routeChannelId);
    if (!validChannel) {
      const defaultCh = channels.find(c => c.is_default) ?? channels[0];
      navigate(`/hive/${hiveId}/chat/${defaultCh.channel_id}`, { replace: true });
      return;
    }
    setActiveChannelId(routeChannelId);
  }, [channelsLoading, channels, routeChannelId, hiveId, navigate]);

  // ── Load messages when active channel changes ─────────────────────────────
  useEffect(() => {
    if (!activeChannelId) return;

    // Clear unread for this channel now that we've switched to it
    setUnreadChannels(prev => {
      if (!prev.has(activeChannelId)) return prev;
      const next = new Set(prev);
      next.delete(activeChannelId);
      return next;
    });

    // Check cache first
    const cached = msgCacheRef.current.get(activeChannelId);
    if (cached) {
      setMessages(cached.messages);
      setHasMore(cached.hasMore);
      setLoading(false);
      requestAnimationFrame(() => scrollToBottom());
      return;
    }

    setLoading(true);
    setMessages([]);
    api.get(`/api/hives/${hiveId}/messages?channel_id=${activeChannelId}&limit=50`)
      .then(data => {
        const msgs = data.messages ?? [];
        setMessages(msgs);
        setHasMore(data.has_more ?? false);
        msgCacheRef.current.set(activeChannelId, { messages: msgs, hasMore: data.has_more ?? false });
      }).catch(() => {}).finally(() => {
        setLoading(false);
        requestAnimationFrame(() => scrollToBottom());
      });
    markSeen();
  }, [activeChannelId, hiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Join/leave channel socket room on channel switch ──────────────────────
  useEffect(() => {
    if (!activeChannelId) return;

    socket.emit('join_channel', { hiveId, channelId: activeChannelId });

    return () => {
      socket.emit('leave_channel', { hiveId, channelId: activeChannelId });
      // Save current messages back to cache on leave
      msgCacheRef.current.set(activeChannelId, {
        messages: messagesRef.current,
        hasMore:  hasMoreRef.current,
      });
    };
  }, [activeChannelId, hiveId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setPresenceData(ack.presence ?? []);
        setMyStatus(ack.your_status ?? 'online');
      } else {
        setSocketError(true);
      }
    });

    const onReceiveMessage = (msg) => {
      // receive_message arrives from channel room — always the active channel
      setMessages(prev => {
        if (prev.some(m => m.message_id === msg.message_id)) return prev;
        if (!isNearBottomRef.current) setNewMsgCount(c => c + 1);
        const next = [...prev, msg];
        msgCacheRef.current.set(activeChannelIdRef.current, {
          messages: next,
          hasMore:  hasMoreRef.current,
        });
        return next;
      });
      if (document.visibilityState === 'visible') {
        markSeen();
        if (isNearBottomRef.current) requestAnimationFrame(() => scrollToBottom(true));
      }
    };

    const onChannelActivity = ({ channel_id }) => {
      if (channel_id && channel_id !== activeChannelIdRef.current) {
        setUnreadChannels(prev => new Set([...prev, channel_id]));
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

    const onPresenceUpdate = ({ online_user_ids, presence: pres }) => {
      setOnlineUserIds(online_user_ids ?? []);
      setPresenceData(pres ?? []);
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

    const onHiveAccessRevoked = ({ hive_id }) => {
      if (hive_id === hiveId) navigate('/app');
    };

    socket.on('receive_message',      onReceiveMessage);
    socket.on('message_updated',      onMessageUpdated);
    socket.on('message_deleted',      onMessageDeleted);
    socket.on('reaction_updated',     onReactionUpdated);
    socket.on('presence_update',      onPresenceUpdate);
    socket.on('typing_update',        onTypingUpdate);
    socket.on('hive_access_revoked',  onHiveAccessRevoked);
    socket.on('channel_activity',     onChannelActivity);

    return () => {
      socket.emit('leave_hive_room', { hiveId });
      socket.off('receive_message',     onReceiveMessage);
      socket.off('message_updated',     onMessageUpdated);
      socket.off('message_deleted',     onMessageDeleted);
      socket.off('reaction_updated',    onReactionUpdated);
      socket.off('presence_update',     onPresenceUpdate);
      socket.off('typing_update',       onTypingUpdate);
      socket.off('hive_access_revoked', onHiveAccessRevoked);
      socket.off('channel_activity',    onChannelActivity);
      Object.values(typingTimers.current).forEach(clearTimeout);
      typingTimers.current = {};
    };
  }, [hiveId, userId, markSeen]); // eslint-disable-line react-hooks/exhaustive-deps

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
    typingIdleTimer.current = setTimeout(() => socket.emit('typing_stop', { hiveId }), 3000);
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

  // ── File attachments ───────────────────────────────────────────────────────
  function handleFileSelect(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';

    const remaining = MAX_ATTACHMENTS - stagedFiles.length;
    const toAdd     = files.slice(0, remaining);

    const newEntries = toAdd.map(file => {
      const id        = `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const objectUrl = URL.createObjectURL(file);
      objectUrlsRef.current.push(objectUrl);
      return { id, file, objectUrl, status: 'uploading', cloudinary: null, errorMsg: null };
    });

    setStagedFiles(prev => [...prev, ...newEntries]);
    newEntries.forEach(entry => _uploadFile(entry));
  }

  async function _uploadFile(entry) {
    try {
      if (entry.file.size > MAX_ATTACHMENT_BYTES) {
        throw new Error('File exceeds 25 MB limit.');
      }
      const sig  = await api.get(`/api/hives/${hiveId}/messages/upload-signature`);
      const form = new FormData();
      form.append('file',      entry.file);
      form.append('api_key',   sig.api_key);
      form.append('timestamp', String(sig.timestamp));
      form.append('signature', sig.signature);
      form.append('folder',    sig.folder);

      const res  = await fetch(
        `https://api.cloudinary.com/v1_1/${sig.cloud_name}/auto/upload`,
        { method: 'POST', body: form },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Upload failed.');

      setStagedFiles(prev => prev.map(f =>
        f.id === entry.id
          ? { ...f, status: 'done', cloudinary: {
                url:           data.secure_url,
                resource_type: data.resource_type,
                file_name:     entry.file.name,
                mime_type:     entry.file.type,
                bytes:         entry.file.size,
                width:         data.width  ?? null,
                height:        data.height ?? null,
              }}
          : f,
      ));
    } catch (err) {
      setStagedFiles(prev => prev.map(f =>
        f.id === entry.id ? { ...f, status: 'error', errorMsg: err.message } : f,
      ));
    }
  }

  function removeStagedFile(id) {
    setStagedFiles(prev => {
      const entry = prev.find(f => f.id === id);
      if (entry?.objectUrl) URL.revokeObjectURL(entry.objectUrl);
      return prev.filter(f => f.id !== id);
    });
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  async function handleSend() {
    const text     = draftText.trim();
    const readyAtts = stagedFiles.filter(f => f.status === 'done').map(f => f.cloudinary);

    if (!text && readyAtts.length === 0) return;
    if (text.length > 2000)              return;
    if (stagedFiles.some(f => f.status === 'uploading')) return; // wait for uploads

    const capturedReply = replyTo;
    const capturedAtts  = readyAtts;

    setDraftText('');
    setReplyTo(null);
    setStagedFiles([]);
    stopTyping();
    if (composerRef.current) { composerRef.current.style.height = 'auto'; }

    const tempId     = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic = {
      message_id:     tempId,
      hive_id:        hiveId,
      channel_id:     activeChannelId,
      sender_user_id: userId,
      message_text:   text || null,
      sent_at:        new Date().toISOString(),
      edited_at:      null,
      is_deleted:     false,
      sender: {
        user_id:           userId,
        full_name:         user?.fullName ?? null,
        profile_photo_url: user?.profilePhotoUrl ?? null,
        role:              hive?.my_role ?? 'member',
      },
      reply_to:    capturedReply ?? null,
      reactions:   [],
      attachments: capturedAtts,
      _status:     'sending',
    };

    setMessages(prev => [...prev, optimistic]);
    requestAnimationFrame(() => scrollToBottom());

    try {
      const payload = {
        reply_to_message_id: capturedReply?.message_id ?? null,
        channel_id:          activeChannelId,
      };
      if (text)                  payload.message_text = text;
      if (capturedAtts.length)   payload.attachments  = capturedAtts;

      const real = await api.post(`/api/hives/${hiveId}/messages`, payload);
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  // ── Retry / discard ────────────────────────────────────────────────────────
  async function handleRetry(tempId) {
    const msg = messagesRef.current.find(m => m.message_id === tempId);
    if (!msg) return;
    setMessages(prev => prev.map(m => m.message_id === tempId ? { ...m, _status: 'sending' } : m));
    try {
      // Resend already-uploaded attachment metadata — do not re-upload files
      const payload = {
        reply_to_message_id: msg.reply_to?.message_id ?? null,
        channel_id:          msg.channel_id ?? activeChannelIdRef.current,
      };
      if (msg.message_text)         payload.message_text = msg.message_text;
      if (msg.attachments?.length)  payload.attachments  = msg.attachments;

      const real = await api.post(`/api/hives/${hiveId}/messages`, payload);
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

  function cancelEdit() { setEditingId(null); setEditText(''); }

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

  // ── Channel navigation ────────────────────────────────────────────────────
  function handleChannelSelect(channelId) {
    if (channelId === activeChannelId) return;
    navigate(`/hive/${hiveId}/chat/${channelId}`);
  }

  function handleChannelCreated(newChannel) {
    setChannels(prev => [...prev, newChannel]);
    setShowCreateChannel(false);
    navigate(`/hive/${hiveId}/chat/${newChannel.channel_id}`);
  }

  const activeChannel = channels.find(c => c.channel_id === activeChannelId);
  const canManageChannels = isOwner || (hive?.my_role === 'admin');

  // ── Render ─────────────────────────────────────────────────────────────────
  const annotated  = annotate(messages);
  const memberCount = hive?.member_count ?? members.length;

  const lastConfirmedOwnIdx = (() => {
    for (let i = annotated.length - 1; i >= 0; i--) {
      const m = annotated[i];
      if (m.sender_user_id === userId && m._status === 'sent' && !m.is_deleted) return i;
    }
    return -1;
  })();

  const uploading     = stagedFiles.some(f => f.status === 'uploading');
  const anyReady      = stagedFiles.some(f => f.status === 'done');
  const canSend       = (draftText.trim() || anyReady) && draftText.length <= 2000 && !uploading;

  return (
    <div className="hc-root">
      {showCreateChannel && (
        <CreateChannelModal
          hiveId={hiveId}
          onClose={() => setShowCreateChannel(false)}
          onCreated={handleChannelCreated}
        />
      )}

      <RoomsRail
        channels={channels}
        activeChannelId={activeChannelId}
        unreadChannels={unreadChannels}
        onSelect={handleChannelSelect}
        onAddRoom={() => setShowCreateChannel(true)}
        canManage={canManageChannels}
      />

      {/* Center */}
      <div className="hc-center">
        {/* Header */}
        <div className="hc-header">
          <div className="hc-header-left">
            <div className="hc-header-room">
              {activeChannel ? activeChannel.name : '…'}
            </div>
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
            {loadingOlder && <div className="hc-load-older">Loading older messages…</div>}
            {loading && <MessageSkeleton />}

            {!loading && annotated.length === 0 && (
              <div className="hc-empty">
                <div className="hc-empty-glyph">⬡</div>
                <h2 className="hc-empty-title">
                  {activeChannel && activeChannel.name !== 'general'
                    ? `Welcome to ${activeChannel.name}`
                    : `Welcome to the beginning of ${hive?.hive_name ?? 'this Hive'}`}
                </h2>
                <p className="hc-empty-sub">Every great Hive starts with its first conversation.</p>
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

          {newMsgCount > 0 && (
            <button className="hc-new-pill" onClick={() => scrollToBottom(true)}>
              ↓ {newMsgCount} new message{newMsgCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>

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

            {/* Staged file chips */}
            <StagedFileChips files={stagedFiles} onRemove={removeStagedFile} />

            <div className="hc-composer-row">
              {/* Attach file button */}
              <button
                type="button"
                className="hc-attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={stagedFiles.length >= MAX_ATTACHMENTS}
                aria-label="Attach file"
                title="Attach file (max 6, 25 MB each)"
              >
                📎
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hc-file-input"
                onChange={handleFileSelect}
                aria-hidden="true"
                tabIndex={-1}
              />

              <textarea
                ref={composerRef}
                className="hc-textarea"
                placeholder={activeChannel ? `Message ${activeChannel.name}…` : 'Select a room…'}
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
                disabled={!canSend}
                aria-label="Send message"
                title="Send"
              >
                ➤
              </button>
            </div>
            <div className="hc-composer-meta">
              <span className="hc-composer-hint">
                Enter to send · Shift+Enter for new line
                {uploading && ' · Uploading…'}
              </span>
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
          presenceData={presenceData}
          myStatus={myStatus}
          onStatusChange={handleStatusChange}
          pinnedGoal={hive?.pinned_goal ?? null}
        />
      )}
    </div>
  );
}
