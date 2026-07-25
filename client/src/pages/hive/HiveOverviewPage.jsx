import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import HiveOverview from '../../components/HiveOverview.jsx';
import { api } from '../../lib/api.js';

export default function HiveOverviewPage() {
  const { hive, hiveId, isOwner, setRequestCount, refreshHive } = useOutletContext();
  const navigate = useNavigate();

  const [posts,        setPosts]        = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/hives/${hiveId}/posts`)
      .then(d => setPosts(d.posts ?? []))
      .catch(() => setPosts([]))
      .finally(() => setPostsLoading(false));
  }, [hiveId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <HiveOverview
      hiveId={hiveId}
      hive={hive}
      isOwner={isOwner}
      posts={posts}
      postsLoading={postsLoading}
      onRequestCount={setRequestCount}
      onSaved={refreshHive}
      onNavigate={(view) => navigate(`/hive/${hiveId}/${view}`)}
    />
  );
}
