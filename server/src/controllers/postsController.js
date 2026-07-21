import { query } from '../db/index.js';

export const REACTIONS = ['like', 'love', 'haha', 'wow', 'sad'];

// ── Shared SELECT (userId always = $1; caller appends WHERE/ORDER/LIMIT) ─────
const FEED_SELECT = `
  SELECT
    p.post_id, p.hive_id, p.author_user_id, p.post_type,
    p.headline, p.body, p.media_url, p.event_at, p.event_location, p.created_at,
    h.hive_name, h.creator_user_id,
    c.category_name,
    (SELECT COUNT(*) FROM hive_members  WHERE hive_id = h.hive_id AND membership_status = 'active') AS member_count,
    (SELECT COUNT(*) FROM post_reactions WHERE post_id = p.post_id)                                  AS reaction_count,
    (SELECT COUNT(*) FROM post_comments  WHERE post_id = p.post_id)                                  AS comment_count,
    EXISTS(SELECT 1 FROM post_reactions WHERE post_id = p.post_id AND user_id = $1)                  AS reacted,
    (SELECT reaction FROM post_reactions WHERE post_id = p.post_id AND user_id = $1)                 AS my_reaction,
    (SELECT json_agg(x) FROM (
      SELECT reaction, COUNT(*)::int AS count
      FROM post_reactions WHERE post_id = p.post_id
      GROUP BY reaction ORDER BY count DESC
    ) x)                                                                                              AS reaction_summary,
    EXISTS(SELECT 1 FROM hive_followers WHERE hive_id = h.hive_id AND user_id = $1)                  AS is_following,
    EXISTS(SELECT 1 FROM hive_members   WHERE hive_id = h.hive_id AND user_id = $1
           AND membership_status = 'active')                                                          AS is_member,
    prof.full_name AS author_name, prof.profile_photo_url AS author_photo
  FROM hive_posts p
  JOIN hives h ON h.hive_id = p.hive_id
  LEFT JOIN categories c   ON c.category_id = h.category_id
  LEFT JOIN profiles  prof ON prof.user_id   = p.author_user_id
`;

// ── Nest flat comment rows into a top-level → replies tree (one level deep) ──
function nestComments(rows) {
  const map = {};
  const roots = [];
  for (const c of rows) map[c.comment_id] = { ...c, replies: [] };
  for (const c of rows) {
    if (!c.parent_comment_id) {
      roots.push(map[c.comment_id]);
    } else {
      // Walk up to the top-level ancestor so deep replies flatten to one level
      let pid = c.parent_comment_id;
      while (map[pid]?.parent_comment_id) pid = map[pid].parent_comment_id;
      if (map[pid]) map[pid].replies.push(map[c.comment_id]);
      else roots.push(map[c.comment_id]);
    }
  }
  return roots;
}

// ── Reaction summary helper ───────────────────────────────────────────────────
async function fetchReactionSummary(postId) {
  const { rows } = await query(
    `SELECT reaction, COUNT(*)::int AS count
     FROM post_reactions WHERE post_id = $1
     GROUP BY reaction ORDER BY count DESC`,
    [postId],
  );
  return rows;
}

// ── Attach most-recent TOP-LEVEL comment per post ────────────────────────────
async function attachTopComments(posts) {
  if (!posts.length) return posts;
  const ids = posts.map(p => p.post_id);
  const { rows } = await query(
    `SELECT DISTINCT ON (pc.post_id)
       pc.post_id, pc.comment_id, pc.body, pc.commented_at,
       prof.full_name, prof.profile_photo_url
     FROM post_comments pc
     LEFT JOIN profiles prof ON prof.user_id = pc.user_id
     WHERE pc.post_id = ANY($1) AND pc.parent_comment_id IS NULL
     ORDER BY pc.post_id, pc.commented_at DESC`,
    [ids],
  );
  const map = Object.fromEntries(rows.map(c => [c.post_id, c]));
  return posts.map(p => ({ ...p, top_comment: map[p.post_id] ?? null }));
}

