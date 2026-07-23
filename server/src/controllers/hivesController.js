import { query } from '../db/index.js';
import {
  scorePurpose,
  scorePair,
  aggregatePeopleFit,
  blendScores,
  buildReasons,
} from '../lib/compatibility.js';
import { createNotification } from './notificationsController.js';

export const CATEGORY_NAME_MAP = {
  social:       'Social Groups',
  professional: 'Professional Networking',
  travel:       'Travel Buddies',
  project:      'Project Collaboration',
  event:        'Event Buddies',
  specialized:  'Specialized Groups',
};

export const matchHives = async (req, res) => {
  try {
    const { category, textValues } = req.body;

    // 1. Load caller profile
    const { rows: [profile] } = await query(
      'SELECT * FROM profiles WHERE user_id = $1',
      [req.userId],
    );
    if (!profile) return res.json({ hives: [], waitingCount: 0, needsProfile: true });

    // Enrich profile location with search-form city if profile has none
    const locationFromSearch =
      textValues?.['social-city'] ||
      textValues?.['event-city']  ||
      textValues?.['professional-city'] ||
      null;
    const enrichedProfile = {
      ...profile,
      location: profile.location || locationFromSearch,
    };

    // 2. Resolve category → category_id
    let categoryId = null;
    if (category) {
      const catName = CATEGORY_NAME_MAP[category] ?? null;
      if (catName) {
        const { rows: [cat] } = await query(
          'SELECT category_id FROM categories WHERE category_name = $1',
          [catName],
        );
        categoryId = cat?.category_id ?? null;
      }
    }

    // 3. Query candidate hives (discoverable, active, not full, caller not already a member)
    const candidateParams = [req.userId];
    let categoryFilter = '';
    if (categoryId) {
      candidateParams.push(categoryId);
      categoryFilter = `AND h.category_id = $${candidateParams.length}`;
    }

    const { rows: candidates } = await query(
      `SELECT h.*,
              c.category_name,
              COUNT(hm.user_id) FILTER (WHERE hm.membership_status = 'active') AS member_count,
              EXISTS(
                SELECT 1 FROM hive_followers WHERE hive_id = h.hive_id AND user_id = $1
              ) AS is_following,
              EXISTS(
                SELECT 1 FROM join_requests WHERE hive_id = h.hive_id AND user_id = $1 AND status = 'pending'
              ) AS request_pending
       FROM hives h
       LEFT JOIN categories   c  ON c.category_id = h.category_id
       LEFT JOIN hive_members hm ON hm.hive_id    = h.hive_id
       WHERE h.discoverable = TRUE
         AND h.hive_status  = 'active'
         AND NOT EXISTS(
           SELECT 1 FROM hive_members
           WHERE hive_id = h.hive_id AND user_id = $1 AND membership_status = 'active'
         )
         ${categoryFilter}
       GROUP BY h.hive_id, c.category_id, c.category_name
       HAVING (h.max_members IS NULL OR
               COUNT(hm.user_id) FILTER (WHERE hm.membership_status = 'active') < h.max_members)`,
      candidateParams,
    );

    // 4. Score each candidate
    const scored = [];
    for (const hive of candidates) {
      const { factors: purposeFactors, total: purposeTotal } =
        scorePurpose(enrichedProfile, hive, category || null);

      // Load active members' profiles (excluding caller)
      const { rows: memberProfiles } = await query(
        `SELECT p.*
         FROM hive_members hm
         JOIN profiles p ON p.user_id = hm.user_id
         WHERE hm.hive_id = $1 AND hm.membership_status = 'active' AND hm.user_id != $2`,
        [hive.hive_id, req.userId],
      );

      // Pairwise scores with 7-day cache
      const pairResults = [];
      for (const mp of memberProfiles) {
        const [ua, ub] = [req.userId, mp.user_id].sort();

        const { rows: [cached] } = await query(
          `SELECT total_score FROM user_compatibility
           WHERE user_a = $1 AND user_b = $2
             AND calculated_at > NOW() - INTERVAL '7 days'`,
          [ua, ub],
        );

        let pairTotal;
        if (cached) {
          pairTotal = Number(cached.total_score);
        } else {
          const { factors, total } = scorePair(enrichedProfile, mp);
          pairTotal = total;
          await query(
            `INSERT INTO user_compatibility
               (user_a, user_b, interests_score, goals_score, personality_score,
                availability_score, age_score, total_score, calculated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW())
             ON CONFLICT (user_a, user_b) DO UPDATE SET
               interests_score    = EXCLUDED.interests_score,
               goals_score        = EXCLUDED.goals_score,
               personality_score  = EXCLUDED.personality_score,
               availability_score = EXCLUDED.availability_score,
               age_score          = EXCLUDED.age_score,
               total_score        = EXCLUDED.total_score,
               calculated_at      = NOW()`,
            [ua, ub,
             factors.interests, factors.goals, factors.personality,
             factors.availability, factors.age, pairTotal],
          );
        }

        pairResults.push({
          user_id:           mp.user_id,
          full_name:         mp.full_name,
          profile_photo_url: mp.profile_photo_url,
          pair_score:        pairTotal,
        });
      }

      const peopleFit  = aggregatePeopleFit(pairResults.map(p => p.pair_score));
      const matchScore = blendScores(purposeTotal, peopleFit);

      // Persist blended score to compatibility_scores
      await query(
        `INSERT INTO compatibility_scores
           (user_id, hive_id, category_score, interest_score, skill_score, goal_score,
            location_score, availability_score, personality_score, total_score, calculated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
         ON CONFLICT (user_id, hive_id) DO UPDATE SET
           category_score     = EXCLUDED.category_score,
           interest_score     = EXCLUDED.interest_score,
           skill_score        = EXCLUDED.skill_score,
           goal_score         = EXCLUDED.goal_score,
           location_score     = EXCLUDED.location_score,
           availability_score = EXCLUDED.availability_score,
           personality_score  = EXCLUDED.personality_score,
           total_score        = EXCLUDED.total_score,
           calculated_at      = NOW()`,
        [
          req.userId, hive.hive_id,
          purposeFactors.category,    purposeFactors.interests,
          purposeFactors.skills,      purposeFactors.goals,
          purposeFactors.location,    purposeFactors.availability,
          purposeFactors.personality, matchScore,
        ],
      );

      const member_matches = pairResults.sort((a, b) => b.pair_score - a.pair_score);
      const reasons        = buildReasons(purposeFactors, peopleFit, member_matches);

      scored.push({
        ...hive,
        match_score:       matchScore,
        purpose_score:     purposeTotal,
        people_score:      peopleFit,
        member_matches,
        reasons,
        _category_score:   purposeFactors.category,
      });
    }

    // 5. Sort DESC, drop zero-category if category is selected, cap 20
    let results = scored.sort((a, b) => b.match_score - a.match_score);
    if (category) results = results.filter(h => h._category_score > 0);
    results = results.map(({ _category_score, ...h }) => h).slice(0, 20);

    // 6. waitingCount for the resolved category
    let waitingCount = 0;
    if (categoryId) {
      const { rows: [wRow] } = await query(
        `SELECT COUNT(*) FROM waitlist WHERE category_id = $1 AND status = 'waiting'`,
        [categoryId],
      );
      waitingCount = Number(wRow.count);
    }

    res.json({ hives: results, waitingCount, needsProfile: false });
  } catch (err) {
    console.error('[hives/matchHives]', err);
    res.status(500).json({ error: 'Failed to run matching.' });
  }
};

