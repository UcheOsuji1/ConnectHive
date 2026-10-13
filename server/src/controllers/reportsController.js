import { query } from '../db/index.js';
import { requireMembership, getMembership } from '../lib/hiveMembership.js';
import { requireChannelAccess } from '../lib/hiveChannels.js';
import { isBlockedEitherWay } from '../lib/blocks.js';
import { getEnrichedMessage } from './messagesController.js';
import { removeMemberCore } from './hivesController.js';
import { createNotification } from './notificationsController.js';
import { getIO } from '../realtime/socket.js';
import { sendReportAlert, REASON_LABELS } from '../lib/email.js';
import { siteAdminEmails } from '../lib/siteAdmin.js';

const TARGET_TYPES    = ['message', 'post', 'comment', 'user', 'hive'];
const REASONS         = ['harassment', 'safety', 'spam', 'sexual', 'hate', 'fake_or_minor', 'other'];
const AUTO_HIDE_AFTER = 2;

const SNAPSHOT_MAX = 2000;
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

// 404 for anything the reporter couldn't see — never a 403 that would
// confirm a room/Hive/person exists to someone who can't read it, same
// convention as the Pair-chat-privacy rule in CLAUDE.md.
function notFound() {
  const err = new Error('Not found.');
  err.status = 404;
  return err;
}

async function hiveNameFor(hiveId) {
  if (!hiveId) return null;
  const { rows: [h] } = await query('SELECT hive_name FROM hives WHERE hive_id = $1', [hiveId]);
  return h?.hive_name ?? null;
}

// Resolves a report target entirely from the server's own data — the client
// supplies only targetType + targetId. Throws notFound() for anything the
// reporter cannot read; never trusts a client-supplied hive_id/author/privacy.
async function resolveTarget(targetType, targetId, reporterId) {
  if (targetType === 'message') {
    const { rows: [m] } = await query(
      `SELECT message_id, hive_id, channel_id, sender_user_id, message_text, deleted_at
         FROM messages WHERE message_id = $1`,
      [targetId],
    );
    if (!m || m.deleted_at) throw notFound();
    let ch;
    try {
      await requireMembership(m.hive_id, reporterId);
      ch = await requireChannelAccess(m.hive_id, m.channel_id, reporterId);
    } catch {
      throw notFound();
    }
    return {
      hiveId:          m.hive_id,
      isPrivate:       ch.kind === 'pair',
      targetUserId:    m.sender_user_id,
      contentSnapshot: clip(m.message_text, SNAPSHOT_MAX),
      hiveName:        await hiveNameFor(m.hive_id),
    };
  }

  if (targetType === 'post' || targetType === 'comment') {
    let row;
    if (targetType === 'post') {
      const { rows: [p] } = await query(
        `SELECT post_id, hive_id, author_user_id, headline, body, visibility
           FROM hive_posts WHERE post_id = $1`,
        [targetId],
      );
      row = p && { hiveId: p.hive_id, authorId: p.author_user_id, visibility: p.visibility,
        snapshot: [p.headline, p.body].filter(Boolean).join('\n\n') };
    } else {
      const { rows: [c] } = await query(
        `SELECT pc.comment_id, pc.user_id, pc.body, hp.hive_id, hp.visibility
           FROM post_comments pc
           JOIN hive_posts hp ON hp.post_id = pc.post_id
          WHERE pc.comment_id = $1`,
        [targetId],
      );
      row = c && { hiveId: c.hive_id, authorId: c.user_id, visibility: c.visibility, snapshot: c.body };
    }
    if (!row) throw notFound();

    const { rows: [access] } = await query(
      `SELECT
         EXISTS(SELECT 1 FROM hive_members WHERE hive_id=$1 AND user_id=$2 AND membership_status='active') AS is_member,
         EXISTS(SELECT 1 FROM hive_followers WHERE hive_id=$1 AND user_id=$2) AS is_following`,
      [row.hiveId, reporterId],
    );
    const canRead = access.is_member || (access.is_following && row.visibility === 'public');
    if (!canRead) throw notFound();

    return {
      hiveId:          row.hiveId,
      isPrivate:       false,
      targetUserId:    row.authorId,
      contentSnapshot: clip(row.snapshot, SNAPSHOT_MAX),
      hiveName:        await hiveNameFor(row.hiveId),
    };
  }

  if (targetType === 'user') {
    // Same visibility gate as getMemberProfile: active accounts only, and
    // invisible (404) across a block in either direction.
    const { rows: [u] } = await query(
      `SELECT user_id FROM users WHERE user_id = $1 AND account_status = 'active'`,
      [targetId],
    );
    if (!u) throw notFound();
    if (await isBlockedEitherWay(reporterId, targetId)) throw notFound();
    return { hiveId: null, isPrivate: false, targetUserId: targetId, contentSnapshot: null, hiveName: null };
  }

  // targetType === 'hive' — discoverable, or the reporter is already a member.
  const { rows: [h] } = await query(
    `SELECT h.hive_id, h.hive_name, h.discoverable,
            EXISTS(SELECT 1 FROM hive_members hm
                    WHERE hm.hive_id = h.hive_id AND hm.user_id = $2 AND hm.membership_status = 'active') AS is_member
       FROM hives h WHERE h.hive_id = $1 AND h.hive_status = 'active'`,
    [targetId, reporterId],
  );
  if (!h || !(h.discoverable || h.is_member)) throw notFound();
  return { hiveId: h.hive_id, isPrivate: false, targetUserId: null, contentSnapshot: null, hiveName: h.hive_name };
}

