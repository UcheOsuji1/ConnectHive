import crypto from 'crypto';
import { getPairScore } from '../lib/pairScoreCache.js';
import { query, getClient } from '../db/index.js';
import {
  scorePurpose,
  aggregatePeopleFit,
  blendScores,
  buildReasons,
  norm,
  ageInBand,
} from '../lib/compatibility.js';
import { createNotification } from './notificationsController.js';
import { evictUserFromHive } from '../realtime/socket.js';
import { getCategoryConfig } from '../lib/categoryConfig.js';
import { PLAN_END } from './eventsController.js';
import { getAttendanceRate } from './checkinsController.js';
import { blockedIdsFor, isBlockedEitherWay } from '../lib/blocks.js';
import { sendYoureInEmail } from '../lib/email.js';
import { resolveMetro, resolveLocationMetro, metroByKey, LAUNCH_METROS } from '../lib/metros.js';
import { readRefineFilters, matchesRefine, sizeBucket } from '../lib/discoveryFilters.js';

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
    const { category, textValues, searchMetroKey, searchMode, ageBands, refineFilters } = req.body;

    // 1. Load caller profile
    const { rows: [profile] } = await query(
      'SELECT * FROM profiles WHERE user_id = $1',
      [req.userId],
    );
    if (!profile) return res.json({ hives: [], waitingCount: 0, needsProfile: true });

    // Enrich profile location with search-form city if profile has none. The
    // search answer wins over a saved profile city — someone searching from
    // a different city than their profile's is answering about THIS search,
    // not updating their profile.
    const locationFromSearch =
      textValues?.['social-city'] || textValues?.['event-city'] || textValues?.['professional-city'] ||
      textValues?.['travel-city'] || textValues?.['project-city'] || textValues?.['spec-city'] ||
      null;
    const enrichedProfile = {
      ...profile,
      location: locationFromSearch || profile.location,
    };

    // The search wins: an explicit searchMetroKey from current-location/
    // autocomplete, else resolve the typed city text, else fall back to the
    // profile's own saved location. Only area-mode searches resolve this —
    // an explicit "online only" search has no area to find.
    let resolvedMetroKey = searchMode === 'online' ? null : (searchMetroKey || null);
    if (!resolvedMetroKey && searchMode !== 'online') {
      if (locationFromSearch) resolvedMetroKey = await resolveMetro(locationFromSearch);
      if (!locationFromSearch && profile.location) resolvedMetroKey = await resolveMetro(profile.location);
    }
    const needsArea = searchMode !== 'online' && !resolvedMetroKey;

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

    // Area filter: an explicit "online only" search (or no area at all —
    // needsArea covers that case client-side) only ever returns online
    // Hives; an area search returns online Hives PLUS in-person/hybrid
    // Hives in that metro.
    let areaFilter = `AND h.location_type = 'online'`;
    if (searchMode !== 'online' && resolvedMetroKey) {
      candidateParams.push(resolvedMetroKey);
      areaFilter = `AND (h.location_type = 'online' OR (h.location_type IN ('in-person', 'hybrid') AND h.metro_key = $${candidateParams.length}))`;
    }

    const refineClauses = [];
    for (const [key, expression] of [
      ['connection', 'h.location_type'],
      ['groupSize', "CASE WHEN h.max_members IS NULL OR h.max_members > 30 THEN 'large' WHEN h.max_members <= 10 THEN 'small' ELSE 'medium' END"],
      ['cadence', 'lower(trim(h.cadence))'],
    ]) {
      const values = refineFilters?.[key];
      if (Array.isArray(values) && values.length) {
        candidateParams.push(values.filter(v => typeof v === 'string'));
        refineClauses.push(`AND ${expression} = ANY($${candidateParams.length}::text[])`);
      }
    }
    const { rows: candidates } = await query(
      `SELECT h.*,
              c.category_name,
              COUNT(hm.user_id) FILTER (WHERE hm.membership_status = 'active')::int AS member_count,
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
         ${areaFilter}
         ${refineClauses.join('\n')}
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
    const blockedIds = await blockedIdsFor(req.userId);
    const hasAgeBands = Array.isArray(ageBands) && ageBands.length > 0 && !ageBands.includes('Any age');
    const scored = [];
    for (const hive of candidates) {
      const { factors: purposeFactors, total: purposeTotal } =
        scorePurpose(enrichedProfile, hive, category || null);

      // Load active members' profiles (excluding caller and anyone blocked
      // either way — a blocked pair must never see each other's cards here).
      const { rows: memberProfiles } = await query(
        `SELECT p.*
         FROM hive_members hm
         JOIN profiles p ON p.user_id = hm.user_id
         JOIN users u ON u.user_id = hm.user_id AND u.account_status = 'active'
         WHERE hm.hive_id = $1 AND hm.membership_status = 'active' AND hm.user_id != $2
           AND hm.user_id != ALL($3)`,
        [hive.hive_id, req.userId, blockedIds],
      );

      // Pairwise scores via the shared 7-day cache (lib/pairScoreCache.js), so
      // Discovery, suggestions and the profile page cannot drift apart.
      const pairResults = [];
      for (const mp of memberProfiles) {
        const { total: pairTotal } = await getPairScore(enrichedProfile, mp);

        pairResults.push({
          user_id:           mp.user_id,
          full_name:         mp.full_name,
          profile_photo_url: mp.profile_photo_url,
          pair_score:        pairTotal,
        });
      }

      const peopleFit  = aggregatePeopleFit(pairResults.map(p => p.pair_score));
      const matchScore = blendScores(purposeTotal, peopleFit);

      // Ages are a ranking signal, not a filter — never changes which Hives
      // appear, only their order. Needs at least 2 members with a known age
      // to be meaningful; otherwise the score is left untouched. Computed
      // from the blended score already persisted below, so the stored
      // compatibility_scores row stays a stable, search-independent fact —
      // only this response's match_score carries the penalty.
      let ageShare = null;
      let finalScore = matchScore;
      if (hasAgeBands) {
        const withAge = memberProfiles.filter(mp => mp.age != null);
        if (withAge.length >= 2) {
          const inBand = withAge.filter(mp => ageBands.some(b => ageInBand(mp.age, b))).length;
          ageShare = inBand / withAge.length;
          finalScore = Math.max(0, matchScore - Math.round(15 * (1 - ageShare)));
        }
      }

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
          // scorePurpose returns `cadence`, never `availability` — that key
          // belongs to scorePair. Passing the missing key sent NULL into a
          // NOT NULL column and 500'd every Discovery request.
          purposeFactors.location,    purposeFactors.cadence,
          purposeFactors.personality, matchScore,
        ],
      );

      const member_matches = pairResults.sort((a, b) => b.pair_score - a.pair_score);
      const reasons        = buildReasons(purposeFactors, peopleFit, member_matches);

      scored.push({
        ...hive,
        match_score:       finalScore,
        purpose_score:     purposeTotal,
        people_score:      peopleFit,
        age_share:         ageShare,
        ageShare,
        member_matches,
        reasons,
        _category_score:   purposeFactors.category,
      });
    }

    // 5. Sort DESC, drop zero-category if category is selected, cap 20
    let results = scored.sort((a, b) => b.match_score - a.match_score);
    if (category) results = results.filter(h => h._category_score > 0);
    results = results.map(({ _category_score, ...h }) => h).slice(0, 20);

    // 6. waitingCount for this category AND area — a queue for "Social in
    // Miami" is a different promise than one for "Social in LA".
    let waitingCount = 0;
    if (categoryId) {
      const { rows: [wRow] } = await query(
        `SELECT COUNT(*)::int FROM waitlist
          WHERE category_id = $1 AND metro_key IS NOT DISTINCT FROM $2 AND status = 'waiting'`,
        [categoryId, resolvedMetroKey],
      );
      waitingCount = Number(wRow.count);
    }

    // 7. Area info for the client — name lookup only when something resolved.
    const resolvedMetro = resolvedMetroKey ? await metroByKey(resolvedMetroKey) : null;
    const area = resolvedMetro ? { metro_key: resolvedMetro.metro_key, name: resolvedMetro.name } : null;
    const isLaunchArea = LAUNCH_METROS.includes(resolvedMetroKey);

    res.json({ hives: results, waitingCount, needsProfile: false, area, isLaunchArea, needsArea });
  } catch (err) {
    console.error('[hives/matchHives]', err);
    res.status(500).json({ error: 'Failed to run matching.' });
  }
};

// ── Quick find: lookup, not a filter ───────────────────────────────────────────
// Matches a name (discoverable hives only) OR an exact code (any hive, private
// included — the code itself is the access grant). The privacy rule lives here,
// in the SQL: a private hive can only enter the result set via the hive_code
// equality branch, never via the ILIKE name branch. There is no post-query
// client-side filtering to bypass.
export const quickFindHives = async (req, res) => {
  try {
    const qRaw = String(req.query.q ?? '').trim();
    if (qRaw.length < 2) return res.json({ hives: [] });

    const namePattern = `%${qRaw}%`;
    const codeDigits   = qRaw.replace(/^TH-?/i, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const codeGuess    = codeDigits ? `TH-${codeDigits}` : '';

    // The results page asks for more than the dropdown does. Capped so the
    // parameter cannot be used to pull the whole table.
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 50);

    const { rows } = await query(
      `SELECT h.hive_id, h.hive_name, h.hive_code, h.location, h.location_type,
              h.logo_url, h.banner_url, h.description, h.join_policy,
              c.category_name,
              COUNT(hm.user_id) FILTER (WHERE hm.membership_status = 'active')::int AS member_count
       FROM hives h
       LEFT JOIN categories c    ON c.category_id = h.category_id
       LEFT JOIN hive_members hm ON hm.hive_id    = h.hive_id
       WHERE h.hive_status = 'active'
         AND (
           (h.discoverable = TRUE AND h.hive_name ILIKE $1)
           OR h.hive_code = $2
         )
       GROUP BY h.hive_id, c.category_name
       ORDER BY (h.hive_code = $2) DESC, h.hive_name ASC
       LIMIT $3`,
      [namePattern, codeGuess, limit],
    );

    res.json({ hives: rows });
  } catch (err) {
    console.error('[hives/quickFindHives]', err);
    res.status(500).json({ error: 'Search failed.' });
  }
};

// ── Real per-category Hive counts for the honeycomb ────────────────────────────
export const getCategoryCounts = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT c.category_name, COUNT(h.hive_id)::int AS hive_count
       FROM categories c
       LEFT JOIN hives h ON h.category_id = c.category_id
                         AND h.discoverable = TRUE AND h.hive_status = 'active'
       GROUP BY c.category_id, c.category_name`,
    );
    res.json({ counts: rows });
  } catch (err) {
    console.error('[hives/getCategoryCounts]', err);
    res.status(500).json({ error: 'Failed to load category counts.' });
  }
};

