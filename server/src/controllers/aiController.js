import { query } from '../db/index.js';
import { scorePurpose, buildReasons, mergeSkills } from '../lib/compatibility.js';
import {
  aiEnabled,
  generateHiveFitAnalysis,
  generateDiscoveryExplanation,
} from '../lib/aiExplain.js';
import { CATEGORY_KEY_FOR_NAME, SCORER_VERSION, loadRolesByHive } from './hivesController.js';

const CACHE_SQL = `AND generated_at > NOW() - INTERVAL '7 days'`;

// Prompt 81 — the cached compatibility_scores row is only trustworthy as-is
// for a Project/Professional Hive once it was written by scorer_version 2+
// (the old columns never carried roleFit/industry/careerStage/...). Every
// other category's cache was always correct and stays untouched.
function cacheIsStale(cs, hiveCategoryKey) {
  if (!cs) return true;
  const isCollabCategory = hiveCategoryKey === 'project' || hiveCategoryKey === 'professional';
  return isCollabCategory && (cs.scorer_version == null || Number(cs.scorer_version) < SCORER_VERSION);
}

// Builds the collabCtx scorePurpose needs for a single Hive/profile pair —
// the candidate's (or caller's) OWN saved Deep Dive answers, never a live
// request body (there is none at this endpoint).
async function buildCollabCtx(hive, profile) {
  const hiveCategoryKey = CATEGORY_KEY_FOR_NAME[hive.category_name] ?? null;
  if (hiveCategoryKey !== 'project' && hiveCategoryKey !== 'professional') return {};
  const answers = profile.deep_dive_answers?.[hiveCategoryKey] ?? null;
  const seekerSkills = mergeSkills(answers?.skills, profile.skills);
  const rolesByHive = await loadRolesByHive([hive.hive_id]);
  const openRoles = (rolesByHive[hive.hive_id] ?? []).filter(r => r.status === 'open' && r.filled < r.slots);
  return { answers, seekerSkills, openRoles };
}