// Every (table, id column) pair a report target can resolve to — the single
// place that mapping lives, reused by auto-hide and by the owner-review
// resolve endpoint below.
const CONTENT_TABLE = {
  message: ['messages', 'message_id', 'sender_user_id'],
  post:    ['hive_posts', 'post_id', 'author_user_id'],
  comment: ['post_comments', 'comment_id', 'user_id'],
};

// Marks the underlying row hidden ('auto') once reporterCount crosses the
// 2-distinct-reporter threshold. Idempotent — a target already hidden (auto
// or removed) is left alone. Emits the message-edit socket event for
// messages, since that's the only content type with any live-update wiring.
async function maybeAutoHide(targetType, targetId, reporterCount) {
  if (!['message', 'post', 'comment'].includes(targetType)) return false;
  if (reporterCount < AUTO_HIDE_AFTER) return false;

  const [table, idCol] = CONTENT_TABLE[targetType];

  const { rows: [updated] } = await query(
    `UPDATE ${table} SET hidden_at = NOW(), hidden_reason = 'auto'
      WHERE ${idCol} = $1 AND hidden_at IS NULL
      RETURNING ${idCol}`,
    [targetId],
  );
  if (!updated) return true; // already hidden — still report it as hidden to the caller

  if (targetType === 'message') {
    try {
      const { rows: [m] } = await query(
        `SELECT hive_id, channel_id FROM messages WHERE message_id = $1`, [targetId],
      );
      const msg = await getEnrichedMessage(targetId, null);
      const room = m.channel_id ? `hive:${m.hive_id}:ch:${m.channel_id}` : `hive:${m.hive_id}`;
      getIO().to(room).emit('message_updated', msg);
    } catch { /* no socket in tests, or send failed — hide already committed */ }
  }
  return true;
}

