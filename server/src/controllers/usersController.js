import { query } from '../db/index.js';
import { MIN_AGE } from '../lib/policy.js';

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
