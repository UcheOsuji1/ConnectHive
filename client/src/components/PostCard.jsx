import { useState } from 'react';
import { api } from '../lib/api';
import FollowButton from './FollowButton';
import '../styles/post.css';

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
        <polygon
          points="18,2 33,10 33,26 18,34 3,26 3,10"
          fill={cfg.color}
          fillOpacity="0.18"
          stroke={cfg.color}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.64rem',
      }}>
        {cfg.icon}
      </div>
    </div>
  );
}

function AuthorAvatar({ name, src }) {
  const initials = name
    ? name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';
  return (
    <div className="post-author-avatar">
      {src ? <img src={src} alt={name} /> : initials}
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

export default function PostCard({ post: initialPost }) {
  const [post, setPost] = useState(initialPost);
  const [reacting, setReacting] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  async function handleReact() {
    if (reacting) return;
    setReacting(true);
    try {
      const data = await api.post(`/api/posts/${post.post_id}/react`, { reaction: 'like' });
      setPost(p => ({ ...p, reacted: data.reacted, reaction_count: data.reaction_count }));
    } catch { /* swallow */ }
    finally { setReacting(false); }
  }

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

  async function handleSubmitComment(e) {
    e.preventDefault();
    if (!commentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const data = await api.post(`/api/posts/${post.post_id}/comments`, { body: commentText.trim() });
      setComments(prev => [...(prev ?? []), data.comment]);
      setPost(p => ({ ...p, comment_count: Number(p.comment_count) + 1 }));
      setCommentText('');
    } catch { /* swallow */ }
    finally { setSubmittingComment(false); }
  }

  const reactionCount = Number(post.reaction_count ?? 0);
  const commentCount  = Number(post.comment_count  ?? 0);

  return (
    <div className="post-card">
      {/* Hive header */}
      <div className="post-hive-row">
        <div className="post-hive-left">
          <SmallHex categoryName={post.category_name} />
          <span className="post-hive-name">{post.hive_name}</span>
          {post.category_name && (
            <span className="post-cat-badge">· {post.category_name}</span>
          )}
        </div>
        {!post.is_member && (
          <FollowButton
            hiveId={post.hive_id}
            initialFollowing={post.is_following}
            onChange={following => setPost(p => ({ ...p, is_following: following }))}
          />
        )}
      </div>

      {/* Author */}
      <div className="post-author-row">
        <AuthorAvatar name={post.author_name} src={post.author_photo} />
        <span className="post-author-name">{post.author_name ?? 'Hive Member'}</span>
        <span className="post-time">{relativeTime(post.created_at)}</span>
      </div>

      {/* Event badge */}
      {post.post_type === 'event' && (
        <div className="post-event-badge">🗓 Event</div>
      )}

      {/* Content */}
      <div className="post-headline">{post.headline}</div>
      {post.body && <div className="post-body">{post.body}</div>}

      {/* Event meta */}
      {post.post_type === 'event' && (post.event_at || post.event_location) && (
        <div className="post-event-meta">
          {post.event_at && <span>📅 {formatEventDate(post.event_at)}</span>}
          {post.event_location && <span>📍 {post.event_location}</span>}
        </div>
      )}

      {/* Top comment preview (when comments panel is closed) */}
      {!showComments && post.top_comment && (
        <div className="post-top-comment">
          <div className="post-top-comment-author">{post.top_comment.full_name ?? 'Member'}</div>
          <div className="post-top-comment-body">{post.top_comment.body}</div>
        </div>
      )}

      {/* Footer */}
      <div className="post-footer">
        <button
          type="button"
          className={`post-react-btn${post.reacted ? ' reacted' : ''}`}
          onClick={handleReact}
          disabled={reacting}
        >
          <span className="post-react-icon">{post.reacted ? '♥' : '♡'}</span>
          {reactionCount > 0 && <span>{reactionCount}</span>}
          <span>{post.reacted ? 'Liked' : 'Like'}</span>
        </button>

        <button
          type="button"
          className="post-comment-btn"
          onClick={handleToggleComments}
        >
          <span>💬</span>
          <span>{commentCount > 0 ? commentCount : ''} {showComments ? 'Hide' : 'Comment'}{commentCount !== 1 && commentCount > 0 ? 's' : ''}</span>
        </button>
      </div>

      {/* Comments panel */}
      {showComments && (
        <div className="post-comments-panel">
          {commentsLoading ? (
            <div style={{ color: '#6b6057', fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif", padding: '4px 0' }}>
              Loading…
            </div>
          ) : (
            (comments ?? []).map(c => (
              <div key={c.comment_id} className="post-comment-item">
                <div className="post-comment-avatar">
                  {c.profile_photo_url
                    ? <img src={c.profile_photo_url} alt={c.full_name} />
                    : (c.full_name ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="post-comment-bubble">
                  <div className="post-comment-bubble-author">{c.full_name ?? 'Member'}</div>
                  <div className="post-comment-bubble-body">{c.body}</div>
                </div>
              </div>
            ))
          )}

          <form className="post-add-comment" onSubmit={handleSubmitComment}>
            <textarea
              className="post-comment-input"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Add a comment…"
              rows={1}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitComment(e);
                }
              }}
            />
            <button
              type="submit"
              className="post-comment-send-btn"
              disabled={submittingComment || !commentText.trim()}
            >
              Post
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