// ── Refine rail facet counts ────────────────────────────────────────────────────
// Counts are computed with every filter EXCEPT the dimension being counted
// applied — the standard faceted-search shape, so toggling "In-person" doesn't
// zero out the other connection-type counts. At ~15 discoverable hives this is
// cheap enough to do in application code rather than four separate aggregate
// queries.
export const getFilterFacets = async (req, res) => {
  try {
    const { rows: hives } = await query(
      `SELECT h.hive_id, h.location, h.metro_key, h.location_type, h.max_members, h.cadence, c.category_name
       FROM hives h LEFT JOIN categories c ON c.category_id = h.category_id
       WHERE h.discoverable = TRUE AND h.hive_status = 'active'`,
    );

    const filters = await readRefineFilters(req.query);
    const selMetro = filters.metroKey;
    const matches = (h, skip = {}) => matchesRefine(h, filters, skip);

    const locations = [...new Set(hives.map(h => h.location).filter(Boolean))].sort();

    const connectionOptions = ['online', 'in-person', 'hybrid'].map(value => ({
      value,
      count: hives.filter(h => h.location_type === value && matches(h, { conn: true })).length,
    }));

    const sizeOptions = ['small', 'medium', 'large'].map(value => ({
      value,
      count: hives.filter(h => sizeBucket(h.max_members) === value && matches(h, { size: true })).length,
    }));

    const cadenceValues = [...new Set(hives.map(h => norm(h.cadence)).filter(Boolean))];
    const cadenceOptions = cadenceValues.map(value => ({
      value,
      count: hives.filter(h => norm(h.cadence) === value && matches(h, { cadence: true })).length,
    }));

    const categoryCounts = {};
    for (const h of hives.filter(h => matches(h))) categoryCounts[h.category_name] = (categoryCounts[h.category_name] || 0) + 1;
    res.json({ locations, connectionOptions, sizeOptions, cadenceOptions, categoryCounts, metroKey: selMetro });
  } catch (err) {
    console.error('[hives/getFilterFacets]', err);
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Failed to load filters.' });
  }
};