export const joinWaitlist = async (req, res) => {
  try {
    const { category, location } = req.body;
    if (!category) return res.status(400).json({ error: 'Category is required.' });

    const catName = CATEGORY_NAME_MAP[category] ?? null;
    if (!catName) return res.status(400).json({ error: 'Unknown category.' });

    const { rows: [cat] } = await query(
      'SELECT category_id FROM categories WHERE category_name = $1',
      [catName],
    );
    const categoryId = cat?.category_id ?? null;

    // Dedupe: only insert if not already waiting for this category
    const { rows: [existing] } = await query(
      `SELECT waitlist_id FROM waitlist
       WHERE user_id = $1 AND category_id = $2 AND status = 'waiting'`,
      [req.userId, categoryId],
    );
    if (!existing) {
      await query(
        `INSERT INTO waitlist (user_id, category_id, location, status)
         VALUES ($1, $2, $3, 'waiting')`,
        [req.userId, categoryId, location ?? null],
      );
    }

    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*) FROM waitlist WHERE category_id = $1 AND status = 'waiting'`,
      [categoryId],
    );

    res.json({ joined: true, waitingCount: Number(count) });
  } catch (err) {
    console.error('[hives/joinWaitlist]', err);
    res.status(500).json({ error: 'Failed to join waitlist.' });
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
         COUNT(DISTINCT hf.user_id)                                                          AS follower_count,
         my_mem.role                                                                          AS my_role,
         my_mem.welcome_seen_at,
         EXISTS(SELECT 1 FROM hive_followers WHERE hive_id = h.hive_id AND user_id = $1)    AS is_following,
         COALESCE((
           SELECT COUNT(*)::int FROM hive_posts hp
           WHERE hp.hive_id = h.hive_id
             AND hp.author_user_id != $1
             AND hp.created_at > COALESCE(hls.last_seen_at, '1970-01-01'::timestamptz)
         ), 0) AS new_posts
       FROM hives h
       LEFT JOIN categories    c       ON c.category_id  = h.category_id
       LEFT JOIN hive_members  hm_all  ON hm_all.hive_id = h.hive_id
       LEFT JOIN hive_followers hf     ON hf.hive_id     = h.hive_id
       LEFT JOIN hive_members  my_mem  ON my_mem.hive_id = h.hive_id
                                      AND my_mem.user_id = $1
                                      AND my_mem.membership_status = 'active'
       LEFT JOIN hive_last_seen hls    ON hls.user_id = $1 AND hls.hive_id = h.hive_id
       WHERE h.hive_id = $2
       GROUP BY h.hive_id, c.category_name, my_mem.role, my_mem.welcome_seen_at, hls.last_seen_at`,
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
              p.full_name, p.profile_photo_url, p.bio, p.location,
              CASE WHEN p.bio IS NOT NULL
                    AND p.profile_photo_url IS NOT NULL
                    AND p.interests IS NOT NULL
                   THEN true ELSE false END AS profile_complete
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
      `WITH my_hives_base AS (
         SELECT h.*, c.category_name, hm.role,
                COUNT(DISTINCT hm2.user_id) FILTER (WHERE hm2.membership_status = 'active') AS member_count,
                COALESCE(hls.last_seen_at, '1970-01-01'::timestamptz) AS last_seen_at
         FROM   hive_members hm
         JOIN   hives h   ON h.hive_id    = hm.hive_id
         LEFT JOIN categories c   ON c.category_id  = h.category_id
         LEFT JOIN hive_members hm2 ON hm2.hive_id  = h.hive_id
         LEFT JOIN hive_last_seen hls ON hls.user_id = $1 AND hls.hive_id = h.hive_id
         WHERE  hm.user_id = $1 AND hm.membership_status = 'active'
         GROUP  BY h.hive_id, c.category_name, hm.role,
                   COALESCE(hls.last_seen_at, '1970-01-01'::timestamptz)
       ),
       enriched AS (
         SELECT b.*,
           (SELECT COUNT(*)::int FROM hive_posts hp
            WHERE hp.hive_id = b.hive_id AND hp.author_user_id != $1
              AND hp.created_at > b.last_seen_at
           ) AS new_posts,
           (SELECT COUNT(*)::int FROM hive_members hm3
            WHERE hm3.hive_id = b.hive_id AND hm3.user_id != $1
              AND hm3.membership_status = 'active' AND hm3.joined_at > b.last_seen_at
           ) AS new_members,
           (SELECT p.full_name FROM hive_members hm_new
            LEFT JOIN profiles p ON p.user_id = hm_new.user_id
            WHERE hm_new.hive_id = b.hive_id AND hm_new.user_id != $1
              AND hm_new.membership_status = 'active' AND hm_new.joined_at > b.last_seen_at
            ORDER BY hm_new.joined_at DESC LIMIT 1
           ) AS newest_member_name,
           GREATEST(
             (SELECT MAX(hp2.created_at) FROM hive_posts hp2 WHERE hp2.hive_id = b.hive_id),
             (SELECT MAX(hm5.joined_at)  FROM hive_members hm5
              WHERE hm5.hive_id = b.hive_id AND hm5.membership_status = 'active')
           ) AS last_activity_at
         FROM my_hives_base b
       )
       SELECT * FROM enriched
       ORDER BY (new_posts + new_members) DESC, last_activity_at DESC NULLS LAST`,
      [req.userId],
    );
    res.json({ hives: rows });
  } catch (err) {
    console.error('[hives/getMyHive]', err);
    res.status(500).json({ error: 'Failed to fetch your Hives.' });
  }
};

