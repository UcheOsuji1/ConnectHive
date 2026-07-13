import { query } from '../db/index.js';

const CATEGORY_NAME_MAP = {
  social:       'Social Groups',
  professional: 'Professional Networking',
  travel:       'Travel Buddies',
  project:      'Project Collaboration',
  event:        'Event Buddies',
  specialized:  'Specialized Groups',
};

export const matchHives = async (req, res) => {
  try {
    // TODO: run compatibility matching for req.body.category + prefillData,
    //       return { hives: [...], waitingCount: N }
    res.json({ hives: [], waitingCount: 0, message: 'matchHives — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const saveDraft = async (req, res) => {
  try {
    // TODO: upsert draft hive for authenticated user
    res.json({ message: 'saveDraft — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getHives = async (req, res) => {
  try {
    // TODO: query hives with filters (category, location, search) + compatibility scores
    res.json({ hives: [], message: 'getHives — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getHive = async (req, res) => {
  try {
    const { rows: [row] } = await query(
      `SELECT
         h.*,
         c.category_name,
         COUNT(DISTINCT hm_all.user_id) FILTER (WHERE hm_all.membership_status = 'active') AS member_count,
         COUNT(DISTINCT hf.user_id)                                                         AS follower_count,
         my_mem.role                                                                         AS my_role,
         EXISTS(SELECT 1 FROM hive_followers WHERE hive_id = h.hive_id AND user_id = $1)   AS is_following
       FROM hives h
       LEFT JOIN categories    c       ON c.category_id  = h.category_id
       LEFT JOIN hive_members  hm_all  ON hm_all.hive_id = h.hive_id
       LEFT JOIN hive_followers hf     ON hf.hive_id     = h.hive_id
       LEFT JOIN hive_members  my_mem  ON my_mem.hive_id = h.hive_id
                                      AND my_mem.user_id = $1
                                      AND my_mem.membership_status = 'active'
       WHERE h.hive_id = $2
       GROUP BY h.hive_id, c.category_name, my_mem.role`,
      [req.userId, req.params.id],
    );
    if (!row) return res.status(404).json({ error: 'Hive not found.' });

    if (!row.discoverable && row.my_role === null) {
      return res.json({
        hive: {
          hive_id:       row.hive_id,
          hive_name:     row.hive_name,
          category_name: row.category_name,
          member_count:  row.member_count,
          discoverable:  false,
          my_role:       null,
          is_following:  row.is_following,
          private:       true,
        },
      });
    }

    res.json({ hive: row });
  } catch (err) {
    console.error('[hives/getHive]', err);
    res.status(500).json({ error: 'Failed to fetch Hive.' });
  }
};

export const getHiveMembers = async (req, res) => {
  try {
    const { rows: [hive] } = await query(
      `SELECT h.discoverable, my_mem.role AS my_role
       FROM hives h
       LEFT JOIN hive_members my_mem ON my_mem.hive_id = h.hive_id
                                    AND my_mem.user_id = $1
                                    AND my_mem.membership_status = 'active'
       WHERE h.hive_id = $2`,
      [req.userId, req.params.id],
    );
    if (!hive) return res.status(404).json({ error: 'Hive not found.' });
    if (!hive.discoverable && !hive.my_role) {
      return res.status(403).json({ error: 'This Hive is private.' });
    }

    const { rows } = await query(
      `SELECT hm.role, hm.joined_at,
              u.user_id, u.member_id,
              p.full_name, p.profile_photo_url, p.bio, p.location
       FROM hive_members hm
       JOIN  users    u ON u.user_id  = hm.user_id
       LEFT JOIN profiles p ON p.user_id = hm.user_id
       WHERE hm.hive_id = $1 AND hm.membership_status = 'active'
       ORDER BY
         CASE hm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
         hm.joined_at ASC NULLS LAST`,
      [req.params.id],
    );
    res.json({ members: rows });
  } catch (err) {
    console.error('[hives/getHiveMembers]', err);
    res.status(500).json({ error: 'Failed to fetch members.' });
  }
};

export const getMyHive = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT h.*, c.category_name, hm.role,
              COUNT(hm2.user_id) FILTER (WHERE hm2.membership_status = 'active') AS member_count
       FROM   hive_members hm
       JOIN   hives h   ON h.hive_id    = hm.hive_id
       LEFT JOIN categories c ON c.category_id = h.category_id
       LEFT JOIN hive_members hm2 ON hm2.hive_id = h.hive_id
       WHERE  hm.user_id = $1 AND hm.membership_status = 'active'
       GROUP  BY h.hive_id, c.category_name, hm.role, hm.joined_at
       ORDER  BY hm.joined_at DESC`,
      [req.userId],
    );
    res.json({ hives: rows });
  } catch (err) {
    console.error('[hives/getMyHive]', err);
    res.status(500).json({ error: 'Failed to fetch your Hives.' });
  }
};

export const followHive = async (req, res) => {
  try {
    const { id: hiveId } = req.params;
    const { rows } = await query('SELECT hive_id FROM hives WHERE hive_id = $1', [hiveId]);
    if (!rows.length) return res.status(404).json({ error: 'Hive not found.' });
    await query(
      `INSERT INTO hive_followers (hive_id, user_id) VALUES ($1, $2)
       ON CONFLICT (hive_id, user_id) DO NOTHING`,
      [hiveId, req.userId],
    );
    res.json({ following: true });
  } catch (err) {
    console.error('[hives/followHive]', err);
    res.status(500).json({ error: 'Failed to follow Hive.' });
  }
};

export const unfollowHive = async (req, res) => {
  try {
    await query(
      'DELETE FROM hive_followers WHERE hive_id = $1 AND user_id = $2',
      [req.params.id, req.userId],
    );
    res.json({ following: false });
  } catch (err) {
    console.error('[hives/unfollowHive]', err);
    res.status(500).json({ error: 'Failed to unfollow Hive.' });
  }
};

export const getFollowedHives = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT h.*, c.category_name,
              COUNT(hm.user_id) FILTER (WHERE hm.membership_status = 'active') AS member_count
       FROM   hive_followers hf
       JOIN   hives h ON h.hive_id = hf.hive_id
       LEFT JOIN categories c  ON c.category_id = h.category_id
       LEFT JOIN hive_members hm ON hm.hive_id = h.hive_id
       WHERE  hf.user_id = $1
       GROUP  BY h.hive_id, c.category_name, hf.followed_at
       ORDER  BY hf.followed_at DESC`,
      [req.userId],
    );
    res.json({ hives: rows });
  } catch (err) {
    console.error('[hives/getFollowedHives]', err);
    res.status(500).json({ error: 'Failed to fetch followed Hives.' });
  }
};

export const createHive = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      name, category, description, tags, idealMembers,
      joinPolicy, discoverable, maxMembers, activationThreshold,
      meetingType, location, cadence, pinnedGoal, groundRules, icebreaker,
    } = req.body;

    if (!name || !name.trim() || !category) {
      return res.status(400).json({ error: 'Hive name and category are required.' });
    }

    // Resolve category_id from seeded category name
    const categoryName = CATEGORY_NAME_MAP[category] ?? null;
    let categoryId = null;
    if (categoryName) {
      const catResult = await query(
        'SELECT category_id FROM categories WHERE category_name = $1 LIMIT 1',
        [categoryName],
      );
      categoryId = catResult.rows[0]?.category_id ?? null;
    }

    const locationType = meetingType ? meetingType.toLowerCase() : null;

    const { rows: [hive] } = await query(
      `INSERT INTO hives (
        creator_user_id, category_id, hive_name, description, ideal_members,
        max_members, activation_threshold, tags, join_policy, discoverable,
        location_type, location, cadence, pinned_goal, ground_rules, icebreaker
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        userId,
        categoryId,
        name.trim(),
        description || null,
        idealMembers || null,
        maxMembers ?? null,
        activationThreshold || 3,
        JSON.stringify(Array.isArray(tags) ? tags : []),
        joinPolicy || 'open',
        discoverable ?? true,
        locationType,
        location || null,
        cadence || null,
        pinnedGoal || null,
        groundRules || null,
        icebreaker || null,
      ],
    );

    // Add creator as owner; on failure, roll back the hive row
    try {
      await query(
        `INSERT INTO hive_members (hive_id, user_id, role, membership_status)
         VALUES ($1, $2, 'owner', 'active')`,
        [hive.hive_id, userId],
      );
    } catch (memberErr) {
      await query('DELETE FROM hives WHERE hive_id = $1', [hive.hive_id]);
      throw memberErr;
    }

    res.status(201).json({ id: hive.hive_id, hive });
  } catch (err) {
    console.error('[hives/createHive]', err);
    res.status(500).json({ error: 'Failed to create Hive.' });
  }
};

export const updateHive = async (req, res) => {
  try {
    // TODO: verify requester is admin, update hive record
    res.json({ message: 'updateHive — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const joinHive = async (req, res) => {
  try {
    // TODO: create join request or add directly if open hive
    res.json({ message: 'joinHive — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getHiveMessages = async (req, res) => {
  try {
    // TODO: paginated message history for hive chat
    res.json({ messages: [], message: 'getHiveMessages — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
