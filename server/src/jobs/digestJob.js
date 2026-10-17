// Hourly activity digest (Prompt 70 Part D, screen E4) — summarizes unread
// chat/post activity for a member who has been away for a while, without
// ever including message text.
import { query } from '../db/index.js';
import { sendActivityDigestEmail } from '../lib/email.js';
import { reportProblem } from '../lib/reportProblem.js';
import { reportJobError } from '../lib/jobTick.js';

const INTERVAL_MS = 60 * 60 * 1000; // hourly
const INACTIVE_SQL = `last_active_at < NOW() - INTERVAL '6 hours'`;
const COOLDOWN_SQL = `(last_digest_sent_at IS NULL OR last_digest_sent_at < NOW() - INTERVAL '12 hours')`;

export async function runDigestJob() {
  const { rows: recipients } = await query(
    `SELECT user_id, last_active_at, last_digest_sent_at
       FROM users
      WHERE email_digest = true AND account_status = 'active' AND email_verified = true
        AND last_active_at IS NOT NULL AND ${INACTIVE_SQL} AND ${COOLDOWN_SQL}`,
  );

  let sent = 0, skipped = 0;
  for (const recipient of recipients) {
    // GREATEST(last_active_at, last_digest_sent_at) — but a never-digested
    // user has a NULL last_digest_sent_at, which GREATEST would propagate
    // as NULL and silently match zero rows, so COALESCE it to last_active_at.
    const since = recipient.last_digest_sent_at && recipient.last_digest_sent_at > recipient.last_active_at
      ? recipient.last_digest_sent_at
      : recipient.last_active_at;

    const { rows: roomRows } = await query(
      `SELECT title, group_count FROM notifications
        WHERE user_id = $1 AND read = false AND type = 'room_activity'
          AND group_key LIKE 'chat:%' AND updated_at >= $2
        ORDER BY updated_at DESC`,
      [recipient.user_id, since],
    );
    const { rows: postRows } = await query(
      `SELECT h.hive_name, COUNT(*)::int AS post_count
         FROM notifications n JOIN hives h ON h.hive_id = n.hive_id
        WHERE n.user_id = $1 AND n.read = false AND n.type = 'new_post' AND n.updated_at >= $2
        GROUP BY h.hive_name
        ORDER BY h.hive_name`,
      [recipient.user_id, since],
    );
    const { rows: [pairRow] } = await query(
      `SELECT COALESCE(SUM(group_count), 0)::int AS pair_count FROM notifications
        WHERE user_id = $1 AND read = false AND type = 'pair_activity'
          AND group_key LIKE 'pair:%' AND updated_at >= $2`,
      [recipient.user_id, since],
    );

    const messageCount = roomRows.reduce((sum, r) => sum + r.group_count, 0) + pairRow.pair_count;
    const postCount = postRows.reduce((sum, r) => sum + r.post_count, 0);

    if (messageCount === 0 && postCount === 0) { skipped++; continue; }

    const roomLines = roomRows.map(r => r.title);
    const postLines = postRows.map(r => `${r.post_count} new post${r.post_count === 1 ? '' : 's'} in ${r.hive_name}`);
    const pairLine = pairRow.pair_count > 0
      ? `${pairRow.pair_count} message${pairRow.pair_count === 1 ? '' : 's'} in a private chat`
      : null;
    const lines = [...roomLines, ...postLines, ...(pairLine ? [pairLine] : [])];

    // Caught per-recipient, not just by the outer job-tick handler — a
    // single Resend failure used to throw out of this loop and silently
    // skip every remaining recipient's digest for the hour.
    let sentOk = false;
    try {
      sentOk = await sendActivityDigestEmail(recipient.user_id, { messageCount, postCount, lines });
    } catch (err) {
      reportProblem(`[digestJob] send failed for recipient=${recipient.user_id}:`, err);
    }
    if (sentOk) {
      sent++;
      await query(`UPDATE users SET last_digest_sent_at = NOW() WHERE user_id = $1`, [recipient.user_id]);
    } else {
      skipped++;
    }
  }

  return { eligible: recipients.length, sent, skipped };
}

let started = false;
export function startDigestJob() {
  if (started) return;
  started = true;
  runDigestJob().catch(e => reportJobError('digestJob', 'initial run', e));
  setInterval(() => {
    runDigestJob().catch(e => reportJobError('digestJob', 'run', e));
  }, INTERVAL_MS);
}
