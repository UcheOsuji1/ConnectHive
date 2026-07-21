// STAGE 2 (AI): LLM re-rank + natural-language explanations plug in here.

export function norm(s) {
  return String(s ?? '').toLowerCase().trim();
}

export function flatten(v) {
  if (!v) return [];
  if (typeof v === 'string') {
    try { return flatten(JSON.parse(v)); } catch { return [norm(v)].filter(Boolean); }
  }
  if (Array.isArray(v))
    return v.map(x => norm(typeof x === 'object' ? JSON.stringify(x) : x)).filter(Boolean);
  if (typeof v === 'object') return Object.values(v).map(norm).filter(Boolean);
  return [norm(String(v))].filter(Boolean);
}

export function overlapScore(aItems, bItems) {
  if (!aItems.length) return 0;
  const bSet = new Set(bItems.map(norm));
  const hits = aItems.filter(x => bSet.has(norm(x))).length;
  return Math.round((hits / aItems.length) * 100);
}

export const GOAL_MAP = {
  goals:     'shared goals',
  vibes:     'good vibes fun',
  growth:    'personal growth',
  account:   'accountability',
  diversity: 'diversity of thought',
  action:    'action results',
};

// Reverse lookup: category display name → short key (mirrors CATEGORY_NAME_MAP in hivesController)
const CATEGORY_KEY_MAP = {
  'social groups':           'social',
  'professional networking': 'professional',
  'travel buddies':          'travel',
  'project collaboration':   'project',
  'event buddies':           'event',
  'specialized groups':      'specialized',
};

const PURPOSE_WEIGHTS = {
  category:    35,
  interests:   20,
  goals:       20,
  skills:      10,
  location:     5,
  availability: 5,
  personality:  5,
};

const PAIR_WEIGHTS = {
  interests:    35,
  goals:        25,
  personality:  20,
  availability: 15,
  age:           5,
};

export const BLEND = { purpose: 0.6, people: 0.4 };

export function scorePurpose(profile, hive, selectedCategoryKey) {
  // Category match
  const hiveCategoryKey = CATEGORY_KEY_MAP[norm(hive.category_name ?? '')] ?? null;
  const category = !selectedCategoryKey
    ? 60
    : hiveCategoryKey === selectedCategoryKey
    ? 100
    : 0;

  // Interests: profile interests vs hive tags
  const userInterests = flatten(profile.interests);
  const hiveTags      = flatten(hive.tags);
  const interests     = overlapScore(userInterests, hiveTags);

  // Goals: map profile goal keys to human descriptions, text-match against hive fields
  const userGoalTexts = flatten(profile.goals).map(g => GOAL_MAP[g] ?? g);
  const hiveText      = norm([hive.pinned_goal, hive.description, hive.ideal_members].filter(Boolean).join(' '));
  const goals = userGoalTexts.length
    ? Math.round((userGoalTexts.filter(g => hiveText.includes(g)).length / userGoalTexts.length) * 100)
    : 0;

  // Skills: profile skills vs hive ideal_members + description text
  const userSkills    = flatten(profile.skills);
  const hiveSkillText = norm([hive.ideal_members, hive.description].filter(Boolean).join(' '));
  const skills = userSkills.length
    ? Math.round((userSkills.filter(s => hiveSkillText.includes(s)).length / userSkills.length) * 100)
    : 0;

  // Location
  let location = 50;
  if (hive.location_type === 'online') {
    location = 80;
  } else if (hive.location_type === 'in-person' || hive.location_type === 'hybrid') {
    const userLoc = norm(profile.location ?? '');
    const hiveLoc = norm(hive.location ?? '');
    if (userLoc && hiveLoc) {
      location = userLoc.includes(hiveLoc) || hiveLoc.includes(userLoc) ? 100 : 10;
    }
  }

  // Availability: profile availability vs hive cadence
  const userAvail = flatten(profile.availability);
  const hiveAvail = hive.cadence ? flatten(hive.cadence) : [];
  const availability = userAvail.length && hiveAvail.length
    ? overlapScore(userAvail, hiveAvail)
    : 50;

  // Personality: personality_type + connection_preference vs hive descriptive text
  const userPersonality = norm(profile.personality_type ?? '');
  const userConnPref    = norm(profile.connection_preference ?? '');
  const hivePersonalityText = norm(
    [hive.ground_rules, hive.ideal_members, hive.description].filter(Boolean).join(' '),
  );
  let personality = 50;
  if (userPersonality && hivePersonalityText.includes(userPersonality)) personality = 90;
  else if (userConnPref && hivePersonalityText.includes(userConnPref)) personality = 70;

  const factors = { category, interests, goals, skills, location, availability, personality };
  const total   = Math.round(
    Object.entries(PURPOSE_WEIGHTS).reduce((sum, [k, w]) => sum + (factors[k] * w) / 100, 0),
  );

  return { factors, total };
}

export function scorePair(profileA, profileB) {
  const interests    = overlapScore(flatten(profileA.interests),    flatten(profileB.interests));
  const goals        = overlapScore(flatten(profileA.goals),        flatten(profileB.goals));
  const availability = overlapScore(flatten(profileA.availability), flatten(profileB.availability));

  const pA = norm(profileA.personality_type ?? '');
  const pB = norm(profileB.personality_type ?? '');
  const personality = pA && pB ? (pA === pB ? 100 : 40) : 50;

  let age = 50;
  if (profileA.age && profileB.age) {
    const diff = Math.abs(Number(profileA.age) - Number(profileB.age));
    age = diff <= 5 ? 100 : diff <= 10 ? 75 : diff <= 20 ? 50 : 25;
  }

  const factors = { interests, goals, personality, availability, age };
  const total   = Math.round(
    Object.entries(PAIR_WEIGHTS).reduce((sum, [k, w]) => sum + (factors[k] * w) / 100, 0),
  );

  return { factors, total };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function aggregatePeopleFit(pairTotals) {
  if (!pairTotals.length) return null;
  const mean  = pairTotals.reduce((s, v) => s + v, 0) / pairTotals.length;
  const min   = Math.min(...pairTotals);
  const clash = min < 35 ? (35 - min) * 0.5 : 0;
  return clamp(Math.round(mean - clash), 0, 100);
}

export function blendScores(purposeTotal, peopleFit) {
  if (peopleFit === null) return purposeTotal;
  return clamp(Math.round(BLEND.purpose * purposeTotal + BLEND.people * peopleFit), 0, 100);
}

export function buildReasons(purposeFactors, peopleFit, topPairs) {
  const reasons = [];

  if (purposeFactors.interests   >= 60) reasons.push('Strong interest overlap with this Hive');
  if (purposeFactors.goals       >= 60) reasons.push('Shared goals alignment');
  if (purposeFactors.skills      >= 50) reasons.push('Your skills match what this Hive needs');
  if (purposeFactors.location    >= 90) reasons.push('Great location fit');
  if (purposeFactors.availability >= 70) reasons.push('Schedule compatibility');

  if (peopleFit !== null && peopleFit >= 65) reasons.push('High people fit with current members');
  else if (peopleFit !== null && peopleFit >= 40) reasons.push('Good people fit with existing members');

  if (topPairs.length) {
    const top   = topPairs[0];
    const first = (top.full_name ?? '').split(' ')[0] || 'a member';
    if (top.pair_score >= 70) reasons.push(`Great personal chemistry with ${first}`);
  }

  const fallbacks = ['Compatible community vibe', 'Category match', 'Explore this Hive'];
  let fi = 0;
  while (reasons.length < 2 && fi < fallbacks.length) reasons.push(fallbacks[fi++]);

  return reasons.slice(0, 4);
}
