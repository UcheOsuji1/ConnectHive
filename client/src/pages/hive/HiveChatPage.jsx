import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext, useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from '../../components/Avatar.jsx';
import EmojiPicker from '../../components/EmojiPicker.jsx';
import CreatePlanModal from '../../components/plans/CreatePlanModal.jsx';
import { PlanMessageCard, PollMessageCard, CreatePollModal } from '../../components/chat/ChatCards.jsx';
import { api } from '../../lib/api.js';
import { socket, joinHive, leaveHive, onHiveJoinAck } from '../../lib/socket.js';
import '../../styles/hive-chat.css';
import '../../styles/hive-chat-redesign.css';

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

// ── Mention rendering ─────────────────────────────────────────────────────────
// The stored text holds "@Full Name"; the ids travel beside it, so rendering
// matches the longest name first and never guesses from the text alone.
function renderWithMentions(text, mentions, meId) {
  if (!text) return text ?? null;
  const list = (mentions ?? []).filter(m => m.full_name);
  if (!list.length) return text;

  const byLength = [...list].sort((a, b) => b.full_name.length - a.full_name.length);
  const out = [];
  let rest = text;
  let key = 0;

  while (rest.length) {
    let hit = null;
    for (const m of byLength) {
      const i = rest.indexOf('@' + m.full_name);
      if (i !== -1 && (hit === null || i < hit.i)) hit = { i, m };
    }
    if (!hit) { out.push(rest); break; }
    if (hit.i > 0) out.push(rest.slice(0, hit.i));
    out.push(
      <Link
        key={`mention-${key++}`}
        to={`/profile/${hit.m.user_id}`}
        className={`hc-mention${hit.m.user_id === meId ? ' hc-mention--me' : ''}`}
      >
        @{hit.m.full_name}
      </Link>,
    );
    rest = rest.slice(hit.i + hit.m.full_name.length + 1);
  }
  return out;
}

// ── AttachmentGrid ────────────────────────────────────────────────────────────

// Images show as a row of up to three rounded thumbnails, with "+N" standing in
// for the rest — the concept's layout. Video and files keep their own cards.
const IMG_VISIBLE = 3;

function AttachmentGrid({ attachments }) {
  if (!attachments?.length) return null;
  const images = attachments.filter(a => a.resource_type === 'image');
  const others = attachments.filter(a => a.resource_type !== 'image');
  const shown  = images.slice(0, IMG_VISIBLE);
  const extra  = images.length - shown.length;

  return (
    <>
      {shown.length > 0 && (
        <div className="hc-att-row">
          {shown.map((att, i) => (
            <a key={`img-${i}`} href={att.url} target="_blank" rel="noopener noreferrer"
               className="hc-att-img-wrap">
              <img src={att.url} alt={att.file_name ?? 'Image'} className="hc-att-img" loading="lazy" />
              {i === shown.length - 1 && extra > 0 && (
                <span className="hc-att-more">+{extra}</span>
              )}
            </a>
          ))}
        </div>
      )}
      {others.length > 0 && <AttachmentRest attachments={others} />}
    </>
  );
}

