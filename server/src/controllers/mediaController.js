import crypto from 'crypto';
import { query } from '../db/index.js';
import { requireMembership, requireCanPost } from '../lib/hiveMembership.js';

const PAGE_SIZE = 40;
const URL_RE    = /https?:\/\/[^\s<>"')]+/g;

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return PAGE_SIZE;
  return Math.min(n, PAGE_SIZE);
}

// ── URL validation ─────────────────────────────────────────────────────────────
// Same prefix check as the chat-attachment validator (Prompt 51 /
// messagesController.js _validateAttachment): protocol, host and the
// cloud-name-scoped path all have to match, or the URL isn't ours.
function validateUploadUrl(url) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:')                  throw new Error();
    if (u.hostname !== 'res.cloudinary.com')       throw new Error();
    if (!u.pathname.startsWith(`/${cloudName}/`))  throw new Error();
  } catch {
    return 'Invalid upload URL — must be hosted on your Cloudinary account.';
  }
  return null;
}

function validateLinkUrl(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2000) {
    return 'Enter a link under 2000 characters.';
  }
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
  } catch {
    return 'Enter a valid http or https URL.';
  }
  return null;
}

// ── Shared photo/file counts — the one definition every page reuses ───────────
// Hive Home and About both read this (via getHiveHome's stats), so mediaCount
// can never drift between pages again.
export async function getMediaCounts(hiveId) {
  const { rows: [row] } = await query(
    `SELECT
       (
         (SELECT COUNT(*)::int FROM message_attachments a
            JOIN messages m ON m.message_id = a.message_id
            JOIN hive_channels c ON c.channel_id = m.channel_id
           WHERE m.hive_id = $1 AND m.deleted_at IS NULL AND c.archived_at IS NULL
             AND a.resource_type IN ('image','video'))
         +
         (SELECT COUNT(*)::int FROM hive_uploads u
           WHERE u.hive_id = $1 AND u.deleted_at IS NULL
             AND u.resource_type IN ('image','video'))
         +
         (SELECT COUNT(*)::int FROM hive_posts p
           WHERE p.hive_id = $1 AND p.post_type = 'event' AND p.media_url IS NOT NULL)
       )::int AS photos,
       (
         (SELECT COUNT(*)::int FROM message_attachments a
            JOIN messages m ON m.message_id = a.message_id
            JOIN hive_channels c ON c.channel_id = m.channel_id
           WHERE m.hive_id = $1 AND m.deleted_at IS NULL AND c.archived_at IS NULL
             AND a.resource_type = 'raw')
         +
         (SELECT COUNT(*)::int FROM hive_uploads u
           WHERE u.hive_id = $1 AND u.deleted_at IS NULL AND u.resource_type = 'raw')
       )::int AS files`,
    [hiveId],
  );
  return { photos: row.photos, files: row.files };
}

// ── Links: hive_links rows + URLs extracted from chat text ────────────────────
async function fetchHiveLinks(hiveId) {
  const { rows } = await query(
    `SELECT hl.link_id, hl.url, hl.title, hl.description, hl.added_by, hl.created_at, hl.plan_post_id,
            p.full_name, p.profile_photo_url
       FROM hive_links hl
       LEFT JOIN profiles p ON p.user_id = hl.added_by
      WHERE hl.hive_id = $1 AND hl.deleted_at IS NULL`,
    [hiveId],
  );
  return rows.map(r => ({
    source: 'link', id: r.link_id, url: r.url, resource_type: null,
    file_name: null, mime_type: null, bytes: null, width: null, height: null,
    title: r.title, description: r.description,
    added_by: { user_id: r.added_by, full_name: r.full_name, profile_photo_url: r.profile_photo_url },
    created_at: r.created_at,
    context_link: r.plan_post_id ? `/hive/${hiveId}/events` : null,
  }));
}

