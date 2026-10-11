// Meet someone new — the pairing round job (Prompt 64 Part 2). Same pattern
// as rsvpReminderJob.js: an exported run function the checks can call
// directly, plus an interval wrapper with a started-once guard.
import { query, getClient } from '../db/index.js';
import { getHivesWithToolOn } from '../lib/hiveTools.js';
import { getPairScore } from '../lib/pairScoreCache.js';
import { createPairChannel } from '../lib/hiveChannels.js';
import { getSystemUserId } from '../lib/systemUser.js';
import { createNotification } from '../controllers/notificationsController.js';
import { flatten } from '../lib/compatibility.js';
import { dyadKey, recentDyads, prioritizedMatch, bestTrioHost } from '../lib/coffeeChatMatching.js';

const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h — same cadence as the other background jobs
const RECENT_ROUNDS_WINDOW = 3;
const MIN_GAP_DAYS = { weekly: 6, biweekly: 13, monthly: 26 };

function todayUTC() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Opted-in, unpaused, active members who pass the same full-access rule
// requireCanPost enforces per-request — inlined as a set query since this
// needs every eligible user at once, not a per-request throw.
async function eligibleCandidates(hiveId) {
  const { rows } = await query(
    `SELECT hm.user_id FROM hive_members hm
       JOIN hive_coffee_optins o ON o.hive_id = hm.hive_id AND o.user_id = hm.user_id
       LEFT JOIN hive_onboarding_settings os ON os.hive_id = hm.hive_id
      WHERE hm.hive_id = $1 AND hm.membership_status = 'active'
        AND (o.paused_until IS NULL OR o.paused_until < CURRENT_DATE)
        AND (
          hm.role IN ('owner','admin')
          OR hm.onboarding_status = 'completed'
          OR COALESCE(os.access_mode, 'full') = 'full'
        )`,
    [hiveId],
  );
  return rows.map(r => r.user_id);
}

function sharedInterests(profileA, profileB) {
  const a = flatten(profileA.interests);
  const bSet = new Set(flatten(profileB.interests));
  return [...new Set(a.filter(i => bSet.has(i)))];
}

async function postIntro(hiveId, channelId, group, profileById, icebreaker) {
  const systemUserId = await getSystemUserId();
  const names = group.map(id => profileById[id]?.full_name ?? 'a member');

  let sharedLine = '';
  if (group.length === 2) {
    const shared = sharedInterests(profileById[group[0]], profileById[group[1]]);
    if (shared.length) sharedLine = `\n\nYou both like: ${shared.slice(0, 5).join(', ')}.`;
  }

  const opener = icebreaker?.trim()
    ? icebreaker.trim()
    : "What's something you're looking forward to this week?";

  const text = `You've been matched! Say hi to ${names.join(' and ')}.${sharedLine}\n\nA question to break the ice: ${opener}`;

  const { rows: [msg] } = await query(
    `INSERT INTO messages (hive_id, channel_id, sender_user_id, message_text)
     VALUES ($1,$2,$3,$4) RETURNING message_id`,
    [hiveId, channelId, systemUserId, text],
  );
  return msg.message_id;
}

