// These clauses only narrow the existing membership/public-follow visibility gate.
export function homeFeedOptions(query = {}) {
  const limit = Math.max(1, Math.min(50, Math.trunc(Number(query.limit)) || 20));
  const offset = Math.min(1000000, Math.max(0, Math.trunc(Number(query.offset)) || 0));
  const filter = query.tab === 'Saved'
    ? `AND EXISTS (SELECT 1 FROM saved_home_posts WHERE post_id=p.post_id AND user_id=$1)`
    : query.tab === 'Following'
    ? `AND EXISTS (SELECT 1 FROM hive_followers WHERE hive_id=h.hive_id AND user_id=$1)`
    : query.tab === 'Nearby'
      ? `AND h.location_type IS DISTINCT FROM 'online'
         AND EXISTS (SELECT 1 FROM profiles viewer WHERE viewer.user_id=$1
           AND NULLIF(TRIM(viewer.location), '') IS NOT NULL
           AND LOWER(TRIM(viewer.location))=LOWER(TRIM(h.location)))`
      : '';
  const order = query.tab === 'Trending'
    ? `(SELECT COUNT(*) FROM post_reactions WHERE post_id=p.post_id) +
       (SELECT COUNT(*) FROM post_comments WHERE post_id=p.post_id) DESC, p.created_at DESC, p.post_id DESC`
    : 'p.created_at DESC, p.post_id DESC';
  return { limit, offset, filter, order };
}
