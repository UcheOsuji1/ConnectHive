import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Avatar from '../components/Avatar.jsx';
import BlockModal from '../components/BlockModal.jsx';
import ReportModal from '../components/ReportModal.jsx';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/messages.css';
import '../styles/safety.css';

// Direct Messages (Prompt 86), built to Messages_Page.design.html.
// The URL drives everything: /messages (list), /messages/:conversationId
// (open conversation), /messages?to={userId} (open-or-start with someone).
// On ≤768px the list and the conversation are separate views for the same
// reason. Uses the one shared socket; joins no Hive rooms.

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // same cap as chat
const TYPING_SHOW_MS = 3500;
const TYPING_EMIT_MS = 2000;

const first = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'them';

function shortTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function useIsMobile() {
  const query = '(max-width: 768px)';
  const [mobile, setMobile] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const h = () => setMobile(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return mobile;
}

function PlusIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}
function ImageIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-9 8" /></svg>;
}
function BackIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>;
}

// ── New message modal ────────────────────────────────────────────────────────
function NewMessageModal({ onClose, onPick }) {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      api.get(`/api/dm/recipients?q=${encodeURIComponent(q.trim())}`)
        .then(d => { if (!cancelled) setPeople(d.recipients ?? []); })
        .catch(() => { if (!cancelled) setPeople([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);
  return (
    <div className="dm-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dm-modal" role="dialog" aria-modal="true" aria-labelledby="dm-new-title"
           onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="dm-modal-head">
          <h2 id="dm-new-title">New message</h2>
          <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <input className="dm-search" autoFocus placeholder="Search people from your Hives"
               value={q} onChange={e => setQ(e.target.value)} aria-label="Search people" />
        <div className="dm-modal-list">
          {people === null ? <p className="dm-muted">Loading…</p>
            : people.length === 0 ? <p className="dm-muted">No one found. You can message your connections and people in your Hives.</p>
            : people.map(p => (
              <button key={p.user_id} type="button" className="dm-modal-row" onClick={() => onPick(p.user_id)}>
                <Avatar name={p.full_name} src={p.profile_photo_url} size={34} />
                <span><strong>{p.full_name}</strong>{p.headline && <small>{p.headline}</small>}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

// ── One message bubble ───────────────────────────────────────────────────────
function Bubble({ m, mine, onEdit, onDelete, onReport, seen }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body ?? '');
  const pressRef = useRef(null);
  const canEdit = mine && !m.deleted && Date.now() - new Date(m.created_at).getTime() < EDIT_WINDOW_MS;

  // Long-press on touch opens the same actions hover shows on desktop.
  function onTouchStart() { pressRef.current = setTimeout(() => setMenu(true), 450); }
  function onTouchEnd() { clearTimeout(pressRef.current); }

  async function save() {
    const ok = await onEdit(m, draft);
    if (ok) setEditing(false);
  }

  return (
    <div className={`dm-msg${mine ? ' dm-msg--mine' : ''}`}>
      <div className="dm-msg-row" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchMove={onTouchEnd}>
        {editing ? (
          <div className="dm-edit">
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} autoFocus
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === 'Escape') setEditing(false); }} />
            <div className="dm-edit-actions">
              <button type="button" onClick={() => setEditing(false)}>Cancel</button>
              <button type="button" className="dm-edit-save" onClick={save}>Save</button>
            </div>
          </div>
        ) : (
          <div className={`dm-bubble${m.deleted ? ' dm-bubble--deleted' : ''}${m.image_url && !m.body ? ' dm-bubble--image' : ''}`}>
            {m.deleted ? 'Message deleted' : (
              <>
                {m.image_url && <a href={m.image_url} target="_blank" rel="noreferrer"><img src={m.image_url} alt="Photo" className="dm-img" /></a>}
                {m.body && <span className="dm-text">{m.body}</span>}
                {m.edited_at && <span className="dm-edited"> (edited)</span>}
              </>
            )}
          </div>
        )}
        {!m.deleted && !editing && (
          <div className={`dm-msg-actions${menu ? ' open' : ''}`}>
            {canEdit && m.body !== null && <button type="button" onClick={() => { setMenu(false); setDraft(m.body ?? ''); setEditing(true); }}>Edit</button>}
            {mine && <button type="button" onClick={() => { setMenu(false); onDelete(m); }}>Delete</button>}
            {!mine && <button type="button" onClick={() => { setMenu(false); onReport(m); }}>Report</button>}
            {menu && <button type="button" onClick={() => setMenu(false)} aria-label="Close">×</button>}
          </div>
        )}
      </div>
      {seen && <div className="dm-seen">Seen</div>}
    </div>
  );
}

// ── Conversation pane ────────────────────────────────────────────────────────
function Conversation({ me, view, setView, onBack, onChanged, onGone }) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [typing, setTyping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [report, setReport] = useState(null); // { targetType, targetId }
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);
  const lastTypingEmit = useRef(0);
  const convId = view.conversation_id;
  const otherId = view.other.user_id;
  const otherFirst = first(view.other.full_name);

  const markRead = useCallback(() => {
    if (!convId || document.visibilityState !== 'visible') return;
    api.post(`/api/dm/conversations/${convId}/read`, {}).catch(() => {});
  }, [convId]);

  // Load messages for this conversation.
  useEffect(() => {
    let cancelled = false;
    setMessages([]); setHasMore(false); setError(null); setText(''); setTyping(false);
    if (!convId) { setLoading(false); return undefined; }
    setLoading(true);
    api.get(`/api/dm/conversations/${convId}/messages`)
      .then(d => { if (!cancelled) { setMessages(d.messages ?? []); setHasMore(!!d.has_more); } })
      .catch(() => { if (!cancelled) onGone(); })
      .finally(() => { if (!cancelled) setLoading(false); });
    markRead();
    return () => { cancelled = true; };
  }, [convId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stick to the bottom as messages arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing]);

  // Live events for this conversation.
  useEffect(() => {
    function onMessage(p) {
      if (!convId || p.conversation_id !== convId) return;
      setMessages(prev => prev.some(x => x.message_id === p.message.message_id) ? prev : [...prev, p.message]);
      setView(v => ({ ...v, status: p.status }));
      if (p.message.sender_id !== me) { setTyping(false); markRead(); }
    }
    function onUpdated(p) {
      if (p.conversation_id !== convId) return;
      setMessages(prev => prev.map(x => x.message_id === p.message.message_id ? p.message : x));
    }
    function onRead(p) {
      if (p.conversation_id === convId && p.user_id === otherId) setView(v => ({ ...v, other_last_read_at: p.last_read_at }));
    }
    function onTyping(p) {
      if (p.conversation_id !== convId || p.user_id !== otherId) return;
      setTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), TYPING_SHOW_MS);
    }
    function onVisible() { if (document.visibilityState === 'visible') markRead(); }
    socket.on('dm_message', onMessage);
    socket.on('dm_message_updated', onUpdated);
    socket.on('dm_read', onRead);
    socket.on('dm_typing', onTyping);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      socket.off('dm_message', onMessage);
      socket.off('dm_message_updated', onUpdated);
      socket.off('dm_read', onRead);
      socket.off('dm_typing', onTyping);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(typingTimer.current);
    };
  }, [convId, otherId, me, markRead, setView]);

  async function loadEarlier() {
    if (!messages.length) return;
    const d = await api.get(`/api/dm/conversations/${convId}/messages?before=${encodeURIComponent(messages[0].created_at)}`).catch(() => null);
    if (d) { setMessages(prev => [...(d.messages ?? []), ...prev]); setHasMore(!!d.has_more); }
  }

  async function send({ body, image_url }) {
    if (sending) return false;
    setSending(true); setError(null);
    try {
      const out = convId
        ? await api.post(`/api/dm/conversations/${convId}/messages`, { body, image_url })
        : await api.post('/api/dm/messages', { toUserId: otherId, body, image_url });
      setMessages(prev => prev.some(x => x.message_id === out.message.message_id) ? prev : [...prev, out.message]);
      if (!convId) {
        navigate(`/messages/${out.conversation_id}`, { replace: true });
      } else {
        // Re-read can_send (a request allows one message until a reply).
        api.get(`/api/dm/conversations/${convId}`).then(d => setView(d.conversation)).catch(() => {});
      }
      onChanged();
      return true;
    } catch (e) {
      setError(e?.data?.error ?? 'Message not sent. Try again.');
      return false;
    } finally {
      setSending(false);
    }
  }

  async function submit() {
    const body = text.trim();
    if (!body) return;
    if (await send({ body })) setText('');
  }

  function onInput(e) {
    setText(e.target.value);
    const now = Date.now();
    if (convId && now - lastTypingEmit.current > TYPING_EMIT_MS) {
      lastTypingEmit.current = now;
      socket.emit('dm_typing', { conversationId: convId });
    }
  }

  async function onPickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Only photos can be sent here.'); return; }
    if (file.size > MAX_IMAGE_BYTES) { setError('Photos must be 25 MB or less.'); return; }
    setUploading(true); setError(null);
    try {
      const sig = await api.get('/api/dm/upload-signature');
      const form = new FormData();
      form.append('file', file);
      form.append('api_key', sig.api_key);
      form.append('timestamp', String(sig.timestamp));
      form.append('signature', sig.signature);
      form.append('folder', sig.folder);
      form.append('allowed_formats', sig.allowed_formats);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Upload failed.');
      await send({ body: text.trim() || null, image_url: data.secure_url });
      setText('');
    } catch (err) {
      setError(err?.data?.error ?? err?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function editMessage(m, body) {
    try {
      const d = await api.patch(`/api/dm/messages/${m.message_id}`, { body });
      setMessages(prev => prev.map(x => x.message_id === m.message_id ? d.message : x));
      return true;
    } catch (e) {
      setError(e?.data?.error ?? 'Could not edit that message.');
      return false;
    }
  }
  async function deleteMessage(m) {
    if (!window.confirm('Delete this message? It will show as "Message deleted" for both of you.')) return;
    try {
      const d = await api.delete(`/api/dm/messages/${m.message_id}`);
      setMessages(prev => prev.map(x => x.message_id === m.message_id ? d.message : x));
      onChanged();
    } catch (e) { setError(e?.data?.error ?? 'Could not delete that message.'); }
  }

  async function toggleMute() {
    setMenuOpen(false);
    const d = await api.post(`/api/dm/conversations/${convId}/mute`, { muted: !view.muted }).catch(() => null);
    if (d) setView(v => ({ ...v, muted: d.muted }));
  }
  async function hide() {
    setMenuOpen(false);
    if (!window.confirm(`Delete this conversation? It's removed from your messages only; ${otherFirst} keeps their copy.`)) return;
    await api.post(`/api/dm/conversations/${convId}/hide`, {}).catch(() => {});
    onChanged();
    navigate('/messages');
  }
  async function ignore() {
    await api.post(`/api/dm/conversations/${convId}/ignore`, {}).catch(() => {});
    onChanged();
    navigate('/messages');
  }

  // "Seen" sits under your last message once the other person has read past it.
  const lastMine = useMemo(() => [...messages].reverse().find(m => m.sender_id === me && !m.deleted), [messages, me]);
  const seenId = lastMine && view.other_last_read_at && new Date(view.other_last_read_at) >= new Date(lastMine.created_at)
    ? lastMine.message_id : null;

  let lastDay = null;
  const composerDisabled = !view.can_send || sending || uploading;

  return (
    <section className="dm-conv" aria-label={`Conversation with ${view.other.full_name}`}>
      <header className="dm-conv-head">
        <button type="button" className="dm-back" onClick={onBack} aria-label="Back to messages"><BackIcon /></button>
        <Avatar name={view.other.full_name} src={view.other.profile_photo_url} size={34} />
        <div className="dm-conv-who">
          <div className="dm-conv-name">{view.other.full_name}</div>
          <div className="dm-conv-ctx">{view.context}</div>
        </div>
        <Link to={`/profile/${otherId}`} className="dm-pill-btn">View profile</Link>
        {convId && (
          <div className="dm-menu-wrap">
            <button type="button" className="dm-icon-btn" aria-label="Conversation actions" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>⋯</button>
            {menuOpen && (
              <div className="dm-menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
                <button type="button" role="menuitem" onClick={toggleMute}>{view.muted ? 'Unmute' : 'Mute'}</button>
                <button type="button" role="menuitem" onClick={hide}>Delete conversation</button>
                <div className="sf-menu-divider" />
                <button type="button" role="menuitem" className="dm-danger" onClick={() => { setMenuOpen(false); setShowBlock(true); }}>Block {otherFirst}</button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setReport({ targetType: 'user', targetId: otherId }); }}>Report {otherFirst}</button>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="dm-thread" ref={scrollRef}>
        {hasMore && <button type="button" className="dm-earlier" onClick={loadEarlier}>Load earlier messages</button>}
        {loading ? <p className="dm-muted dm-center">Loading…</p> : null}
        {!loading && !convId && (
          <p className="dm-muted dm-center">
            {view.mode === 'request'
              ? `You and ${otherFirst} don't share a Hive yet, so this will be sent as a message request. You can send one message until ${otherFirst} replies.`
              : `Say hi to ${otherFirst}.`}
          </p>
        )}
        {messages.map(m => {
          const day = new Date(m.created_at).toDateString();
          const divider = day !== lastDay ? <div className="dm-day" key={`d-${m.message_id}`}>{dayLabel(m.created_at)}</div> : null;
          lastDay = day;
          return [
            divider,
            <Bubble key={m.message_id} m={m} mine={m.sender_id === me}
                    seen={m.message_id === seenId}
                    onEdit={editMessage} onDelete={deleteMessage}
                    onReport={(msg) => setReport({ targetType: 'dm_message', targetId: msg.message_id })} />,
          ];
        })}
        {typing && <div className="dm-typing"><span className="dm-dots"><i /><i /><i /></span>{otherFirst} is typing</div>}
      </div>

      {view.incoming_request && (
        <div className="dm-banner">
          <span><strong>{otherFirst}</strong> wants to message you. Reply to accept.</span>
          <span className="dm-banner-actions">
            <button type="button" onClick={ignore}>Ignore</button>
            <button type="button" className="dm-danger" onClick={() => setShowBlock(true)}>Block</button>
          </span>
        </div>
      )}
      {view.awaiting_reply && !view.can_send && (
        <div className="dm-banner dm-banner--quiet">Request sent. You can send more once {otherFirst} replies.</div>
      )}
      {error && <div className="dm-error" role="alert">{error}</div>}

      <form className="dm-composer" onSubmit={e => { e.preventDefault(); submit(); }}>
        <button type="button" className="dm-icon-btn dm-img-btn" aria-label="Send a photo"
                disabled={composerDisabled} onClick={() => fileRef.current?.click()}><ImageIcon /></button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
        <textarea
          className="dm-input"
          rows={1}
          placeholder={uploading ? 'Uploading photo…' : `Message ${otherFirst}…`}
          value={text}
          disabled={composerDisabled}
          onChange={onInput}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          aria-label={`Message ${otherFirst}`}
          maxLength={4000}
        />
        <button type="submit" className="dm-send" disabled={composerDisabled || !text.trim()}>Send</button>
      </form>

      {showBlock && (
        <BlockModal userId={otherId} name={otherFirst} onClose={() => setShowBlock(false)}
                    onBlocked={() => { setShowBlock(false); onChanged(); navigate('/messages'); }} />
      )}
      {report && (
        <ReportModal targetType={report.targetType} targetId={report.targetId}
                     title={report.targetType === 'dm_message' ? 'Report message' : `Report ${otherFirst}`}
                     personName={otherFirst} onClose={() => setReport(null)}
                     onReported={() => onChanged()} />
      )}
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function MessagesPage() {
  const { user } = useAuth();
  const me = user?.userId;
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const [params] = useSearchParams();
  const toUserId = params.get('to');
  const isMobile = useIsMobile();

  const [tab, setTab] = useState('inbox');
  const [lists, setLists] = useState({ inbox: null, requests: null });
  const [filter, setFilter] = useState('');
  const [view, setView] = useState(null);
  const [viewError, setViewError] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [hasHives, setHasHives] = useState(true);

  const loadLists = useCallback(() => {
    Promise.all([
      api.get('/api/dm/conversations?tab=inbox').catch(() => ({ conversations: [] })),
      api.get('/api/dm/conversations?tab=requests').catch(() => ({ conversations: [] })),
    ]).then(([a, b]) => setLists({ inbox: a.conversations ?? [], requests: b.conversations ?? [] }));
  }, []);

  useEffect(() => {
    if (!socket.connected) socket.connect();
    loadLists();
    api.get('/api/hives/mine').then(d => setHasHives((d.hives ?? []).length > 0)).catch(() => {});
    // Any DM activity (or a read in another tab) can reorder or move rows.
    let t = null;
    const soon = () => { clearTimeout(t); t = setTimeout(loadLists, 150); };
    socket.on('dm_message', soon);
    socket.on('dm_message_updated', soon);
    socket.on('dm_unread', soon);
    window.addEventListener('focus', loadLists);
    return () => {
      clearTimeout(t);
      socket.off('dm_message', soon);
      socket.off('dm_message_updated', soon);
      socket.off('dm_unread', soon);
      window.removeEventListener('focus', loadLists);
    };
  }, [loadLists]);

  // Resolve what the right pane shows from the URL.
  useEffect(() => {
    let cancelled = false;
    setViewError(null);
    if (conversationId) {
      api.get(`/api/dm/conversations/${conversationId}`)
        .then(d => { if (!cancelled) setView(d.conversation); })
        .catch(() => { if (!cancelled) { setView(null); setViewError('This conversation is no longer available.'); } });
    } else if (toUserId) {
      api.post('/api/dm/conversations', { userId: toUserId })
        .then(d => {
          if (cancelled) return;
          if (d.conversation.conversation_id) navigate(`/messages/${d.conversation.conversation_id}`, { replace: true });
          else setView(d.conversation);
        })
        .catch(e => { if (!cancelled) { setView(null); setViewError(e?.data?.error ?? "You can't message this person."); } });
    } else {
      setView(null);
    }
    return () => { cancelled = true; };
  }, [conversationId, toUserId, navigate]);

  // Opening a request you received shows it under Requests.
  useEffect(() => {
    if (view?.incoming_request) setTab('requests');
  }, [view?.conversation_id, view?.incoming_request]);

  const rows = useMemo(() => {
    const list = lists[tab] ?? [];
    const f = filter.trim().toLowerCase();
    if (!f) return list;
    return list.filter(c => c.other.full_name.toLowerCase().includes(f) || c.preview.toLowerCase().includes(f));
  }, [lists, tab, filter]);

  const loaded = lists.inbox !== null && lists.requests !== null;
  const nothingAtAll = loaded && lists.inbox.length === 0 && lists.requests.length === 0;
  const showConversation = !!(conversationId || toUserId);
  const paneClass = isMobile ? (showConversation ? 'dm-show-conv' : 'dm-show-list') : '';

  return (
    <>
      <Navbar />
      <main className={`dm-page ${paneClass}`}>
        <aside className="dm-list" aria-label="Conversations">
          <div className="dm-list-head">
            <h1>Messages</h1>
            <button type="button" className="dm-icon-btn dm-new" aria-label="New message" onClick={() => setShowNew(true)}><PlusIcon /></button>
          </div>
          <input className="dm-search" placeholder="Search people or messages" value={filter}
                 onChange={e => setFilter(e.target.value)} aria-label="Search people or messages" />
          <div className="dm-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'inbox'} className={tab === 'inbox' ? 'on' : ''} onClick={() => setTab('inbox')}>Inbox</button>
            <button type="button" role="tab" aria-selected={tab === 'requests'} className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>
              Requests{lists.requests?.length ? <span className="dm-tab-count">{lists.requests.length}</span> : null}
            </button>
          </div>
          <div className="dm-rows">
            {!loaded ? <p className="dm-muted dm-pad">Loading…</p>
              : nothingAtAll ? (
                <div className="dm-empty">
                  <p>No messages yet. Message someone from one of your Hives.</p>
                  <Link to={hasHives ? '/my-hive' : '/find-your-hive'} className="dm-pill-btn">{hasHives ? 'My Hives' : 'Find Your Hive'}</Link>
                </div>
              ) : rows.length === 0 ? (
                <p className="dm-muted dm-pad">{filter ? 'No matches.' : tab === 'requests' ? 'No message requests.' : 'Nothing here yet.'}</p>
              ) : rows.map(c => (
                <Link key={c.conversation_id} to={`/messages/${c.conversation_id}`}
                      className={`dm-row${c.conversation_id === view?.conversation_id ? ' on' : ''}${c.unread ? ' unread' : ''}`}>
                  <Avatar name={c.other.full_name} src={c.other.profile_photo_url} size={40} />
                  <span className="dm-row-body">
                    <span className="dm-row-top">
                      <span className="dm-row-name">{c.other.full_name}</span>
                      <span className="dm-row-time">{shortTime(c.last_message_at)}</span>
                    </span>
                    <span className="dm-row-ctx">{c.request_sent ? 'Request sent' : c.context}</span>
                    <span className="dm-row-preview">{c.preview}</span>
                  </span>
                  {c.unread > 0 && <span className="dm-dot" aria-label="Unread" />}
                </Link>
              ))}
          </div>
        </aside>

        <div className="dm-pane">
          {view ? (
            <Conversation
              key={view.conversation_id ?? `to-${view.other.user_id}`}
              me={me}
              view={view}
              setView={setView}
              onBack={() => navigate('/messages')}
              onChanged={loadLists}
              onGone={() => { setView(null); setViewError('This conversation is no longer available.'); loadLists(); }}
            />
          ) : (
            <div className="dm-placeholder">
              {viewError
                ? <><p>{viewError}</p><button type="button" className="dm-pill-btn" onClick={() => navigate('/messages')}>Back to messages</button></>
                : showConversation ? <p className="dm-muted">Loading…</p> : <p>Select a conversation</p>}
            </div>
          )}
        </div>
      </main>
      {showNew && (
        <NewMessageModal onClose={() => setShowNew(false)}
                         onPick={(id) => { setShowNew(false); navigate(`/messages?to=${id}`); }} />
      )}
    </>
  );
}