// Bounded scan — a conservative https?:// regex over the most recent
// URL-bearing messages. No fetching: previews are title + domain only.
async function extractChatLinks(hiveId) {
  const { rows } = await query(
    `SELECT m.message_id, m.message_text, m.sender_user_id, m.channel_id, m.sent_at,
            p.full_name, p.profile_photo_url
       FROM messages m
       JOIN hive_channels c ON c.channel_id = m.channel_id
       LEFT JOIN profiles p ON p.user_id = m.sender_user_id
      WHERE m.hive_id = $1 AND m.deleted_at IS NULL AND c.archived_at IS NULL
        AND m.message_text ~ 'https?://'
      ORDER BY m.sent_at ASC
      LIMIT 1000`,
    [hiveId],
  );
  const byUrl = new Map(); // rows are ASC, so the first insert is the earliest sharer
  for (const r of rows) {
    const matches = r.message_text.match(URL_RE) ?? [];
    for (const raw of matches) {
      const url = raw.replace(/[.,;:!?)]+$/, '');
      if (byUrl.has(url)) continue;
      byUrl.set(url, {
        source: 'chat', id: r.message_id, url, resource_type: null,
        file_name: null, mime_type: null, bytes: null, width: null, height: null,
        title: null, description: null,
        added_by: { user_id: r.sender_user_id, full_name: r.full_name, profile_photo_url: r.profile_photo_url },
        created_at: r.sent_at,
        context_link: `/hive/${hiveId}/chat/${r.channel_id}`,
      });
    }
  }
  return [...byUrl.values()];
}

// hive_links wins a collision — it carries a real title/description an
// auto-extracted chat mention never has.
async function getLinksItems(hiveId) {
  const [explicit, extracted] = await Promise.all([fetchHiveLinks(hiveId), extractChatLinks(hiveId)]);
  const seen = new Set(explicit.map(l => l.url));
  const merged = [...explicit];
  for (const l of extracted) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    merged.push(l);
  }
  return merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// ── GET /api/hives/:id/media/summary ──────────────────────────────────────────
export const getMediaSummary = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const [counts, links] = await Promise.all([getMediaCounts(hiveId), getLinksItems(hiveId)]);

    const { rows: contribRows } = await query(
      `WITH recent_photos AS (
         SELECT m.sender_user_id AS contributor_id, a.url, a.created_at
           FROM message_attachments a
           JOIN messages m ON m.message_id = a.message_id
           JOIN hive_channels c ON c.channel_id = m.channel_id
          WHERE m.hive_id = $1 AND m.deleted_at IS NULL AND c.archived_at IS NULL
            AND a.resource_type IN ('image','video')
            AND a.created_at >= NOW() - INTERVAL '30 days'
         UNION ALL
         SELECT u.uploaded_by AS contributor_id, u.url, u.created_at
           FROM hive_uploads u
          WHERE u.hive_id = $1 AND u.deleted_at IS NULL
            AND u.resource_type IN ('image','video')
            AND u.created_at >= NOW() - INTERVAL '30 days'
       )
       SELECT rp.contributor_id, p.full_name, p.profile_photo_url,
              COUNT(*)::int AS photo_count,
              MAX(rp.created_at) AS last_at,
              (ARRAY_AGG(rp.url ORDER BY rp.created_at DESC))[1:2] AS recent_thumbs
         FROM recent_photos rp
         LEFT JOIN profiles p ON p.user_id = rp.contributor_id
        GROUP BY rp.contributor_id, p.full_name, p.profile_photo_url
        ORDER BY photo_count DESC, last_at DESC
        LIMIT 5`,
      [hiveId],
    );

    res.json({
      photos: counts.photos,
      files: counts.files,
      links: links.length,
      contributors: contribRows.map(r => ({
        user_id: r.contributor_id,
        full_name: r.full_name,
        profile_photo_url: r.profile_photo_url,
        photo_count: r.photo_count,
        last_at: r.last_at,
        recent_thumbs: r.recent_thumbs ?? [],
      })),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[media/getMediaSummary]', err);
    res.status(500).json({ error: 'Failed to load the media summary.' });
  }
};

