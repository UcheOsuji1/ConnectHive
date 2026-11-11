// Prompt 81 — Collab matching (Pro & Project plan, Step 4).
// Pure unit tests on scoreCollab / buildReasons / the weight tables. No
// database — see prompt81-collab-match.integration.mjs for the dev-DB,
// through-the-real-controller pass (matchHives ranking, role fill/hide,
// owner review roleFit).
//
//   node src/checks/collabMatching.check.mjs
import assert from 'node:assert/strict';
import {
  scoreCollab, buildReasons, scorePurpose, COLLAB_WEIGHTS, mergeSkills,
  norm, flatten, tokens, overlapScore,
} from '../lib/compatibility.js';

let checks = 0;
function check(ok, name) { assert.ok(ok, name); checks++; console.log(`PASS ${name}`); }

// ── Fixtures ─────────────────────────────────────────────────────────────────
const FILM_HIVE = {
  category_name: 'Project Collaboration',
  compensation: ['revenue_share', 'portfolio'],
  project_types: ['film_video'],
  project_stage: 'in_progress',
  commitment: 'part_time',
  work_style: 'weekly_sync',
  project_timeline: 'few_months',
  tags: [], hive_values: [], ideal_members: '', description: '',
  location_type: 'online',
};
const FILM_ROLES = [
  { role_id: 'cine',  title: 'Cinematographer', skills: ['Photography', 'Documentary'] },
  { role_id: 'sound', title: 'Sound mixer',     skills: ['Audio Engineering', 'Live Sound'] },
  { role_id: 'lead',  title: 'Lead actor',       skills: ['Film / TV Acting', 'Acting / Theater'] },
];

// ── Film crew Hive ───────────────────────────────────────────────────────────
{
  const answers = {
    joining: { wantRoles: ['Actor'], wantsInReturn: ['portfolio'], prefStages: [] },
    types: ['film_video'], commitment: 'part_time', workStyle: 'weekly_sync', timeline: 'few_months',
  };
  const seekerSkills = mergeSkills(['Film / TV Acting', 'Acting / Theater'], []);
  const { factors, details } = scoreCollab('project', answers, seekerSkills, {}, FILM_HIVE, FILM_ROLES);
  check(details.bestRole?.role_id === 'lead', 'Film crew: actor seeker’s bestRole is Lead actor');
  check(factors.roleFit === 100, 'Film crew: actor seeker’s roleFit is 100 (capped)');
  const reasons = buildReasons(factors, null, [], details);
  check(reasons.includes('You fit the open Lead actor role'), 'Film crew: actor seeker gets the role reason');
}
{
  const answers = { joining: { wantRoles: [], wantsInReturn: [], prefStages: [] } };
  const { factors, details } = scoreCollab('project', answers, ['Guitar'], {}, FILM_HIVE, FILM_ROLES);
  check(details.bestRole?.role_id === 'sound', 'Film crew: musician’s bestRole is Sound mixer (same-category partial)');
  check(factors.roleFit <= 70 && factors.roleFit > 0, 'Film crew: musician gets partial credit at most');
  const reasons = buildReasons(factors, null, [], details);
  check(!reasons.some(r => r.startsWith('You fit the open')), 'Film crew: musician gets no role reason');
}
{
  const answers = { joining: { wantRoles: [], wantsInReturn: [], prefStages: [] } };
  const { factors, details } = scoreCollab('project', answers, ['Voice Acting'], {}, FILM_HIVE, FILM_ROLES);
  check(details.bestRole?.role_id === 'lead', 'Film crew: Voice Acting seeker’s bestRole is Lead actor (same-category)');
  check(factors.roleFit === 50, 'Film crew: Voice Acting seeker gets same-category partial credit (50)');
}

