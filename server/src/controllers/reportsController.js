import { query } from '../db/index.js';
import { requireMembership } from '../lib/hiveMembership.js';
import { requireChannelAccess } from '../lib/hiveChannels.js';
import { isBlockedEitherWay } from '../lib/blocks.js';
import { getEnrichedMessage } from './messagesController.js';
import { getIO } from '../realtime/socket.js';
import { sendReportAlert } from '../lib/email.js';
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

// Marks the underlying row hidden ('auto') the first time a target crosses
// the 2-distinct-reporter threshold. Idempotent — a target already hidden
// (auto or removed) is left alone. Emits the message-edit socket event for
// messages, since that's the only content type with any live-update wiring.
async function maybeAutoHide(targetType, targetId) {
  if (!['message', 'post', 'comment'].includes(targetType)) return false;

  const { rows: [{ n }] } = await query(
    `SELECT COUNT(DISTINCT reporter_id)::int AS n FROM reports WHERE target_type = $1 AND target_id = $2`,
    [targetType, targetId],
  );
  if (n < AUTO_HIDE_AFTER) return false;

  const table = targetType === 'message' ? 'messages' : targetType === 'post' ? 'hive_posts' : 'post_comments';
  const idCol = targetType === 'message' ? 'message_id' : targetType === 'post' ? 'post_id' : 'comment_id';

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
      hidden = await maybeAutoHide(targetType, targetId);

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