// ── GET /api/hives/:id/media?kind=photos|files|links&cursor=…&limit=… ─────────
export const getHiveMedia = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const kind = req.query.kind;
    if (!['photos', 'files', 'links'].includes(kind)) {
      return res.status(400).json({ error: 'kind must be photos, files or links.' });
    }
    const limit  = clampLimit(req.query.limit);
    const cursor = req.query.cursor ? new Date(req.query.cursor) : null;
    if (cursor && isNaN(cursor.getTime())) {
      return res.status(400).json({ error: 'Invalid cursor.' });
    }

    if (kind === 'links') {
      const all      = await getLinksItems(hiveId);
      const filtered = cursor ? all.filter(i => new Date(i.created_at) < cursor) : all;
      const page     = filtered.slice(0, limit);
      const nextCursor = filtered.length > limit ? page[page.length - 1].created_at : null;
      return res.json({ items: page, next_cursor: nextCursor });
    }

    const isPhotos       = kind === 'photos';
    const chatTypeFilter = isPhotos ? `a.resource_type IN ('image','video')` : `a.resource_type = 'raw'`;
    const uploadTypeFilter = isPhotos ? `u.resource_type IN ('image','video')` : `u.resource_type = 'raw'`;

    const params = [hiveId];
    let cursorClause = '';
    if (cursor) {
      params.push(cursor.toISOString());
      cursorClause = `WHERE combined.created_at < $${params.length}`;
    }

    const planBranch = isPhotos ? `
        UNION ALL
        SELECT 'plan'::text AS source, p.media_url AS url, 'image'::text AS resource_type,
               NULL::text AS file_name, NULL::text AS mime_type, NULL::bigint AS bytes,
               NULL::int AS width, NULL::int AS height,
               p.headline AS title, NULL::text AS description,
               p.author_user_id AS added_by_id, p.created_at,
               NULL::uuid AS context_channel_id, p.post_id AS context_plan_id
          FROM hive_posts p
         WHERE p.hive_id = $1 AND p.post_type = 'event' AND p.media_url IS NOT NULL` : '';

    params.push(limit + 1);
    const sql = `
      WITH combined AS (
        SELECT 'chat'::text AS source, a.url, a.resource_type,
               a.file_name, a.mime_type, a.bytes, a.width, a.height,
               NULL::text AS title, NULL::text AS description,
               m.sender_user_id AS added_by_id, a.created_at,
               m.channel_id AS context_channel_id, NULL::uuid AS context_plan_id
          FROM message_attachments a
          JOIN messages m ON m.message_id = a.message_id
          JOIN hive_channels c ON c.channel_id = m.channel_id
         WHERE m.hive_id = $1 AND m.deleted_at IS NULL AND c.archived_at IS NULL AND ${chatTypeFilter}
        UNION ALL
        SELECT 'upload'::text AS source, u.url, u.resource_type,
               u.file_name, u.mime_type, u.bytes, u.width, u.height,
               u.title, u.description,
               u.uploaded_by AS added_by_id, u.created_at,
               NULL::uuid AS context_channel_id, u.plan_post_id AS context_plan_id
          FROM hive_uploads u
         WHERE u.hive_id = $1 AND u.deleted_at IS NULL AND ${uploadTypeFilter}
        ${planBranch}
      )
      SELECT combined.*, p.full_name AS added_by_name, p.profile_photo_url AS added_by_photo
        FROM combined
        LEFT JOIN profiles p ON p.user_id = combined.added_by_id
        ${cursorClause}
       ORDER BY combined.created_at DESC
       LIMIT $${params.length}`;

    const { rows } = await query(sql, params);
    const hasMore = rows.length > limit;
    const page    = rows.slice(0, limit);

    res.json({
      items: page.map(r => ({
        source: r.source, url: r.url, resource_type: r.resource_type,
        file_name: r.file_name, mime_type: r.mime_type, bytes: r.bytes,
        width: r.width, height: r.height, title: r.title, description: r.description,
        added_by: { user_id: r.added_by_id, full_name: r.added_by_name, profile_photo_url: r.added_by_photo },
        created_at: r.created_at,
        context_link: r.context_channel_id ? `/hive/${hiveId}/chat/${r.context_channel_id}`
                    : r.context_plan_id    ? `/hive/${hiveId}/events`
                    : null,
      })),
      next_cursor: hasMore ? page[page.length - 1].created_at : null,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[media/getHiveMedia]', err);
    res.status(500).json({ error: 'Failed to load media.' });
  }
};

