// These clauses only narrow the existing membership/public-follow visibility gate.
//
// personalScope (Prompt 87) decides which personal posts (hive_id IS NULL) a
// tab may include, before `filter` narrows further:
//   For You / Trending — your own and people you follow
//   Following          — people you follow (filter drops your own)
//   Nearby             — none (filter requires a Hive; there's no location)
//   Saved              — any you saved and can still read (the feed's block
//                        and active-author checks still apply)
const FOLLOWS_AUTHOR = `EXISTS (SELECT 1 FROM user_follows WHERE follower_id=$1 AND followed_id=p.author_user_id)`;

export function homeFeedOptions(query = {}) {
  const limit = Math.max(1, Math.min(50, Math.trunc(Number(query.limit)) || 20));
  const offset = Math.min(1000000, Math.max(0, Math.trunc(Number(query.offset)) || 0));
  const filter = query.tab === 'Saved'
    ? `AND EXISTS (SELECT 1 FROM saved_home_posts WHERE post_id=p.post_id AND user_id=$1)`
    : query.tab === 'Following'
    ? `AND ((p.hive_id IS NOT NULL AND EXISTS (SELECT 1 FROM hive_followers WHERE hive_id=h.hive_id AND user_id=$1))
         OR (p.hive_id IS NULL AND ${FOLLOWS_AUTHOR}))`
    : query.tab === 'Nearby'
      ? `AND p.hive_id IS NOT NULL
         AND h.location_type IS DISTINCT FROM 'online'
         AND EXISTS (SELECT 1 FROM profiles viewer WHERE viewer.user_id=$1
           AND NULLIF(TRIM(viewer.location), '') IS NOT NULL
           AND LOWER(TRIM(viewer.location))=LOWER(TRIM(h.location)))`
      : '';
  const personalScope = query.tab === 'Saved'
    ? 'TRUE'
    : `(p.author_user_id=$1 OR ${FOLLOWS_AUTHOR})`;
  const order = query.tab === 'Trending'
    ? `(SELECT COUNT(*) FROM post_reactions WHERE post_id=p.post_id) +
       (SELECT COUNT(*) FROM post_comments WHERE post_id=p.post_id) DESC, p.created_at DESC, p.post_id DESC`
    : 'p.created_at DESC, p.post_id DESC';
  return { limit, offset, filter, order, personalScope };
}