// ── Compensation ─────────────────────────────────────────────────────────────
{
  const hive = { ...FILM_HIVE, compensation: ['portfolio'] };
  const wantsPaid = { joining: { wantRoles: [], wantsInReturn: ['paid'], prefStages: [] } };
  const r1 = scoreCollab('project', wantsPaid, [], {}, hive, []);
  check(r1.factors.compensation === 10, 'Compensation: wants Paid vs Portfolio-only → 10');

  const wantsPaidPortfolio = { joining: { wantRoles: [], wantsInReturn: ['paid', 'portfolio'], prefStages: [] } };
  const r2 = scoreCollab('project', wantsPaidPortfolio, [], {}, hive, []);
  check(r2.factors.compensation === 100, 'Compensation: wants Paid + Portfolio vs Portfolio → 100');
  const reasons2 = buildReasons(r2.factors, null, [], r2.details);
  check(reasons2.some(r => r.startsWith('They offer')), 'Compensation: the overlap reason fires at 100');
}

// ── Commitment ───────────────────────────────────────────────────────────────
{
  const r1 = scoreCollab('project', { commitment: 'full_time' }, [], {}, { ...FILM_HIVE, commitment: 'casual' }, []);
  check(r1.factors.commitment === 15, 'Commitment: Full-time vs Casual → 15');
  const r2 = scoreCollab('project', { commitment: 'side_project' }, [], {}, { ...FILM_HIVE, commitment: 'part_time' }, []);
  check(r2.factors.commitment === 55, 'Commitment: Side project vs Part-time → 55');
}

// ── Stage ────────────────────────────────────────────────────────────────────
{
  const answers = { joining: { wantRoles: [], wantsInReturn: [], prefStages: [] } };
  const r = scoreCollab('project', answers, [], {}, { ...FILM_HIVE, project_stage: 'launched' }, []);
  check(r.factors.stage === 100, 'Stage: "any stage" (empty prefStages, with a joining path) → 100');
}

// ── Hive with no roles ───────────────────────────────────────────────────────
{
  const hive = { ...FILM_HIVE, ideal_members: 'Looking for a Python developer', description: 'Build cool stuff' };
  const profile = { skills: ['Python', 'JavaScript'] };
  const collab = scoreCollab('project', null, ['Python', 'JavaScript'], profile, hive, []);
  // The ORIGINAL word-overlap skills score, reproduced inline — the same
  // formula scorePurpose's own (unchanged) `skills` factor uses.
  const userSkills = flatten(profile.skills);
  const hiveSkillTokSet = new Set(tokens([hive.ideal_members, hive.description].filter(Boolean).join(' ')));
  const legacyScore = Math.round(
    userSkills.filter(s => tokens(s).some(t => hiveSkillTokSet.has(t))).length / userSkills.length * 100,
  );
  check(collab.factors.roleFit === legacyScore, 'No roles: roleFit equals today’s word-overlap skills score');
}

// ── Neutral ──────────────────────────────────────────────────────────────────
{
  const hive = { ...FILM_HIVE, compensation: [] };
  const withRoles = scoreCollab('project', null, [], {}, hive, FILM_ROLES);
  for (const key of ['projectType', 'compensation', 'commitment', 'stage', 'workStyle', 'timeline']) {
    check(withRoles.factors[key] === 60, `Neutral: ${key} is 60 for a seeker with no answers`);
  }
  check(withRoles.factors.roleFit === 60, 'Neutral: roleFit is 60 when the seeker gave no skills or wanted roles');
  const reasons = buildReasons(withRoles.factors, null, [], withRoles.details);
  check(!reasons.some(r => /role|offer|stage|commitment/i.test(r)), 'Neutral: no collab reasons fire');
}