// ── Uploads ────────────────────────────────────────────────────────────────────
export const getMediaUploadSignature = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanPost(hiveId, req.userId);

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey    = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(503).json({ error: 'File uploads are not configured yet.' });
    }

    const folder    = `hives/${hiveId}/uploads`;
    const timestamp = Math.round(Date.now() / 1000);
    const paramsStr = `folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto.createHash('sha1').update(paramsStr + apiSecret).digest('hex');

    res.json({ signature, timestamp, api_key: apiKey, cloud_name: cloudName, folder });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[media/getMediaUploadSignature]', err);
    res.status(500).json({ error: 'Failed to generate upload signature.' });
  }
};

export const recordUpload = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanPost(hiveId, req.userId);

    const { url, resource_type, file_name, mime_type, bytes, width, height, title, description, plan_post_id } = req.body ?? {};

    const urlErr = validateUploadUrl(url);
    if (urlErr) return res.status(400).json({ error: urlErr });
    if (!['image', 'video', 'raw'].includes(resource_type)) {
      return res.status(400).json({ error: 'Invalid resource_type.' });
    }

    const t = title == null ? null : (String(title).trim() || null);
    if (t && t.length > 120) return res.status(400).json({ error: 'Title must be 120 characters or fewer.' });
    const d = description == null ? null : (String(description).trim() || null);
    if (d && d.length > 300) return res.status(400).json({ error: 'Description must be 300 characters or fewer.' });

    let planId = null;
    if (plan_post_id) {
      const { rows: [plan] } = await query(
        `SELECT post_id FROM hive_posts WHERE post_id = $1 AND hive_id = $2 AND post_type = 'event'`,
        [plan_post_id, hiveId],
      );
      if (!plan) return res.status(400).json({ error: 'That plan does not belong to this Hive.' });
      planId = plan.post_id;
    }

    const { rows: [row] } = await query(
      `INSERT INTO hive_uploads
         (hive_id, uploaded_by, url, resource_type, file_name, mime_type, bytes, width, height, title, description, plan_post_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING upload_id, url, resource_type, file_name, mime_type, bytes, width, height, title, description, plan_post_id, created_at`,
      [hiveId, req.userId, url, resource_type, file_name ?? null, mime_type ?? null,
        bytes ?? null, width ?? null, height ?? null, t, d, planId],
    );

    res.status(201).json({ upload: row });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[media/recordUpload]', err);
    res.status(500).json({ error: 'Failed to record the upload.' });
  }
};

export const deleteUpload = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await requireMembership(hiveId, req.userId);

    const { rows: [upload] } = await query(
      `SELECT upload_id, uploaded_by FROM hive_uploads
        WHERE upload_id = $1 AND hive_id = $2 AND deleted_at IS NULL`,
      [req.params.uploadId, hiveId],
    );
    if (!upload) return res.status(404).json({ error: 'Upload not found.' });

    const canDelete = upload.uploaded_by === req.userId || member.role === 'owner' || member.role === 'admin';
    if (!canDelete) return res.status(403).json({ error: 'You can only delete your own uploads.' });

    await query(`UPDATE hive_uploads SET deleted_at = NOW() WHERE upload_id = $1`, [upload.upload_id]);
    res.json({ deleted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[media/deleteUpload]', err);
    res.status(500).json({ error: 'Failed to delete the upload.' });
  }
};

// ── Links ──────────────────────────────────────────────────────────────────────
export const addLink = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const { url, title, description, plan_post_id } = req.body ?? {};
    const urlErr = validateLinkUrl(url);
    if (urlErr) return res.status(400).json({ error: urlErr });

    const t = String(title ?? '').trim();
    if (!t || t.length > 120) {
      return res.status(400).json({ error: 'Title is required and must be 120 characters or fewer.' });
    }
    const d = description == null ? null : (String(description).trim() || null);
    if (d && d.length > 300) return res.status(400).json({ error: 'Description must be 300 characters or fewer.' });

    let planId = null;
    if (plan_post_id) {
      const { rows: [plan] } = await query(
        `SELECT post_id FROM hive_posts WHERE post_id = $1 AND hive_id = $2 AND post_type = 'event'`,
        [plan_post_id, hiveId],
      );
      if (!plan) return res.status(400).json({ error: 'That plan does not belong to this Hive.' });
      planId = plan.post_id;
    }

    const { rows: [row] } = await query(
      `INSERT INTO hive_links (hive_id, added_by, url, title, description, plan_post_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING link_id, url, title, description, plan_post_id, created_at`,
      [hiveId, req.userId, url, t, d, planId],
    );

    res.status(201).json({ link: row });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[media/addLink]', err);
    res.status(500).json({ error: 'Failed to add the link.' });
  }
};

export const deleteLink = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await requireMembership(hiveId, req.userId);

    const { rows: [link] } = await query(
      `SELECT link_id, added_by FROM hive_links
        WHERE link_id = $1 AND hive_id = $2 AND deleted_at IS NULL`,
      [req.params.linkId, hiveId],
    );
    if (!link) return res.status(404).json({ error: 'Link not found.' });

    const canDelete = link.added_by === req.userId || member.role === 'owner' || member.role === 'admin';
    if (!canDelete) return res.status(403).json({ error: 'You can only delete links you added.' });

    await query(`UPDATE hive_links SET deleted_at = NOW() WHERE link_id = $1`, [link.link_id]);
    res.json({ deleted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[media/deleteLink]', err);
    res.status(500).json({ error: 'Failed to delete the link.' });
  }
};