// ── "Might suit you" — profile-only suggestions, no category required ──────────
// Score every eligible candidate with the same scorePurpose used by the real
// matching flow, take the top ~15, sample 3. Re-sampling (the "Show me others"
// control) just calls this again — the pool is recomputed but the top-15 scoring
// is cheap at this table size, so no server-side caching is needed yet.
export const getSuggestions = async (req, res) => {
  try {
    const { rows: [profile] } = await query('SELECT * FROM profiles WHERE user_id = $1', [req.userId]);
    if (!profile) return res.json({ hives: [] });

    const { rows: candidates } = await query(
      `SELECT h.*, c.category_name,
              COUNT(hm.user_id) FILTER (WHERE hm.membership_status = 'active')::int AS member_count
       FROM hives h
       LEFT JOIN categories   c  ON c.category_id = h.category_id
       LEFT JOIN hive_members hm ON hm.hive_id    = h.hive_id
       WHERE h.discoverable = TRUE AND h.hive_status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM hive_members
           WHERE hive_id = h.hive_id AND user_id = $1 AND membership_status = 'active'
         )
       GROUP BY h.hive_id, c.category_id, c.category_name
       HAVING (h.max_members IS NULL OR
               COUNT(hm.user_id) FILTER (WHERE hm.membership_status = 'active') < h.max_members)`,
      [req.userId],
    );

    const filters = await readRefineFilters(req.query);
    const scored = candidates.filter(hive => matchesRefine(hive, filters))
      .map(hive => {
        const { factors, total } = scorePurpose(profile, hive, null);
        return { hive, factors, total };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // Sample 3 without replacement — different set per call, always from the
    // genuinely-relevant top 15, never a static top 3 and never fully random.
    const pool = [...scored];
    const picks = [];
    while (picks.length < 3 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(i, 1)[0]);
    }

    const blockedIds = await blockedIdsFor(req.userId);
    const results = [];
    for (const { hive, factors, total } of picks) {
      // account_status = 'active' was missed in Prompt 68 Part D's sweep of
      // this exact pattern elsewhere (matchHives, getHiveMembers, etc.) —
      // fixed here alongside the block filter since it's the same query.
      const { rows: memberProfiles } = await query(
        `SELECT p.* FROM hive_members hm
         JOIN profiles p ON p.user_id = hm.user_id
         JOIN users u ON u.user_id = hm.user_id AND u.account_status = 'active'
         WHERE hm.hive_id = $1 AND hm.membership_status = 'active' AND hm.user_id != $2
           AND hm.user_id != ALL($3)`,
        [hive.hive_id, req.userId, blockedIds],
      );
      // Was scorePair() fresh on every request, which is exactly how this
      // surface drifted from Discovery and the profile page.
      const pairResults = [];
      for (const mp of memberProfiles) {
        const { total } = await getPairScore(profile, mp);
        pairResults.push({ user_id: mp.user_id, full_name: mp.full_name, pair_score: total });
      }
      pairResults.sort((a, b) => b.pair_score - a.pair_score);

      const peopleFit  = aggregatePeopleFit(pairResults.map(p => p.pair_score));
      const matchScore = blendScores(total, peopleFit);
      const reasons     = buildReasons(factors, peopleFit, pairResults);

      results.push({
        hive_id:       hive.hive_id,
        hive_name:     hive.hive_name,
        hive_code:     hive.hive_code,
        category_name: hive.category_name,
        tags:          hive.tags,
        member_count:  Number(hive.member_count),
        location:      hive.location,
        location_type: hive.location_type,
        match_score:   matchScore,
        reasons,
      });
    }

    res.json({ hives: results });
  } catch (err) {
    console.error('[hives/getSuggestions]', err);
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Failed to load suggestions.' });
  }
};

export const joinWaitlist = async (req, res) => {
  try {
    const { category, location } = req.body;
    const metroKey = Object.prototype.hasOwnProperty.call(req.body, 'metro_key') ? req.body.metro_key
      : Object.prototype.hasOwnProperty.call(req.body, 'metroKey') ? req.body.metroKey
      : (location ? await resolveMetro(location) : null);
    if (metroKey) {
      if (location) await resolveLocationMetro(location, metroKey);
      else if (!await metroByKey(metroKey)) return res.status(400).json({ error: 'Unknown metropolitan area.' });
    }
    if (!category) return res.status(400).json({ error: 'Category is required.' });

    const catName = CATEGORY_NAME_MAP[category] ?? null;
    if (!catName) return res.status(400).json({ error: 'Unknown category.' });

    const { rows: [cat] } = await query(
      'SELECT category_id FROM categories WHERE category_name = $1',
      [catName],
    );
    const categoryId = cat?.category_id ?? null;

    // Dedupe and count scope to (category, metro) — IS NOT DISTINCT FROM so
    // a metro-less wait (e.g. an online-only search) is its own bucket too,
    // same as a plain `= $n` would be if metro_key were never NULL.
    const { rows: [existing] } = await query(
      `SELECT waitlist_id FROM waitlist
       WHERE user_id = $1 AND category_id = $2 AND metro_key IS NOT DISTINCT FROM $3 AND status = 'waiting'`,
      [req.userId, categoryId, metroKey ?? null],
    );
    if (!existing) {
      await query(
        `INSERT INTO waitlist (user_id, category_id, location, metro_key, status)
         VALUES ($1, $2, $3, $4, 'waiting')`,
        [req.userId, categoryId, location ?? null, metroKey ?? null],
      );
    }

    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*)::int FROM waitlist WHERE category_id = $1 AND metro_key IS NOT DISTINCT FROM $2 AND status = 'waiting'`,
      [categoryId, metroKey ?? null],
    );

    res.json({ joined: true, waitingCount: Number(count) });
  } catch (err) {
    console.error('[hives/joinWaitlist]', err);
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Failed to join waitlist.' });
  }
};

export const getHive = async (req, res) => {
  try {
    const { rows: [row] } = await query(
      `SELECT
         h.*,
         c.category_name,
         COUNT(DISTINCT hm_all.user_id) FILTER (WHERE hm_all.membership_status = 'active')::int AS member_count,
         COUNT(DISTINCT hf.user_id)::int                                                     AS follower_count,
         my_mem.role                                                                          AS my_role,
         my_mem.welcome_seen_at,
         my_mem.onboarding_status,
         COALESCE(obs.access_mode, 'full')                                                   AS onboarding_access_mode,
         EXISTS(SELECT 1 FROM hive_followers WHERE hive_id = h.hive_id AND user_id = $1)    AS is_following,
         COALESCE((
           SELECT COUNT(*)::int FROM hive_posts hp
           WHERE hp.hive_id = h.hive_id
             AND hp.author_user_id != $1
             AND hp.created_at > COALESCE(hls.last_seen_at, '1970-01-01'::timestamptz)
         ), 0) AS new_posts
       FROM hives h
       LEFT JOIN categories               c       ON c.category_id  = h.category_id
       LEFT JOIN hive_members             hm_all  ON hm_all.hive_id = h.hive_id
       LEFT JOIN hive_followers           hf      ON hf.hive_id     = h.hive_id
       LEFT JOIN hive_members             my_mem  ON my_mem.hive_id = h.hive_id
                                                 AND my_mem.user_id = $1
                                                 AND my_mem.membership_status = 'active'
       LEFT JOIN hive_last_seen           hls     ON hls.user_id = $1 AND hls.hive_id = h.hive_id
       LEFT JOIN hive_onboarding_settings obs     ON obs.hive_id = h.hive_id
       WHERE h.hive_id = $2
       GROUP BY h.hive_id, c.category_name, my_mem.role, my_mem.welcome_seen_at,
                my_mem.onboarding_status, obs.access_mode, hls.last_seen_at`,
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
      `SELECT hm.role, hm.joined_at, hm.onboarding_status,
              u.user_id, u.presence_status,
              p.full_name, p.profile_photo_url, p.bio, p.location, p.interests, p.skills,
              CASE WHEN p.bio IS NOT NULL
                    AND p.profile_photo_url IS NOT NULL
                    AND p.interests IS NOT NULL
                   THEN true ELSE false END AS profile_complete,
              hls.last_seen_at,
              COUNT(mop.step_id)::int AS completed_steps,
              (SELECT COUNT(*)::int FROM hive_onboarding_steps hos
               WHERE hos.hive_id = hm.hive_id) AS total_steps
       FROM hive_members hm
       JOIN  users    u ON u.user_id  = hm.user_id
       LEFT JOIN profiles p ON p.user_id = hm.user_id
       LEFT JOIN hive_last_seen hls
              ON hls.user_id = hm.user_id AND hls.hive_id = hm.hive_id
       LEFT JOIN member_onboarding_progress mop
              ON mop.user_id = hm.user_id AND mop.hive_id = hm.hive_id
       WHERE hm.hive_id = $1 AND hm.membership_status = 'active' AND u.account_status = 'active'
         AND u.user_id != ALL($2)
       GROUP BY hm.hive_id, hm.role, hm.joined_at, hm.onboarding_status,
                u.user_id, u.presence_status,
                p.full_name, p.profile_photo_url, p.bio, p.location, p.interests, p.skills,
                hls.last_seen_at
       ORDER BY
         CASE hm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
         hm.joined_at ASC NULLS LAST`,
      [req.params.id, await blockedIdsFor(req.userId)],
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
                COUNT(DISTINCT hm2.user_id) FILTER (WHERE hm2.membership_status = 'active')::int AS member_count,
                COALESCE(hls.last_seen_at, '1970-01-01'::timestamptz) AS last_seen_at
         FROM   hive_members hm
         JOIN   hives h   ON h.hive_id    = hm.hive_id
         LEFT JOIN categories c   ON c.category_id  = h.category_id
         LEFT JOIN hive_members hm2 ON hm2.hive_id  = h.hive_id
         LEFT JOIN hive_last_seen hls ON hls.user_id = $1 AND hls.hive_id = h.hive_id
         WHERE  hm.user_id = $1 AND hm.membership_status = 'active' AND h.hive_status <> 'deleted'
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
           (SELECT COUNT(*)::int FROM hive_posts hp3
            WHERE hp3.hive_id = b.hive_id
              AND hp3.post_type = 'event'
              AND hp3.event_at > NOW()
           ) AS upcoming_events,
           (SELECT COUNT(*)::int FROM join_requests jr
            WHERE jr.hive_id = b.hive_id AND jr.status = 'pending'
           ) AS pending_requests,
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
    // Opening a room clears its grouped "N new messages" row (Prompt 70
    // Part B #4) — both the room and the pair-chat group key, so one call
    // site covers either kind of channel the client might report.
    const channelId = req.body?.channelId;
    if (channelId) {
      await query(
        `UPDATE notifications SET read = true
          WHERE user_id = $1 AND read = false
            AND group_key IN ($2, $3)`,
        [req.userId, `chat:${channelId}`, `pair:${channelId}`],
      );
    }
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
              COUNT(hm.user_id) FILTER (WHERE hm.membership_status = 'active')::int AS member_count
       FROM   hive_followers hf
       JOIN   hives h ON h.hive_id = hf.hive_id
       LEFT JOIN categories c  ON c.category_id = h.category_id
       LEFT JOIN hive_members hm ON hm.hive_id = h.hive_id
       WHERE  hf.user_id = $1 AND h.hive_status <> 'deleted'
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
      hiveValues, onboarding, metroKey,
    } = req.body;

    if (!name || !name.trim() || !category) {
      return res.status(400).json({ error: 'Hive name and category are required.' });
    }

    // Invite-only promises "won't appear in search" on the create page's own
    // card — enforce that server-side too, so a client that skips the card's
    // disabling logic (or a future caller) can't create a discoverable
    // invite-only Hive.
    const resolvedJoinPolicy = joinPolicy || 'open';
    const resolvedDiscoverable = resolvedJoinPolicy === 'invite' ? false : (discoverable ?? true);

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

    // An explicit metroKey from the create-Hive autocomplete (Part D) wins;
    // otherwise resolve it from the typed location text so metro_key stays
    // right even for a client that hasn't picked up the autocomplete yet.
    const resolvedMetroKey = locationType === 'online' ? null : await resolveLocationMetro(location, metroKey);

    // Hive, owner membership, default channel and onboarding settings are one
    // unit of work. Previously these were separate pool queries with a
    // hand-rolled compensating DELETE for the membership step, and no channel
    // insert at all — a Hive could exist with no #general, which only ever got
    // repaired by a backfill or lazily on first chat load.
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { rows: [hive] } = await client.query(
        `INSERT INTO hives (
          creator_user_id, category_id, hive_name, description, ideal_members,
          max_members, activation_threshold, tags, join_policy, discoverable,
          location_type, location, cadence, pinned_goal, ground_rules, icebreaker,
          hive_values, metro_key
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
          resolvedJoinPolicy,
          resolvedDiscoverable,
          locationType,
          location || null,
          cadence || null,
          pinnedGoal || null,
          groundRules || null,
          icebreaker || null,
          JSON.stringify(Array.isArray(hiveValues) ? hiveValues : []),
          resolvedMetroKey,
        ],
      );

      // Add creator as owner; stamp welcome_seen_at so they skip the takeover.
      // No compensating DELETE needed any more — the transaction covers it.
      await client.query(
        `INSERT INTO hive_members (hive_id, user_id, role, membership_status, welcome_seen_at)
         VALUES ($1, $2, 'owner', 'active', NOW())`,
        [hive.hive_id, userId],
      );

      const catConfig = categoryName ? getCategoryConfig(categoryName) : null;

      // How plans get made (Prompt 60, decision 6) — a new Hive gets its
      // category's default; a category with no planRules (or no category at
      // all) falls through to the column defaults already set by schema.sql
      // (owners/owner — today's behaviour), so there's nothing to write.
      if (catConfig?.planRules) {
        const { plan_proposers, plan_approval } = catConfig.planRules;
        await client.query(
          `UPDATE hives SET plan_proposers = $1, plan_approval = $2 WHERE hive_id = $3`,
          [plan_proposers, plan_approval, hive.hive_id],
        );
        hive.plan_proposers = plan_proposers;
        hive.plan_approval = plan_approval;
      }

      // Every Hive gets its #general from the moment it exists.
      await client.query(
        `INSERT INTO hive_channels (hive_id, name, channel_type, is_default, position)
         VALUES ($1, 'general', 'text', TRUE, 0)`,
        [hive.hive_id],
      );

      // The category's other default rooms (spec §11) — same transaction as
      // #general, so a Hive can never exist with only some of its starting
      // rooms. #general itself is skipped: every category's list leads with
      // it, and it's already inserted above as the one TRUE is_default room.
      const extraRooms = (catConfig?.defaultRooms ?? []).filter(r => r !== 'general');
      for (let i = 0; i < extraRooms.length; i++) {
        await client.query(
          `INSERT INTO hive_channels (hive_id, name, channel_type, is_default, position)
           VALUES ($1, $2, 'text', FALSE, $3)`,
          [hive.hive_id, extraRooms[i], i + 1],
        );
      }

      // Create onboarding settings if provided (otherwise lazy-created on first access)
      if (onboarding) {
        const joinExp = ['simple', 'standard', 'guided'].includes(onboarding.join_experience)
          ? onboarding.join_experience : 'standard';
        // steps_seeded = true when owner chose "blank" — suppresses default step seeding on first GET
        const stepsSeeded = !!onboarding.skip_default_steps;
        await client.query(
          `INSERT INTO hive_onboarding_settings
             (hive_id, join_experience, show_welcome_banner, show_owner_note,
              send_welcome_notif, require_photo, completion_unlocks, steps_seeded)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (hive_id) DO UPDATE SET
             join_experience     = EXCLUDED.join_experience,
             show_welcome_banner = EXCLUDED.show_welcome_banner,
             show_owner_note     = EXCLUDED.show_owner_note,
             send_welcome_notif  = EXCLUDED.send_welcome_notif,
             require_photo       = EXCLUDED.require_photo,
             completion_unlocks  = EXCLUDED.completion_unlocks,
             steps_seeded        = EXCLUDED.steps_seeded,
             updated_at          = NOW()`,
          [
            hive.hive_id, joinExp,
            onboarding.show_welcome_banner ?? true,
            onboarding.show_owner_note ?? true,
            onboarding.send_welcome_notif ?? true,
            onboarding.require_photo ?? false,
            onboarding.completion_unlocks ?? false,
            stepsSeeded,
          ],
        );
      }

      await client.query('COMMIT');
      return res.status(201).json({ id: hive.hive_id, hive });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[hives/createHive]', err);
    if (err.status) return res.status(err.status).json({ error: err.message });
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
      'join_policy', 'discoverable', 'tagline', 'purpose', 'founder_note',
      'metro_key',
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

    // An explicit metro_key (from the General-tab autocomplete) wins; a
    // location edit with no explicit metro_key re-resolves from the new
    // text, so a plain-text save still keeps metro_key right.
    if ('location' in updates || 'metro_key' in updates || 'location_type' in updates) {
      const { rows: [saved] } = await query('SELECT location, location_type, metro_key FROM hives WHERE hive_id = $1', [hiveId]);
      const locationText = 'location' in updates ? updates.location : saved.location;
      const locationType = updates.location_type ?? saved.location_type;
      const sameLocation = locationText === saved.location;
      if (locationType === 'online') updates.metro_key = null;
      else if (!(sameLocation && (!('metro_key' in updates) || updates.metro_key === saved.metro_key))) {
        updates.metro_key = await resolveLocationMetro(locationText, updates.metro_key);
      }
    }

    // Invite-only Hives never appear in search — true whether THIS request is
    // the one switching to invite, or it's touching some unrelated field on a
    // Hive that's already invite-only (e.g. flipping discoverable back on in
    // a separate save shouldn't quietly undo the invite-only guarantee).
    const effectiveJoinPolicy = 'join_policy' in updates
      ? updates.join_policy
      : (await query(`SELECT join_policy FROM hives WHERE hive_id = $1`, [hiveId])).rows[0]?.join_policy;
    if (effectiveJoinPolicy === 'invite') {
      updates.discoverable = false;
    }

    // Nullable identity fields: trim, turn blank into NULL (clears the field),
    // and enforce the same length limits as the hives_*_check constraints.
    const LENGTH_LIMITS = { tagline: { min: 1, max: 90 }, purpose: { max: 500 }, founder_note: { max: 2000 } };
    for (const key of Object.keys(LENGTH_LIMITS)) {
      if (!(key in updates)) continue;
      const raw = updates[key];
      if (raw === null || raw === undefined) { updates[key] = null; continue; }
      const trimmed = String(raw).trim();
      if (trimmed === '') { updates[key] = null; continue; }
      const { min, max } = LENGTH_LIMITS[key];
      if (min && trimmed.length < min) {
        return res.status(400).json({ error: `${key} must be at least ${min} character${min === 1 ? '' : 's'}.` });
      }
      if (trimmed.length > max) {
        return res.status(400).json({ error: `${key} must be ${max} characters or fewer.` });
      }
      updates[key] = trimmed;
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
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Failed to update Hive.' });
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
              COUNT(hm.user_id) FILTER (WHERE hm.membership_status = 'active')::int AS member_count
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

    // A block between the requester and the owner stops this cold — never
    // revealed as the reason, same generic message a full Hive doesn't get
    // either (that one does say "full"; this one must not say "blocked").
    // Covers all three paths below (simple-join, plain open, and the
    // request flow) since it runs before any of them.
    const { rows: [owner] } = await query(
      `SELECT user_id FROM hive_members WHERE hive_id = $1 AND role = 'owner' AND membership_status = 'active'`,
      [hiveId],
    );
    if (owner && await isBlockedEitherWay(owner.user_id, req.userId)) {
      return res.status(403).json({ error: "You can't join this Hive." });
    }

    // Check onboarding settings before anything else
    const { rows: [obSettings] } = await query(
      `SELECT join_experience FROM hive_onboarding_settings WHERE hive_id = $1`,
      [hiveId],
    );
    const joinExp = obSettings?.join_experience ?? 'standard';

    // 'simple' join_experience → instant-join, no request needed. But only
    // for an open Hive: 'simple' configures the WELCOME SCREENS a new member
    // sees, not who's allowed in. A request/invite Hive with 'simple' must
    // still go through approval — skipping it here let anyone with the link
    // into a Hive whose owner chose to review members first.
    if (joinExp === 'simple' && hive.join_policy === 'open') {
      await query(
        `INSERT INTO hive_members
           (hive_id, user_id, role, membership_status, onboarding_status, welcome_seen_at)
         VALUES ($1, $2, 'member', 'active', 'completed', NULL)
         ON CONFLICT (hive_id, user_id) DO UPDATE SET
           role = 'member', membership_status = 'active', onboarding_status = 'completed',
           welcome_seen_at = NULL, onboarding_started_at = NULL, onboarding_completed_at = NULL`,
        [hiveId, req.userId],
      );
      // Best-effort: welcome notification + notify existing members
      try {
        const [{ rows: [profile] }, { rows: existingMembers }, { rows: [catRow] }] = await Promise.all([
          query(`SELECT full_name FROM profiles WHERE user_id = $1`, [req.userId]),
          query(
            `SELECT user_id, role FROM hive_members
             WHERE hive_id = $1 AND user_id != $2 AND membership_status = 'active'`,
            [hiveId, req.userId],
          ),
          hive.category_id
            ? query(`SELECT category_name FROM categories WHERE category_id = $1`, [hive.category_id])
            : Promise.resolve({ rows: [] }),
        ]);
        const memberName = profile?.full_name ?? 'A new member';
        await createNotification({
          userId: req.userId, type: 'request_accepted', category: 'system',
          title: `You're in! Welcome to ${hive.hive_name}`,
          body: 'Open your Hive to see your welcome.',
          hiveId, actorUserId: req.userId, link: `/hive/${hiveId}`,
        });
        // Owners/admins always hear about a new member — 'system' is not
        // gated by the new_members preference, which stays default-off for
        // everyone else (correct for a busy Hive; noise for regular members).
        for (const m of existingMembers) {
          const isOwnerAdmin = m.role === 'owner' || m.role === 'admin';
          await createNotification({
            userId: m.user_id, type: 'member_joined',
            category: isOwnerAdmin ? 'system' : 'new_members',
            title: `${memberName} joined ${hive.hive_name}`,
            body: 'Give them a warm welcome 👋',
            hiveId, actorUserId: req.userId, link: `/hive/${hiveId}`,
          });
        }

        // E1 — "You're in!" (instant join: no one to thank, so "You joined…").
        await sendYoureInEmail(req.userId, {
          hiveId, hiveName: hive.hive_name,
          categoryName: catRow?.category_name ?? null,
          location: hive.location ?? null,
          firstLine: `You joined ${hive.hive_name}.`,
          memberName,
          memberNo: existingMembers.length + 1,
          maxMembers: hive.max_members ?? null,
          joinedAt: new Date(),
        }).catch(e => console.error('[hives/requestToJoin] E1 email failed (non-fatal):', e));

        // E2 — queue "{name} joined {Hive}" for the owner only.
        const owner = existingMembers.find(m => m.role === 'owner');
        if (owner) {
          await query(
            `INSERT INTO email_outbox (recipient_id, hive_id, kind, subject_user_id)
             VALUES ($1, $2, 'member_joined', $3)`,
            [owner.user_id, hiveId, req.userId],
          );
        }
      } catch (e) {
        console.error('[hives/requestToJoin] simple-join notification failed (non-fatal):', e);
      }
      return res.json({ joined: true });
    }

    // Open policy → join directly, no request needed
    if (hive.join_policy === 'open') {
      const obStatus = joinExp === 'guided' || joinExp === 'application' ? 'pending' : 'completed';
      await query(
        `INSERT INTO hive_members
           (hive_id, user_id, role, membership_status, onboarding_status, welcome_seen_at)
         VALUES ($1, $2, 'member', 'active', $3, NULL)
         ON CONFLICT (hive_id, user_id) DO UPDATE SET
           role = 'member', membership_status = 'active', onboarding_status = $3,
           welcome_seen_at = NULL`,
        [hiveId, req.userId, obStatus],
      );
      return res.json({ joined: true });
    }

    // Check for an existing request row
    const { rows: [existingReq] } = await query(
      `SELECT request_id, status FROM join_requests WHERE hive_id = $1 AND user_id = $2`,
      [hiveId, req.userId],
    );

    let thisRequestId;
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
      thisRequestId = existingReq.request_id;
    } else {
      const { rows: [inserted] } = await query(
        `INSERT INTO join_requests (hive_id, user_id, request_message)
         VALUES ($1, $2, $3) RETURNING request_id`,
        [hiveId, req.userId, message?.trim() || null],
      );
      thisRequestId = inserted.request_id;
    }

    // Notify hive owners/admins (best-effort)
    try {
      const [{ rows: [requester] }, { rows: ownerAdmins }] = await Promise.all([
        query(`SELECT full_name FROM profiles WHERE user_id = $1`, [req.userId]),
        query(
          `SELECT user_id, role FROM hive_members
           WHERE hive_id = $1 AND role IN ('owner','admin') AND membership_status = 'active'`,
          [hiveId],
        ),
      ]);
      const name = requester?.full_name ?? 'Someone';
      for (const m of ownerAdmins) {
        await createNotification({
          userId: m.user_id,
          type: 'join_request', category: 'system',
          title: `${name} requested to join ${hive.hive_name}`,
          hiveId,
          actorUserId: req.userId,
          link: `/hive/${hiveId}`,
        });
      }

      // E3 — queue "{name} wants to join {Hive}" for the owner only (not
      // admins), approval Hives only (this branch only runs for those).
      const owner = ownerAdmins.find(m => m.role === 'owner');
      if (owner) {
        await query(
          `INSERT INTO email_outbox (recipient_id, hive_id, kind, subject_user_id, request_id)
           VALUES ($1, $2, 'join_request', $3, $4)`,
          [owner.user_id, hiveId, req.userId, thisRequestId],
        );
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
       WHERE jr.hive_id = $1 AND jr.status = 'pending' AND (u.account_status IS NULL OR u.account_status = 'active')
       ORDER BY cs.total_score DESC NULLS LAST, jr.requested_at ASC`,
      [hiveId, req.userId],
    );

    const { rows: [cap] } = await query(
      `SELECT h.max_members,
              COUNT(hm.user_id) FILTER (WHERE hm.membership_status = 'active')::int AS member_count
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

    // The decision (status UPDATE + member INSERT/UPSERT + capacity re-check)
    // is one transaction — previously these were separate statements, so a
    // crash between them (an unhandled throw further down used to do this
    // every single time, see the ReferenceError this fix also removes) could
    // leave the request accepted with no member row. SELECT ... FOR UPDATE
    // locks the Hive row so two concurrent accepts can't both pass the
    // capacity check and overshoot max_members.
    let joinExp = null;
    const client = await getClient();
    try {
      await client.query('BEGIN');

      if (action === 'accept') {
        const { rows: [hiveRow] } = await client.query(
          `SELECT max_members FROM hives WHERE hive_id = $1 FOR UPDATE`,
          [hiveId],
        );
        const { rows: [countRow] } = await client.query(
          `SELECT COUNT(*)::int AS member_count FROM hive_members
            WHERE hive_id = $1 AND membership_status = 'active'`,
          [hiveId],
        );
        if (hiveRow.max_members &&
            Number(countRow.member_count) >= Number(hiveRow.max_members)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Hive is full.' });
        }

        // Determine onboarding status from hive settings
        const { rows: [obSettings] } = await client.query(
          `SELECT join_experience FROM hive_onboarding_settings WHERE hive_id = $1`,
          [hiveId],
        );
        joinExp = obSettings?.join_experience ?? 'standard';
        // simple/standard → no onboarding steps, immediately active
        // guided/application → member must work through steps before full access
        const onboardingStatus =
          joinExp === 'simple'   ? 'completed' :
          joinExp === 'standard' ? 'completed' : 'pending';

        await client.query(
          `UPDATE join_requests
           SET status = 'accepted', reviewed_at = NOW(), reviewed_by = $1
           WHERE request_id = $2`,
          [req.userId, requestId],
        );
        await client.query(
          `INSERT INTO hive_members
             (hive_id, user_id, role, membership_status, welcome_seen_at, onboarding_status)
           VALUES ($1, $2, 'member', 'active', NULL, $3)
           ON CONFLICT (hive_id, user_id) DO UPDATE
             SET role                    = 'member',
                 membership_status       = 'active',
                 welcome_seen_at         = NULL,
                 onboarding_status       = $3,
                 onboarding_started_at   = NULL,
                 onboarding_completed_at = NULL`,
          [hiveId, request.user_id, onboardingStatus],
        );
      } else {
        await client.query(
          `UPDATE join_requests
           SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $1
           WHERE request_id = $2`,
          [req.userId, requestId],
        );
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*)::int FROM hive_members WHERE hive_id = $1 AND membership_status = 'active'`,
      [hiveId],
    );

    // ── Join ceremony (best-effort — never rolls back the acceptance) ──────────
    let newMember = null;
    if (action === 'accept') {
      try {
        const [{ rows: [requester] }, { rows: [hiveRow] }, { rows: existingMembers }, { rows: [memberRow] }, { rows: [ownerProfile] }] = await Promise.all([
          query(
            `SELECT p.full_name, p.profile_photo_url, u.member_id
             FROM profiles p JOIN users u ON u.user_id = p.user_id
             WHERE p.user_id = $1`,
            [request.user_id],
          ),
          query(
            `SELECT h.hive_name, h.max_members, h.location, c.category_name
               FROM hives h LEFT JOIN categories c ON c.category_id = h.category_id
              WHERE h.hive_id = $1`,
            [hiveId],
          ),
          query(
            `SELECT user_id, role FROM hive_members
             WHERE hive_id = $1 AND membership_status = 'active' AND user_id != $2`,
            [hiveId, request.user_id],
          ),
          query(
            `SELECT joined_at FROM hive_members WHERE hive_id = $1 AND user_id = $2`,
            [hiveId, request.user_id],
          ),
          query(
            `SELECT p.full_name FROM hive_members hm JOIN profiles p ON p.user_id = hm.user_id
              WHERE hm.hive_id = $1 AND hm.role = 'owner' AND hm.membership_status = 'active'`,
            [hiveId],
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
          type: 'request_accepted', category: 'system',
          title: `You're in! Welcome to ${hiveName}`,
          body: `Open your Hive to see your welcome.`,
          hiveId,
          actorUserId: req.userId,
          link: `/hive/${hiveId}`,
        });

        // 2. Notify all other active members (owner + existing). Owners/
        // admins always hear it ('system', not gated by a preference);
        // everyone else keeps the default-off new_members category.
        for (const m of existingMembers) {
          const isOwnerAdmin = m.role === 'owner' || m.role === 'admin';
          await createNotification({
            userId: m.user_id,
            type: 'member_joined', category: isOwnerAdmin ? 'system' : 'new_members',
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

        // 5. E1 — "You're in!" to the new member (Prompt 70 Part C).
        const ownerFirstName = (ownerProfile?.full_name ?? 'The owner').split(' ')[0];
        await sendYoureInEmail(request.user_id, {
          hiveId, hiveName,
          categoryName: hiveRow?.category_name ?? null,
          location: hiveRow?.location ?? null,
          firstLine: `${ownerFirstName} accepted your request.`,
          memberName: requesterName,
          memberNo: existingMembers.length + 1,
          maxMembers: hiveRow?.max_members ?? null,
          joinedAt: memberRow?.joined_at ?? new Date(),
        }).catch(e => console.error('[hives/reviewRequest] E1 email failed (non-fatal):', e));

        // 6. E2 — queue "{name} joined {Hive}" for the owner only (not
        // admins), bundled and sent by jobs/emailOutboxJob.js.
        const owner = existingMembers.find(m => m.role === 'owner');
        if (owner) {
          await query(
            `INSERT INTO email_outbox (recipient_id, hive_id, kind, subject_user_id)
             VALUES ($1, $2, 'member_joined', $3)`,
            [owner.user_id, hiveId, request.user_id],
          );
        }
      } catch (ceremonyErr) {
        console.error('[hives/reviewRequest] ceremony failed (non-fatal):', ceremonyErr);
      }
    }

    res.json({
      reviewed:     true,
      action,
      member_count: Number(count),
      new_member:   newMember,
      join_experience: action === 'accept' ? joinExp : undefined,
    });
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
       WHERE jr.user_id = $1 AND h.hive_status <> 'deleted'
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
              COUNT(DISTINCT hm.user_id) FILTER (WHERE hm.membership_status = 'active')::int AS member_count,
              COUNT(DISTINCT jr.request_id) FILTER (WHERE jr.status = 'pending')::int        AS pending_count
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
      `SELECT COUNT(*)::int AS cnt
       FROM hive_members hm
       LEFT JOIN profiles p ON p.user_id = hm.user_id
       WHERE hm.hive_id = $1 AND hm.membership_status = 'active' AND p.age IS NULL`,
      [hiveId],
    );
    const incompleteCount = Number(incRow?.cnt ?? 0);

    // Manage Hive > Overview metrics (spec §10) — each links to where an
    // owner would act on it.
    const { rows: [recent] } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE hm.joined_at >= NOW() - INTERVAL '30 days')::int AS members_30d,
         COUNT(*) FILTER (WHERE hm.onboarding_status = 'completed')::int        AS onboarding_completed,
         COUNT(*)::int                                                          AS onboarding_total
       FROM hive_members hm
       WHERE hm.hive_id = $1 AND hm.membership_status = 'active'`,
      [hiveId],
    );
    const { rows: [msgRow] } = await query(
      `SELECT COUNT(*)::int AS n FROM messages m
        LEFT JOIN hive_channels c ON c.channel_id = m.channel_id
        WHERE m.hive_id = $1 AND m.sent_at >= NOW() - INTERVAL '7 days' AND m.deleted_at IS NULL
          AND (c.kind IS NULL OR c.kind != 'pair')`,
      [hiveId],
    );
    const { rows: [planRow] } = await query(
      `SELECT COUNT(*)::int AS n FROM hive_posts p
        WHERE p.hive_id = $1 AND p.post_type = 'event' AND p.event_at IS NOT NULL
          AND ${PLAN_END} >= NOW()`,
      [hiveId],
    );
    const onboardingTotal = Number(recent?.onboarding_total ?? 0);
    const onboardingCompleted = Number(recent?.onboarding_completed ?? 0);

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
      members_last_30d:   Number(recent?.members_30d ?? 0),
      messages_last_7d:   Number(msgRow?.n ?? 0),
      upcoming_plans:      Number(planRow?.n ?? 0),
      // null (not 0%) when there are no active members at all — nothing to
      // divide by, which is a different state than "everyone's at 0%".
      onboarding_completion_rate: onboardingTotal > 0
        ? Math.round((onboardingCompleted / onboardingTotal) * 100) : null,
      action_items,
      recent_activity,
    });
  } catch (err) {
    console.error('[hives/getHiveOverview]', err);
    res.status(500).json({ error: 'Failed to load overview.' });
  }
};

// ── getHiveAnalytics — GET /api/hives/:id/analytics?days=30|90 ───────────────
// Real charts over time (spec §10): member count by week (cumulative — a
// member who left is removed from hive_members' active rows, so weeks after
// they joined can't be "corrected" down; the client caption says this, it's
// not hidden), messages per week, plans+RSVPs per month, most active rooms.
export const getHiveAnalytics = async (req, res) => {
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

    const days = [30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const weeks = Math.ceil(days / 7);
    const months = days === 90 ? 3 : 2;

    // One series of week-start buckets for the window, so a week with zero
    // activity still shows as a 0 point instead of a gap in the chart.
    const [memberRes, messageRes, planRes, roomRes, attendanceRate, coffeeMetRes] = await Promise.all([
      query(
        `WITH weeks AS (
           SELECT date_trunc('week', NOW()) - (n || ' weeks')::interval AS week_start
             FROM generate_series(${weeks - 1}, 0, -1) n
         ),
         joins AS (
           SELECT date_trunc('week', joined_at) AS week_start, COUNT(*)::int AS n
             FROM hive_members
            WHERE hive_id = $1 AND membership_status = 'active'
            GROUP BY 1
         ),
         -- Members already active at the start of the window, so the first
         -- bar isn't a misleadingly small slice of the Hive's real total.
         base AS (
           SELECT COUNT(*)::int AS n FROM hive_members
            WHERE hive_id = $1 AND membership_status = 'active'
              AND joined_at < (SELECT MIN(week_start) FROM weeks)
         )
         SELECT w.week_start,
                ((SELECT n FROM base) + SUM(COALESCE(j.n, 0))
                  OVER (ORDER BY w.week_start ROWS UNBOUNDED PRECEDING))::int AS cumulative_count
           FROM weeks w
           LEFT JOIN joins j ON j.week_start = w.week_start
          ORDER BY w.week_start`,
        [hiveId],
      ),
      query(
        `WITH weeks AS (
           SELECT date_trunc('week', NOW()) - (n || ' weeks')::interval AS week_start
             FROM generate_series(${weeks - 1}, 0, -1) n
         )
         SELECT w.week_start, COUNT(m.message_id)::int AS count
           FROM weeks w
           LEFT JOIN messages m ON date_trunc('week', m.sent_at) = w.week_start
                               AND m.hive_id = $1 AND m.deleted_at IS NULL
           LEFT JOIN hive_channels c ON c.channel_id = m.channel_id
          WHERE c.channel_id IS NULL OR c.kind != 'pair'
          GROUP BY w.week_start
          ORDER BY w.week_start`,
        [hiveId],
      ),
      query(
        `WITH mo AS (
           SELECT date_trunc('month', NOW()) - (n || ' months')::interval AS month_start
             FROM generate_series(${months - 1}, 0, -1) n
         )
         SELECT mo.month_start,
                COUNT(DISTINCT p.post_id)::int AS plans,
                COUNT(r.rsvp_id)::int           AS rsvps
           FROM mo
           LEFT JOIN hive_posts p ON date_trunc('month', p.created_at) = mo.month_start
                                  AND p.hive_id = $1 AND p.post_type = 'event'
           LEFT JOIN event_rsvps r ON r.post_id = p.post_id AND r.rsvp_status = 'going'
          GROUP BY mo.month_start
          ORDER BY mo.month_start`,
        [hiveId],
      ),
      query(
        `SELECT c.channel_id, c.name, COUNT(m.message_id)::int AS message_count
           FROM hive_channels c
           LEFT JOIN messages m ON m.channel_id = c.channel_id
                               AND m.sent_at >= NOW() - ($2 || ' days')::interval
                               AND m.deleted_at IS NULL
          WHERE c.hive_id = $1 AND c.archived_at IS NULL AND c.kind != 'pair'
          GROUP BY c.channel_id, c.name
          ORDER BY message_count DESC, c.position ASC
          LIMIT 5`,
        [hiveId, days],
      ),
      // null until 3+ past plans have check-in data (Prompt 61 Part 5).
      getAttendanceRate(hiveId),
      // Threshold is on completed PAIRS (spec: "at least 5 completed
      // pairs"); the number actually shown is the distinct member count
      // among them, so a trio counts its 3 members once each, never the
      // pairing 3 times, and someone met through two different pairings
      // isn't double-counted either.
      query(
        `SELECT
           COUNT(DISTINCT cp.pair_id)::int AS pair_count,
           COUNT(DISTINCT uid)::int AS member_count
           FROM hive_coffee_pairs cp
           JOIN hive_coffee_rounds cr ON cr.round_id = cp.round_id
           CROSS JOIN LATERAL unnest(cp.user_ids) AS uid
          WHERE cr.hive_id = $1 AND cp.met = TRUE`,
        [hiveId],
      ),
    ]);

    const coffeePairCount = Number(coffeeMetRes.rows[0]?.pair_count ?? 0);
    const coffeeMemberCount = Number(coffeeMetRes.rows[0]?.member_count ?? 0);

    res.json({
      days,
      memberCountByWeek: memberRes.rows.map(r => ({ week: r.week_start, count: r.cumulative_count })),
      messagesByWeek: messageRes.rows.map(r => ({ week: r.week_start, count: r.count })),
      plansByMonth: planRes.rows.map(r => ({ month: r.month_start, plans: r.plans, rsvps: r.rsvps })),
      activeRooms: roomRes.rows.map(r => ({ channel_id: r.channel_id, name: r.name, messageCount: r.message_count })),
      attendanceRate, // { rate, planCount } | null
      // Only shown once the Hive has at least 5 completed pairings.
      membersMetCount: coffeePairCount >= 5 ? coffeeMemberCount : null,
    });
  } catch (err) {
    console.error('[hives/getHiveAnalytics]', err);
    res.status(500).json({ error: 'Failed to load analytics.' });
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

// The actual removal — pulled out of the route handler so the report-review
// flow's "Remove {name} from Hive" action (reportsController.js) can call the
// exact same logic instead of a second copy. callerId is trusted to already
// be an owner/admin of hiveId by the time either caller reaches this.
export async function removeMemberCore(hiveId, callerId, targetId) {
  const { rows } = await query(
    `SELECT hm.user_id, hm.role
     FROM hive_members hm
     WHERE hm.hive_id = $1 AND hm.user_id = ANY($2::uuid[]) AND hm.membership_status = 'active'`,
    [hiveId, [callerId, targetId]],
  );
  const callerRow = rows.find(r => r.user_id === callerId);
  const targetRow = rows.find(r => r.user_id === targetId);

  if (!callerRow || !['owner', 'admin'].includes(callerRow.role)) {
    const err = new Error('Not authorised.'); err.status = 403; throw err;
  }
  if (!targetRow) { const err = new Error('Member not found.'); err.status = 404; throw err; }
  if (targetRow.role === 'owner') { const err = new Error('Cannot remove the owner.'); err.status = 403; throw err; }
  if (targetId === callerId) { const err = new Error('Cannot remove yourself here.'); err.status = 403; throw err; }
  // Admins cannot remove other admins
  if (callerRow.role === 'admin' && targetRow.role === 'admin') {
    const err = new Error('Admins cannot remove other admins.'); err.status = 403; throw err;
  }

  await query(
    `UPDATE hive_members SET membership_status = 'removed', role = 'member'
     WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
    [hiveId, targetId],
  );

  // Kick the evicted user's socket from the hive room immediately
  try { evictUserFromHive(hiveId, targetId); } catch { /* socket not yet initialized in tests */ }

  const { rows: [{ member_count }] } = await query(
    `SELECT COUNT(*)::int AS member_count FROM hive_members
     WHERE hive_id = $1 AND membership_status = 'active'`,
    [hiveId],
  );
  return { removed: true, user_id: targetId, member_count: Number(member_count) };
}

