// Signup funnel (Prompt 72 Part C) — signed up -> verified email -> profile
// finished -> joined a Hive -> sent a first message. One query builds the
// whole signup cohort with every step's reach-timestamp in a single pass
// (LATERAL joins instead of N+1), so this stays "one query per step at
// most" even though it's really just one query, period.
import { query } from '../db/index.js';
import { getSystemUserId } from '../lib/systemUser.js';
import { siteAdminEmails } from '../lib/siteAdmin.js';
import { funnelExcludedEmails } from '../lib/funnelExclude.js';

const STUCK_CAP = 50;

const STEP_META = [
  { key: 'signed_up',        label: 'Signed up' },
  { key: 'verified',         label: 'Verified email' },
  { key: 'profile_finished', label: 'Profile finished' },
  { key: 'joined_hive',      label: 'Joined a Hive' },
  { key: 'sent_message',     label: 'Sent a first message' },
];

function median(values) {
  if (values.length < 3) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function hoursBetween(a, b) {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3600000;
}

export async function getSignupFunnel(req, res) {
  try {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const from = req.query.from ? new Date(req.query.from) : defaultFrom;
    const to = req.query.to ? new Date(req.query.to) : now;
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return res.status(400).json({ error: 'Invalid from/to date.' });
    }

    const systemUserId = await getSystemUserId();
    const excluded = [...siteAdminEmails(), ...funnelExcludedEmails()];

    const start = Date.now();
    const { rows } = await query(
      `SELECT
         u.user_id, u.created_at AS signed_up_at, u.email_verified, u.last_login,
         p.full_name,
         (
           p.user_id IS NOT NULL
           AND p.full_name IS NOT NULL AND p.full_name <> ''
           AND p.age IS NOT NULL
           AND COALESCE(p.location, '') <> ''
           AND COALESCE(jsonb_array_length(p.interests), 0) > 0
           AND COALESCE(jsonb_array_length(p.skills), 0) > 0
           AND COALESCE(jsonb_array_length(p.connection_purposes), 0) > 0
         ) AS profile_finished,
         p.updated_at AS profile_updated_at,
         hmj.first_active_join_at,
         hmj.only_via_create,
         msg.first_message_at
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.user_id
       LEFT JOIN LATERAL (
         SELECT MIN(hm.joined_at) AS first_active_join_at,
                bool_and(hm.role = 'owner' AND h.creator_user_id = u.user_id) AS only_via_create
           FROM hive_members hm JOIN hives h ON h.hive_id = hm.hive_id
          WHERE hm.user_id = u.user_id AND hm.membership_status = 'active'
       ) hmj ON true
       LEFT JOIN LATERAL (
         SELECT MIN(m.sent_at) AS first_message_at
           FROM messages m
          WHERE m.sender_user_id = u.user_id AND m.sender_user_id <> $1
       ) msg ON true
       WHERE u.created_at BETWEEN $2 AND $3
         AND u.account_status IN ('active', 'pending_deletion', 'suspended')
         AND u.email <> 'system@truehive.internal'
         AND NOT (lower(u.email) = ANY($4::text[]))
       ORDER BY u.created_at DESC`,
      [systemUserId, from.toISOString(), to.toISOString(), excluded],
    );
    const queryMs = Date.now() - start;

    const cohort = rows.map(r => ({
      id: r.user_id,
      name: r.full_name ?? 'Member',
      signedUpAt: r.signed_up_at,
      lastActiveAt: r.last_login, // last_active_at is never written anywhere in this codebase — last_login is the real signal
      verified: r.email_verified,
      profileFinished: r.profile_finished,
      profileUpdatedAt: r.profile_updated_at,
      joinedHive: r.first_active_join_at !== null,
      joinedAt: r.first_active_join_at,
      joinedOnlyByCreating: r.only_via_create === true,
      sentMessage: r.first_message_at !== null,
      firstMessageAt: r.first_message_at,
    }));

    const reached = {
      signed_up: cohort,
      verified: cohort.filter(c => c.verified),
      profile_finished: cohort.filter(c => c.profileFinished),
      joined_hive: cohort.filter(c => c.joinedHive),
      sent_message: cohort.filter(c => c.sentMessage),
    };

    const medianHoursByStep = {
      signed_up: null, // the reference point — "time from signup to signup" isn't meaningful
      verified: null,  // email_verified has no timestamp column anywhere in the schema — only a boolean
      profile_finished: median(reached.profile_finished.map(c => hoursBetween(c.signedUpAt, c.profileUpdatedAt))),
      joined_hive: median(reached.joined_hive.map(c => hoursBetween(c.signedUpAt, c.joinedAt))),
      sent_message: median(reached.sent_message.map(c => hoursBetween(c.signedUpAt, c.firstMessageAt))),
    };

    const steps = STEP_META.map((meta, i) => {
      const count = reached[meta.key].length;
      const prevCount = i === 0 ? null : reached[STEP_META[i - 1].key].length;
      return {
        key: meta.key,
        label: meta.label,
        count,
        pctOfSignups: cohort.length ? Math.round((count / cohort.length) * 1000) / 10 : 0,
        pctOfPrevious: prevCount == null ? null : (prevCount ? Math.round((count / prevCount) * 1000) / 10 : 0),
        medianHours: medianHoursByStep[meta.key],
      };
    });

    const joinedOnlyByCreatingCount = reached.joined_hive.filter(c => c.joinedOnlyByCreating).length;

    const stuckEntry = (c) => ({
      id: c.id,
      name: c.name,
      signedUpAt: c.signedUpAt,
      lastActiveAt: c.lastActiveAt,
      profileLink: `/profile/${c.id}`,
    });
    const stuckList = (from_, notKey) => from_.filter(c => !reached[notKey].includes(c))
      .sort((a, b) => new Date(b.signedUpAt) - new Date(a.signedUpAt))
      .slice(0, STUCK_CAP)
      .map(stuckEntry);

    const stuck = {
      verified: stuckList(reached.signed_up, 'verified'),
      profile_finished: stuckList(reached.verified, 'profile_finished'),
      joined_hive: stuckList(reached.profile_finished, 'joined_hive'),
      sent_message: stuckList(reached.joined_hive, 'sent_message'),
    };

    res.json({
      from: from.toISOString(),
      to: to.toISOString(),
      totalSignups: cohort.length,
      steps,
      stuck,
      joinedOnlyByCreatingCount,
      _debug: { queryMs },
    });
  } catch (err) {
    console.error('[funnel/getSignupFunnel]', err);
    res.status(500).json({ error: 'Failed to load the signup funnel.' });
  }
}