// Exported separately so checks can call one pass directly and assert on the
// return value instead of waiting on a timer.
export async function runCoffeeChatJob() {
  const today = todayUTC();
  const todayDow = today.getUTCDay();
  const todayStr = today.toISOString().slice(0, 10);

  const hiveIds = await getHivesWithToolOn('coffee_chats');
  let roundsRun = 0, pairsCreated = 0, trios = 0, sitOuts = 0;

  for (const hiveId of hiveIds) {
    const { rows: [settings] } = await query(
      `SELECT cadence, pairing_day, allow_groups_of_3 FROM hive_coffee_settings WHERE hive_id = $1`,
      [hiveId],
    );
    const cadence     = settings?.cadence ?? 'biweekly';
    const pairingDay  = settings?.pairing_day ?? 1;
    const allowTrio   = settings?.allow_groups_of_3 ?? true;
    if (todayDow !== pairingDay) continue;

    const { rows: [lastRound] } = await query(
      `SELECT scheduled_for FROM hive_coffee_rounds WHERE hive_id = $1 ORDER BY scheduled_for DESC LIMIT 1`,
      [hiveId],
    );
    if (lastRound) {
      const daysSince = Math.floor((today - new Date(lastRound.scheduled_for + 'T00:00:00Z')) / 86400000);
      if (daysSince < MIN_GAP_DAYS[cadence]) continue;
    }

    // The actual idempotency guard: only the run that wins this INSERT
    // proceeds to pair anyone for this hive today. A second run the same day
    // (or a second hive-loop pass) finds the slot already claimed and skips.
    const { rows: [claimed] } = await query(
      `INSERT INTO hive_coffee_rounds (hive_id, scheduled_for) VALUES ($1, $2)
       ON CONFLICT (hive_id, scheduled_for) DO NOTHING RETURNING round_id`,
      [hiveId, todayStr],
    );
    if (!claimed) continue;
    const roundId = claimed.round_id;

    const candidateIds = await eligibleCandidates(hiveId);
    if (candidateIds.length < 2) continue;

    const { rows: recentRounds } = await query(
      `SELECT round_id FROM hive_coffee_rounds WHERE hive_id = $1 AND round_id != $2
        ORDER BY scheduled_for DESC LIMIT $3`,
      [hiveId, roundId, RECENT_ROUNDS_WINDOW],
    );
    const { rows: recentPairRows } = recentRounds.length
      ? await query(`SELECT user_ids FROM hive_coffee_pairs WHERE round_id = ANY($1)`, [recentRounds.map(r => r.round_id)])
      : { rows: [] };
    const excluded = recentDyads(recentPairRows.map(r => r.user_ids));

    let priorityId = null;
    if (recentRounds.length) {
      const { rows: [sitOut] } = await query(
        `SELECT user_ids[1] AS user_id FROM hive_coffee_pairs
          WHERE round_id = $1 AND array_length(user_ids, 1) = 1 LIMIT 1`,
        [recentRounds[0].round_id],
      );
      if (sitOut && candidateIds.includes(sitOut.user_id)) priorityId = sitOut.user_id;
    }

    const { rows: profiles } = await query(`SELECT * FROM profiles WHERE user_id = ANY($1)`, [candidateIds]);
    const profileById = Object.fromEntries(profiles.map(p => [p.user_id, p]));

    const scores = new Map();
    for (let i = 0; i < candidateIds.length; i++) {
      for (let j = i + 1; j < candidateIds.length; j++) {
        const a = candidateIds[i], b = candidateIds[j];
        if (!profileById[a] || !profileById[b]) continue;
        const { total } = await getPairScore(profileById[a], profileById[b]);
        scores.set(dyadKey(a, b), total);
      }
    }

    const { pairs, leftover } = prioritizedMatch(candidateIds, scores, excluded, priorityId);
    const groups = pairs.map(p => [...p]);

    if (leftover.length === 1) {
      if (allowTrio && groups.length > 0) {
        const idx = bestTrioHost(groups, leftover[0], scores);
        if (idx >= 0) groups[idx].push(leftover[0]);
        else groups.push([leftover[0]]);
      } else {
        groups.push([leftover[0]]);
      }
    }

    const { rows: [hiveRow] } = await query(`SELECT icebreaker FROM hives WHERE hive_id = $1`, [hiveId]);

    for (const group of groups) {
      if (group.length === 1) {
        await query(`INSERT INTO hive_coffee_pairs (round_id, user_ids) VALUES ($1, $2)`, [roundId, group]);
        sitOuts++;
        continue;
      }

      const client = await getClient();
      let channelId;
      try {
        await client.query('BEGIN');
        channelId = await createPairChannel(client, hiveId, group, 'coffee_chat');
        await client.query(
          `INSERT INTO hive_coffee_pairs (round_id, user_ids, channel_id) VALUES ($1,$2,$3)`,
          [roundId, group, channelId],
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('[coffeeChatJob] pairing insert failed', e);
        continue;
      } finally {
        client.release();
      }

      pairsCreated++;
      if (group.length === 3) trios++;

      await postIntro(hiveId, channelId, group, profileById, hiveRow?.icebreaker).catch(e =>
        console.error('[coffeeChatJob] intro message failed (non-fatal)', e));

      await Promise.all(group.map(uid => createNotification({
        userId: uid, type: 'coffee_match', category: 'matches',
        title: 'You’ve been matched for a chat!',
        body: 'Say hello and find a time to connect.',
        hiveId, link: `/hive/${hiveId}/chat/${channelId}`,
      }).catch(e => console.error('[coffeeChatJob] notify failed (non-fatal)', e))));
    }

    roundsRun++;
  }

  return { roundsRun, pairsCreated, trios, sitOuts };
}

let started = false;
export function startCoffeeChatJob() {
  if (started) return;
  started = true;
  runCoffeeChatJob().catch(e => console.error('[coffeeChatJob] initial run failed:', e));
  setInterval(() => {
    runCoffeeChatJob().catch(e => console.error('[coffeeChatJob] run failed:', e));
  }, INTERVAL_MS);
}
