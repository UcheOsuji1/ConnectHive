import { query } from '../db/index.js';
import { createNotification } from './notificationsController.js';
import { getMembership } from '../lib/hiveMembership.js';
import { excludeSystemClause } from '../lib/systemUser.js';
import { homeFeedOptions } from '../lib/homeFeed.js';

// Post-creation fan-out for Prompt 70 Part B #2: every active member except
// the author, category 'posts' (default on). No groupKey — Hive posts are
// low-volume since only owners/admins can write them, so each gets its own
// row rather than bunching like chat activity does. The system-written types
// (milestone/welcome) never actually reach createPost in practice — they're
// inserted directly by onboardingController.js/hivesController.js — but the
// guard is explicit anyway, matching the prompt's own wording rather than
// relying on that being true incidentally.
async function notifyNewPost(post, authorName, hiveName) {
  if (!['update', 'event'].includes(post.post_type)) return;
  if (post.hidden) return;

  const { rows: members } = await query(
    `SELECT user_id FROM hive_members
      WHERE hive_id = $1 AND membership_status = 'active' AND user_id != $2`,
    [post.hive_id, post.author_user_id],
  );
  const preview = (post.body?.trim() || post.headline).slice(0, 80);
  await Promise.all(members.map(m => createNotification({
    userId: m.user_id,
    type: 'new_post', category: 'posts',
    title: `${authorName} posted in ${hiveName}`,
    body: preview,
    hiveId: post.hive_id,
    actorUserId: post.author_user_id,
    link: `/hive/${post.hive_id}`,
  }).catch(e => console.error('[posts/notifyNewPost]', e))));
}

export const REACTIONS = ['like', 'love', 'haha', 'wow', 'sad', 'wave'];

// ── Shared SELECT (userId always = $1; caller appends WHERE/ORDER/LIMIT) ─────
export const FEED_SELECT = `
  SELECT
    p.post_id, p.hive_id, p.author_user_id, p.post_type, p.visibility,
    CASE WHEN p.hidden_at IS NOT NULL THEN NULL ELSE p.headline   END AS headline,
    CASE WHEN p.hidden_at IS NOT NULL THEN NULL ELSE p.body       END AS body,
    CASE WHEN p.hidden_at IS NOT NULL THEN NULL ELSE p.media_url  END AS media_url,
    p.hidden_reason AS hidden,
    p.event_at, p.event_location, p.created_at,
    EXISTS(SELECT 1 FROM saved_home_posts WHERE post_id=p.post_id AND user_id=$1) AS is_saved,
    h.hive_name, h.creator_user_id, h.banner_url, h.logo_url,
    c.category_name,
    (SELECT COUNT(*) FROM hive_members  WHERE hive_id = h.hive_id AND membership_status = 'active' AND ${excludeSystemClause()})::int AS member_count,
    (SELECT COUNT(*) FROM post_reactions WHERE post_id = p.post_id)::int                                  AS reaction_count,
    (SELECT COUNT(*) FROM post_comments  WHERE post_id = p.post_id)::int                                  AS comment_count,
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
    prof.full_name AS author_name, prof.profile_photo_url AS author_photo,
    prof.headline AS author_headline,
    (au.account_status = 'deleted') AS author_deleted,
    (p.hive_id IS NULL) AS is_personal,
    EXISTS(SELECT 1 FROM user_follows WHERE follower_id = $1 AND followed_id = p.author_user_id)     AS following_author,
    EXISTS(SELECT 1 FROM user_connections
            WHERE user_a = LEAST($1::uuid, p.author_user_id)
              AND user_b = GREATEST($1::uuid, p.author_user_id))                                      AS author_connected
  FROM hive_posts p
  -- LEFT: a personal post (Prompt 87) has no Hive. Every h.* column and the
  -- h.hive_id subqueries above come out NULL / 0 / false for it.
  LEFT JOIN hives h ON h.hive_id = p.hive_id
  LEFT JOIN categories c   ON c.category_id = h.category_id
  LEFT JOIN profiles  prof ON prof.user_id   = p.author_user_id
  LEFT JOIN users      au  ON au.user_id     = p.author_user_id
`;

