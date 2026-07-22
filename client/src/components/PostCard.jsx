import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { REACTIONS, reactionByKey } from '../lib/reactions';
import ReactionPicker from './ReactionPicker';
import EmojiPicker from './EmojiPicker';
import FollowButton from './FollowButton';
import '../styles/post.css';

// ── Category config ───────────────────────────────────────────────────────────
const CAT_CONFIG = {
  'Social Groups':           { color: '#5dcaa5', icon: '👥' },
  'Professional Networking': { color: '#c49a28', icon: '💼' },
  'Travel Buddies':          { color: '#4db6c4', icon: '✈️' },
  'Project Collaboration':   { color: '#f08a4b', icon: '🚀' },
  'Event Buddies':           { color: '#e86a7c', icon: '🎟️' },
  'Specialized Groups':      { color: '#a59ae8', icon: '⭐' },
};

function SmallHex({ categoryName }) {
  const cfg = CAT_CONFIG[categoryName] ?? { color: '#8a8070', icon: '✦' };
  return (
    <div style={{ position: 'relative', width: 26, height: 26, flexShrink: 0 }}>
      <svg viewBox="0 0 36 36" width={26} height={26} style={{ position: 'absolute', inset: 0 }}>
        <polygon points="18,2 33,10 33,26 18,34 3,26 3,10"
          fill={cfg.color} fillOpacity="0.18" stroke={cfg.color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.64rem' }}>
        {cfg.icon}
      </div>
    </div>
  );
}

function CommentAvatar({ name, src, size = 30 }) {
  const initials = name
    ? name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg,#e8c84a 0%,#c49a28 55%,#8a6510 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {src
        ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ color: '#1a1508', fontWeight: 600, fontSize: size * 0.4, fontFamily: "'DM Sans',sans-serif", lineHeight: 1 }}>{initials}</span>}
    </div>
  );
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatEventDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// Insert emoji at textarea cursor position
function insertAtCursor(inputEl, setText, emoji) {
  if (!inputEl) { setText(prev => prev + emoji); return; }
  const start = inputEl.selectionStart ?? 0;
  const end   = inputEl.selectionEnd   ?? 0;
  const val   = inputEl.value;
  const next  = val.slice(0, start) + emoji + val.slice(end);
  setText(next);
  requestAnimationFrame(() => {
    inputEl.selectionStart = inputEl.selectionEnd = start + emoji.length;
    inputEl.focus();
  });
}