// ── Professional ─────────────────────────────────────────────────────────────
const PRO_HIVE = {
  category_name: 'Professional Networking',
  pro_industries: ['tech_software'], career_stages: ['mid'], audience_scope: 'same',
  tags: [], hive_values: [], ideal_members: '', description: '', location_type: 'online',
};
{
  const hive = { ...PRO_HIVE, audience_scope: 'cross', pro_industries: [] };
  const r = scoreCollab('professional', { industries: [], industryScope: 'cross' }, [], {}, hive, []);
  check(r.factors.industry === 75, 'Professional: cross-industry Hive with no industries → 75');
}
{
  const r = scoreCollab('professional', { industryScope: 'cross' }, [], {}, PRO_HIVE, []);
  check(r.factors.scope === 30, 'Professional: same/cross scope conflict → 30');
}
{
  const r = scoreCollab('professional', { careerStage: 'senior' }, [], {}, PRO_HIVE, []);
  check(r.factors.careerStage === 50, 'Professional: career stage one step away (mid ↔ senior) → 50');
}

// ── Weight sums ──────────────────────────────────────────────────────────────
for (const name of ['project', 'professional']) {
  const sum = Object.values(COLLAB_WEIGHTS[name]).reduce((a, b) => a + b, 0);
  check(sum === 100, `COLLAB_WEIGHTS.${name} sums to 100`);
}

// ── Unchanged categories: frozen reference vs current scorePurpose ──────────
// A self-contained copy of the PRE-Prompt-81 scorePurpose, built only from
// compatibility.js's still-exported primitives (norm/flatten/tokens/
// overlapScore) — proves the refactor changed nothing for Social, Travel,
// Event and Specialized Hives.
const FROZEN_PURPOSE_WEIGHTS = { category: 35, interests: 20, goals: 20, skills: 10, location: 5, cadence: 5, personality: 5 };
const FROZEN_CATEGORY_KEY_MAP = {
  'social groups': 'social', 'professional networking': 'professional', 'travel buddies': 'travel',
  'project collaboration': 'project', 'event buddies': 'event', 'specialized groups': 'specialized',
};
function frozenCadenceScore(commitmentArr, hiveCadence) {
  if (!commitmentArr.length || !hiveCadence) return 50;
  const hc = norm(hiveCadence);
  if (hc === 'flexible') return 100;
  const hits = commitmentArr.filter(c => {
    const uc = norm(c);
    if (uc === 'as needed') return true;
    if (hc === 'daily')    return uc === 'daily'    || uc.includes('few times');
    if (hc === 'weekly')   return uc === 'weekly'   || uc.includes('few times');
    if (hc === 'biweekly') return uc === 'biweekly' || uc === 'bi-weekly';
    if (hc === 'monthly')  return uc === 'monthly';
    return false;
  }).length;
  return Math.round((hits / commitmentArr.length) * 100);
}
function frozenScorePurpose(profile, hive, selectedCategoryKey) {
  const hiveCategoryKey = FROZEN_CATEGORY_KEY_MAP[norm(hive.category_name ?? '')] ?? null;
  const category = !selectedCategoryKey ? 60 : hiveCategoryKey === selectedCategoryKey ? 100 : 0;

  const userInterests  = flatten(profile.interests);
  const hiveTags       = flatten(hive.tags);
  const hiveTagTokSet  = new Set(hiveTags.flatMap(t => tokens(t)));
  const interests = userInterests.length
    ? Math.round(userInterests.filter(i => tokens(i).some(t => hiveTagTokSet.has(t))).length / userInterests.length * 100)
    : 0;

  const userGoals  = flatten(profile.goals);
  const hiveValues = flatten(hive.hive_values);
  const goals = !hiveValues.length ? 50 : overlapScore(userGoals, hiveValues);

  const userSkills      = flatten(profile.skills);
  const hiveSkillText   = [hive.ideal_members, hive.description].filter(Boolean).join(' ');
  const hiveSkillTokSet = new Set(tokens(hiveSkillText));
  const skills = userSkills.length
    ? Math.round(userSkills.filter(s => tokens(s).some(t => hiveSkillTokSet.has(t))).length / userSkills.length * 100)
    : 0;

  let location = 50;
  if (hive.location_type === 'online') {
    location = 80;
  } else if (hive.location_type === 'in-person' || hive.location_type === 'hybrid') {
    const userLoc = norm(profile.location ?? '');
    const hiveLoc = norm(hive.location ?? '');
    if (userLoc && hiveLoc) location = userLoc.includes(hiveLoc) || hiveLoc.includes(userLoc) ? 100 : 10;
  }

  const sp = profile.social_preferences ?? {};
  const rawFreq = sp.frequency;
  const userFrequency = rawFreq ? (Array.isArray(rawFreq) ? rawFreq : [rawFreq]) : [];
  const cadence = frozenCadenceScore(userFrequency, hive.cadence);

  const userPersonality = norm(profile.personality_type ?? '');
  const userConnPref    = norm(profile.connection_preference ?? '');
  const hivePersonalityText = norm([hive.ground_rules, hive.ideal_members, hive.description].filter(Boolean).join(' '));
  let personality = 50;
  if (userPersonality && hivePersonalityText.includes(userPersonality)) personality = 90;
  else if (userConnPref && hivePersonalityText.includes(userConnPref)) personality = 70;

  const factors = { category, interests, goals, skills, location, cadence, personality };
  const total = Math.round(Object.entries(FROZEN_PURPOSE_WEIGHTS).reduce((sum, [k, w]) => sum + (factors[k] * w) / 100, 0));
  return { factors, total };
}

