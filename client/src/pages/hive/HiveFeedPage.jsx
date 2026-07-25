import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import PostCard from '../../components/PostCard.jsx';
import { api } from '../../lib/api.js';

function FeedSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1, 2].map(i => (
        <div key={i} style={{ background: '#fff', border: '1.5px solid #e9dfcf', borderRadius: 12, padding: 20 }}>
          <div style={{ height: 12, width: '40%', background: '#ede7d9', borderRadius: 6, marginBottom: 10 }} />
          <div style={{ height: 12, width: '70%', background: '#ede7d9', borderRadius: 6, marginBottom: 8 }} />
          <div style={{ height: 12, width: '55%', background: '#ede7d9', borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

export default function HiveFeedPage() {
  const { hive, hiveId, isOwner, openPostModal, newPost } = useOutletContext();

  const [posts,   setPosts]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/posts`)
      .then(d => setPosts(d.posts ?? []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [hiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prepend newly created post without refetch
  useEffect(() => {
    if (newPost) setPosts(prev => [newPost, ...prev.filter(p => p.post_id !== newPost.post_id)]);
  }, [newPost]);

  return (
    <div className="hw-feed">
      {isOwner && (
        <button type="button" className="hw-composer-strip" onClick={openPostModal}>
          <span className="hw-composer-placeholder">Post an update as {hive.hive_name}…</span>
          <span className="hw-composer-btn">Post</span>
        </button>
      )}
      {loading ? (
        <FeedSkeleton />
      ) : posts.length === 0 ? (
        <div className="hw-empty-state">
          <div className="hw-empty-title">No posts yet.</div>
          {isOwner && <div className="hw-empty-sub">Share the first update with your Hive.</div>}
        </div>
      ) : (
        <div className="post-feed">
          {posts.map(post => <PostCard key={post.post_id} post={post} />)}
        </div>
      )}
    </div>
  );
}