// ── createPost ────────────────────────────────────────────────────────────────
export const createPost = async (req, res) => {
  try {
    const { hiveId, headline, body, mediaUrl, postType, eventAt, eventLocation } = req.body;
    if (!headline?.trim() || !hiveId) {
      return res.status(400).json({ error: 'Headline and hiveId are required.' });
    }
    const { rows: [member] } = await query(
      `SELECT role FROM hive_members WHERE hive_id=$1 AND user_id=$2 AND membership_status='active'`,
      [hiveId, req.userId],
    );
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only Hive owners and admins can post.' });
    }
    const { rows: [inserted] } = await query(
      `INSERT INTO hive_posts
         (hive_id, author_user_id, post_type, headline, body, media_url, event_at, event_location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING post_id`,
      [
        hiveId, req.userId,
        postType || 'update',
        headline.trim(),
        body?.trim()          || null,
        mediaUrl?.trim()      || null,
        eventAt               || null,
        eventLocation?.trim() || null,
      ],
    );
    const { rows: [post] } = await query(
      `${FEED_SELECT} WHERE p.post_id = $2`,
      [req.userId, inserted.post_id],
    );
    res.status(201).json({ post });
  } catch (err) {
    console.error('[posts/createPost]', err);
    res.status(500).json({ error: 'Failed to create post.' });
  }
};

// ── getFeed ───────────────────────────────────────────────────────────────────
export const getFeed = async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit)  || 20, 50);
    const offset = Number(req.query.offset) || 0;
    const { rows: posts } = await query(
      `${FEED_SELECT}
       WHERE (
         EXISTS(SELECT 1 FROM hive_followers WHERE hive_id = h.hive_id AND user_id = $1)
         OR
         EXISTS(SELECT 1 FROM hive_members   WHERE hive_id = h.hive_id AND user_id = $1 AND membership_status = 'active')
       )
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset],
    );
    res.json({ posts: await attachTopComments(posts) });
  } catch (err) {
    console.error('[posts/getFeed]', err);
    res.status(500).json({ error: 'Failed to fetch feed.' });
  }
};

// ── getHivePosts ──────────────────────────────────────────────────────────────
export const getHivePosts = async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit)  || 20, 50);
    const offset = Number(req.query.offset) || 0;
    const { rows: posts } = await query(
      `${FEED_SELECT}
       WHERE p.hive_id = $2
       ORDER BY p.created_at DESC
       LIMIT $3 OFFSET $4`,
      [req.userId, req.params.id, limit, offset],
    );
    res.json({ posts: await attachTopComments(posts) });
  } catch (err) {
    console.error('[posts/getHivePosts]', err);
    res.status(500).json({ error: 'Failed to fetch Hive posts.' });
  }
};

// ── getPost ───────────────────────────────────────────────────────────────────
export const getPost = async (req, res) => {
  try {
    const { rows: [post] } = await query(
      `${FEED_SELECT} WHERE p.post_id = $2`,
      [req.userId, req.params.id],
    );
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    const [withComment] = await attachTopComments([post]);
    res.json({ post: withComment });
  } catch (err) {
    console.error('[posts/getPost]', err);
    res.status(500).json({ error: 'Failed to fetch post.' });
  }
};

// ── deletePost ────────────────────────────────────────────────────────────────
export const deletePost = async (req, res) => {
  try {
    const { rows: [post] } = await query(
      'SELECT author_user_id FROM hive_posts WHERE post_id=$1', [req.params.id],
    );
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    if (post.author_user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorised.' });
    }
    await query('DELETE FROM hive_posts WHERE post_id=$1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('[posts/deletePost]', err);
    res.status(500).json({ error: 'Failed to delete post.' });
  }
};

// ── toggleReaction ────────────────────────────────────────────────────────────
export const toggleReaction = async (req, res) => {
  try {
    const postId   = req.params.id;
    const reaction = REACTIONS.includes(req.body.reaction) ? req.body.reaction : 'like';

    const { rows: [existing] } = await query(
      'SELECT reaction_id, reaction FROM post_reactions WHERE post_id=$1 AND user_id=$2',
      [postId, req.userId],
    );

    let reacted;
    if (!existing) {
      await query(
        'INSERT INTO post_reactions (post_id, user_id, reaction) VALUES ($1,$2,$3)',
        [postId, req.userId, reaction],
      );
      reacted = true;
    } else if (existing.reaction === reaction) {
      await query('DELETE FROM post_reactions WHERE post_id=$1 AND user_id=$2', [postId, req.userId]);
      reacted = false;
    } else {
      await query(
        'UPDATE post_reactions SET reaction=$3, reacted_at=NOW() WHERE post_id=$1 AND user_id=$2',
        [postId, req.userId, reaction],
      );
      reacted = true;
    }

    const { rows: [{ count }] } = await query(
      'SELECT COUNT(*) FROM post_reactions WHERE post_id=$1', [postId],
    );
    const reaction_summary = await fetchReactionSummary(postId);

    res.json({ reacted, reaction, reaction_count: Number(count), reaction_summary });
  } catch (err) {
    console.error('[posts/toggleReaction]', err);
    res.status(500).json({ error: 'Failed to toggle reaction.' });
  }
};

// ── getReactors ───────────────────────────────────────────────────────────────
export const getReactors = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.user_id, p.full_name, p.profile_photo_url, pr.reaction
       FROM post_reactions pr
       JOIN  users    u ON u.user_id  = pr.user_id
       LEFT JOIN profiles p ON p.user_id = pr.user_id
       WHERE pr.post_id = $1
       ORDER BY pr.reacted_at ASC`,
      [req.params.id],
    );
    res.json({ reactors: rows });
  } catch (err) {
    console.error('[posts/getReactors]', err);
    res.status(500).json({ error: 'Failed to fetch reactors.' });
  }
};