// Neither the viewer ($1) nor the post's author has blocked the other.
// Applied to every Home feed post (Prompt 87).
const AUTHOR_NOT_BLOCKED = `NOT EXISTS (
  SELECT 1 FROM user_blocks ub
   WHERE (ub.blocker_id = $1 AND ub.blocked_id = p.author_user_id)
      OR (ub.blocker_id = p.author_user_id AND ub.blocked_id = $1))`;

const PERSONAL_BODY_MAX = 3000;

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

// ── Access helpers ────────────────────────────────────────────────────────────

// Returns { hive_id, visibility, author_user_id, author_status } for a post, or null.
async function _getPostInfo(postId) {
  const { rows: [row] } = await query(
    `SELECT hp.hive_id, hp.visibility, hp.author_user_id, u.account_status AS author_status
       FROM hive_posts hp LEFT JOIN users u ON u.user_id = hp.author_user_id
      WHERE hp.post_id = $1`,
    [postId],
  );
  return row ?? null;
}

// Returns { hive_id, post_id, visibility, author_user_id, author_status }
// resolved from a comment (the post's author, not the comment's), or null.
async function _getCommentInfo(commentId) {
  const { rows: [row] } = await query(
    `SELECT hp.hive_id, pc.post_id, hp.visibility, hp.author_user_id, u.account_status AS author_status
     FROM post_comments pc
     JOIN hive_posts hp ON hp.post_id = pc.post_id
     LEFT JOIN users u ON u.user_id = hp.author_user_id
     WHERE pc.comment_id = $1`,
    [commentId],
  );
  return row ?? null;
}

// Personal posts (Prompt 87): any signed-in member who isn't blocked either
// way with the author, while the author's account is active. Unlike a Hive
// post, a deleted (or suspended) author's personal post is gone (404): their
// profile 404s too, and the post is about them, not a Hive conversation.
async function _assertCanReadPersonal(postInfo, userId, res) {
  if (postInfo.author_user_id === userId) return true;
  if (postInfo.author_status !== 'active') {
    res.status(404).json({ error: 'Not found.' });
    return false;
  }
  const { rows: [b] } = await query(
    `SELECT EXISTS (SELECT 1 FROM user_blocks
                     WHERE (blocker_id = $1 AND blocked_id = $2)
                        OR (blocker_id = $2 AND blocked_id = $1)) AS blocked`,
    [userId, postInfo.author_user_id],
  );
  if (b.blocked) {
    res.status(404).json({ error: 'Not found.' });
    return false;
  }
  return true;
}

// Read gate: member OR (follower + visibility = 'public'); for a personal
// post, _assertCanReadPersonal. Sends 404/403 and returns false when denied.
async function _assertCanRead(postInfo, userId, res) {
  if (!postInfo) {
    res.status(404).json({ error: 'Not found.' });
    return false;
  }
  if (!postInfo.hive_id) return _assertCanReadPersonal(postInfo, userId, res);
  const { hive_id, visibility } = postInfo;
  const { rows: [row] } = await query(
    `SELECT
       EXISTS(SELECT 1 FROM hive_members   WHERE hive_id=$1 AND user_id=$2 AND membership_status='active') AS is_member,
       EXISTS(SELECT 1 FROM hive_followers WHERE hive_id=$1 AND user_id=$2) AS is_following`,
    [hive_id, userId],
  );
  if (row.is_member) return true;
  if (row.is_following && visibility === 'public') return true;
  res.status(403).json({ error: 'You must be a member of this Hive.' });
  return false;
}

// Write gate: member only, regardless of post visibility.
// Sends 404/403 and returns false when access is denied.
async function _assertMemberForHive(hiveId, userId, res) {
  if (!hiveId) {
    res.status(404).json({ error: 'Not found.' });
    return false;
  }
  const member = await getMembership(hiveId, userId);
  if (!member) {
    res.status(403).json({ error: 'You must be a member of this Hive.' });
    return false;
  }
  return true;
}

