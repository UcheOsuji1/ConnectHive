import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api.js';
import { reactionByKey } from '../../lib/reactions.js';
import ReactionPicker from '../ReactionPicker.jsx';
import Avatar from '../Avatar.jsx';

// The plan detail page's discussion — reuses the exact same post reaction
// and threaded-comment endpoints postsController already exposes for every
// other post (Part 2). The plan's own hero already shows title/host/date, so
// this deliberately skips PostCard's full header chrome.
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function PlanDiscussion({ postId }) {
  const [post, setPost] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [comments, setComments] = useState(null);
  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pickerRef = useRef(null);

  const load = useCallback(() => {
    api.get(`/api/posts/${postId}`).then(d => setPost(d.post)).catch(() => {});
    api.get(`/api/posts/${postId}/comments`).then(d => setComments(d.comments ?? [])).catch(() => setComments([]));
  }, [postId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = e => { if (!pickerRef.current?.contains(e.target)) setPickerOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pickerOpen]);

  async function react(key) {
    setPickerOpen(false);
    try {
      const d = await api.post(`/api/posts/${postId}/react`, { reaction: key });
      setPost(p => ({ ...p, reacted: d.reacted, my_reaction: d.reacted ? d.reaction : null, reaction_count: d.reaction_count, reaction_summary: d.reaction_summary }));
    } catch { /* swallow */ }
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const d = await api.post(`/api/posts/${postId}/comments`, { body: text.trim() });
      setComments(c => [...(c ?? []), { ...d.comment, replies: [] }]);
      setText('');
    } finally { setSubmitting(false); }
  }

  async function submitReply(parentId) {
    if (!replyText.trim()) return;
    try {
      const d = await api.post(`/api/posts/${postId}/comments`, { body: replyText.trim(), parentCommentId: parentId });
      setComments(c => c.map(x => x.comment_id === parentId ? { ...x, replies: [...(x.replies ?? []), d.comment] } : x));
      setReplyText('');
      setReplyingTo(null);
    } catch { /* swallow */ }
  }

  async function del(commentId, parentId) {
    try {
      await api.delete(`/api/posts/comments/${commentId}`);
      if (parentId) {
        setComments(c => c.map(x => x.comment_id === parentId ? { ...x, replies: x.replies.filter(r => r.comment_id !== commentId) } : x));
      } else {
        setComments(c => c.filter(x => x.comment_id !== commentId));
      }
    } catch { /* swallow */ }
  }

  const summary = Array.isArray(post?.reaction_summary) ? post.reaction_summary.slice(0, 3) : [];
  const myR = post?.my_reaction ? reactionByKey(post.my_reaction) : null;

  return (
    <section className="pd-discussion">
      <h3 className="pd-section-title">Discussion</h3>

      <div className="pd-react-row" ref={pickerRef}>
        <div className="pd-react-wrap" onMouseEnter={() => setPickerOpen(true)} onMouseLeave={() => setPickerOpen(false)}>
          <button type="button" className={`pd-react-btn${post?.reacted ? ' pd-react-btn--on' : ''}`}
                  onClick={() => react(post?.my_reaction || 'like')}>
            <span>{myR ? myR.emoji : '👍'}</span>
            <span>{myR ? myR.label : 'Like'}</span>
          </button>
          {pickerOpen && <ReactionPicker current={post?.my_reaction} onPick={react} />}
        </div>
        {post?.reaction_count > 0 && (
          <span className="pd-react-summary">
            {summary.map(r => <span key={r.reaction}>{reactionByKey(r.reaction).emoji}</span>)} {post.reaction_count}
          </span>
        )}
      </div>

      <form className="pd-comment-form" onSubmit={submitComment}>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Add a comment…" rows={1}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(e); } }} />
        <button type="submit" disabled={submitting || !text.trim()}>{submitting ? '…' : 'Post'}</button>
      </form>

      <div className="pd-comments">
        {(comments ?? []).map(c => (
          <div key={c.comment_id} className="pd-comment">
            <Avatar name={c.full_name} src={c.profile_photo_url} size={28} />
            <div className="pd-comment-body-wrap">
              <div className="pd-comment-bubble">
                <div className="pd-comment-author">
                  {c.full_name ?? 'Member'}
                  {c.is_mine && <button type="button" className="pd-comment-del" onClick={() => del(c.comment_id, null)}>Delete</button>}
                </div>
                <div>{c.body}</div>
              </div>
              <div className="pd-comment-meta">
                <span>{relativeTime(c.commented_at)}</span>
                <button type="button" onClick={() => setReplyingTo(replyingTo === c.comment_id ? null : c.comment_id)}>Reply</button>
              </div>
              {(c.replies ?? []).map(r => (
                <div key={r.comment_id} className="pd-reply">
                  <Avatar name={r.full_name} src={r.profile_photo_url} size={22} />
                  <div className="pd-comment-bubble">
                    <div className="pd-comment-author">
                      {r.full_name ?? 'Member'}
                      {r.is_mine && <button type="button" className="pd-comment-del" onClick={() => del(r.comment_id, c.comment_id)}>Delete</button>}
                    </div>
                    <div>{r.body}</div>
                  </div>
                </div>
              ))}
              {replyingTo === c.comment_id && (
                <div className="pd-reply-form">
                  <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Write a reply…"
                         onKeyDown={e => { if (e.key === 'Enter') submitReply(c.comment_id); if (e.key === 'Escape') setReplyingTo(null); }} />
                  <button type="button" onClick={() => submitReply(c.comment_id)}>Post</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {comments && comments.length === 0 && <p className="pd-comments-empty">No comments yet.</p>}
      </div>
    </section>
  );
}
