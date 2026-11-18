import { useState, useEffect } from 'react';
import PostCard from './PostCard.jsx';
import { api } from '../lib/api.js';
import '../styles/post.css';

// Their personal posts, newest first, paged with "Show more".
export default function PersonalPosts({ userId, firstName, emptyText, title = 'Posts' }) {
  const [posts, setPosts] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPosts(null);
    api.get(`/api/users/${userId}/posts`)
      .then(d => { if (!cancelled) { setPosts(d.posts ?? []); setHasMore(!!d.has_more); } })
      .catch(() => { if (!cancelled) setPosts([]); });
    return () => { cancelled = true; };
  }, [userId]);
  async function more() {
    setLoadingMore(true);
    const d = await api.get(`/api/users/${userId}/posts?offset=${posts.length}`).catch(() => null);
    if (d) { setPosts(prev => [...prev, ...(d.posts ?? [])]); setHasMore(!!d.has_more); }
    setLoadingMore(false);
  }
  return (
    <div className="pf-card mp-posts">
      <div className="pf-card-title">{title}</div>
      {posts === null ? <p className="mp-empty">Loading…</p>
        : posts.length === 0 ? <p className="mp-empty">{emptyText ?? `${firstName} hasn’t posted yet.`}</p>
        : (
          <div className="mp-post-list">
            {posts.map(post => <PostCard key={post.post_id} post={post} variant="light" homeLayout />)}
            {hasMore && <button type="button" className="mp-show-more" disabled={loadingMore} onClick={more}>{loadingMore ? 'Loading…' : 'Show more'}</button>}
          </div>
        )}
    </div>
  );
}