// Deterministic PRNG (mulberry32) — reproducible across runs.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(81);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pickSome = (arr) => arr.filter(() => rand() < 0.5);

const INTEREST_POOL = ['Hiking', 'Board games', 'Cooking', 'Reading', 'Music', 'Film', 'Travel', 'Fitness'];
const GOAL_POOL = ['shared goals', 'good vibes fun', 'personal growth', 'accountability', 'diversity of thought', 'action results'];
const SKILL_POOL = ['Python', 'Design', 'Writing', 'Marketing', 'Cooking', 'Photography'];
const CATEGORY_NAMES = ['Social Groups', 'Travel Buddies', 'Event Buddies', 'Specialized Groups'];
const CATEGORY_KEYS  = ['social', 'travel', 'event', 'specialized'];

let mismatches = 0;
for (let i = 0; i < 20; i++) {
  const profile = {
    interests: pickSome(INTEREST_POOL),
    goals: pickSome(GOAL_POOL),
    skills: pickSome(SKILL_POOL),
    location: pick(['Los Angeles', 'Miami', 'Chicago', '']),
    social_preferences: { frequency: pick(['Daily', 'Weekly', 'Monthly', 'As needed']) },
    personality_type: pick(['introvert', 'extrovert', '']),
    connection_preference: pick(['deep', 'casual', '']),
  };
  const catIdx = i % CATEGORY_NAMES.length;
  const hive = {
    category_name: CATEGORY_NAMES[catIdx],
    tags: pickSome(INTEREST_POOL),
    hive_values: pickSome(GOAL_POOL),
    ideal_members: pick(SKILL_POOL) + ' ' + pick(SKILL_POOL),
    description: 'A Hive about ' + pick(INTEREST_POOL),
    location_type: pick(['online', 'in-person', 'hybrid']),
    location: pick(['Los Angeles', 'Miami', 'Chicago']),
    cadence: pick(['Daily', 'Weekly', 'Biweekly', 'Monthly', 'Flexible']),
    ground_rules: pick(['Be kind', 'Show up', '']),
  };
  const selectedCategoryKey = pick([null, ...CATEGORY_KEYS]);

  const frozen  = frozenScorePurpose(profile, hive, selectedCategoryKey);
  const current = scorePurpose(profile, hive, selectedCategoryKey);
  const same = JSON.stringify(frozen.factors) === JSON.stringify(current.factors) && frozen.total === current.total;
  if (!same) {
    mismatches++;
    console.log('MISMATCH', i, JSON.stringify({ frozen, current, hive, selectedCategoryKey }));
  }
}
check(mismatches === 0, `Unchanged categories: 20 generated profile/Hive pairs (Social/Travel/Event/Specialized) match the frozen reference exactly`);

console.log(`\n${checks}/${checks} checks passed.`);
