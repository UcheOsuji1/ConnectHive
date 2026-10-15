import { query } from '../db/index.js';
import { CONTENT_TABLE, hiveNameFor } from './reportsController.js';
import { createNotification } from './notificationsController.js';
import { invalidateTokenVersion } from '../middleware/auth.js';
import { disconnectUserSockets } from '../realtime/socket.js';
import { REASON_LABELS } from '../lib/email.js';
import { listMetros } from '../lib/metros.js';

const PRIORITY_REASONS = new Set(['safety', 'fake_or_minor']);

// Signs a user out everywhere — bumps token_version (so every existing JWT
// fails requireAuth's version check), clears the in-memory cache that would
// otherwise shelter an old token for up to 30s, and force-closes any open
// sockets. Same three steps authController.js's logout/password-reset paths
// already use.
async function suspendUser(userId, note) {
  await query(
    `UPDATE users SET account_status = 'suspended', suspended_at = NOW(), suspension_note = $2,
            token_version = token_version + 1
      WHERE user_id = $1`,
    [userId, note ?? null],
  );
  invalidateTokenVersion(userId);
  disconnectUserSockets(userId);
}

function topReasonOf(reportRows) {
  const counts = {};
  for (const r of reportRows) counts[r.reason] = (counts[r.reason] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// Every report, grouped by target, across every Hive and every target type
// (message/post/comment/user/hive) — including private pair-chat reports,
// which Part D's Hive-owner view deliberately never sees. Reporter names and
// their details text appear ONLY here.
async function listAdminReportGroups(status) {
  const { rows } = await query(
    `WITH grp AS (
       SELECT target_type, target_id,
              COUNT(DISTINCT reporter_id)::int AS report_count,
              MIN(created_at) AS created_at,
              BOOL_OR(status = 'open') AS has_open,
              MAX(content_snapshot) AS content_snapshot,
              -- uuid has no built-in MAX/MIN aggregate; every report row for
              -- one target carries the same hive_id/target_user_id anyway,
              -- so any non-null value is correct — array_agg + [1] sidesteps
              -- the missing aggregate without a text cast round-trip.
              (ARRAY_AGG(hive_id) FILTER (WHERE hive_id IS NOT NULL))[1] AS hive_id,
              (ARRAY_AGG(target_user_id) FILTER (WHERE target_user_id IS NOT NULL))[1] AS target_user_id,
              BOOL_OR(is_private) AS is_private
         FROM reports
        GROUP BY target_type, target_id
     ),
     reason_counts AS (
       SELECT target_type, target_id, reason, COUNT(*)::int AS n,
              ROW_NUMBER() OVER (PARTITION BY target_type, target_id ORDER BY COUNT(*) DESC, reason ASC) AS rn
         FROM reports
        GROUP BY target_type, target_id, reason
     )
     SELECT g.*, rc.reason AS top_reason, rc.n AS top_reason_count
       FROM grp g
       JOIN reason_counts rc
         ON rc.target_type = g.target_type AND rc.target_id = g.target_id AND rc.rn = 1
      WHERE g.has_open = $1`,
    [status === 'open'],
  );
  if (!rows.length) return [];

  // Sort: open groups put safety/fake_or_minor first, then oldest first.
  // Resolved groups: most recently filed first (no ordering requirement given).
  rows.sort((a, b) => {
    if (status === 'open') {
      const pa = PRIORITY_REASONS.has(a.top_reason) ? 0 : 1;
      const pb = PRIORITY_REASONS.has(b.top_reason) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.created_at) - new Date(b.created_at);
    }
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const idsByType = { message: [], post: [], comment: [], user: [], hive: [] };
  for (const r of rows) idsByType[r.target_type].push(r.target_id);

  const [messages, posts, comments, users, hives] = await Promise.all([
    idsByType.message.length ? query(
      `SELECT m.message_id AS id, m.hidden_at, m.hidden_reason, m.channel_id, m.hive_id,
              p.full_name AS author_name
         FROM messages m LEFT JOIN profiles p ON p.user_id = m.sender_user_id
        WHERE m.message_id = ANY($1)`, [idsByType.message],
    ) : { rows: [] },
    idsByType.post.length ? query(
      `SELECT hp.post_id AS id, hp.hidden_at, hp.hidden_reason, hp.hive_id,
              p.full_name AS author_name
         FROM hive_posts hp LEFT JOIN profiles p ON p.user_id = hp.author_user_id
        WHERE hp.post_id = ANY($1)`, [idsByType.post],
    ) : { rows: [] },
    idsByType.comment.length ? query(
      `SELECT pc.comment_id AS id, pc.hidden_at, pc.hidden_reason, pc.post_id, hp.hive_id,
              p.full_name AS author_name
         FROM post_comments pc
         JOIN hive_posts hp ON hp.post_id = pc.post_id
         LEFT JOIN profiles p ON p.user_id = pc.user_id
        WHERE pc.comment_id = ANY($1)`, [idsByType.comment],
    ) : { rows: [] },
    idsByType.user.length ? query(
      `SELECT u.user_id AS id, p.full_name AS author_name, u.created_at AS joined_at, u.account_status
         FROM users u LEFT JOIN profiles p ON p.user_id = u.user_id
        WHERE u.user_id = ANY($1)`, [idsByType.user],
    ) : { rows: [] },
    idsByType.hive.length ? query(
      `SELECT h.hive_id AS id, h.hive_name AS author_name, h.hive_status,
              om.user_id AS owner_id, op.full_name AS owner_name
         FROM hives h
         LEFT JOIN hive_members om ON om.hive_id = h.hive_id AND om.role = 'owner' AND om.membership_status = 'active'
         LEFT JOIN profiles op ON op.user_id = om.user_id
        WHERE h.hive_id = ANY($1)`, [idsByType.hive],
    ) : { rows: [] },
  ]);

  const detailsByKey = new Map();
  for (const r of messages.rows) detailsByKey.set(`message:${r.id}`, r);
  for (const r of posts.rows)    detailsByKey.set(`post:${r.id}`, r);
  for (const r of comments.rows) detailsByKey.set(`comment:${r.id}`, r);
  for (const r of users.rows)    detailsByKey.set(`user:${r.id}`, r);
  for (const r of hives.rows)    detailsByKey.set(`hive:${r.id}`, r);

  // Reporters (names + their details text) — the whole point of the admin view.
  const { rows: reporterRows } = await query(
    `SELECT r.target_type, r.target_id, r.reporter_id, r.details, r.reason, r.created_at,
            p.full_name AS reporter_name
       FROM reports r
       LEFT JOIN profiles p ON p.user_id = r.reporter_id
      WHERE (r.target_type, r.target_id) IN (
        SELECT target_type, target_id FROM unnest($1::text[], $2::uuid[]) AS t(target_type, target_id)
      )
      ORDER BY r.created_at ASC`,
    [rows.map(r => r.target_type), rows.map(r => r.target_id)],
  );
  const reportersByKey = new Map();
  for (const r of reporterRows) {
    const key = `${r.target_type}:${r.target_id}`;
    if (!reportersByKey.has(key)) reportersByKey.set(key, []);
    reportersByKey.get(key).push({
      name: r.reporter_name ?? 'Member', details: r.details ?? null, reason: r.reason, created_at: r.created_at,
    });
  }

  // Account age + "earlier reports" for whichever person is actually behind
  // each group (the content author for message/post/comment, or the user
  // themselves for a 'user' target).
  const personIds = [...new Set(
    rows.map(r => (r.target_type === 'user' ? r.target_id : r.target_user_id)).filter(Boolean),
  )];

  const [accountRows, priorCounts] = await Promise.all([
    personIds.length ? query(
      `SELECT user_id, created_at FROM users WHERE user_id = ANY($1)`, [personIds],
    ) : { rows: [] },
    personIds.length ? query(
      // Each report row is already unique per (reporter_id, target_type,
      // target_id) via the reports table's own UNIQUE constraint, so a
      // plain COUNT(*) is exact here — no DISTINCT/concat needed.
      `SELECT target_user_id, COUNT(*)::int AS n
         FROM reports WHERE target_user_id = ANY($1)
        GROUP BY target_user_id`, [personIds],
    ) : { rows: [] },
  ]);
  const accountByUser = new Map(accountRows.rows.map(r => [r.user_id, r.created_at]));
  const priorByUser = new Map(priorCounts.rows.map(r => [r.target_user_id, r.n]));

  const hiveNameCache = new Map();
  async function cachedHiveName(hiveId) {
    if (!hiveId) return null;
    if (hiveNameCache.has(hiveId)) return hiveNameCache.get(hiveId);
    const name = await hiveNameFor(hiveId);
    hiveNameCache.set(hiveId, name);
    return name;
  }

  const out = [];
  for (const r of rows) {
    const key = `${r.target_type}:${r.target_id}`;
    const d = detailsByKey.get(key);
    if (!d) continue; // content hard-deleted by its own author since reporting

    const reporters = reportersByKey.get(key) ?? [];
    const personId = r.target_type === 'user' ? r.target_id : r.target_user_id;
    const joinedAt = personId ? accountByUser.get(personId) : null;
    const accountAgeDays = joinedAt ? Math.floor((Date.now() - new Date(joinedAt).getTime()) / 86400000) : null;
    // "Earlier" reports against this person, excluding this very group's own tally.
    const priorTotal = personId ? (priorByUser.get(personId) ?? 0) : 0;
    const priorReportCount = Math.max(0, priorTotal - r.report_count);

    out.push({
      target_type:        r.target_type,
      target_id:          r.target_id,
      hive_id:             r.hive_id ?? d.hive_id ?? null,
      hive_name:            await cachedHiveName(r.hive_id ?? d.hive_id ?? null),
      is_private:           r.is_private,
      report_count:         r.report_count,
      reason:               r.top_reason,
      reason_count:         r.top_reason_count,
      created_at:           r.created_at,
      snapshot:             r.content_snapshot,
      author_name:          d.author_name ?? null,
      hidden:               d.hidden_reason ?? undefined,
      channel_id:           d.channel_id ?? null,
      post_id:              d.post_id ?? null,
      owner_id:             d.owner_id ?? null,
      owner_name:           d.owner_name ?? null,
      account_status:       d.account_status ?? null,
      target_user_id:       r.target_user_id,
      account_age_days:     accountAgeDays,
      prior_report_count:   priorReportCount,
      reporters,
    });
  }
  return out;
}

export const getAdminReports = async (req, res) => {
  try {
    const status = req.query.status === 'resolved' ? 'resolved' : 'open';
    const groups = await listAdminReportGroups(status);
    res.json({ groups });
  } catch (err) {
    console.error('[admin/getAdminReports]', err);
    res.status(500).json({ error: 'Failed to load reports.' });
  }
};

export const resolveAdminReport = async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    const { action, note } = req.body ?? {};

    if (!['message', 'post', 'comment', 'user', 'hive'].includes(targetType)) {
      return res.status(400).json({ error: 'Invalid target type.' });
    }
    if (!['remove', 'remove_and_suspend', 'dismiss', 'suspend_owner'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action.' });
    }
    if (action === 'remove' && !CONTENT_TABLE[targetType]) {
      return res.status(400).json({ error: "remove doesn't apply to this target type." });
    }
    if (action === 'suspend_owner' && targetType !== 'hive') {
      return res.status(400).json({ error: 'suspend_owner only applies to a hive target.' });
    }
    if (action === 'remove_and_suspend' && targetType === 'hive') {
      return res.status(400).json({ error: "Use suspend_owner for a hive target." });
    }

    const { rows: reportRows } = await query(
      `SELECT report_id, reporter_id, reason, target_user_id, hive_id FROM reports
        WHERE target_type = $1 AND target_id = $2`,
      [targetType, targetId],
    );
    if (!reportRows.length) return res.status(404).json({ error: 'Report not found.' });

    let authorId = reportRows[0].target_user_id;
    let hiveId   = reportRows[0].hive_id;
    let ownerId  = null;

    if (CONTENT_TABLE[targetType]) {
      const [table, idCol, authorCol] = CONTENT_TABLE[targetType];
      const { rows: [row] } = await query(`SELECT ${authorCol} AS author_id FROM ${table} WHERE ${idCol} = $1`, [targetId]);
      if (!row) return res.status(404).json({ error: 'Content not found.' });
      authorId = row.author_id;
    }
    if (targetType === 'hive') {
      const { rows: [row] } = await query(
        `SELECT user_id FROM hive_members WHERE hive_id = $1 AND role = 'owner' AND membership_status = 'active'`,
        [targetId],
      );
      ownerId = row?.user_id ?? null;
      hiveId = targetId;
    }

    let resolution;
    let dbAction = action;

    if (action === 'remove' || (action === 'remove_and_suspend' && CONTENT_TABLE[targetType])) {
      const [table, idCol] = CONTENT_TABLE[targetType];
      await query(
        `UPDATE ${table} SET hidden_at = COALESCE(hidden_at, NOW()), hidden_reason = 'removed' WHERE ${idCol} = $1`,
        [targetId],
      );
    }
    if (action === 'dismiss' && CONTENT_TABLE[targetType]) {
      await query(
        `UPDATE ${CONTENT_TABLE[targetType][0]} SET hidden_at = NULL, hidden_reason = NULL
          WHERE ${CONTENT_TABLE[targetType][1]} = $1 AND hidden_reason = 'auto'`,
        [targetId],
      );
    }

    if (action === 'remove') resolution = 'removed';
    else if (action === 'dismiss') resolution = 'kept';
    else resolution = 'removed_and_suspended'; // remove_and_suspend, suspend_owner

    if (action === 'remove_and_suspend' && authorId) {
      await suspendUser(authorId, note ?? null);
    }
    if (action === 'suspend_owner' && ownerId) {
      await suspendUser(ownerId, note ?? null);
    }

    await query(
      `UPDATE reports SET status = $1, resolution = $2, resolved_by = $3, resolved_at = NOW()
        WHERE target_type = $4 AND target_id = $5`,
      [action === 'dismiss' ? 'dismissed' : 'actioned', resolution, req.userId, targetType, targetId],
    );

    // Same reporter/author notifications as Part D — never for a private
    // (pair-chat) report, since a reporter there is identified only by
    // being in that very channel, and "your report was reviewed" is a safe,
    // generic line regardless.
    await Promise.all(reportRows.map(r => createNotification({
      userId: r.reporter_id,
      type: 'report_reviewed', category: 'system',
      title: 'Your report was reviewed',
      body: 'Thanks for helping keep TrueHive safe.',
      hiveId: r.hive_id,
    }).catch(e => console.error('[admin/resolve] reporter notify failed', e))));

    if (CONTENT_TABLE[targetType] && action !== 'dismiss' && authorId) {
      const label = REASON_LABELS[topReasonOf(reportRows)] ?? topReasonOf(reportRows);
      const hiveName = await hiveNameFor(hiveId);
      await createNotification({
        userId: authorId,
        type: 'content_removed', category: 'system',
        title: `Your ${targetType} in ${hiveName ?? 'your Hive'} was removed by a Hive admin for: ${label}.`,
        hiveId,
      }).catch(e => console.error('[admin/resolve] author notify failed', e));
    }

    res.json({ ok: true, resolution });
  } catch (err) {
    console.error('[admin/resolveAdminReport]', err);
    res.status(500).json({ error: 'Failed to resolve report.' });
  }
};

export const unsuspendUser = async (req, res) => {
  try {
    const { rows: [row] } = await query(
      `UPDATE users SET account_status = 'active', suspended_at = NULL, suspension_note = NULL
        WHERE user_id = $1 AND account_status = 'suspended'
        RETURNING user_id`,
      [req.params.id],
    );
    if (!row) return res.status(404).json({ error: 'User not found or not suspended.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/unsuspendUser]', err);
    res.status(500).json({ error: 'Failed to unsuspend this account.' });
  }
};

export const getSuspendedUsers = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.user_id, u.email, u.suspended_at, u.suspension_note, p.full_name
         FROM users u LEFT JOIN profiles p ON p.user_id = u.user_id
        WHERE u.account_status = 'suspended'
        ORDER BY u.suspended_at DESC`,
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('[admin/getSuspendedUsers]', err);
    res.status(500).json({ error: 'Failed to load suspended accounts.' });
  }
};

// "Hives without an area" (Prompt 71 Part A) — the backfill migration leaves
// a Hive's metro_key NULL rather than guess at an ambiguous bare city name;
// this tab is how Uche fixes those leftovers by hand.
export const getHivesWithoutArea = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT h.hive_id, h.hive_name, h.location, h.location_type, c.category_name
         FROM hives h LEFT JOIN categories c ON c.category_id = h.category_id
        WHERE h.hive_status = 'active' AND h.location_type IN ('in-person', 'hybrid')
          AND h.metro_key IS NULL
        ORDER BY h.created_at DESC`,
    );
    const metros = await listMetros();
    res.json({ hives: rows, metros });
  } catch (err) {
    console.error('[admin/getHivesWithoutArea]', err);
    res.status(500).json({ error: 'Failed to load Hives without an area.' });
  }
};

export const setHiveMetro = async (req, res) => {
  try {
    const { id } = req.params;
    const { metroKey } = req.body ?? {};
    if (!metroKey) return res.status(400).json({ error: 'metroKey is required.' });

    const { rows: [metro] } = await query(`SELECT metro_key FROM metros WHERE metro_key = $1`, [metroKey]);
    if (!metro) return res.status(400).json({ error: 'Unknown metro.' });

    const { rowCount } = await query(`UPDATE hives SET metro_key = $1, updated_at = NOW() WHERE hive_id = $2`, [metroKey, id]);
    if (!rowCount) return res.status(404).json({ error: 'Hive not found.' });

    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/setHiveMetro]', err);
    res.status(500).json({ error: 'Failed to set this Hive\'s area.' });
  }
};