// Reactions and comments: on a personal post anyone who can read it may
// interact; on a Hive post it stays member-only, exactly as before.
async function _assertCanInteract(postInfo, userId, res) {
  if (postInfo && !postInfo.hive_id) return _assertCanReadPersonal(postInfo, userId, res);
  return _assertMemberForHive(postInfo?.hive_id, userId, res);
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
       pc.post_id, pc.comment_id,
       CASE WHEN pc.hidden_at IS NOT NULL THEN NULL ELSE pc.body END AS body,
       pc.hidden_reason AS hidden,
       pc.commented_at,
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
// Personal post (Prompt 87): no Hive, body required (1-3000), optional photo,
// no events, no visibility choice. No notifyNewPost: the feed is the signal.
async function createPersonalPost(req, res) {
  const { body, mediaUrl, postType } = req.body;
  if (postType === 'event') return res.status(400).json({ error: 'Events belong to a Hive.' });
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return res.status(400).json({ error: 'Write something to post.' });
  if (text.length > PERSONAL_BODY_MAX) {
    return res.status(400).json({ error: `Posts can be up to ${PERSONAL_BODY_MAX} characters.` });
  }
  // A photo must be one this person uploaded via /api/users/me/upload-signature:
  // our Cloudinary account, image delivery, their own posts/{userId} folder.
  let media = null;
  if (typeof mediaUrl === 'string' && mediaUrl.trim()) {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    try {
      const u = new URL(mediaUrl.trim());
      if (!cloud || u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com'
          || !u.pathname.startsWith(`/${cloud}/image/upload/`) || !u.pathname.includes(`/posts/${req.userId}/`)) throw new Error();
      media = u.toString();
    } catch {
      return res.status(400).json({ error: 'Invalid photo.' });
    }
  }
  const { rows: [inserted] } = await query(
    `INSERT INTO hive_posts (hive_id, author_user_id, post_type, headline, body, media_url, visibility)
     VALUES (NULL, $1, 'update', '', $2, $3, 'personal')
     RETURNING post_id`,
    [req.userId, text, media],
  );
  const { rows: [post] } = await query(`${FEED_SELECT} WHERE p.post_id = $2`, [req.userId, inserted.post_id]);
  return res.status(201).json({ post: { ...post, top_comment: null } });
}

export const createPost = async (req, res) => {
  try {
    const { hiveId, headline, body, mediaUrl, postType, eventAt, eventLocation, visibility } = req.body;
    if (!hiveId) return await createPersonalPost(req, res);
    if (!headline?.trim()) {
      return res.status(400).json({ error: 'Headline and hiveId are required.' });
    }
    const { rows: [member] } = await query(
      `SELECT role FROM hive_members WHERE hive_id=$1 AND user_id=$2 AND membership_status='active'`,
      [hiveId, req.userId],
    );
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only Hive owners and admins can post.' });
    }
    // Only owners/admins may set 'public'; any other value (or role) silently defaults to 'hive'.
    const safeVisibility = (visibility === 'public' && ['owner', 'admin'].includes(member.role))
      ? 'public'
      : 'hive';
    const { rows: [inserted] } = await query(
      `INSERT INTO hive_posts
         (hive_id, author_user_id, post_type, headline, body, media_url, event_at, event_location, visibility)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING post_id`,
      [
        hiveId, req.userId,
        postType || 'update',
        headline.trim(),
        body?.trim()          || null,
        mediaUrl?.trim()      || null,
        eventAt               || null,
        eventLocation?.trim() || null,
        safeVisibility,
      ],
    );
    const { rows: [post] } = await query(
      `${FEED_SELECT} WHERE p.post_id = $2`,
      [req.userId, inserted.post_id],
    );
    res.status(201).json({ post });
    notifyNewPost(post, post.author_name ?? 'Someone', post.hive_name)
      .catch(e => console.error('[posts/createPost] notify failed', e));
  } catch (err) {
    console.error('[posts/createPost]', err);
    res.status(500).json({ error: 'Failed to create post.' });
  }
};