// ── addComment ────────────────────────────────────────────────────────────────
export const addComment = async (req, res) => {
  try {
    const { body, parentCommentId } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Comment body is required.' });

    if (parentCommentId) {
      const { rows: [parent] } = await query(
        'SELECT comment_id FROM post_comments WHERE comment_id=$1 AND post_id=$2',
        [parentCommentId, req.params.id],
      );
      if (!parent) return res.status(400).json({ error: 'Parent comment not found for this post.' });
    }

    const { rows: [comment] } = await query(
      `INSERT INTO post_comments (post_id, user_id, parent_comment_id, body)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.userId, parentCommentId ?? null, body.trim()],
    );
    const { rows: [profile] } = await query(
      'SELECT full_name, profile_photo_url FROM profiles WHERE user_id=$1 LIMIT 1',
      [req.userId],
    );
    res.status(201).json({
      comment: {
        ...comment,
        full_name:         profile?.full_name         ?? null,
        profile_photo_url: profile?.profile_photo_url ?? null,
        is_mine:           true,
        replies:           [],
      },
    });
  } catch (err) {
    console.error('[posts/addComment]', err);
    res.status(500).json({ error: 'Failed to add comment.' });
  }
};

// ── getComments ───────────────────────────────────────────────────────────────
export const getComments = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT pc.*,
              prof.full_name, prof.profile_photo_url,
              (pc.user_id = $2) AS is_mine
       FROM post_comments pc
       LEFT JOIN profiles prof ON prof.user_id = pc.user_id
       WHERE pc.post_id = $1
       ORDER BY pc.commented_at ASC`,
      [req.params.id, req.userId],
    );
    res.json({ comments: nestComments(rows) });
  } catch (err) {
    console.error('[posts/getComments]', err);
    res.status(500).json({ error: 'Failed to fetch comments.' });
  }
};

// ── deleteComment ─────────────────────────────────────────────────────────────
export const deleteComment = async (req, res) => {
  try {
    const { rows: [comment] } = await query(
      'SELECT user_id FROM post_comments WHERE comment_id=$1',
      [req.params.commentId],
    );
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });
    if (comment.user_id !== req.userId) return res.status(403).json({ error: 'Not authorised.' });
    await query('DELETE FROM post_comments WHERE comment_id=$1', [req.params.commentId]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('[posts/deleteComment]', err);
    res.status(500).json({ error: 'Failed to delete comment.' });
  }
};