export const removeMember = async (req, res) => {
  try {
    const { id: hiveId, userId: targetId } = req.params;
    const result = await removeMemberCore(hiveId, req.userId, targetId);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[hives/removeMember]', err);
    res.status(500).json({ error: 'Failed to remove member.' });
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
      type:        'owner_message', category: 'announcements',
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

// ── Cloudinary signed upload ──────────────────────────────────────────────────

export const getUploadSignature = async (req, res) => {
  try {
    const { rows: [member] } = await query(
      `SELECT role FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [req.params.id, req.userId],
    );
    if (!['owner', 'admin'].includes(member?.role)) {
      return res.status(403).json({ error: 'Only owners and admins can upload images.' });
    }

    const cloudName  = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey     = process.env.CLOUDINARY_API_KEY;
    const apiSecret  = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(503).json({ error: 'Image uploads are not configured yet.' });
    }

    const FOLDERS   = { logo: 'logos', plan: 'plans', banner: 'banners' };
    const type      = FOLDERS[req.body.type] ?? 'banners';
    const folder    = `hives/${req.params.id}/${type}`;
    const timestamp = Math.round(Date.now() / 1000);

    // Cloudinary signature: SHA-1( sorted_params + api_secret )
    const paramsStr = `folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto.createHash('sha1')
      .update(paramsStr + apiSecret)
      .digest('hex');

    res.json({ signature, timestamp, api_key: apiKey, cloud_name: cloudName, folder });
  } catch (err) {
    console.error('[hives/getUploadSignature]', err);
    res.status(500).json({ error: 'Failed to generate upload signature.' });
  }
};

// ── Save banner/logo URL after Cloudinary upload ──────────────────────────────

export const updateHiveMedia = async (req, res) => {
  try {
    const { rows: [member] } = await query(
      `SELECT role FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [req.params.id, req.userId],
    );
    if (!['owner', 'admin'].includes(member?.role)) {
      return res.status(403).json({ error: 'Only owners and admins can update Hive images.' });
    }

    const { banner_url, logo_url } = req.body;
    const updates = [];
    const values  = [];
    let   idx     = 1;

    if (banner_url !== undefined) { updates.push(`banner_url = $${idx++}`); values.push(banner_url || null); }
    if (logo_url   !== undefined) { updates.push(`logo_url   = $${idx++}`); values.push(logo_url   || null); }

    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });

    values.push(req.params.id);
    await query(
      `UPDATE hives SET ${updates.join(', ')}, updated_at = NOW() WHERE hive_id = $${idx}`,
      values,
    );

    const payload = {};
    if (banner_url !== undefined) payload.banner_url = banner_url || null;
    if (logo_url   !== undefined) payload.logo_url   = logo_url   || null;

    res.json({ hive: payload });
  } catch (err) {
    console.error('[hives/updateHiveMedia]', err);
    res.status(500).json({ error: 'Failed to save image URL.' });
  }
};

// ── leaveHive ──────────────────────────────────────────────────────────────────
export const leaveHive = async (req, res) => {
  const hiveId = req.params.id;
  const userId = req.userId;
  const { transfer_to_user_id } = req.body ?? {};

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Must be an active member
    const { rows: [caller] } = await client.query(
      `SELECT role FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, userId],
    );
    if (!caller) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You are not an active member of this Hive.' });
    }

    if (caller.role !== 'owner') {
      // Non-owner: leave immediately; demote role so a rejoin gets plain member
      await client.query(
        `UPDATE hive_members SET membership_status = 'left', role = 'member'
         WHERE hive_id = $1 AND user_id = $2`,
        [hiveId, userId],
      );
    } else {
      // Owner path: check for other active members
      const { rows: others } = await client.query(
        `SELECT user_id FROM hive_members
         WHERE hive_id = $1 AND user_id != $2 AND membership_status = 'active'`,
        [hiveId, userId],
      );

      if (others.length === 0) {
        // Sole owner: archive and leave; demote role so a rejoin gets plain member
        await client.query(
          `UPDATE hives SET hive_status = 'archived', updated_at = NOW() WHERE hive_id = $1`,
          [hiveId],
        );
        await client.query(
          `UPDATE hive_members SET membership_status = 'left', role = 'member'
           WHERE hive_id = $1 AND user_id = $2`,
          [hiveId, userId],
        );
      } else {
        // Owner with others: require a successor
        if (!transfer_to_user_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'You are the owner — supply transfer_to_user_id to hand off ownership before leaving.',
          });
        }
        const { rows: [successor] } = await client.query(
          `SELECT user_id FROM hive_members
           WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
          [hiveId, transfer_to_user_id],
        );
        if (!successor) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'transfer_to_user_id must be an active member of this Hive.' });
        }
        await client.query(
          `UPDATE hive_members SET role = 'owner'
           WHERE hive_id = $1 AND user_id = $2`,
          [hiveId, transfer_to_user_id],
        );
        // Demote role so a rejoin gets plain member, not owner
        await client.query(
          `UPDATE hive_members SET membership_status = 'left', role = 'member'
           WHERE hive_id = $1 AND user_id = $2`,
          [hiveId, userId],
        );
      }
    }

    await client.query('COMMIT');
    try { evictUserFromHive(hiveId, userId); } catch { /* socket not yet up in tests */ }
    res.json({ left: true, hive_id: hiveId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[hives/leaveHive]', err);
    res.status(500).json({ error: 'Failed to leave Hive.' });
  } finally {
    client.release();
  }
};

// ── deleteHive ───────────────────────────────────────────────────────────────
// Owner-only, soft delete. Requires the caller to type the Hive's exact name,
// the same confirmation bar as every other irreversible action in this file.
// Deletion is in-transaction (status flip + plan cancellation); the member
// notify/evict loop runs after commit as a best-effort ceremony, same pattern
// as reviewRequest's post-accept notifications.
const DELETE_PURGE_GRACE_DAYS = 30;

export const deleteHive = async (req, res) => {
  const hiveId = req.params.id;
  const { confirmName } = req.body ?? {};

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: [hive] } = await client.query(
      `SELECT hive_name, hive_status FROM hives WHERE hive_id = $1 FOR UPDATE`,
      [hiveId],
    );
    if (!hive) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Hive not found.' });
    }
    if (hive.hive_status === 'deleted') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This Hive has already been deleted.' });
    }

    const { rows: [member] } = await client.query(
      `SELECT role FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (member?.role !== 'owner') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the owner can delete this Hive.' });
    }

    if (typeof confirmName !== 'string' || confirmName !== hive.hive_name) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Type the Hive name exactly to confirm deletion.' });
    }

    await client.query(
      `UPDATE hives
         SET hive_status = 'deleted', deleted_at = NOW(), deleted_by = $2,
             purge_after = NOW() + INTERVAL '${DELETE_PURGE_GRACE_DAYS} days', updated_at = NOW()
       WHERE hive_id = $1`,
      [hiveId, req.userId],
    );

    // A deleted Hive shouldn't keep paging people to RSVP to plans that will
    // never happen.
    await client.query(
      `UPDATE hive_posts
         SET cancelled_at = NOW()
       WHERE hive_id = $1 AND post_type = 'event' AND event_at > NOW() AND cancelled_at IS NULL`,
      [hiveId],
    );

    const { rows: members } = await client.query(
      `SELECT user_id FROM hive_members
       WHERE hive_id = $1 AND membership_status = 'active' AND user_id != $2`,
      [hiveId, req.userId],
    );

    await client.query('COMMIT');

    for (const m of members) {
      try {
        await createNotification({
          userId: m.user_id,
          type: 'hive_deleted',
          title: `${hive.hive_name} was deleted`,
          body: `The owner deleted this Hive. It will be permanently removed after ${DELETE_PURGE_GRACE_DAYS} days unless restored.`,
          hiveId,
          actorUserId: req.userId,
          category: 'system',
        });
      } catch (notifyErr) {
        console.error('[hives/deleteHive] notify failed (non-fatal):', notifyErr);
      }
      try { await evictUserFromHive(hiveId, m.user_id); } catch { /* socket not yet initialized in tests */ }
    }
    try { await evictUserFromHive(hiveId, req.userId); } catch { /* socket not yet initialized in tests */ }

    res.json({ deleted: true, hive_id: hiveId, purge_after_days: DELETE_PURGE_GRACE_DAYS });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[hives/deleteHive]', err);
    res.status(500).json({ error: 'Failed to delete Hive.' });
  } finally {
    client.release();
  }
};