// ── GET /api/hives/:id/ai-fit/:userId ────────────────────────────────────────
export async function getAiFit(req, res) {
  try {
    const hiveId      = req.params.id;
    const candidateId = req.params.userId;

    // 1. Caller must be owner/admin
    const { rows: [myRole] } = await query(
      `SELECT role FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (!myRole || !['owner', 'admin'].includes(myRole.role)) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    // 2. Pending request must exist for candidate
    const { rows: [jr] } = await query(
      `SELECT request_id, request_message FROM join_requests
       WHERE hive_id = $1 AND user_id = $2 AND status = 'pending'`,
      [hiveId, candidateId],
    );
    if (!jr) return res.status(404).json({ error: 'No pending request found.' });

    // 3. Check 7-day cache
    const { rows: [cached] } = await query(
      `SELECT content, generated_at FROM ai_explanations
       WHERE scope = 'hive_fit' AND hive_id = $1 AND user_id = $2 ${CACHE_SQL}`,
      [hiveId, candidateId],
    );
    if (cached) {
      return res.json({ source: 'ai', generated_at: cached.generated_at, analysis: cached.content });
    }

    // 4. Load data in parallel
    const [
      { rows: [hive] },
      { rows: [candidateProfile] },
      { rows: [cs] },
      { rows: [uc] },
    ] = await Promise.all([
      query(
        `SELECT h.*, c.category_name FROM hives h
         LEFT JOIN categories c ON c.category_id = h.category_id
         WHERE h.hive_id = $1`,
        [hiveId],
      ),
      query('SELECT * FROM profiles WHERE user_id = $1', [candidateId]),
      query(
        `SELECT category_score, interest_score, goal_score, skill_score,
                location_score, availability_score, personality_score, total_score,
                scorer_version
         FROM compatibility_scores WHERE user_id = $1 AND hive_id = $2`,
        [candidateId, hiveId],
      ),
      query(
        `SELECT total_score FROM user_compatibility
         WHERE (user_a = $1 AND user_b = $2) OR (user_b = $1 AND user_a = $2)`,
        [req.userId, candidateId],
      ),
    ]);

    // 5. Build purposeFactors — this is "the AI candidate path" (Prompt 81):
    // a Project/Professional Hive with a stale or missing scorer_version
    // recomputes via scoreCollab (through scorePurpose) using the candidate's
    // own saved Deep Dive answers, instead of trusting the old columns, which
    // never carried roleFit/industry/careerStage/... .
    const hiveCategoryKey = hive ? (CATEGORY_KEY_FOR_NAME[hive.category_name] ?? null) : null;
    let purposeFactors, details;
    if (!cacheIsStale(cs, hiveCategoryKey) && hive) {
      purposeFactors = {
        category:     Number(cs.category_score),
        interests:    Number(cs.interest_score),
        goals:        Number(cs.goal_score),
        skills:       Number(cs.skill_score),
        location:     Number(cs.location_score),
        availability: Number(cs.availability_score),
        personality:  Number(cs.personality_score),
      };
    } else if (hive && candidateProfile) {
      const collabCtx = await buildCollabCtx(hive, candidateProfile);
      ({ factors: purposeFactors, details } = scorePurpose(candidateProfile, hive, null, collabCtx));
    } else {
      purposeFactors = { category: 0, interests: 0, goals: 0, skills: 0, location: 0, availability: 0, personality: 0 };
    }

    const peopleFit = uc ? Number(uc.total_score) : null;
    const topPairs  = peopleFit !== null ? [{ full_name: null, pair_score: peopleFit }] : [];
    const reasons   = buildReasons(purposeFactors, peopleFit, topPairs, details);

    // 6. Try AI generation
    if (aiEnabled() && hive && candidateProfile) {
      const aiResult = await generateHiveFitAnalysis(
        {
          hive,
          candidate: {
            ...candidateProfile,
            request_message: jr.request_message,
            hive_fit_score:  cs ? Number(cs.total_score) : null,
            pair_score:      peopleFit,
          },
          reasons,
        },
        req.userId,
      );

      if (aiResult) {
        const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
        await query(
          `INSERT INTO ai_explanations (scope, hive_id, user_id, content, model)
           VALUES ('hive_fit', $1, $2, $3, $4)
           ON CONFLICT (scope, hive_id, user_id) DO UPDATE SET
             content = EXCLUDED.content, model = EXCLUDED.model, generated_at = NOW()`,
          [hiveId, candidateId, JSON.stringify(aiResult), model],
        );
        return res.json({ source: 'ai', generated_at: new Date().toISOString(), analysis: aiResult });
      }
    }

    // 7. Rules-based fallback — NOT cached
    return res.json({
      source:       'rules',
      generated_at: null,
      analysis: {
        summary:       null,
        strengths:     reasons.slice(0, 3),
        consideration: null,
      },
    });
  } catch (err) {
    console.error('[ai/getAiFit]', err);
    res.status(500).json({ error: 'Failed to generate AI fit analysis.' });
  }
}

// ── GET /api/hives/:id/ai-match ───────────────────────────────────────────────
export async function getAiMatch(req, res) {
  try {
    const hiveId = req.params.id;

    // 1. Hive must be active + discoverable
    const { rows: [hive] } = await query(
      `SELECT h.*, c.category_name FROM hives h
       LEFT JOIN categories c ON c.category_id = h.category_id
       WHERE h.hive_id = $1 AND h.hive_status = 'active' AND h.discoverable = TRUE`,
      [hiveId],
    );
    if (!hive) return res.status(404).json({ error: 'Hive not found or not discoverable.' });

    // 2. Must NOT already be an active member
    const { rows: [membership] } = await query(
      `SELECT 1 FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (membership) return res.status(403).json({ error: 'Already a member.' });

    // 3. Check 7-day cache
    const { rows: [cached] } = await query(
      `SELECT content, generated_at FROM ai_explanations
       WHERE scope = 'discovery' AND hive_id = $1 AND user_id = $2 ${CACHE_SQL}`,
      [hiveId, req.userId],
    );
    if (cached) {
      return res.json({ source: 'ai', generated_at: cached.generated_at, match: cached.content });
    }

    // 4. Load data in parallel
    const [{ rows: [userProfile] }, { rows: [cs] }] = await Promise.all([
      query('SELECT * FROM profiles WHERE user_id = $1', [req.userId]),
      query(
        `SELECT category_score, interest_score, goal_score, skill_score,
                location_score, availability_score, personality_score, total_score,
                scorer_version
         FROM compatibility_scores WHERE user_id = $1 AND hive_id = $2`,
        [req.userId, hiveId],
      ),
    ]);

    // 5. Build purposeFactors — same scorer_version-aware recompute as getAiFit.
    const hiveCategoryKey = CATEGORY_KEY_FOR_NAME[hive.category_name] ?? null;
    let purposeFactors, details;
    if (!cacheIsStale(cs, hiveCategoryKey)) {
      purposeFactors = {
        category:     Number(cs.category_score),
        interests:    Number(cs.interest_score),
        goals:        Number(cs.goal_score),
        skills:       Number(cs.skill_score),
        location:     Number(cs.location_score),
        availability: Number(cs.availability_score),
        personality:  Number(cs.personality_score),
      };
    } else if (userProfile) {
      const collabCtx = await buildCollabCtx(hive, userProfile);
      ({ factors: purposeFactors, details } = scorePurpose(userProfile, hive, null, collabCtx));
    } else {
      purposeFactors = { category: 0, interests: 0, goals: 0, skills: 0, location: 0, availability: 0, personality: 0 };
    }

    const reasons = buildReasons(purposeFactors, null, [], details);

    // 6. Try AI generation
    if (aiEnabled() && userProfile) {
      const aiResult = await generateDiscoveryExplanation(
        {
          hive: { ...hive, match_score: cs ? Number(cs.total_score) : null },
          userProfile: { ...userProfile, user_id: req.userId },
          reasons,
        },
        req.userId,
      );

      if (aiResult) {
        const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
        await query(
          `INSERT INTO ai_explanations (scope, hive_id, user_id, content, model)
           VALUES ('discovery', $1, $2, $3, $4)
           ON CONFLICT (scope, hive_id, user_id) DO UPDATE SET
             content = EXCLUDED.content, model = EXCLUDED.model, generated_at = NOW()`,
          [hiveId, req.userId, JSON.stringify(aiResult), model],
        );
        return res.json({ source: 'ai', generated_at: new Date().toISOString(), match: aiResult });
      }
    }

    // 7. Rules-based fallback — NOT cached
    return res.json({
      source:       'rules',
      generated_at: null,
      match: {
        summary:    null,
        highlights: reasons.slice(0, 3),
      },
    });
  } catch (err) {
    console.error('[ai/getAiMatch]', err);
    res.status(500).json({ error: 'Failed to generate AI match explanation.' });
  }
}
