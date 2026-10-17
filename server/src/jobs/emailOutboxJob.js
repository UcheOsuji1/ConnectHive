// Bundles email_outbox rows (member_joined, join_request) by
// (recipient_id, hive_id, kind) and sends at most one email per group per
// 60-minute window — "grouped within an hour" (Prompt 70 Part C).
import { query } from '../db/index.js';
import { sendMemberJoinedEmail, sendJoinRequestEmail } from '../lib/email.js';
import { getPairScore } from '../lib/pairScoreCache.js';
import { reportProblem } from '../lib/reportProblem.js';
import { reportJobError } from '../lib/jobTick.js';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const COOLDOWN_SQL = `sent_at > NOW() - INTERVAL '60 minutes'`;

// Builds the {name, photoUrl, fitScore, withScore, requestMessage} list a
// template needs, fetching the recipient's own profile once (E3's "with
// you" score needs both sides) rather than once per person in the group.
async function buildPeople(kind, recipientId, hiveId, rows) {
  const subjectIds = [...new Set(rows.map(r => r.subject_user_id))];
  const { rows: profiles } = await query(
    `SELECT * FROM profiles WHERE user_id = ANY($1)`, [subjectIds],
  );
  const profileById = new Map(profiles.map(p => [p.user_id, p]));

  if (kind === 'member_joined') {
    return rows.map(r => {
      const p = profileById.get(r.subject_user_id);
      return { name: p?.full_name ?? 'A new member', photoUrl: p?.profile_photo_url ?? null };
    });
  }

  // join_request — Hive-fit score (compatibility_scores) + "with you" score
  // (the shared pairScoreCache) + the request message, per row (not per
  // distinct person — a re-request can carry a different message).
  const { rows: recipientProfileRows } = await query(`SELECT * FROM profiles WHERE user_id = $1`, [recipientId]);
  const recipientProfile = recipientProfileRows[0] ?? null;

  const { rows: fitRows } = await query(
    `SELECT user_id, total_score FROM compatibility_scores WHERE hive_id = $1 AND user_id = ANY($2)`,
    [hiveId, subjectIds],
  );
  const fitByUser = new Map(fitRows.map(r => [r.user_id, Math.round(Number(r.total_score))]));

  const people = [];
  for (const r of rows) {
    const p = profileById.get(r.subject_user_id);
    let withScore = null;
    if (recipientProfile && p) {
      try {
        const { total } = await getPairScore(recipientProfile, p);
        withScore = Math.round(total);
      } catch { /* scoring is best-effort for the email — never blocks the send */ }
    }
    people.push({
      name: p?.full_name ?? 'Someone',
      photoUrl: p?.profile_photo_url ?? null,
      fitScore: fitByUser.has(r.subject_user_id) ? fitByUser.get(r.subject_user_id) : null,
      withScore,
      requestMessage: r.request_message ?? null,
    });
  }
  return people;
}

export async function runEmailOutboxJob() {
  const { rows: pending } = await query(
    `SELECT eo.outbox_id, eo.recipient_id, eo.hive_id, eo.kind, eo.subject_user_id, eo.request_id, eo.created_at,
            jr.request_message, jr.status AS request_status
       FROM email_outbox eo
       LEFT JOIN join_requests jr ON jr.request_id = eo.request_id
      WHERE eo.sent_at IS NULL
      ORDER BY eo.created_at ASC`,
  );
  if (!pending.length) return { groupsSent: 0, groupsSkipped: 0, groupsDropped: 0 };

  const groups = new Map();
  for (const row of pending) {
    const key = `${row.recipient_id}:${row.hive_id}:${row.kind}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let groupsSent = 0, groupsSkipped = 0, groupsDropped = 0;

  for (const rows of groups.values()) {
    const { recipient_id: recipientId, hive_id: hiveId, kind } = rows[0];
    const outboxIds = rows.map(r => r.outbox_id);

    // "Grouped within an hour": wait for the next eligible tick if this
    // recipient already got one of this kind for this Hive recently.
    const { rows: [recent] } = await query(
      `SELECT 1 FROM email_outbox
        WHERE recipient_id = $1 AND hive_id = $2 AND kind = $3 AND sent_at IS NOT NULL AND ${COOLDOWN_SQL}
        LIMIT 1`,
      [recipientId, hiveId, kind],
    );
    if (recent) { groupsSkipped++; continue; }

    // A join request accepted/declined before the email went out drops out
    // of the group — never mark it sent until it's actually represented or
    // genuinely moot, so a late-arriving still-pending one isn't lost.
    let liveRows = rows;
    if (kind === 'join_request') {
      liveRows = rows.filter(r => !r.request_id || r.request_status === 'pending');
    }

    if (!liveRows.length) {
      await query(`UPDATE email_outbox SET sent_at = NOW() WHERE outbox_id = ANY($1)`, [outboxIds]);
      groupsDropped++;
      continue;
    }

    try {
      const { rows: [hiveRow] } = await query(`SELECT hive_name FROM hives WHERE hive_id = $1`, [hiveId]);
      const hiveName = hiveRow?.hive_name ?? 'your Hive';
      const people = await buildPeople(kind, recipientId, hiveId, liveRows);

      if (kind === 'member_joined') {
        await sendMemberJoinedEmail(recipientId, { hiveId, hiveName, people });
      } else {
        await sendJoinRequestEmail(recipientId, { hiveId, hiveName, people });
      }
      groupsSent++;
    } catch (err) {
      // Loud, per CLAUDE.md — a send failure here must not look like success.
      reportProblem(`[emailOutboxJob] send failed for recipient=${recipientId} hive=${hiveId} kind=${kind}:`, err);
    }

    // Marked sent_at regardless of outcome above — a hard send failure
    // shouldn't retry forever and spam the recipient once Resend recovers;
    // the error is already logged loudly for a human to notice.
    await query(`UPDATE email_outbox SET sent_at = NOW() WHERE outbox_id = ANY($1)`, [outboxIds]);
  }

  return { groupsSent, groupsSkipped, groupsDropped };
}

let started = false;
export function startEmailOutboxJob() {
  if (started) return;
  started = true;
  runEmailOutboxJob().catch(e => reportJobError('emailOutboxJob', 'initial run', e));
  setInterval(() => {
    runEmailOutboxJob().catch(e => reportJobError('emailOutboxJob', 'run', e));
  }, INTERVAL_MS);
}