export const markHiveSeen = async (req, res) => {
  try {
    await query(
      `INSERT INTO hive_last_seen (user_id, hive_id, last_seen_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, hive_id) DO UPDATE SET last_seen_at = NOW()`,
      [req.userId, req.params.id],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[hives/markHiveSeen]', err);
    res.status(500).json({ error: 'Failed to mark seen.' });
  }
};

export const markWelcomeSeen = async (req, res) => {
  try {
    const { rowCount } = await query(
      `UPDATE hive_members SET welcome_seen_at = NOW()
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [req.params.id, req.userId],
    );
    if (!rowCount) return res.status(404).json({ error: 'Membership not found.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[hives/markWelcomeSeen]', err);
    res.status(500).json({ error: 'Failed to mark welcome seen.' });
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

    // Add creator as owner; stamp welcome_seen_at so they skip the takeover
    try {
      await query(
        `INSERT INTO hive_members (hive_id, user_id, role, membership_status, welcome_seen_at)
         VALUES ($1, $2, 'owner', 'active', NOW())`,
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
    const hiveId = req.params.id;

    const { rows: [myRole] } = await query(
      `SELECT role FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (!myRole || !['owner', 'admin'].includes(myRole.role)) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    const WHITELIST = [
      'description', 'pinned_goal', 'ground_rules', 'icebreaker',
      'cadence', 'location', 'location_type', 'max_members',
      'join_policy', 'discoverable',
    ];
    const updates = {};
    for (const key of WHITELIST) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates[key] = req.body[key];
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    const keys = Object.keys(updates);
    const vals = Object.values(updates);
    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

    await query(
      `UPDATE hives SET ${setClauses}, updated_at = NOW() WHERE hive_id = $${keys.length + 1}`,
      [...vals, hiveId],
    );

    const { rows: [updated] } = await query(
      `SELECT h.*, c.category_name
       FROM hives h
       LEFT JOIN categories c ON c.category_id = h.category_id
       WHERE h.hive_id = $1`,
      [hiveId],
    );

    res.json({ hive: updated });
  } catch (err) {
    console.error('[hives/updateHive]', err);
    res.status(500).json({ error: 'Failed to update Hive.' });
  }
};

export const joinHive = async (req, res) => {
  try {
    res.json({ message: 'joinHive — not yet implemented' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── requestToJoin ─────────────────────────────────────────────────────────────
export const requestToJoin = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const { message } = req.body;

    // Load hive + member count in one query
    const { rows: [hive] } = await query(
      `SELECT h.*,
              COUNT(hm.user_id) FILTER (WHERE hm.membership_status = 'active') AS member_count
       FROM hives h
       LEFT JOIN hive_members hm ON hm.hive_id = h.hive_id
       WHERE h.hive_id = $1
       GROUP BY h.hive_id`,
      [hiveId],
    );
    if (!hive) return res.status(404).json({ error: 'Hive not found.' });
    if (hive.hive_status !== 'active')
      return res.status(400).json({ error: 'This Hive is not currently active.' });

    // Already a member?
    const { rows: [existingMember] } = await query(
      `SELECT 1 FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (existingMember) return res.status(400).json({ error: 'You are already a member of this Hive.' });

    // Full?
    if (hive.max_members && Number(hive.member_count) >= Number(hive.max_members)) {
      return res.status(400).json({ error: 'This Hive is full.' });
    }

    // Open policy → join directly, no request needed
    if (hive.join_policy === 'open') {
      await query(
        `INSERT INTO hive_members (hive_id, user_id, role, membership_status)
         VALUES ($1, $2, 'member', 'active')
         ON CONFLICT (hive_id, user_id) DO UPDATE SET membership_status = 'active'`,
        [hiveId, req.userId],
      );
      return res.json({ joined: true });
    }

    // Check for an existing request row
    const { rows: [existingReq] } = await query(
      `SELECT request_id, status FROM join_requests WHERE hive_id = $1 AND user_id = $2`,
      [hiveId, req.userId],
    );

    if (existingReq) {
      if (existingReq.status === 'pending') {
        return res.status(400).json({ error: 'Request already pending.' });
      }
      // Rejected or previously accepted → reset to pending (re-request)
      await query(
        `UPDATE join_requests
         SET status = 'pending', request_message = $3,
             requested_at = NOW(), reviewed_at = NULL, reviewed_by = NULL
         WHERE hive_id = $1 AND user_id = $2`,
        [hiveId, req.userId, message?.trim() || null],
      );
    } else {
      await query(
        `INSERT INTO join_requests (hive_id, user_id, request_message)
         VALUES ($1, $2, $3)`,
        [hiveId, req.userId, message?.trim() || null],
      );
    }

    // Notify hive owners/admins (best-effort)
    try {
      const [{ rows: [requester] }, { rows: ownerAdmins }] = await Promise.all([
        query(`SELECT full_name FROM profiles WHERE user_id = $1`, [req.userId]),
        query(
          `SELECT user_id FROM hive_members
           WHERE hive_id = $1 AND role IN ('owner','admin') AND membership_status = 'active'`,
          [hiveId],
        ),
      ]);
      const name = requester?.full_name ?? 'Someone';
      for (const m of ownerAdmins) {
        await createNotification({
          userId: m.user_id,
          type: 'join_request',
          title: `${name} requested to join ${hive.hive_name}`,
          hiveId,
          actorUserId: req.userId,
          link: `/hive/${hiveId}`,
        });
      }
    } catch (e) {
      console.error('[hives/requestToJoin] notification failed (non-fatal):', e);
    }

    res.json({ requested: true });
  } catch (err) {
    console.error('[hives/requestToJoin]', err);
    res.status(500).json({ error: 'Failed to submit request.' });
  }
};

// ── getHiveRequests ───────────────────────────────────────────────────────────
export const getHiveRequests = async (req, res) => {
  try {
    const hiveId = req.params.id;

    const { rows: [myRole] } = await query(
      `SELECT role FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (!myRole || !['owner', 'admin'].includes(myRole.role)) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    const { rows } = await query(
      `SELECT jr.request_id, jr.user_id, jr.request_message, jr.status, jr.requested_at,
              p.full_name, p.profile_photo_url, p.age, p.location, p.interests, p.skills,
              u.member_id,
              uc.total_score AS pair_score,
              cs.total_score AS hive_fit_score
       FROM join_requests jr
       LEFT JOIN profiles p  ON p.user_id  = jr.user_id
       LEFT JOIN users u     ON u.user_id  = jr.user_id
       LEFT JOIN user_compatibility uc ON (
         (uc.user_a = $2 AND uc.user_b = jr.user_id) OR
         (uc.user_b = $2 AND uc.user_a = jr.user_id)
       )
       LEFT JOIN compatibility_scores cs ON (cs.user_id = jr.user_id AND cs.hive_id = $1)
       WHERE jr.hive_id = $1 AND jr.status = 'pending'
       ORDER BY cs.total_score DESC NULLS LAST, jr.requested_at ASC`,
      [hiveId, req.userId],
    );

    const { rows: [cap] } = await query(
      `SELECT h.max_members,
              COUNT(hm.user_id) FILTER (WHERE hm.membership_status = 'active') AS member_count
       FROM hives h
       LEFT JOIN hive_members hm ON hm.hive_id = h.hive_id
       WHERE h.hive_id = $1
       GROUP BY h.hive_id`,
      [hiveId],
    );

    res.json({
      requests:     rows,
      member_count: cap?.member_count != null ? Number(cap.member_count) : 0,
      max_members:  cap?.max_members  != null ? Number(cap.max_members)  : null,
    });
  } catch (err) {
    console.error('[hives/getHiveRequests]', err);
    res.status(500).json({ error: 'Failed to fetch requests.' });
  }
};

// ── reviewRequest ─────────────────────────────────────────────────────────────
export const reviewRequest = async (req, res) => {
  try {
    const { id: hiveId, requestId } = req.params;
    const { action } = req.body;

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "accept" or "reject".' });
    }

    const { rows: [myRole] } = await query(
      `SELECT role FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (!myRole || !['owner', 'admin'].includes(myRole.role)) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    const { rows: [request] } = await query(
      `SELECT request_id, user_id FROM join_requests
       WHERE request_id = $1 AND hive_id = $2 AND status = 'pending'`,
      [requestId, hiveId],
    );
    if (!request) return res.status(404).json({ error: 'Request not found or already reviewed.' });

    if (action === 'accept') {
      // Re-check capacity before accepting
      const { rows: [countRow] } = await query(
        `SELECT h.max_members,
                COUNT(hm.user_id) FILTER (WHERE hm.membership_status = 'active') AS member_count
         FROM hives h
         LEFT JOIN hive_members hm ON hm.hive_id = h.hive_id
         WHERE h.hive_id = $1
         GROUP BY h.hive_id`,
        [hiveId],
      );
      if (countRow.max_members &&
          Number(countRow.member_count) >= Number(countRow.max_members)) {
        return res.status(400).json({ error: 'Hive is full.' });
      }

      await query(
        `UPDATE join_requests
         SET status = 'accepted', reviewed_at = NOW(), reviewed_by = $1
         WHERE request_id = $2`,
        [req.userId, requestId],
      );
      await query(
        `INSERT INTO hive_members (hive_id, user_id, role, membership_status, welcome_seen_at)
         VALUES ($1, $2, 'member', 'active', NULL)
         ON CONFLICT (hive_id, user_id) DO UPDATE
           SET membership_status = 'active', welcome_seen_at = NULL`,
        [hiveId, request.user_id],
      );
    } else {
      await query(
        `UPDATE join_requests
         SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $1
         WHERE request_id = $2`,
        [req.userId, requestId],
      );
    }

    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*) FROM hive_members WHERE hive_id = $1 AND membership_status = 'active'`,
      [hiveId],
    );

    // ── Join ceremony (best-effort — never rolls back the acceptance) ──────────
    let newMember = null;
    if (action === 'accept') {
      try {
        const [{ rows: [requester] }, { rows: [hiveRow] }, { rows: existingMembers }, { rows: [memberRow] }] = await Promise.all([
          query(
            `SELECT p.full_name, p.profile_photo_url, u.member_id
             FROM profiles p JOIN users u ON u.user_id = p.user_id
             WHERE p.user_id = $1`,
            [request.user_id],
          ),
          query(`SELECT hive_name FROM hives WHERE hive_id = $1`, [hiveId]),
          query(
            `SELECT user_id FROM hive_members
             WHERE hive_id = $1 AND membership_status = 'active' AND user_id != $2`,
            [hiveId, request.user_id],
          ),
          query(
            `SELECT joined_at FROM hive_members WHERE hive_id = $1 AND user_id = $2`,
            [hiveId, request.user_id],
          ),
        ]);

        const requesterName = requester?.full_name ?? 'A new member';
        const hiveName = hiveRow?.hive_name ?? 'the Hive';
        newMember = {
          user_id:           request.user_id,
          full_name:         requesterName,
          profile_photo_url: requester?.profile_photo_url ?? null,
          member_id:         requester?.member_id ?? null,
          joined_at:         memberRow?.joined_at ?? null,
        };

        // 1. Welcome the new member — notification links to the Hive (takeover shows there)
        await createNotification({
          userId: request.user_id,
          type: 'request_accepted',
          title: `You're in! Welcome to ${hiveName}`,
          body: `Open your Hive to see your welcome.`,
          hiveId,
          actorUserId: req.userId,
          link: `/hive/${hiveId}`,
        });

        // 2. Notify all other active members (owner + existing)
        for (const m of existingMembers) {
          await createNotification({
            userId: m.user_id,
            type: 'member_joined',
            title: `${requesterName} joined ${hiveName}`,
            body: 'Give them a warm welcome 👋',
            hiveId,
            actorUserId: request.user_id,
            link: `/hive/${hiveId}`,
          });
        }

        // 3. Milestone post — shows in home feed as a member-count event
        await query(
          `INSERT INTO hive_posts (hive_id, author_user_id, post_type, headline, body)
           VALUES ($1, $2, 'milestone', $3, $4)`,
          [hiveId, request.user_id,
           `🎉 ${requesterName} joined the Hive`,
           `Give a warm welcome to your newest member.`],
        );

        // 4. Welcome post — lives inside the Hive feed; existing members react with a wave
        await query(
          `INSERT INTO hive_posts (hive_id, author_user_id, post_type, headline, body)
           VALUES ($1, $2, 'welcome', $3, $4)`,
          [hiveId, request.user_id,
           `Welcome ${requesterName} to ${hiveName}!`,
           `Introduce yourself and give them a warm hello! 👋`],
        );
      } catch (ceremonyErr) {
        console.error('[hives/reviewRequest] ceremony failed (non-fatal):', ceremonyErr);
      }
    }

    res.json({ reviewed: true, action, member_count: Number(count), new_member: newMember });
  } catch (err) {
    console.error('[hives/reviewRequest]', err);
    res.status(500).json({ error: 'Failed to review request.' });
  }
};

// ── getMyRequests ─────────────────────────────────────────────────────────────
export const getMyRequests = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT jr.request_id, jr.hive_id, jr.status, jr.request_message,
              jr.requested_at, jr.reviewed_at,
              h.hive_name, c.category_name
       FROM join_requests jr
       JOIN hives h ON h.hive_id = jr.hive_id
       LEFT JOIN categories c ON c.category_id = h.category_id
       WHERE jr.user_id = $1
       ORDER BY jr.requested_at DESC`,
      [req.userId],
    );
    res.json({ requests: rows });
  } catch (err) {
    console.error('[hives/getMyRequests]', err);
    res.status(500).json({ error: 'Failed to fetch your requests.' });
  }
};

// ── getHiveOverview ───────────────────────────────────────────────────────────
export const getHiveOverview = async (req, res) => {
  try {
    const hiveId = req.params.id;

    const { rows: [myRole] } = await query(
      `SELECT role FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (!myRole || !['owner', 'admin'].includes(myRole.role)) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    // Core metrics
    const { rows: [metrics] } = await query(
      `SELECT h.max_members, h.hive_status,
              COUNT(DISTINCT hm.user_id) FILTER (WHERE hm.membership_status = 'active') AS member_count,
              COUNT(DISTINCT jr.request_id) FILTER (WHERE jr.status = 'pending')        AS pending_count
       FROM hives h
       LEFT JOIN hive_members  hm ON hm.hive_id = h.hive_id
       LEFT JOIN join_requests jr ON jr.hive_id = h.hive_id
       WHERE h.hive_id = $1
       GROUP BY h.hive_id`,
      [hiveId],
    );

    const pendingCount = Number(metrics?.pending_count ?? 0);

    // Members without a completed profile (age not set — proxy for incomplete setup)
    const { rows: [incRow] } = await query(
      `SELECT COUNT(*) AS cnt
       FROM hive_members hm
       LEFT JOIN profiles p ON p.user_id = hm.user_id
       WHERE hm.hive_id = $1 AND hm.membership_status = 'active' AND p.age IS NULL`,
      [hiveId],
    );
    const incompleteCount = Number(incRow?.cnt ?? 0);

    // Build action items
    const action_items = [];
    if (pendingCount > 0) {
      action_items.push({ type: 'requests', count: pendingCount, label: 'membership request(s) need review' });
    }
    if (incompleteCount > 0) {
      action_items.push({ type: 'profiles', count: incompleteCount, label: "member(s) haven't completed their profile" });
    }

    // Recent activity (member joins + posts, last 10)
    const { rows: recent_activity } = await query(
      `(
         SELECT COALESCE(p.full_name, 'Someone') || ' joined' AS label, hm.joined_at AS timestamp
         FROM hive_members hm
         LEFT JOIN profiles p ON p.user_id = hm.user_id
         WHERE hm.hive_id = $1 AND hm.membership_status = 'active'
         ORDER BY hm.joined_at DESC LIMIT 5
       )
       UNION ALL
       (
         SELECT COALESCE(p.full_name, 'Someone') || ' posted' AS label, hp.created_at AS timestamp
         FROM hive_posts hp
         LEFT JOIN profiles p ON p.user_id = hp.author_user_id
         WHERE hp.hive_id = $1
         ORDER BY hp.created_at DESC LIMIT 5
       )
       ORDER BY timestamp DESC LIMIT 10`,
      [hiveId],
    );

    res.json({
      member_count:    Number(metrics?.member_count ?? 0),
      max_members:     metrics?.max_members ? Number(metrics.max_members) : null,
      hive_status:     metrics?.hive_status ?? 'active',
      pending_count:   pendingCount,
      action_items,
      recent_activity,
    });
  } catch (err) {
    console.error('[hives/getHiveOverview]', err);
    res.status(500).json({ error: 'Failed to load overview.' });
  }
};

export const updateMemberRole = async (req, res) => {
  try {
    const { id: hiveId, userId: targetId } = req.params;
    const callerId = req.userId;

    const { role: newRole } = req.body ?? {};
    if (!['admin', 'member'].includes(newRole)) {
      return res.status(400).json({ error: "role must be 'admin' or 'member'." });
    }

    // Load caller + target roles in one query
    const { rows } = await query(
      `SELECT hm.user_id, hm.role
       FROM hive_members hm
       WHERE hm.hive_id = $1 AND hm.user_id = ANY($2::uuid[]) AND hm.membership_status = 'active'`,
      [hiveId, [callerId, targetId]],
    );
    const callerRow = rows.find(r => r.user_id === callerId);
    const targetRow = rows.find(r => r.user_id === targetId);

    if (!callerRow || !['owner', 'admin'].includes(callerRow.role)) {
      return res.status(403).json({ error: 'Not authorised.' });
    }
    if (!targetRow) return res.status(404).json({ error: 'Member not found.' });
    if (targetRow.role === 'owner')  return res.status(403).json({ error: 'Cannot change the owner\'s role.' });
    if (targetId === callerId)       return res.status(403).json({ error: 'Cannot change your own role.' });
    // Admins may only act on plain members
    if (callerRow.role === 'admin' && targetRow.role !== 'member') {
      return res.status(403).json({ error: 'Admins can only modify members.' });
    }

    await query(
      `UPDATE hive_members SET role = $1
       WHERE hive_id = $2 AND user_id = $3 AND membership_status = 'active'`,
      [newRole, hiveId, targetId],
    );
    res.json({ updated: true, user_id: targetId, role: newRole });
  } catch (err) {
    console.error('[hives/updateMemberRole]', err);
    res.status(500).json({ error: 'Failed to update role.' });
  }
};

export const removeMember = async (req, res) => {
  try {
    const { id: hiveId, userId: targetId } = req.params;
    const callerId = req.userId;

    const { rows } = await query(
      `SELECT hm.user_id, hm.role
       FROM hive_members hm
       WHERE hm.hive_id = $1 AND hm.user_id = ANY($2::uuid[]) AND hm.membership_status = 'active'`,
      [hiveId, [callerId, targetId]],
    );
    const callerRow = rows.find(r => r.user_id === callerId);
    const targetRow = rows.find(r => r.user_id === targetId);

    if (!callerRow || !['owner', 'admin'].includes(callerRow.role)) {
      return res.status(403).json({ error: 'Not authorised.' });
    }
    if (!targetRow) return res.status(404).json({ error: 'Member not found.' });
    if (targetRow.role === 'owner')  return res.status(403).json({ error: 'Cannot remove the owner.' });
    if (targetId === callerId)       return res.status(403).json({ error: 'Cannot remove yourself here.' });
    // Admins cannot remove other admins
    if (callerRow.role === 'admin' && targetRow.role === 'admin') {
      return res.status(403).json({ error: 'Admins cannot remove other admins.' });
    }

    await query(
      `UPDATE hive_members SET membership_status = 'removed'
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, targetId],
    );

    const { rows: [{ member_count }] } = await query(
      `SELECT COUNT(*) AS member_count FROM hive_members
       WHERE hive_id = $1 AND membership_status = 'active'`,
      [hiveId],
    );
    res.json({ removed: true, user_id: targetId, member_count: Number(member_count) });
  } catch (err) {
    console.error('[hives/removeMember]', err);
    res.status(500).json({ error: 'Failed to remove member.' });
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

// ── notifyMember ──────────────────────────────────────────────────────────────
export const notifyMember = async (req, res) => {
  try {
    const { id: hiveId, userId: targetId } = req.params;
    const { message } = req.body ?? {};
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required.' });

    const { rows: [myRole] } = await query(
      `SELECT role FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (!myRole || !['owner', 'admin'].includes(myRole.role)) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    const { rows: [target] } = await query(
      `SELECT user_id FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, targetId],
    );
    if (!target) return res.status(404).json({ error: 'Member not found.' });

    const { rows: [hiveRow] } = await query(
      `SELECT hive_name FROM hives WHERE hive_id = $1`, [hiveId],
    );

    await createNotification({
      userId:      targetId,
      type:        'owner_message',
      title:       `Message from ${hiveRow?.hive_name ?? 'your Hive'}`,
      body:        message.trim(),
      hiveId,
      actorUserId: req.userId,
      link:        `/hive/${hiveId}`,
    });

    res.json({ sent: true });
  } catch (err) {
    console.error('[hives/notifyMember]', err);
    res.status(500).json({ error: 'Failed to send message.' });
  }
};