export const createReport = async (req, res) => {
  try {
    const { targetType, targetId, reason, details, alsoBlock } = req.body ?? {};

    if (!TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({ error: 'Invalid targetType.' });
    }
    if (!targetId) {
      return res.status(400).json({ error: 'targetId is required.' });
    }
    if (!REASONS.includes(reason)) {
      return res.status(400).json({ error: 'Invalid reason.' });
    }
    const cleanDetails = details == null ? null : String(details).trim() || null;
    if (cleanDetails && cleanDetails.length > 500) {
      return res.status(400).json({ error: 'Details must be 500 characters or fewer.' });
    }

    const target = await resolveTarget(targetType, targetId, req.userId);

    if (target.targetUserId && target.targetUserId === req.userId) {
      return res.status(400).json({ error: "You can't report yourself." });
    }

    const { rows: [inserted] } = await query(
      `INSERT INTO reports
         (reporter_id, target_type, target_id, hive_id, is_private, reason, details,
          target_user_id, content_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING
       RETURNING report_id`,
      [req.userId, targetType, targetId, target.hiveId, target.isPrivate, reason, cleanDetails,
        target.targetUserId, target.contentSnapshot],
    );
    const isNewReport = !!inserted;

    if (alsoBlock === true && target.targetUserId && target.targetUserId !== req.userId) {
      await query(
        `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)
         ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
        [req.userId, target.targetUserId],
      );
    }

    let hidden = false;
    if (isNewReport) {
      const isHiveRoomContent = ['message', 'post', 'comment'].includes(targetType)
        && target.hiveId && !target.isPrivate;

      if (isHiveRoomContent) {
        const { rows: [{ n: reporterCount }] } = await query(
          `SELECT COUNT(DISTINCT reporter_id)::int AS n FROM reports WHERE target_type = $1 AND target_id = $2`,
          [targetType, targetId],
        );
        hidden = await maybeAutoHide(targetType, targetId, reporterCount);

        // First report on this target — notify the Hive's owners/admins once.
        // Never on the 2nd+ report for the same target (that's the auto-hide
        // signal, a separate event), and never for a pair-chat or person/Hive
        // report, which a Hive owner must never see.
        if (reporterCount === 1) {
          const { rows: leaders } = await query(
            `SELECT user_id FROM hive_members
              WHERE hive_id = $1 AND membership_status = 'active' AND role IN ('owner','admin')`,
            [target.hiveId],
          );
          await Promise.all(leaders.map(l => createNotification({
            userId: l.user_id,
            type: 'content_reported', category: 'system',
            title: `Something in ${target.hiveName ?? 'your Hive'} was reported`,
            link: `/hive/${target.hiveId}/reports`,
            hiveId: target.hiveId,
          }).catch(e => console.error('[reports/create] owner notify failed', e))));
        }
      }

      const admins = siteAdminEmails();
      if (admins.length) {
        sendReportAlert(admins, {
          reason, targetType, hiveName: target.hiveName, snippet: target.contentSnapshot,
        }).catch(e => console.error('[reports/create] alert email failed', e));
      }
    }

    res.status(isNewReport ? 201 : 200).json({ reported: true, hidden });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[reports/create]', err);
    res.status(500).json({ error: 'Failed to submit report.' });
  }
};

// ── Part D: Hive owners review their Hive's reports (O1/O2) ──────────────────

// Reports about a Hive's own rooms, grouped by target. Never includes a
// pair-chat message or a person/Hive report — those go to TrueHive only
// (CLAUDE.md's pair-chat-privacy rule: a Hive owner must never see pair-chat
// content). Never includes a reporter id or name — only a count.
async function listHiveReportGroups(hiveId, status) {
  const { rows } = await query(
    `WITH grp AS (
       SELECT target_type, target_id,
              COUNT(DISTINCT reporter_id)::int AS report_count,
              MIN(created_at) AS created_at,
              BOOL_OR(status = 'open') AS has_open,
              MAX(content_snapshot) AS content_snapshot
         FROM reports
        WHERE hive_id = $1 AND is_private = FALSE AND target_type IN ('message','post','comment')
        GROUP BY target_type, target_id
     ),
     reason_counts AS (
       SELECT target_type, target_id, reason, COUNT(*)::int AS n,
              ROW_NUMBER() OVER (PARTITION BY target_type, target_id ORDER BY COUNT(*) DESC, reason ASC) AS rn
         FROM reports
        WHERE hive_id = $1 AND is_private = FALSE AND target_type IN ('message','post','comment')
        GROUP BY target_type, target_id, reason
     )
     SELECT g.target_type, g.target_id, g.report_count, g.created_at, g.content_snapshot,
            rc.reason AS top_reason, rc.n AS top_reason_count
       FROM grp g
       JOIN reason_counts rc
         ON rc.target_type = g.target_type AND rc.target_id = g.target_id AND rc.rn = 1
      WHERE g.has_open = $2
      ORDER BY g.created_at DESC`,
    [hiveId, status === 'open'],
  );
  if (!rows.length) return [];

  const idsByType = { message: [], post: [], comment: [] };
  for (const r of rows) idsByType[r.target_type].push(r.target_id);

  const [messages, posts, comments] = await Promise.all([
    idsByType.message.length ? query(
      `SELECT m.message_id AS id, m.hidden_at, m.hidden_reason, m.channel_id,
              p.full_name AS author_name
         FROM messages m LEFT JOIN profiles p ON p.user_id = m.sender_user_id
        WHERE m.message_id = ANY($1)`, [idsByType.message],
    ) : { rows: [] },
    idsByType.post.length ? query(
      `SELECT hp.post_id AS id, hp.hidden_at, hp.hidden_reason,
              p.full_name AS author_name
         FROM hive_posts hp LEFT JOIN profiles p ON p.user_id = hp.author_user_id
        WHERE hp.post_id = ANY($1)`, [idsByType.post],
    ) : { rows: [] },
    idsByType.comment.length ? query(
      `SELECT pc.comment_id AS id, pc.hidden_at, pc.hidden_reason, pc.post_id,
              p.full_name AS author_name
         FROM post_comments pc LEFT JOIN profiles p ON p.user_id = pc.user_id
        WHERE pc.comment_id = ANY($1)`, [idsByType.comment],
    ) : { rows: [] },
  ]);

  const detailsByKey = new Map();
  for (const r of messages.rows) detailsByKey.set(`message:${r.id}`, r);
  for (const r of posts.rows)    detailsByKey.set(`post:${r.id}`, r);
  for (const r of comments.rows) detailsByKey.set(`comment:${r.id}`, r);

  return rows
    .map(r => {
      const d = detailsByKey.get(`${r.target_type}:${r.target_id}`);
      if (!d) return null; // the content was hard-deleted by its author since reporting
      return {
        target_type:   r.target_type,
        target_id:     r.target_id,
        author_name:   d.author_name ?? null,
        snapshot:      r.content_snapshot,
        reason:        r.top_reason,
        reason_count:  r.top_reason_count,
        report_count:  r.report_count,
        created_at:    r.created_at,
        hidden:        d.hidden_reason ?? null,
        channel_id:    d.channel_id ?? null,
        post_id:       d.post_id ?? null,
      };
    })
    .filter(Boolean);
}

export const getHiveReports = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const member = await getMembership(hiveId, req.userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only Hive owners and admins can view reports.' });
    }
    const status = req.query.status === 'resolved' ? 'resolved' : 'open';
    const groups = await listHiveReportGroups(hiveId, status);
    res.json({ groups });
  } catch (err) {
    console.error('[reports/getHiveReports]', err);
    res.status(500).json({ error: 'Failed to load reports.' });
  }
};

function topReasonOf(reportRows) {
  const counts = {};
  for (const r of reportRows) counts[r.reason] = (counts[r.reason] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export const resolveHiveReport = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const { targetType, targetId } = req.params;
    const { action } = req.body ?? {};

    if (!CONTENT_TABLE[targetType]) return res.status(400).json({ error: 'Invalid target type.' });
    if (!['remove', 'keep', 'remove_member'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action.' });
    }

    const member = await getMembership(hiveId, req.userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only Hive owners and admins can resolve reports.' });
    }

    // Reload from the DB — never trust the URL alone that this target has
    // open reports belonging to this Hive's own rooms.
    const { rows: reportRows } = await query(
      `SELECT report_id, reporter_id, reason FROM reports
        WHERE hive_id = $1 AND is_private = FALSE AND target_type = $2 AND target_id = $3`,
      [hiveId, targetType, targetId],
    );
    if (!reportRows.length) return res.status(404).json({ error: 'Report not found.' });

    const [table, idCol, authorCol] = CONTENT_TABLE[targetType];
    const { rows: [targetRow] } = await query(
      `SELECT ${authorCol} AS author_id FROM ${table} WHERE ${idCol} = $1`, [targetId],
    );
    if (!targetRow) return res.status(404).json({ error: 'Content not found.' });

    const hiveName = await hiveNameFor(hiveId);

    let resolution;
    if (action === 'keep') {
      await query(
        `UPDATE ${table} SET hidden_at = NULL, hidden_reason = NULL
          WHERE ${idCol} = $1 AND hidden_reason = 'auto'`,
        [targetId],
      );
      resolution = 'kept';
    } else {
      // 'remove' and 'remove_member' both remove the content itself; the row
      // stays (never a hard delete) so the snapshot and thread stay
      // consistent — only the reported post/comment is hard-deleted today,
      // via the member's own delete, never via this path.
      await query(
        `UPDATE ${table} SET hidden_at = COALESCE(hidden_at, NOW()), hidden_reason = 'removed'
          WHERE ${idCol} = $1`,
        [targetId],
      );
      resolution = action === 'remove_member' ? 'member_removed' : 'removed';
    }

    await query(
      `UPDATE reports SET status = $1, resolution = $2, resolved_by = $3, resolved_at = NOW()
        WHERE hive_id = $4 AND is_private = FALSE AND target_type = $5 AND target_id = $6`,
      [action === 'keep' ? 'dismissed' : 'actioned', resolution, req.userId, hiveId, targetType, targetId],
    );

    if (action === 'remove_member') {
      await removeMemberCore(hiveId, req.userId, targetRow.author_id);
    }

    // Notify each reporter exactly once — the outcome is never disclosed.
    await Promise.all(reportRows.map(r => createNotification({
      userId: r.reporter_id,
      type: 'report_reviewed', category: 'system',
      title: 'Your report was reviewed',
      body: 'Thanks for helping keep TrueHive safe.',
      hiveId,
    }).catch(e => console.error('[reports/resolve] reporter notify failed', e))));

    // Notify the author only when their content actually came down.
    if (action !== 'keep') {
      const label = REASON_LABELS[topReasonOf(reportRows)] ?? topReasonOf(reportRows);
      await createNotification({
        userId: targetRow.author_id,
        type: 'content_removed', category: 'system',
        title: `Your ${targetType} in ${hiveName ?? 'your Hive'} was removed by a Hive admin for: ${label}.`,
        hiveId,
      }).catch(e => console.error('[reports/resolve] author notify failed', e));
    }

    res.json({ ok: true, resolution });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[reports/resolveHiveReport]', err);
    res.status(500).json({ error: 'Failed to resolve report.' });
  }
};
