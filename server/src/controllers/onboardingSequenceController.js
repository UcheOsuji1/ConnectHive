import { query } from '../db/index.js';
import { requireMembership } from '../lib/hiveMembership.js';
import { flatten } from '../lib/compatibility.js';
import { getDefaultChannelId } from '../lib/hiveChannels.js';
import { getEnrichedMessage, depersonalise } from './messagesController.js';
import { PLAN_SELECT, PLAN_END, shapePlan } from './eventsController.js';
import { getIO } from '../realtime/socket.js';

const MAX_PEOPLE = 6;

function sharedCount(aRaw, bRaw) {
  const aSet = new Set(flatten(aRaw));
  const bList = flatten(bRaw);
  let n = 0;
  const seen = new Set();
  for (const x of bList) {
    if (aSet.has(x) && !seen.has(x)) { seen.add(x); n++; }
  }
  return n;
}

// ── GET /api/hives/:id/onboarding/sequence?preview=1 ──────────────────────────
// One response, built from parallel queries. `preview=1` is owner/admin-only:
// it runs the exact same assembly against the CALLER's own profile, so the
// Preview-as-a-new-member modal shows real data without needing a second
// account — and, crucially, never touches onboarding_screen or hive_member_intros.
export const getSequence = async (req, res) => {
  try {
    const hiveId  = req.params.id;
    const preview = req.query.preview === '1';
    const member  = await requireMembership(hiveId, req.userId);

    if (preview && !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only owners and admins can preview onboarding.' });
    }

    const [hiveRes, settingsRes, meRes, introRes, channelsRes, membersRes, planRes] = await Promise.all([
      query(
        `SELECT h.hive_id, h.hive_name, h.banner_url, h.founder_note, h.hive_values, h.ground_rules,
                h.location, h.location_type, c.category_name
           FROM hives h LEFT JOIN categories c ON c.category_id = h.category_id
          WHERE h.hive_id = $1`,
        [hiveId],
      ),
      query(`SELECT * FROM hive_onboarding_settings WHERE hive_id = $1`, [hiveId]),
      query(`SELECT full_name, profile_photo_url, interests FROM profiles WHERE user_id = $1`, [req.userId]),
      query(
        `SELECT intro, interests, answers FROM hive_member_intros WHERE hive_id = $1 AND user_id = $2`,
        [hiveId, req.userId],
      ),
      query(
        `SELECT channel_id, name, icon, channel_type FROM hive_channels
          WHERE hive_id = $1 AND archived_at IS NULL ORDER BY position ASC`,
        [hiveId],
      ),
      query(
        `SELECT hm.user_id, hm.role, hm.joined_at, p.full_name, p.profile_photo_url, p.bio, p.interests
           FROM hive_members hm LEFT JOIN profiles p ON p.user_id = hm.user_id
          WHERE hm.hive_id = $1 AND hm.membership_status = 'active' AND hm.user_id != $2`,
        [hiveId, req.userId],
      ),
      query(
        `${PLAN_SELECT}
          WHERE p.hive_id = $2 AND p.post_type = 'event'
            AND p.event_at IS NOT NULL AND ${PLAN_END} >= NOW()
          ORDER BY p.event_at ASC LIMIT 1`,
        [req.userId, hiveId],
      ),
      // LEFT JOIN LATERAL owner-with-creator-fallback — same pattern as
      // hiveHomeController/HiveAboutPage, but we need the full identity here.
    ]);

    const hive = hiveRes.rows[0];
    if (!hive) return res.status(404).json({ error: 'Hive not found.' });
    const settings = settingsRes.rows[0] ?? {};
    const me = meRes.rows[0] ?? {};

    const { rows: [ownerRow] } = await query(
      `SELECT u.user_id, p.full_name, p.profile_photo_url
         FROM hive_members hm
         JOIN users u ON u.user_id = hm.user_id
         LEFT JOIN profiles p ON p.user_id = hm.user_id
        WHERE hm.hive_id = $1 AND hm.role = 'owner' AND hm.membership_status = 'active'
        ORDER BY hm.joined_at ASC NULLS LAST LIMIT 1`,
      [hiveId],
    );

    const myInterests = me.interests;
    const peopleToMeet = membersRes.rows
      .map(m => ({
        user_id: m.user_id, full_name: m.full_name, profile_photo_url: m.profile_photo_url, bio: m.bio,
        shared_interest_count: sharedCount(myInterests, m.interests),
        joined_at: m.joined_at,
      }))
      .sort((a, b) => b.shared_interest_count - a.shared_interest_count || new Date(a.joined_at) - new Date(b.joined_at))
      .slice(0, MAX_PEOPLE)
      .map(({ joined_at, ...rest }) => rest);

    const resumeScreen = preview ? 1 : (member.onboarding_screen ?? 1);

    res.json({
      preview,
      resumeScreen,
      screenConfig: settings.screen_config ?? {},
      rulesAcceptanceRequired: !!settings.rules_acceptance_required,
      categoryQuestionsEnabled: settings.category_questions_enabled !== false,
      introQuestions: settings.intro_questions ?? [],
      autoWelcomePost: !!settings.auto_welcome_post,
      hive: {
        hive_id: hive.hive_id, hive_name: hive.hive_name, banner_url: hive.banner_url,
        category_name: hive.category_name, location: hive.location, location_type: hive.location_type,
        hive_values: hive.hive_values, ground_rules: hive.ground_rules, founder_note: hive.founder_note,
      },
      founder: ownerRow ?? null,
      welcomeMessage: settings.welcome_message ?? null,
      me: { full_name: me.full_name, profile_photo_url: me.profile_photo_url, interests: me.interests ?? [] },
      existingIntro: introRes.rows[0] ?? null,
      channels: channelsRes.rows,
      peopleToMeet,
      nextPlan: planRes.rows.length ? shapePlan(planRes.rows[0]) : null,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[onboardingSequence/getSequence]', err);
    res.status(500).json({ error: 'Failed to load the onboarding sequence.' });
  }
};

// ── POST /api/hives/:id/onboarding/sequence/screen ────────────────────────────
// Body: { screen }. Persists resume position. Never called in preview mode —
// the client simply never calls it when previewing.
export const saveScreen = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const screen = Number(req.body?.screen);
    if (!Number.isInteger(screen) || screen < 1 || screen > 5) {
      return res.status(400).json({ error: 'screen must be an integer between 1 and 5.' });
    }
    await query(
      `UPDATE hive_members SET onboarding_screen = $3
        WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId, screen],
    );
    res.json({ saved: true, screen });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[onboardingSequence/saveScreen]', err);
    res.status(500).json({ error: 'Failed to save progress.' });
  }
};

// ── POST /api/hives/:id/onboarding/intro ───────────────────────────────────────
// Screen 3 ("Make yourself known"). Hive-local only — never touches the
// member's global profile. With auto_welcome_post on and a non-empty intro,
// posts it to #general (or the hive's default channel) exactly once.
export const saveIntro = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);

    const { intro, interests, answers, roomChannelIds } = req.body ?? {};
    const introText = intro == null ? null : String(intro).trim().slice(0, 280) || null;
    const interestsArr = Array.isArray(interests) ? interests : [];
    const answersObj = (answers && typeof answers === 'object' && !Array.isArray(answers)) ? answers : {};
    if (Array.isArray(roomChannelIds)) answersObj.rooms = roomChannelIds;

    const { rows: [existing] } = await query(
      `SELECT intro_id FROM hive_member_intros WHERE hive_id = $1 AND user_id = $2`,
      [hiveId, req.userId],
    );

    const { rows: [row] } = await query(
      `INSERT INTO hive_member_intros (hive_id, user_id, intro, interests, answers)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (hive_id, user_id) DO UPDATE SET
         intro = EXCLUDED.intro, interests = EXCLUDED.interests, answers = EXCLUDED.answers
       RETURNING intro_id, intro, interests, answers, created_at`,
      [hiveId, req.userId, introText, JSON.stringify(interestsArr), JSON.stringify(answersObj)],
    );

    let posted = false;
    // Only the first save creates the welcome post — a refresh-and-resave on
    // screen 3 must not spam #general with duplicate introductions.
    if (!existing && introText) {
      const { rows: [settings] } = await query(
        `SELECT auto_welcome_post FROM hive_onboarding_settings WHERE hive_id = $1`,
        [hiveId],
      );
      if (settings?.auto_welcome_post) {
        try {
          const channelId = await getDefaultChannelId(hiveId);
          if (channelId) {
            const { rows: [ins] } = await query(
              `INSERT INTO messages (hive_id, channel_id, sender_user_id, message_text)
               VALUES ($1,$2,$3,$4) RETURNING message_id`,
              [hiveId, channelId, req.userId, introText],
            );
            posted = true;
            const msg = await getEnrichedMessage(ins.message_id, req.userId);
            try {
              const io = getIO();
              io.to(`hive:${hiveId}:ch:${channelId}`).emit('receive_message', depersonalise(msg));
              io.to(`hive:${hiveId}`).emit('channel_activity', { hive_id: hiveId, channel_id: channelId });
            } catch { /* no socket in tests */ }
          }
        } catch (postErr) {
          console.error('[onboardingSequence/saveIntro] auto_welcome_post failed (non-fatal):', postErr);
        }
      }
    }

    res.json({ saved: true, intro: row, posted });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[onboardingSequence/saveIntro]', err);
    res.status(500).json({ error: 'Failed to save your introduction.' });
  }
};
