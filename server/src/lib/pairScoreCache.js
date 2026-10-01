import { query } from '../db/index.js';
import { scorePair } from './compatibility.js';

// ── Shared pair-score cache ──────────────────────────────────────────────────
// Three surfaces show the compatibility between the same two people: Hive
// Discovery (matchHives), the "might suit you" suggestions (getSuggestions) and
// the member profile page. getSuggestions used to call scorePair fresh on every
// request while the other two read a 7-day cache, so the same pair could show
// different numbers on different pages. They all go through here now.
//
// The SQL is lifted unchanged from matchHives, which was the only correct
// implementation: a 7-day freshness window on read and DO UPDATE on write.
// usersController previously read with no freshness filter at all and wrote
// DO NOTHING, which is why a stale row there could outlive the window.
export async function getPairScore(profileA, profileB) {
  const idA = profileA.user_id;
  const idB = profileB.user_id;
  const [ua, ub] = [idA, idB].sort();

  const { rows: [cached] } = await query(
    `SELECT total_score, interests_score, goals_score, personality_score,
            availability_score, age_score
       FROM user_compatibility
      WHERE user_a = $1 AND user_b = $2
        AND calculated_at > NOW() - INTERVAL '7 days'`,
    [ua, ub],
  );

  if (cached) {
    return {
      total: Number(cached.total_score),
      factors: {
        interests:    Number(cached.interests_score),
        goals:        Number(cached.goals_score),
        personality:  Number(cached.personality_score),
        availability: Number(cached.availability_score),
        age:          Number(cached.age_score),
      },
      source: 'cache',
    };
  }

  const { factors, total } = scorePair(profileA, profileB);

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
     factors.availability, factors.age, total],
  );

  return { total, factors, source: 'computed' };
}