function AttachmentRest({ attachments }) {
  const count = Math.min(attachments.length, 4);
  return (
    <div className={`hc-att-grid hc-att-grid--${count}`}>
      {attachments.map((att, i) => {
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

const CHANNEL_ICON = <span className="hc-room-hash" aria-hidden="true">#</span>;

function RoomsRail({ channels, activeChannelId, unreadChannels, onSelect, onAddRoom, canManage, open }) {
  const [filter, setFilter] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  const q = filter.trim().toLowerCase();
  const match = (c) => !q || c.name.toLowerCase().includes(q);
  const textChannels  = channels
    .filter(c => ['text', 'announcement', 'resource', 'planning'].includes(c.channel_type))
    .filter(match);
  const voiceChannels = channels.filter(c => ['voice', 'video'].includes(c.channel_type)).filter(match);

  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  return (
    <aside className={`hc-rooms-rail${open ? ' hc-rooms-rail--open' : ''}`} aria-label="Rooms">
      <div className="hc-rooms-head">
        <h2 className="hc-rooms-title">Chat</h2>
        <button
          type="button"
          className="hc-rooms-icon-btn"
          onClick={() => { setSearchOpen(v => !v); if (searchOpen) setFilter(''); }}
          aria-label={searchOpen ? 'Close room search' : 'Search rooms'}
          aria-expanded={searchOpen}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
          </svg>
        </button>
        {/* Creating a room is owner/admin only, so the + is too. */}
        {canManage && (
          <button type="button" className="hc-rooms-icon-btn hc-rooms-icon-btn--add"
                  onClick={onAddRoom} aria-label="Create a room">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>

      {searchOpen && (
        <input
          ref={searchRef}
          className="hc-rooms-search"
          type="search"
          placeholder="Find a room…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { setFilter(''); setSearchOpen(false); } }}
          aria-label="Filter rooms by name"
        />
      )}

      <div className="hc-rail-section-label">Channels</div>

      {textChannels.length === 0 && q && (
        <div className="hc-rooms-none">No rooms match “{filter.trim()}”.</div>
      )}

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

function TypingIndicator({ typingUsers, currentUserId, members }) {
  const others = Object.entries(typingUsers).filter(([id]) => id !== currentUserId);

  if (others.length === 0) return <div className="hc-typing" />;

  const names = others.map(([, name]) => name ?? 'Someone');
  let text;
  if (names.length === 1)      text = `${names[0]} is typing…`;
  else if (names.length === 2) text = `${names[0]} and ${names[1]} are typing…`;
  else                         text = 'Several members are typing…';

  const byId = Object.fromEntries((members ?? []).map(m => [m.user_id, m]));

  return (
    <div className="hc-typing">
      <span className="hc-typing-avatars">
        {others.slice(0, 3).map(([id, name]) => (
          <Avatar key={id} name={byId[id]?.full_name ?? name}
                  src={byId[id]?.profile_photo_url} size={22} />
        ))}
      </span>
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
  onPin, onPlanRsvp, onPollVote,
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

      {msg._grouped
        ? <div className="hc-msg-avatar-placeholder" />
        : <div className="hc-msg-avatar-col">
            <Avatar name={senderName} src={msg.sender?.profile_photo_url} size={40} />
          </div>}

      <div className="hc-msg-body">
        {!msg._grouped && (
          <div className="hc-msg-header">
            <span className="hc-msg-sender">{senderName}</span>
            {showBadge && (
              <span className={`hc-msg-badge hc-msg-badge--${senderRole}`}>
                {senderRole.charAt(0).toUpperCase() + senderRole.slice(1)}
              </span>
            )}
            <span className="hc-msg-time">{timeLabel}{isOwn && ' · You'}</span>
            {msg.pinned_at && <span className="hc-pin-mark" title="Pinned">📌</span>}
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
                : renderWithMentions(msg.message_text, msg.mentions, userId)}
              {!isDeleted && (msg.plan || msg.plan_removed) && (
                <PlanMessageCard plan={msg.plan} removed={msg.plan_removed}
                                 hiveId={msg.hive_id} onRsvp={onPlanRsvp} />
              )}
              {!isDeleted && msg.poll && (
                <PollMessageCard poll={msg.poll} hiveId={msg.hive_id} onVote={onPollVote} />
              )}
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
                {isOwner && (
                  <button className="hc-action-btn" onClick={() => onPin(msg)}>
                    {msg.pinned_at ? 'Unpin' : 'Pin'}
                  </button>
                )}
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

const firstNameOf = (n) => (n ?? 'Member').trim().split(/\s+/)[0];

const RAIL_ICONS = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
  pin:      <><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  users:    <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 20v-2a4 4 0 0 0-3-3.9" /></>,
  image:    <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.8" /><path d="m21 16-5-5L5 20" /></>,
  note:     <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
};

function Ico({ name, size = 15 }) {
  if (!RAIL_ICONS[name]) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {RAIL_ICONS[name]}
    </svg>
  );
}

function DateTile({ iso }) {
  const d = new Date(iso);
  return (
    <div className="hc-datetile">
      <span className="hc-datetile-dow">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
      <span className="hc-datetile-date">
        {d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} {d.getDate()}
      </span>
      <span className="hc-datetile-time">
        {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
      </span>
    </div>
  );
}

function ContextRail({
  members, presenceData, myStatus, onStatusChange,
  hiveId, hive, nextPlan, recentMedia = [], pin = null, onOpenPins,
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const statusMap = Object.fromEntries((presenceData ?? []).map(p => [p.user_id, p.status]));
  const byId = Object.fromEntries((members ?? []).map(m => [m.user_id, m]));

  // Online = whoever presence reports, in the server's order. Invisible users
  // are already absent from presenceData, so they stay invisible here.
  const statusOrder = { online: 0, away: 1, busy: 2 };
  const online = (presenceData ?? [])
    .map(p => byId[p.user_id] ?? { user_id: p.user_id, full_name: 'Member' })
    .sort((a, b) => (statusOrder[statusMap[a.user_id]] ?? 3) - (statusOrder[statusMap[b.user_id]] ?? 3));

  const locationType = hive?.location_type
    ? hive.location_type.charAt(0).toUpperCase() + hive.location_type.slice(1)
    : null;

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

      {/* ── Online Now ── */}
      {/* presenceData already excludes invisible users: the server drops them
          from _buildPresence, so they never reach this list. */}
      <section className="hc-ctx-card">
        <div className="hc-ctx-head">
          <span className="hc-ctx-dot" />
          <h3 className="hc-ctx-title">Online Now</h3>
          <span className="hc-ctx-meta">{online.length} online</span>
        </div>
        {online.length === 0 ? (
          <p className="hc-ctx-empty">Nobody else is here right now.</p>
        ) : (
          <div className="hc-online-strip">
            {online.map(m => (
              <Link key={m.user_id} to={`/profile/${m.user_id}`} className="hc-online-person">
                <span className="hc-online-avatar">
                  <Avatar name={m.full_name} src={m.profile_photo_url} size={44} />
                  <span className="hc-online-dot"
                        style={{ background: presenceColor(statusMap[m.user_id] ?? 'online') }}
                        title={statusLabel(statusMap[m.user_id] ?? 'online')} />
                </span>
                <span className="hc-online-name">{firstNameOf(m.full_name)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Upcoming Plan ── */}
      {nextPlan && (
        <section className="hc-ctx-card">
          <div className="hc-ctx-head">
            <Ico name="calendar" />
            <h3 className="hc-ctx-title">Upcoming Plan</h3>
            <Link to={`/hive/${hiveId}/events`} className="hc-ctx-link">View all →</Link>
          </div>
          <div className="hc-ctx-plan">
            <DateTile iso={nextPlan.event_at} />
            <div className="hc-ctx-plan-body">
              <div className="hc-ctx-plan-title">{nextPlan.headline}</div>
              {nextPlan.event_location && (
                <div className="hc-ctx-plan-row">
                  <Ico name="pin" size={12} /> {nextPlan.event_location}
                </div>
              )}
              <div className="hc-ctx-plan-row">
                <span className="hc-ctx-plan-going">
                  <Ico name="users" size={12} /> {nextPlan.going_count} going
                </span>
                {locationType && <span className="hc-ctx-chip">{locationType}</span>}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Pinned Note ── */}
      {pin && (
        <section className="hc-ctx-card">
          <div className="hc-ctx-head">
            <span aria-hidden="true" className="hc-ctx-pin">📌</span>
            <h3 className="hc-ctx-title">Pinned Note</h3>
            {onOpenPins && (
              <button type="button" className="hc-ctx-more" onClick={onOpenPins}
                      aria-label="See all pinned messages in this room">···</button>
            )}
          </div>
          <div className="hc-ctx-pinned">
            <div className="hc-ctx-pinned-top">
              <Avatar name={pin.sender?.full_name} src={pin.sender?.profile_photo_url} size={28} />
              <span>
                <span className="hc-ctx-pinned-name">{pin.sender?.full_name ?? 'Member'}</span>
                <span className="hc-ctx-pinned-date">
                  {new Date(pin.sent_at).toLocaleDateString('en-US',
                    { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </span>
            </div>
            <p className="hc-ctx-pinned-text">{pin.text}</p>
          </div>
        </section>
      )}

      {/* ── Recent Media ── */}
      {recentMedia.length > 0 && (
        <section className="hc-ctx-card">
          <div className="hc-ctx-head">
            <Ico name="image" />
            <h3 className="hc-ctx-title">Recent Media</h3>
          </div>
          <div className="hc-ctx-media">
            {recentMedia.slice(0, 6).map(a => (
              <a key={a.attachment_id} href={a.url} target="_blank" rel="noopener noreferrer"
                 className="hc-ctx-media-tile">
                <img src={a.url} alt="" loading="lazy" />
              </a>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}

// ── PinsModal ─────────────────────────────────────────────────────────────────

function PinsModal({ hiveId, channelId, channelName, onClose }) {
  const [pins, setPins]   = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/channels/${channelId}/pins`)
      .then(d => setPins(d.pins ?? []))
      .catch(e => setError(e?.data?.error ?? 'Could not load pinned messages.'));
  }, [hiveId, channelId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="hc-modal-overlay" onClick={onClose}>
      <div className="hc-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
           aria-label={`Pinned messages in ${channelName ?? 'this room'}`}>
        <div className="hc-modal-header">
          <span>Pinned in #{channelName}</span>
          <button className="hc-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="hc-modal-body">
          {error && <p className="hc-modal-error">{error}</p>}
          {!error && pins === null && <p className="hc-ctx-empty">Loading…</p>}
          {pins?.length === 0 && <p className="hc-ctx-empty">Nothing is pinned in this room yet.</p>}
          {pins?.map(p => (
            <div key={p.message_id} className="hc-pin-row">
              <Avatar name={p.sender?.full_name} src={p.sender?.profile_photo_url} size={28} />
              <div className="hc-pin-row-body">
                <div className="hc-pin-row-top">
                  <span className="hc-ctx-pinned-name">{p.sender?.full_name ?? 'Member'}</span>
                  <span className="hc-ctx-pinned-date">
                    {new Date(p.sent_at).toLocaleDateString('en-US',
                      { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <p className="hc-ctx-pinned-text">{p.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
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
  const [showRooms,   setShowRooms]   = useState(false);
  const [pinsOpen,    setPinsOpen]    = useState(false);
  const [plusOpen,    setPlusOpen]    = useState(false);
  const [planOpen,    setPlanOpen]    = useState(false);
  const [pollOpen,    setPollOpen]    = useState(false);
  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState(null); // null = closed
  const [mentionIdx,   setMentionIdx]   = useState(0);
  const mentionedRef = useRef(new Map());   // full_name → user_id, for this draft
  const [newMsgCount, setNewMsgCount] = useState(0);

  // Context rail data for the active room (next plan + this room's images)
  const [rail, setRail] = useState({ nextPlan: null, recentMedia: [], pin: null });

  // Refs for stable callbacks
  const scrollAreaRef    = useRef(null);
  const composerRef      = useRef(null);
  const fileInputRef     = useRef(null);
  const imageInputRef    = useRef(null);
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

  // ── Hive room membership ───────────────────────────────────────────────────
  // Keyed on hiveId alone. It used to live in the listener effect below, whose
  // dependencies included markSeen, so any churn there would leave and rejoin
  // the shared room. joinHive/leaveHive reference count, so Hive Home holding
  // the same room is not disturbed by Chat unmounting.
  useEffect(() => {
    if (!hiveId) return;
    const offAck = onHiveJoinAck(hiveId, (ack) => {
      if (ack?.ok) {
        setOnlineUserIds(ack.online_user_ids ?? []);
        setPresenceData(ack.presence ?? []);
        setMyStatus(ack.your_status ?? 'online');
        setSocketError(false);
      } else {
        setSocketError(true);
      }
    });
    joinHive(hiveId);
    return () => { offAck(); leaveHive(hiveId); };
  }, [hiveId]);

  // ── Socket listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket.connected) socket.connect();

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

    const onPollUpdated = ({ poll_id, results, total_votes }) => {
      setMessages(prev => prev.map(m => {
        if (m.poll?.poll_id !== poll_id) return m;
        const byId = Object.fromEntries((results ?? []).map(r => [r.option_id, r.count]));
        return { ...m, poll: { ...m.poll, total_votes,
          options: m.poll.options.map(o => ({ ...o, count: byId[o.option_id] ?? o.count })) } };
      }));
    };

    const onPlanRsvpUpdated = ({ post_id, going_count }) => {
      // Counts only — viewer_rsvp stays whatever this reader set.
      setMessages(prev => prev.map(m => m.plan?.post_id === post_id
        ? { ...m, plan: { ...m.plan, going_count } } : m));
    };

    const onMessagePinned = ({ pin }) => {
      if (!pin) return;
      setMessages(prev => prev.map(m =>
        m.message_id === pin.message_id ? { ...m, pinned_at: pin.pinned_at } : m));
      if (pin.channel_id === activeChannelIdRef.current) setRail(r => ({ ...r, pin }));
    };

    const onMessageUnpinned = ({ message_id, channel_id }) => {
      setMessages(prev => prev.map(m =>
        m.message_id === message_id ? { ...m, pinned_at: null } : m));
      if (channel_id === activeChannelIdRef.current) {
        // Another message may still be pinned — ask the rail for the newest.
        api.get(`/api/hives/${hiveId}/channels/${channel_id}/rail`)
          .then(d => setRail(r => ({ ...r, pin: d.pin ?? null })))
          .catch(() => setRail(r => ({ ...r, pin: null })));
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
    socket.on('poll_updated',         onPollUpdated);
    socket.on('plan_rsvp_updated',    onPlanRsvpUpdated);
    socket.on('message_pinned',       onMessagePinned);
    socket.on('message_unpinned',     onMessageUnpinned);

    return () => {
      socket.off('receive_message',     onReceiveMessage);
      socket.off('message_updated',     onMessageUpdated);
      socket.off('message_deleted',     onMessageDeleted);
      socket.off('reaction_updated',    onReactionUpdated);
      socket.off('presence_update',     onPresenceUpdate);
      socket.off('typing_update',       onTypingUpdate);
      socket.off('hive_access_revoked', onHiveAccessRevoked);
      socket.off('channel_activity',    onChannelActivity);
      socket.off('poll_updated',        onPollUpdated);
      socket.off('plan_rsvp_updated',   onPlanRsvpUpdated);
      socket.off('message_pinned',      onMessagePinned);
      socket.off('message_unpinned',    onMessageUnpinned);
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

  // ── Context rail data for the active room ──────────────────────────────────
  useEffect(() => {
    if (!activeChannelId) { setRail({ nextPlan: null, recentMedia: [], pin: null }); return; }
    let live = true;
    api.get(`/api/hives/${hiveId}/channels/${activeChannelId}/rail`)
      .then(d => { if (live) setRail({ nextPlan: d.nextPlan ?? null,
                                       recentMedia: d.recentMedia ?? [], pin: d.pin ?? null }); })
      .catch(() => { if (live) setRail({ nextPlan: null, recentMedia: [], pin: null }); });
    return () => { live = false; };
  }, [hiveId, activeChannelId]);

  // ── Plan RSVP from a card in the stream ────────────────────────────────────
  // Only this reader's own viewer_rsvp is touched locally; the counts arrive
  // for everyone through plan_rsvp_updated.
  async function handlePlanRsvp(plan, status) {
    try {
      const r = await api.post(`/api/events/${plan.post_id}/rsvp`, { status: status ?? 'clear' });
      setMessages(prev => prev.map(m => m.plan?.post_id === plan.post_id
        ? { ...m, plan: { ...m.plan, viewer_rsvp: r.status, going_count: r.goingCount } }
        : m));
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.data?.error ?? 'Could not update your RSVP.');
    }
  }

  // ── Poll voting ────────────────────────────────────────────────────────────
  async function handlePollVote(poll, optionIds) {
    try {
      const d = optionIds.length
        ? await api.post(`/api/hives/${hiveId}/polls/${poll.poll_id}/vote`, { optionIds })
        : await api.delete(`/api/hives/${hiveId}/polls/${poll.poll_id}/vote`);
      setMessages(prev => prev.map(m => m.poll?.poll_id === poll.poll_id
        ? { ...m, poll: d.poll } : m));
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.data?.error ?? 'Could not record your vote.');
    }
  }

  // ── Pin / unpin ────────────────────────────────────────────────────────────
  async function handlePin(msg) {
    const pinning = !msg.pinned_at;
    try {
      if (pinning) await api.post(`/api/hives/${hiveId}/messages/${msg.message_id}/pin`, {});
      else         await api.delete(`/api/hives/${hiveId}/messages/${msg.message_id}/pin`);
      // The socket broadcast updates both the stream and the rail, including
      // for everyone else in the room.
    } catch (e) {
      setSocketError(false);
      // eslint-disable-next-line no-alert
      alert(e?.data?.error ?? 'Could not change the pin.');
    }
  }

  function insertEmoji(emoji) {
    const el = composerRef.current;
    if (!el) { setDraftText(t => t + emoji); return; }
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? start;
    setDraftText(t => t.slice(0, start) + emoji + t.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
      autoResize(el);
    });
  }

  // ── Textarea auto-resize ───────────────────────────────────────────────────
  function autoResize(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 5 * 24) + 'px';
  }

  function handleDraftChange(e) {
    const v = e.target.value;
    setDraftText(v);
    autoResize(e.target);

    // Open the picker on the "@word" immediately before the caret.
    const upto = v.slice(0, e.target.selectionStart ?? v.length);
    const m = /(?:^|\s)@([^\s@]{0,40})$/.exec(upto);
    setMentionQuery(m ? m[1] : null);
    setMentionIdx(0);
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
      // POST, not GET: the route is registered with router.post, so a GET fell
      // through to the 404 handler and every chat upload failed with
      // "Not found" before Cloudinary was ever reached. The Hive banner and
      // plan-cover uploads already POST their signature requests.
      const sig  = await api.post(`/api/hives/${hiveId}/messages/upload-signature`, {});
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

      // Cloudinary accounts have a "Allow delivery of PDF and ZIP files"
      // security setting that is off by default. The upload succeeds either
      // way, but delivery of those two types then returns 401 with an empty
      // body — an attachment that looks fine and is silently broken. Check the
      // delivery URL once for those types and surface it instead.
      if (/\.(pdf|zip)$/i.test(entry.file.name)) {
        const probe = await fetch(data.secure_url, { method: 'GET' }).catch(() => null);
        if (!probe || !probe.ok) {
          throw new Error(
            `${entry.file.name.split('.').pop().toUpperCase()} delivery is blocked on this ` +
            `Cloudinary account (returned ${probe ? probe.status : 'no response'}). ` +
            `A Hive admin needs to enable "Allow delivery of PDF and ZIP files".`);
        }
      }

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

      // Only the names still present in the sent text — editing one out must
      // not notify that person.
      const ids = [...mentionedRef.current.entries()]
        .filter(([name]) => text.includes('@' + name))
        .map(([, id]) => id);
      if (ids.length) payload.mentionUserIds = ids;
      mentionedRef.current.clear();

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

  const mentionMatches = mentionQuery === null ? [] : members
    .filter(m => m.user_id !== userId)
    .filter(m => (m.full_name ?? '').toLowerCase().includes(mentionQuery.toLowerCase()))
    .slice(0, 6);

  function insertMention(member) {
    const el = composerRef.current;
    const caret = el?.selectionStart ?? draftText.length;
    const before = draftText.slice(0, caret);
    const after  = draftText.slice(caret);
    const replaced = before.replace(/(^|\s)@([^\s@]{0,40})$/, `$1@${member.full_name} `);
    mentionedRef.current.set(member.full_name, member.user_id);
    const next = replaced + after;
    setDraftText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = replaced.length;
      el?.setSelectionRange(pos, pos);
      autoResize(el);
    });
  }

  function handleComposerKey(e) {
    if (mentionQuery !== null && mentionMatches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => (i + 1) % mentionMatches.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIdx(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mentionIdx]); return; }
      if (e.key === 'Escape')    { e.preventDefault(); setMentionQuery(null); return; }
    }
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
      {planOpen && (
        <CreatePlanModal
          hiveId={hiveId}
          onClose={() => setPlanOpen(false)}
          onCreated={async (plan) => {
            setPlanOpen(false);
            // Posting the plan as a message is what puts the card in the room.
            try {
              // Use the REST response locally. The socket broadcast is
              // depersonalised on purpose, so the creator would otherwise see
              // their own auto-RSVP as unset until a reload.
              const msg = await api.post(`/api/hives/${hiveId}/messages`,
                { channel_id: activeChannelId, planPostId: plan.post_id });
              setMessages(prev => prev.some(m => m.message_id === msg.message_id)
                ? prev.map(m => m.message_id === msg.message_id ? msg : m)
                : [...prev, msg]);
            } catch (e) {
              // eslint-disable-next-line no-alert
              alert(e?.data?.error ?? 'The plan was created but could not be posted here.');
            }
          }}
        />
      )}

      {pollOpen && (
        <CreatePollModal
          hiveId={hiveId}
          channelId={activeChannelId}
          channelName={activeChannel?.name}
          onClose={() => setPollOpen(false)}
          onCreated={() => setPollOpen(false)}
          /* the poll's message arrives over the socket like any other */
        />
      )}

      {pinsOpen && (
        <PinsModal
          hiveId={hiveId}
          channelId={activeChannelId}
          channelName={activeChannel?.name}
          onClose={() => setPinsOpen(false)}
        />
      )}

      {showCreateChannel && (
        <CreateChannelModal
          hiveId={hiveId}
          onClose={() => setShowCreateChannel(false)}
          onCreated={handleChannelCreated}
        />
      )}

      {/* On phones this is a drawer; showRooms only matters there. */}
      {showRooms && <div className="hc-rooms-scrim" onClick={() => setShowRooms(false)} />}
      <RoomsRail
        channels={channels}
        activeChannelId={activeChannelId}
        unreadChannels={unreadChannels}
        onSelect={(id) => { handleChannelSelect(id); setShowRooms(false); }}
        onAddRoom={() => { setShowCreateChannel(true); setShowRooms(false); }}
        canManage={canManageChannels}
        open={showRooms}
      />

      {/* Center */}
      <div className="hc-center">
        {/* Header */}
        <div className="hc-header">
          <button
            type="button"
            className="hc-header-rooms-btn"
            onClick={() => setShowRooms(v => !v)}
            aria-label="Show rooms"
            aria-expanded={showRooms}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <span className="hc-header-hash" aria-hidden="true">#</span>
          <div className="hc-header-left">
            <h1 className="hc-header-room">{activeChannel ? activeChannel.name : '…'}</h1>
            {activeChannel?.description && (
              <p className="hc-header-desc">{activeChannel.description}</p>
            )}
          </div>

          <button
            type="button"
            className="hc-header-members"
            onClick={() => setShowContext(v => !v)}
            aria-label={showContext ? 'Hide the context rail' : 'Show the context rail'}
            aria-expanded={showContext}
          >
            {memberCount} members <span aria-hidden="true">›</span>
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
                  onPin={handlePin}
                  onPlanRsvp={handlePlanRsvp}
                  onPollVote={handlePollVote}
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

        <TypingIndicator typingUsers={typingUsers} currentUserId={userId} members={members} />

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

            {mentionQuery !== null && mentionMatches.length > 0 && (
              <div className="hc-mention-menu" role="listbox" aria-label="Mention a member">
                {mentionMatches.map((m, i) => (
                  <button
                    key={m.user_id}
                    type="button"
                    role="option"
                    aria-selected={i === mentionIdx}
                    className={`hc-mention-item${i === mentionIdx ? ' hc-mention-item--on' : ''}`}
                    onMouseEnter={() => setMentionIdx(i)}
                    onClick={() => insertMention(m)}
                  >
                    <Avatar name={m.full_name} src={m.profile_photo_url} size={24} />
                    {m.full_name ?? 'Member'}
                  </button>
                ))}
              </div>
            )}

            <div className="hc-composer-row">
              <div className="hc-plus-wrap">
              <button
                type="button"
                className="hc-plus-btn"
                onClick={() => setPlusOpen(o => !o)}
                aria-label="Add to this message"
                aria-haspopup="menu"
                aria-expanded={plusOpen}
                title="Add a photo, file, plan or poll"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              {plusOpen && (
                <>
                  <div className="hc-plus-scrim" onClick={() => setPlusOpen(false)} />
                  <div className="hc-plus-menu" role="menu" aria-label="Add to this message">
                    <button type="button" role="menuitem" className="hc-plus-item"
                            onClick={() => { setPlusOpen(false); imageInputRef.current?.click(); }}>
                      🖼 Photo or video
                    </button>
                    <button type="button" role="menuitem" className="hc-plus-item"
                            onClick={() => { setPlusOpen(false); fileInputRef.current?.click(); }}>
                      📎 File
                    </button>
                    {isOwner && (
                      <button type="button" role="menuitem" className="hc-plus-item"
                              onClick={() => { setPlusOpen(false); setPlanOpen(true); }}>
                        📅 Create a plan
                      </button>
                    )}
                    <button type="button" role="menuitem" className="hc-plus-item"
                            onClick={() => { setPlusOpen(false); setPollOpen(true); }}>
                      📊 Poll
                    </button>
                  </div>
                </>
              )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hc-file-input"
                onChange={handleFileSelect}
                aria-hidden="true"
                tabIndex={-1}
              />
              <input
                ref={imageInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hc-file-input"
                onChange={handleFileSelect}
                aria-hidden="true"
                tabIndex={-1}
              />

              <textarea
                ref={composerRef}
                className="hc-textarea"
                placeholder={activeChannel ? `Message #${activeChannel.name}…` : 'Select a room…'}
                value={draftText}
                onChange={handleDraftChange}
                onKeyDown={handleComposerKey}
                rows={1}
                maxLength={2050}
                aria-label="Message input"
              />

              <div className="hc-composer-tools">
                <EmojiPicker onSelect={insertEmoji} />
                <button
                  type="button"
                  className="hc-tool-btn"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={stagedFiles.length >= MAX_ATTACHMENTS}
                  aria-label="Add a photo or video"
                  title="Photo or video"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <circle cx="8.5" cy="9.5" r="1.8" /><path d="m21 16-5-5L5 20" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="hc-tool-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={stagedFiles.length >= MAX_ATTACHMENTS}
                  aria-label="Attach a file"
                  title="Attach file (max 6, 25 MB each)"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21.4 11.1 12.3 20a5.5 5.5 0 0 1-7.8-7.8l9.2-9.1a3.7 3.7 0 1 1 5.2 5.2l-9.2 9.1a1.8 1.8 0 1 1-2.6-2.6l8.5-8.4" />
                  </svg>
                </button>
              </div>

              <button
                className="hc-send-btn"
                onClick={handleSend}
                disabled={!canSend}
                aria-label="Send message"
                title="Send"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M3.2 20.3 21 12 3.2 3.7 3.2 10l12 2-12 2z" />
                </svg>
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
          hiveId={hiveId}
          hive={hive}
          nextPlan={rail.nextPlan}
          recentMedia={rail.recentMedia}
          pin={rail.pin}
          onOpenPins={() => setPinsOpen(true)}
        />
      )}
    </div>
  );
}