// ── getFeed ───────────────────────────────────────────────────────────────────
// Members see all posts from their Hives.
// Followers see only public posts from Hives they follow (but are not members of).
// Personal posts (Prompt 87): your own and those of people you follow
// (personalScope, per tab). No post from someone blocked either way, Hive
// posts included; Hive posts from blocked authors were not excluded before.
export const getFeed = async (req, res) => {
  try {
    const { limit, offset, filter, order, personalScope } = homeFeedOptions(req.query);
    const { rows: posts } = await query(
      `${FEED_SELECT}
       WHERE (
         (p.hive_id IS NOT NULL AND (
           EXISTS(SELECT 1 FROM hive_members WHERE hive_id = h.hive_id AND user_id = $1 AND membership_status = 'active')
           OR (
             EXISTS(SELECT 1 FROM hive_followers WHERE hive_id = h.hive_id AND user_id = $1)
             AND p.visibility = 'public'
           )
         ))
         OR (p.hive_id IS NULL AND ${personalScope}
             AND (p.author_user_id = $1 OR au.account_status = 'active'))
       )
       AND ${AUTHOR_NOT_BLOCKED}
       ${filter}
       ORDER BY ${order}
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
    const hiveId = req.params.id;
    // Same read gate as a single post (_assertCanRead): member sees
    // everything, a follower who isn't a member sees public posts only.
    // This was previously _assertMemberForHive (member-only, no follower
    // exception), which meant a follower got zero posts here even though
    // getPost already honored public visibility for them on the single-post
    // route — this list route is what the Hive's Posts tab actually uses.
    const { rows: [access] } = await query(
      `SELECT
         EXISTS(SELECT 1 FROM hive_members   WHERE hive_id=$1 AND user_id=$2 AND membership_status='active') AS is_member,
         EXISTS(SELECT 1 FROM hive_followers WHERE hive_id=$1 AND user_id=$2) AS is_following`,
      [hiveId, req.userId],
    );
    if (!access.is_member && !access.is_following) {
      return res.status(403).json({ error: 'You must be a member of this Hive.' });
    }
    const visibilityClause = access.is_member ? '' : `AND p.visibility = 'public'`;

    const limit  = Math.min(Number(req.query.limit)  || 20, 50);
    const offset = Number(req.query.offset) || 0;
    const { rows: posts } = await query(
      `${FEED_SELECT}
       WHERE p.hive_id = $2 ${visibilityClause}
       ORDER BY p.created_at DESC
       LIMIT $3 OFFSET $4`,
      [req.userId, hiveId, limit, offset],
    );
    res.json({ posts: await attachTopComments(posts) });
  } catch (err) {
    console.error('[posts/getHivePosts]', err);
    res.status(500).json({ error: 'Failed to fetch Hive posts.' });
  }
};

// ── getUserPosts ──────────────────────────────────────────────────────────────
// GET /api/users/:id/posts: that person's personal posts, newest first, 20 a
// page. 403 across a block; :id may be the viewer's own id (for /profile).
const USER_POSTS_PAGE = 20;
export const getUserPosts = async (req, res) => {
  try {
    const targetId = req.params.id;
    const offset = Math.min(100000, Math.max(0, Math.trunc(Number(req.query.offset)) || 0));
    if (targetId !== req.userId) {
      const { rows: [t] } = await query(
        `SELECT u.account_status,
                EXISTS (SELECT 1 FROM user_blocks
                         WHERE (blocker_id = $1 AND blocked_id = $2)
                            OR (blocker_id = $2 AND blocked_id = $1)) AS blocked
           FROM users u WHERE u.user_id = $2`,
        [req.userId, targetId],
      );
      if (!t || t.account_status !== 'active') return res.status(404).json({ error: 'Member not found.' });
      if (t.blocked) return res.status(403).json({ error: 'Not available.' });
    }
    const { rows } = await query(
      `${FEED_SELECT}
       WHERE p.hive_id IS NULL AND p.author_user_id = $2
       ORDER BY p.created_at DESC, p.post_id DESC
       LIMIT ${USER_POSTS_PAGE + 1} OFFSET $3`,
      [req.userId, targetId, offset],
    );
    const posts = await attachTopComments(rows.slice(0, USER_POSTS_PAGE));
    res.json({ posts, has_more: rows.length > USER_POSTS_PAGE });
  } catch (err) {
    console.error('[posts/getUserPosts]', err);
    res.status(500).json({ error: 'Failed to load posts.' });
  }
};

// ── getPost ───────────────────────────────────────────────────────────────────
export const getPost = async (req, res) => {
  try {
    const postInfo = await _getPostInfo(req.params.id);
    if (!await _assertCanRead(postInfo, req.userId, res)) return;
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
      'SELECT hive_id, author_user_id FROM hive_posts WHERE post_id=$1', [req.params.id],
    );
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    // Personal post: only its author, no Hive involved.
    if (post.hive_id && !await _assertMemberForHive(post.hive_id, req.userId, res)) return;
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

export const savePost = async (req, res) => {
  try {
    if (!await _assertCanRead(await _getPostInfo(req.params.id), req.userId, res)) return;
    if (typeof req.body.saved !== 'boolean') return res.status(400).json({ error: 'saved must be a boolean.' });
    if (req.body.saved) await query('INSERT INTO saved_home_posts(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.userId,req.params.id]);
    else await query('DELETE FROM saved_home_posts WHERE user_id=$1 AND post_id=$2', [req.userId,req.params.id]);
    res.json({ saved: req.body.saved });
  } catch { res.status(500).json({ error: 'Could not save this post.' }); }
};

export const editPost = async (req, res) => {
  try {
    const { rows: [post] } = await query('SELECT hive_id,author_user_id FROM hive_posts WHERE post_id=$1',[req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    if (!post.hive_id) {
      // Personal post: author only, body only (1-3000), headline stays ''.
      if (post.author_user_id !== req.userId) return res.status(403).json({ error: 'Not authorised.' });
      const text = typeof req.body.body === 'string' ? req.body.body.trim() : '';
      if (!text || text.length > PERSONAL_BODY_MAX) return res.status(400).json({ error: `Write up to ${PERSONAL_BODY_MAX} characters.` });
      await query('UPDATE hive_posts SET body=$1, updated_at=NOW() WHERE post_id=$2', [text, req.params.id]);
      return res.json({ headline: '', body: text });
    }
    if (!await _assertMemberForHive(post.hive_id, req.userId, res)) return;
    if (post.author_user_id !== req.userId) return res.status(403).json({ error: 'Not authorised.' });
    const { headline, body } = req.body;
    if (typeof headline !== 'string' || !headline.trim() || headline.length > 120 || (body != null && (typeof body !== 'string' || body.length > 10000))) return res.status(400).json({ error: 'Enter a headline up to 120 characters and details up to 10,000 characters.' });
    await query('UPDATE hive_posts SET headline=$1,body=$2 WHERE post_id=$3', [headline.trim(),body?.trim() || null,req.params.id]);
    res.json({ headline: headline.trim(), body: body?.trim() || null });
  } catch { res.status(500).json({ error: 'Could not edit this post.' }); }
};

// ── toggleReaction ────────────────────────────────────────────────────────────
export const toggleReaction = async (req, res) => {
  try {
    const postId   = req.params.id;
    const postInfo = await _getPostInfo(postId);
    if (!await _assertCanInteract(postInfo, req.userId, res)) return;
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
      'SELECT COUNT(*)::int FROM post_reactions WHERE post_id=$1', [postId],
    );
    const reaction_summary = await fetchReactionSummary(postId);
    const reaction_count = count;

    // Aggregated "welcomed" notification for wave reactions on welcome posts
    if (reacted) {
      try {
        const { rows: [postMeta] } = await query(
          `SELECT hp.post_type, hp.author_user_id, hp.hive_id, h.hive_name
           FROM hive_posts hp JOIN hives h ON h.hive_id = hp.hive_id
           WHERE hp.post_id = $1`,
          [postId],
        );
        if (postMeta?.post_type === 'welcome' && postMeta.author_user_id !== req.userId) {
          const { rows: [existing] } = await query(
            `SELECT notification_id FROM notifications
             WHERE user_id = $1 AND type = 'welcomed' AND hive_id = $2`,
            [postMeta.author_user_id, postMeta.hive_id],
          );
          const n = reaction_count;
          const title = `${n} member${n !== 1 ? 's' : ''} welcomed you to ${postMeta.hive_name}`;
          if (existing) {
            await query(
              `UPDATE notifications SET title = $1, read = false, created_at = NOW()
               WHERE notification_id = $2`,
              [title, existing.notification_id],
            );
          } else {
            await createNotification({
              userId:      postMeta.author_user_id,
              type:        'welcomed', category: 'new_members',
              title,
              body:        'Open the Hive to see who greeted you.',
              hiveId:      postMeta.hive_id,
              actorUserId: req.userId,
              link:        `/hive/${postMeta.hive_id}`,
            });
          }
        }
      } catch (notifErr) {
        console.error('[posts/toggleReaction] welcome notification failed (non-fatal):', notifErr);
      }
    }

    res.json({ reacted, reaction, reaction_count, reaction_summary });
  } catch (err) {
    console.error('[posts/toggleReaction]', err);
    res.status(500).json({ error: 'Failed to toggle reaction.' });
  }
};

// ── getReactors ───────────────────────────────────────────────────────────────
export const getReactors = async (req, res) => {
  try {
    const postInfo = await _getPostInfo(req.params.id);
    if (!await _assertCanRead(postInfo, req.userId, res)) return;
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
    const postInfo = await _getPostInfo(req.params.id);
    if (!await _assertCanInteract(postInfo, req.userId, res)) return;
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
    const postInfo = await _getPostInfo(req.params.id);
    if (!await _assertCanRead(postInfo, req.userId, res)) return;
    const { rows } = await query(
      `SELECT pc.comment_id, pc.post_id, pc.user_id, pc.parent_comment_id, pc.commented_at,
              CASE WHEN pc.hidden_at IS NOT NULL THEN NULL ELSE pc.body END AS body,
              pc.hidden_reason AS hidden,
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
    const commentInfo = await _getCommentInfo(req.params.commentId);
    if (!await _assertCanInteract(commentInfo, req.userId, res)) return;
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

// ── updatePostVisibility ──────────────────────────────────────────────────────
// PATCH /api/posts/:id/visibility
// Rules:
//   - Must be a Hive member with role owner or admin
//   - Narrowing (public → hive) is allowed
//   - Widening (hive → public) is rejected — retroactively exposes existing comments
export const updatePostVisibility = async (req, res) => {
  try {
    const { visibility } = req.body;
    if (!['hive', 'public'].includes(visibility)) {
      return res.status(400).json({ error: 'visibility must be "hive" or "public".' });
    }

    const { rows: [post] } = await query(
      'SELECT hive_id, visibility FROM hive_posts WHERE post_id=$1',
      [req.params.id],
    );
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    if (!post.hive_id) return res.status(400).json({ error: 'Personal posts have no visibility setting.' });

    const member = await getMembership(post.hive_id, req.userId);
    if (!member) {
      return res.status(403).json({ error: 'You must be a member of this Hive.' });
    }
    if (!['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only Hive owners and admins can change post visibility.' });
    }

    // Widening is permanently blocked — comments were written under a privacy expectation.
    if (post.visibility === 'hive' && visibility === 'public') {
      return res.status(400).json({
        error: 'Post visibility cannot be widened after posting. Existing comments were written under an expectation of privacy.',
      });
    }

    await query('UPDATE hive_posts SET visibility=$1 WHERE post_id=$2', [visibility, req.params.id]);
    res.json({ visibility });
  } catch (err) {
    console.error('[posts/updatePostVisibility]', err);
    res.status(500).json({ error: 'Failed to update post visibility.' });
  }
};
