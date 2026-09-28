import { query } from '../db/index.js';
import { MIN_AGE } from '../lib/policy.js';
import { scorePair, flatten, norm } from '../lib/compatibility.js';

export const getProfile = async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM profiles WHERE user_id = $1 LIMIT 1',
      [req.userId],
    );

    return res.json({ profile: rows[0] ?? null });
  } catch (err) {
    console.error('[users/getProfile]', err);
    return res.status(500).json({ error: 'Failed to fetch profile.' });
  }
};

export const updateProfile = async (req, res) => {
  try {
    // TODO: validate and update profile fields for req.userId
    res.json({ message: 'updateProfile — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const setupProfile = async (req, res) => {
  try {
    const userId = req.userId;

    const {
      full_name,
      age,
      location,
      school_company,
      bio,
      profile_photo_url,
      interests,
      skills,
      goals,
      availability,
      group_size_preference,
      connection_preference,
      connection_purposes,
      social_preferences,
    } = req.body ?? {};

    if (age != null && age !== '') {
      const parsedAge = parseInt(age, 10);
      if (isNaN(parsedAge) || parsedAge < MIN_AGE) {
        return res.status(400).json({ error: `You must be at least ${MIN_AGE} years old to use TrueHive.` });
      }
    }

    const { rows } = await query(
      `INSERT INTO profiles (
         user_id, full_name, age, location, school_company, bio, profile_photo_url,
         interests, skills, goals, availability,
         group_size_preference, connection_preference,
         connection_purposes, social_preferences
       ) VALUES (
         $1,  $2,  $3,  $4,  $5,  $6,  $7,
         $8,  $9,  $10, $11,
         $12, $13,
         $14, $15
       )
       ON CONFLICT (user_id) DO UPDATE SET
         full_name             = EXCLUDED.full_name,
         age                   = EXCLUDED.age,
         location              = EXCLUDED.location,
         school_company        = EXCLUDED.school_company,
         bio                   = EXCLUDED.bio,
         profile_photo_url     = EXCLUDED.profile_photo_url,
         interests             = EXCLUDED.interests,
         skills                = EXCLUDED.skills,
         goals                 = EXCLUDED.goals,
         availability          = EXCLUDED.availability,
         group_size_preference = EXCLUDED.group_size_preference,
         connection_preference = EXCLUDED.connection_preference,
         connection_purposes   = EXCLUDED.connection_purposes,
         social_preferences    = EXCLUDED.social_preferences,
         updated_at            = NOW()
       RETURNING profile_id, user_id`,
      [
        userId,
        full_name        || null,
        age != null && age !== '' ? parseInt(age, 10) : null,
        location         || null,
        school_company   || null,
        bio              || null,
        profile_photo_url || null,
        JSON.stringify(interests          ?? []),
        JSON.stringify(skills             ?? []),
        JSON.stringify(goals              ?? []),
        JSON.stringify(availability       ?? []),
        group_size_preference || null,
        connection_preference || null,
        JSON.stringify(connection_purposes ?? []),
        JSON.stringify(social_preferences  ?? {}),
      ],
    );

    return res.status(200).json({ profile: rows[0] });
  } catch (err) {
    console.error('[users/setupProfile]', err);
    return res.status(500).json({ error: 'Failed to save profile.' });
  }
};

export const getCompatibility = async (req, res) => {
  try {
    // TODO: compute and return compatibility score between user and hive
    res.json({ score: null, reasons: [], message: 'getCompatibility — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getActivity = async (req, res) => {
  try {
    const userId = req.userId;
    const { rows } = await query(
      `SELECT label, ts, type FROM (
         SELECT 'Joined TrueHive' AS label, u.created_at AS ts, 'joined' AS type
         FROM users u WHERE u.user_id = $1
         UNION ALL
         SELECT 'Updated your profile' AS label, p.updated_at AS ts, 'profile' AS type
         FROM profiles p JOIN users u ON u.user_id = p.user_id
         WHERE p.user_id = $1
           AND p.updated_at > u.created_at + INTERVAL '1 minute'
         UNION ALL
         SELECT 'Joined ' || h.hive_name AS label, hm.joined_at AS ts, 'hive' AS type
         FROM hive_members hm JOIN hives h ON h.hive_id = hm.hive_id
         WHERE hm.user_id = $1 AND hm.membership_status = 'active'
       ) a
       ORDER BY ts DESC
       LIMIT 5`,
      [userId],
    );
    return res.json({ activity: rows });
  } catch (err) {
    console.error('[users/getActivity]', err);
    return res.status(500).json({ error: 'Failed to fetch activity.' });
  }
};

// ── Member profile (another user, viewed by the logged-in member) ────────────
//
// Every section is scoped to what the VIEWER may see:
//   Hive History  mirrors hivesController.js:493 — a Hive is private when
//                 discoverable = FALSE and the viewer has no active membership.
//   Activity      mirrors postsController._assertCanRead — member, OR follower
//                 when the post is visibility='public'. Expressed as SQL
//                 because that helper gates a single post, not a list.

// Literal intersection of two chip lists, matching how overlapScore compares
// them (norm()), but returning the target's original strings for display.
function sharedItems(aRaw, bRaw) {
  const aSet = new Set(flatten(aRaw));
  const seen = new Set();
  const out = [];
  for (const raw of (Array.isArray(bRaw) ? bRaw : flatten(bRaw))) {
    const n = norm(typeof raw === 'object' ? JSON.stringify(raw) : raw);
    if (aSet.has(n) && !seen.has(n)) { seen.add(n); out.push(String(raw)); }
  }
  return out;
}

function parseJsonish(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return v ?? [];
}

export const getMemberProfile = async (req, res) => {
  try {
    const viewerId = req.userId;
    const targetId = req.params.id;

    if (targetId === viewerId) {
      return res.status(400).json({ error: 'Use /api/users/profile for your own profile.' });
    }

    const { rows: [target] } = await query(
      `SELECT p.*, u.created_at AS joined_at, u.last_login
         FROM profiles p
         JOIN users u ON u.user_id = p.user_id
        WHERE p.user_id = $1`,
      [targetId],
    );
    if (!target) return res.status(404).json({ error: 'Member not found.' });

    const { rows: [viewer] } = await query(
      `SELECT * FROM profiles WHERE user_id = $1`, [viewerId],
    );

    // ── Shared Hives ───────────────────────────────────────────────────────
    const { rows: sharedHives } = await query(
      `SELECT h.hive_id, h.hive_name, h.logo_url, h.banner_url,
              h.location_type, c.category_name
         FROM hive_members a
         JOIN hive_members b ON b.hive_id = a.hive_id
                            AND b.user_id = $2
                            AND b.membership_status = 'active'
         JOIN hives h        ON h.hive_id = a.hive_id
         LEFT JOIN categories c ON c.category_id = h.category_id
        WHERE a.user_id = $1 AND a.membership_status = 'active'
        ORDER BY h.hive_name`,
      [viewerId, targetId],
    );

    // ── Hive History — private Hives the viewer is not in are excluded ──────
    const { rows: hiveHistory } = await query(
      `SELECT h.hive_id, h.hive_name, h.discoverable, c.category_name,
              hm.role, hm.joined_at,
              EXISTS(SELECT 1 FROM hive_members v
                      WHERE v.hive_id = h.hive_id AND v.user_id = $1
                        AND v.membership_status = 'active') AS viewer_is_member
         FROM hive_members hm
         JOIN hives h ON h.hive_id = hm.hive_id
         LEFT JOIN categories c ON c.category_id = h.category_id
        WHERE hm.user_id = $2
          AND hm.membership_status = 'active'
          AND (
            h.discoverable = TRUE
            OR EXISTS(SELECT 1 FROM hive_members v
                       WHERE v.hive_id = h.hive_id AND v.user_id = $1
                         AND v.membership_status = 'active')
          )
        ORDER BY hm.joined_at DESC`,
      [viewerId, targetId],
    );

    // ── Compatibility ──────────────────────────────────────────────────────
    // Read the cache first, then compute and write through — the same pattern
    // as hivesController.js:119-142. getHiveRequests already displays this
    // cached number as "% with you", so reading it keeps the two consistent.
    const [ua, ub] = viewerId < targetId ? [viewerId, targetId] : [targetId, viewerId];
    let compatibility = null;

    if (viewer) {
      const interestsShared = sharedItems(viewer.interests, parseJsonish(target.interests));
      const skillsShared    = sharedItems(viewer.skills,    parseJsonish(target.skills));

      // interests + goals + availability carry 75% of the weight; personality
      // and age fall back to a flat 50, so a sparse profile still scores ~13.
      // That looks like signal and is not, so it gets its own state.
      const enough =
        (flatten(viewer.interests).length > 0 && flatten(target.interests).length > 0) ||
        (flatten(viewer.goals).length     > 0 && flatten(target.goals).length     > 0);

      const { rows: [cached] } = await query(
        `SELECT total_score, interests_score, goals_score, personality_score,
                availability_score, age_score
           FROM user_compatibility WHERE user_a = $1 AND user_b = $2`,
        [ua, ub],
      );

      let total, factors;
      if (cached) {
        total   = Number(cached.total_score);
        factors = {
          interests:    Number(cached.interests_score),
          goals:        Number(cached.goals_score),
          personality:  Number(cached.personality_score),
          availability: Number(cached.availability_score),
          age:          Number(cached.age_score),
        };
      } else {
        ({ factors, total } = scorePair(viewer, target));
        await query(
          `INSERT INTO user_compatibility
             (user_a, user_b, interests_score, goals_score, personality_score,
              availability_score, age_score, total_score, calculated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW())
           ON CONFLICT (user_a, user_b) DO NOTHING`,
          [ua, ub, factors.interests, factors.goals, factors.personality,
           factors.availability, factors.age, total],
        );
      }

      compatibility = {
        total: Math.round(total),
        factors,
        enoughData: enough,
        source: cached ? 'cache' : 'computed',
        sharedInterests: interestsShared,
        sharedSkills:    skillsShared,
      };
    }

    return res.json({
      profile: {
        user_id: target.user_id,
        full_name: target.full_name,
        location: target.location,
        school_company: target.school_company,
        bio: target.bio,
        profile_photo_url: target.profile_photo_url,
        interests: target.interests,
        skills: target.skills,
        goals: target.goals,
        availability: target.availability,
        group_size_preference: target.group_size_preference,
        connection_preference: target.connection_preference,
        connection_purposes: target.connection_purposes,
        social_preferences: target.social_preferences,
        joined_at: target.joined_at,
        last_login: target.last_login,
      },
      compatibility,
      sharedHives,
      hiveHistory,
    });
  } catch (err) {
    console.error('[users/getMemberProfile]', err);
    return res.status(500).json({ error: 'Failed to load member profile.' });
  }
};

export const getMemberActivity = async (req, res) => {
  try {
    const viewerId = req.userId;
    const targetId = req.params.id;

    // Mirrors _assertCanRead: member of the Hive, OR follower when the post
    // itself is visibility='public'. A post in a Hive the viewer cannot read
    // never enters the result set — there is no client-side filtering.
    const { rows } = await query(
      `SELECT hp.post_id, hp.headline, hp.post_type, hp.created_at, hp.visibility,
              h.hive_id, h.hive_name
         FROM hive_posts hp
         JOIN hives h ON h.hive_id = hp.hive_id
        WHERE hp.author_user_id = $2
          AND (
            EXISTS(SELECT 1 FROM hive_members v
                    WHERE v.hive_id = hp.hive_id AND v.user_id = $1
                      AND v.membership_status = 'active')
            OR (hp.visibility = 'public'
                AND EXISTS(SELECT 1 FROM hive_followers f
                            WHERE f.hive_id = hp.hive_id AND f.user_id = $1))
          )
        ORDER BY hp.created_at DESC
        LIMIT 8`,
      [viewerId, targetId],
    );
    return res.json({ activity: rows });
  } catch (err) {
    console.error('[users/getMemberActivity]', err);
    return res.status(500).json({ error: 'Failed to load member activity.' });
  }
};

export const getSuggestions = async (req, res) => {
  try {
    const userId = req.userId;
    const { rows } = await query(
      `SELECT
         p.user_id, p.full_name, p.location, p.profile_photo_url,
         p.interests, p.connection_purposes,
         uc.total_score
       FROM user_compatibility uc
       JOIN profiles p ON p.user_id = CASE
         WHEN uc.user_a = $1 THEN uc.user_b
         ELSE uc.user_a
       END
       WHERE (uc.user_a = $1 OR uc.user_b = $1)
         AND p.full_name IS NOT NULL
       ORDER BY uc.total_score DESC
       LIMIT 3`,
      [userId],
    );
    return res.json({ suggestions: rows });
  } catch (err) {
    console.error('[users/getSuggestions]', err);
    return res.status(500).json({ error: 'Failed to fetch suggestions.' });
  }
};