// ── restoreHive ──────────────────────────────────────────────────────────────
// Owner-only. Restoring never un-cancels plans deleteHive cancelled — that is
// a deliberate choice, not an oversight: a plan that already told everyone
// "cancelled" doesn't get silently resurrected.
export const restoreHive = async (req, res) => {
  const hiveId = req.params.id;
  try {
    const { rows: [hive] } = await query(
      `SELECT hive_name, hive_status FROM hives WHERE hive_id = $1`,
      [hiveId],
    );
    if (!hive) return res.status(404).json({ error: 'Hive not found.' });
    if (hive.hive_status !== 'deleted') {
      return res.status(400).json({ error: 'This Hive is not deleted.' });
    }

    const { rows: [member] } = await query(
      `SELECT role FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (member?.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can restore this Hive.' });
    }

    await query(
      `UPDATE hives
         SET hive_status = 'active', deleted_at = NULL, deleted_by = NULL,
             purge_after = NULL, updated_at = NOW()
       WHERE hive_id = $1`,
      [hiveId],
    );

    const { rows: members } = await query(
      `SELECT user_id FROM hive_members
       WHERE hive_id = $1 AND membership_status = 'active' AND user_id != $2`,
      [hiveId, req.userId],
    );
    for (const m of members) {
      try {
        await createNotification({
          userId: m.user_id,
          type: 'hive_restored',
          title: `${hive.hive_name} was restored`,
          body: 'The owner restored this Hive.',
          hiveId,
          actorUserId: req.userId,
          category: 'system',
        });
      } catch (notifyErr) {
        console.error('[hives/restoreHive] notify failed (non-fatal):', notifyErr);
      }
    }

    res.json({ restored: true, hive_id: hiveId });
  } catch (err) {
    console.error('[hives/restoreHive]', err);
    res.status(500).json({ error: 'Failed to restore Hive.' });
  }
};

// ── getMyDeletedHives ─────────────────────────────────────────────────────────
export const getMyDeletedHives = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT h.hive_id, h.hive_name, h.logo_url, h.banner_url, c.category_name,
              h.deleted_at, h.purge_after, h.deleted_by, hm.role AS my_role
       FROM hive_members hm
       JOIN hives h ON h.hive_id = hm.hive_id
       LEFT JOIN categories c ON c.category_id = h.category_id
       WHERE hm.user_id = $1 AND hm.membership_status = 'active' AND h.hive_status = 'deleted'
       ORDER BY h.deleted_at DESC`,
      [req.userId],
    );
    res.json({ hives: rows });
  } catch (err) {
    console.error('[hives/getMyDeletedHives]', err);
    res.status(500).json({ error: 'Failed to fetch deleted Hives.' });
  }
};