// ── ReplyBox sub-component ────────────────────────────────────────────────────
function ReplyBox({ onSubmit, onCancel, submitting }) {
  const [text, setText] = useState('');
  const inputRef        = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="post-reply-box">
      <textarea
        ref={inputRef}
        className="post-comment-input post-comment-input-sm"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Write a reply…"
        rows={1}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) onSubmit(text); }
          if (e.key === 'Escape') onCancel();
        }}
      />
      <EmojiPicker onSelect={emoji => insertAtCursor(inputRef.current, setText, emoji)} />
      <button
        type="button"
        className="post-comment-send-btn post-comment-send-btn-sm"
        disabled={submitting || !text.trim()}
        onClick={() => { if (text.trim()) onSubmit(text); }}
      >
        {submitting ? '…' : 'Post'}
      </button>
      <button type="button" className="post-reply-cancel" onClick={onCancel}>Cancel</button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PostCard({ post: initialPost, variant }) {
  const [post, setPost] = useState(initialPost);

  // Reaction picker
  const [pickerVisible, setPickerVisible] = useState(false);
  const [reacting,      setReacting]      = useState(false);
  const pickerWrapRef   = useRef(null);
  const showPickerTimer = useRef(null);
  const touchTimer      = useRef(null);
  const touchDidFire    = useRef(false);

  // Reactors modal
  const [reactorsOpen,    setReactorsOpen]    = useState(false);
  const [reactors,        setReactors]        = useState(null);
  const [reactorsLoading, setReactorsLoading] = useState(false);

  // Comments
  const [showComments,     setShowComments]     = useState(false);
  const [comments,         setComments]         = useState(null);
  const [commentsLoading,  setCommentsLoading]  = useState(false);
  const [commentText,      setCommentText]      = useState('');
  const [submittingTop,    setSubmittingTop]    = useState(false);
  const commentInputRef   = useRef(null);

  // Replies
  const [replyingTo,     setReplyingTo]     = useState(null);   // parent comment_id
  const [submittingReply,setSubmittingReply] = useState(null);  // parent comment_id being replied to

  // ── Reaction picker hover ───────────────────────────────────────────────────
  function onWrapEnter() {
    showPickerTimer.current = setTimeout(() => setPickerVisible(true), 250);
  }
  function onWrapLeave() {
    clearTimeout(showPickerTimer.current);
    setPickerVisible(false);
  }
  // Mobile long-press
  function onTouchStart() {
    touchDidFire.current = false;
    touchTimer.current = setTimeout(() => { touchDidFire.current = true; setPickerVisible(true); }, 500);
  }
  function onTouchEnd(e) {
    clearTimeout(touchTimer.current);
    if (!touchDidFire.current) {
      e.preventDefault();
      handlePickReaction(post.my_reaction || 'like');
    }
  }

  // ── React handler ───────────────────────────────────────────────────────────
  const handlePickReaction = useCallback(async (reactionKey) => {
    if (reacting) return;
    setReacting(true);
    setPickerVisible(false);
    const prev = { reacted: post.reacted, my_reaction: post.my_reaction,
                   reaction_count: post.reaction_count, reaction_summary: post.reaction_summary };
    try {
      const data = await api.post(`/api/posts/${post.post_id}/react`, { reaction: reactionKey });
      setPost(p => ({
        ...p,
        reacted:          data.reacted,
        my_reaction:      data.reacted ? data.reaction : null,
        reaction_count:   data.reaction_count,
        reaction_summary: data.reaction_summary,
      }));
    } catch {
      setPost(p => ({ ...p, ...prev }));
    } finally {
      setReacting(false);
    }
  }, [post, reacting]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reactors modal ──────────────────────────────────────────────────────────
  async function handleOpenReactors() {
    setReactorsOpen(true);
    if (reactors === null) {
      setReactorsLoading(true);
      try {
        const data = await api.get(`/api/posts/${post.post_id}/reactors`);
        setReactors(data.reactors ?? []);
      } catch { setReactors([]); }
      finally { setReactorsLoading(false); }
    }
  }
  useEffect(() => {
    if (!reactorsOpen) return;
    const h = e => { if (e.key === 'Escape') setReactorsOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [reactorsOpen]);

  // ── Comments toggle + fetch ─────────────────────────────────────────────────
  async function handleToggleComments() {
    if (!showComments && comments === null) {
      setCommentsLoading(true);
      try {
        const data = await api.get(`/api/posts/${post.post_id}/comments`);
        setComments(data.comments ?? []);
      } catch { setComments([]); }
      finally { setCommentsLoading(false); }
    }
    setShowComments(v => !v);
  }

  // ── Submit top-level comment ────────────────────────────────────────────────
  async function handleSubmitComment(e) {
    e.preventDefault();
    if (!commentText.trim() || submittingTop) return;
    setSubmittingTop(true);
    try {
      const data = await api.post(`/api/posts/${post.post_id}/comments`, { body: commentText.trim() });
      setComments(prev => [...(prev ?? []), { ...data.comment, replies: [] }]);
      setPost(p => ({ ...p, comment_count: Number(p.comment_count) + 1 }));
      setCommentText('');
    } catch { /* swallow */ }
    finally { setSubmittingTop(false); }
  }

  // ── Submit reply ────────────────────────────────────────────────────────────
  async function handleSubmitReply(parentId, text) {
    if (!text?.trim() || submittingReply) return;
    setSubmittingReply(parentId);
    try {
      const data = await api.post(`/api/posts/${post.post_id}/comments`, {
        body: text.trim(), parentCommentId: parentId,
      });
      setComments(prev => prev.map(c =>
        c.comment_id === parentId
          ? { ...c, replies: [...(c.replies ?? []), data.comment] }
          : c,
      ));
      setPost(p => ({ ...p, comment_count: Number(p.comment_count) + 1 }));
      setReplyingTo(null);
    } catch { /* swallow */ }
    finally { setSubmittingReply(null); }
  }

  // ── Delete comment / reply ──────────────────────────────────────────────────
  async function handleDeleteComment(commentId, parentId) {
    try {
      await api.delete(`/api/posts/comments/${commentId}`);
      if (parentId) {
        setComments(prev => prev.map(c =>
          c.comment_id === parentId
            ? { ...c, replies: c.replies.filter(r => r.comment_id !== commentId) }
            : c,
        ));
        setPost(p => ({ ...p, comment_count: Math.max(0, Number(p.comment_count) - 1) }));
      } else {
        const current = comments ?? [];
        const removed = current.find(c => c.comment_id === commentId);
        const diff    = 1 + (removed?.replies?.length ?? 0);
        setComments(current.filter(c => c.comment_id !== commentId));
        setPost(p => ({ ...p, comment_count: Math.max(0, Number(p.comment_count) - diff) }));
      }
    } catch { /* swallow */ }
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const reactionCount  = Number(post.reaction_count ?? 0);
  const commentCount   = Number(post.comment_count  ?? 0);
  const summaryArr     = Array.isArray(post.reaction_summary) ? post.reaction_summary : [];
  const topReactions   = summaryArr.slice(0, 3);
  const myR            = post.my_reaction ? reactionByKey(post.my_reaction) : null;

  // ── Special card types (after all hooks) ───────────────────────────────────
  if (post.post_type === 'milestone') {
    const count    = Number(post.member_count ?? 0);
    const cardCls  = `post-card post-card--milestone${variant === 'light' ? ' post-card--light' : ''}`;
    return (
      <div className={cardCls}>
        <div className="pc-ms-header">
          <span className="pc-ms-chip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c49a28" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4a2 2 0 0 1-2-2V5h4" />
              <path d="M18 9h2a2 2 0 0 0 2-2V5h-4" />
              <path d="M8 21h8" /><path d="M12 17v4" />
              <path d="M4 5h16v5a8 8 0 0 1-16 0V5z" />
            </svg>
          </span>
          <span className="pc-ms-label">MILESTONE</span>
          <span className="pc-ms-meta">{post.hive_name} · {relativeTime(post.created_at)}</span>
        </div>
        <div className="pc-ms-headline">
          {post.hive_name} just reached{' '}
          <span className="pc-ms-count">{count}</span>
          {' '}member{count !== 1 ? 's' : ''}
        </div>
        {post.body && <div className="pc-ms-body">{post.body}</div>}
      </div>
    );
  }

  if (post.post_type === 'member_joined') {
    const initials = (post.author_name ?? '?')
      .trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const cardCls  = `post-card post-card--new-member${variant === 'light' ? ' post-card--light' : ''}`;
    return (
      <div className={cardCls}>
        <div className="pc-nm-header">
          <span className="pc-nm-chip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#639922" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </span>
          <span className="pc-nm-label">NEW MEMBER</span>
          <span className="pc-nm-meta">{post.hive_name} · {relativeTime(post.created_at)}</span>
        </div>
        <div className="pc-nm-body-row">
          <div className="pc-nm-avatar">
            {post.author_photo
              ? <img src={post.author_photo} alt={post.author_name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              : initials}
          </div>
          <span className="pc-nm-text">
            <strong className="pc-nm-name">{post.author_name ?? 'A new member'}</strong>
            {' '}joined{' '}
            <strong className="pc-nm-hive">{post.hive_name}</strong>
          </span>
          <Link to={`/profile/${post.author_user_id}`} className="pc-nm-say-hi">Say hi</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`post-card${variant === 'light' ? ' post-card--light' : ''}`}>

      {/* ── Hive header ── */}
      <div className="post-hive-row">
        <div className="post-hive-left">
          <SmallHex categoryName={post.category_name} />
          <span className="post-hive-name">{post.hive_name}</span>
          {post.category_name && <span className="post-cat-badge">· {post.category_name}</span>}
        </div>
        {!post.is_member && (
          <FollowButton
            hiveId={post.hive_id}
            initialFollowing={post.is_following}
            onChange={following => setPost(p => ({ ...p, is_following: following }))}
          />
        )}
      </div>

      {/* ── Author ── */}
      <div className="post-author-row">
        <CommentAvatar name={post.author_name} src={post.author_photo} size={30} />
        <span className="post-author-name">{post.author_name ?? 'Hive Member'}</span>
        <span className="post-time">{relativeTime(post.created_at)}</span>
      </div>

      {/* ── Event badge ── */}
      {post.post_type === 'event' && <div className="post-event-badge">🗓 Event</div>}

      {/* ── Content ── */}
      <div className="post-headline">{post.headline}</div>
      {post.body && <div className="post-body">{post.body}</div>}

      {/* ── Event meta ── */}
      {post.post_type === 'event' && (post.event_at || post.event_location) && (
        <div className="post-event-meta">
          {post.event_at      && <span>📅 {formatEventDate(post.event_at)}</span>}
          {post.event_location && <span>📍 {post.event_location}</span>}
        </div>
      )}

      {/* ── Reaction summary ── */}
      {reactionCount > 0 && (
        <div className="post-reaction-summary">
          <div className="post-summary-faces">
            {topReactions.map(r => (
              <span key={r.reaction} className="post-summary-face">{reactionByKey(r.reaction).emoji}</span>
            ))}
          </div>
          <button type="button" className="post-summary-count" onClick={handleOpenReactors}>
            {reactionCount}
          </button>
        </div>
      )}

      {/* ── Top comment preview ── */}
      {!showComments && post.top_comment && (
        <div className="post-top-comment">
          <div className="post-top-comment-author">{post.top_comment.full_name ?? 'Member'}</div>
          <div className="post-top-comment-body">{post.top_comment.body}</div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="post-footer">
        {/* Reaction button + hover picker */}
        <div
          className="post-reaction-wrap"
          ref={pickerWrapRef}
          onMouseEnter={onWrapEnter}
          onMouseLeave={onWrapLeave}
        >
          <button
            type="button"
            className={`post-react-btn${post.reacted ? ' reacted' : ''}`}
            onClick={() => handlePickReaction(post.my_reaction || 'like')}
            disabled={reacting}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <span className="post-react-icon">{myR ? myR.emoji : '👍'}</span>
            <span>{myR ? myR.label : 'Like'}</span>
          </button>
          {pickerVisible && (
            <ReactionPicker
              current={post.my_reaction}
              onPick={key => { handlePickReaction(key); setPickerVisible(false); }}
            />
          )}
        </div>

        <button type="button" className="post-comment-btn" onClick={handleToggleComments}>
          <span>💬</span>
          <span>
            {commentCount > 0
              ? `${commentCount} Comment${commentCount !== 1 ? 's' : ''}`
              : 'Comment'}
            {showComments ? ' ▲' : ''}
          </span>
        </button>
      </div>

      {/* ── Comments panel ── */}
      {showComments && (
        <div className="post-comments-panel">
          {commentsLoading ? (
            <div style={{ color: '#6b6057', fontSize: '0.8rem', fontFamily: "'DM Sans',sans-serif", padding: '4px 0' }}>
              Loading…
            </div>
          ) : (
            (comments ?? []).map(comment => (
              <div key={comment.comment_id} className="post-comment-item">
                <CommentAvatar name={comment.full_name} src={comment.profile_photo_url} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="post-comment-bubble">
                    <div className="post-comment-bubble-author">
                      {comment.full_name ?? 'Member'}
                      {comment.is_mine && (
                        <button
                          type="button"
                          className="post-comment-delete"
                          onClick={() => handleDeleteComment(comment.comment_id, null)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <div className="post-comment-bubble-body">{comment.body}</div>
                    <div className="post-comment-meta">
                      <span>{relativeTime(comment.commented_at)}</span>
                      <button
                        type="button"
                        className="post-reply-trigger"
                        onClick={() => setReplyingTo(
                          replyingTo === comment.comment_id ? null : comment.comment_id,
                        )}
                      >
                        Reply
                      </button>
                    </div>
                  </div>

                  {/* Replies */}
                  {(comment.replies ?? []).map(reply => (
                    <div key={reply.comment_id} className="post-reply-indent">
                      <div className="post-reply-thread-line" />
                      <CommentAvatar name={reply.full_name} src={reply.profile_photo_url} size={24} />
                      <div className="post-comment-bubble">
                        <div className="post-comment-bubble-author">
                          {reply.full_name ?? 'Member'}
                          {reply.is_mine && (
                            <button
                              type="button"
                              className="post-comment-delete"
                              onClick={() => handleDeleteComment(reply.comment_id, comment.comment_id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                        <div className="post-comment-bubble-body">{reply.body}</div>
                        <div className="post-comment-meta">
                          <span>{relativeTime(reply.commented_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Inline reply box */}
                  {replyingTo === comment.comment_id && (
                    <ReplyBox
                      onSubmit={text => handleSubmitReply(comment.comment_id, text)}
                      onCancel={() => setReplyingTo(null)}
                      submitting={submittingReply === comment.comment_id}
                    />
                  )}
                </div>
              </div>
            ))
          )}

          {/* Top-level comment input */}
          <form className="post-add-comment" onSubmit={handleSubmitComment}>
            <textarea
              ref={commentInputRef}
              className="post-comment-input"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Add a comment…"
              rows={1}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitComment(e); }
              }}
            />
            <EmojiPicker onSelect={emoji => insertAtCursor(commentInputRef.current, setCommentText, emoji)} />
            <button
              type="submit"
              className="post-comment-send-btn"
              disabled={submittingTop || !commentText.trim()}
            >
              {submittingTop ? '…' : 'Post'}
            </button>
          </form>
        </div>
      )}

      {/* ── Reactors modal ── */}
      {reactorsOpen && (
        <div
          className="post-reactors-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setReactorsOpen(false)}
        >
          <div className="post-reactors-modal" onClick={e => e.stopPropagation()}>
            <div className="post-reactors-header">
              <span className="post-reactors-title">Reactions</span>
              <button type="button" className="post-reactors-close" onClick={() => setReactorsOpen(false)}>×</button>
            </div>
            <div className="post-reactors-list">
              {reactorsLoading ? (
                <div style={{ color: '#6b6057', fontSize: '0.82rem', fontFamily: "'DM Sans',sans-serif", padding: '12px 0', textAlign: 'center' }}>
                  Loading…
                </div>
              ) : (reactors ?? []).length === 0 ? (
                <div style={{ color: '#6b6057', fontSize: '0.82rem', fontFamily: "'DM Sans',sans-serif", padding: '12px 0', textAlign: 'center' }}>
                  No reactions yet.
                </div>
              ) : (
                (reactors ?? []).map(r => (
                  <div key={r.user_id} className="post-reactor-row">
                    <CommentAvatar name={r.full_name} src={r.profile_photo_url} size={32} />
                    <span className="post-reactor-name">{r.full_name ?? 'Member'}</span>
                    <span className="post-reactor-emoji">{reactionByKey(r.reaction).emoji}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
