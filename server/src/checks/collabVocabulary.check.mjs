// Checks server/src/lib/collabVocabulary.js against its twin
// client/src/data/collabVocabulary.js, against the Prompt 76 snapshot fixture,
// and exercises keyForLabel / skillLabel / normalizeDeepDive directly. Prints
// PASS/FAIL per check and exits non-zero on any failure — see "npm run
// check:collab" in server/package.json.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as serverVocab from '../lib/collabVocabulary.js';
import { SKILL_CATS as serverSkillCats } from '../lib/skillCatalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = path.resolve(HERE, '../../../client/src');
const importClient = (rel) => import(pathToFileURL(path.resolve(CLIENT_SRC, rel)).href);

const clientVocab = await importClient('data/collabVocabulary.js');
const { SKILL_CATS: clientSkillCats } = await importClient('data/skillTaxonomy.js');
const { ROLE_SUGGESTIONS: roleSuggestions } = await importClient('data/roleSuggestions.js');

const snapshot = JSON.parse(readFileSync(
  path.resolve(HERE, 'fixtures/deepdive-collab-snapshot.json'), 'utf8',
));

let failures = 0;
let total = 0;
function check(name, fn) {
  total++;
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name} — ${err.message}`);
  }
}

const {
  display, asChips, asCards, skillLabel, keyForLabel, normalizeDeepDive,
  PROJECT_PATHS, PROJECT_TYPES, PROJECT_PRIMARY_GOALS, PROJECT_STAGES, PROJECT_PREF_STAGES,
  PROJECT_INDUSTRIES, EXPERIENCE_LEVELS, COMPENSATION, WORK_STYLES, COMMITMENTS,
  PROJECT_TIMELINES, COLLAB_FORMATS, FUNDING,
  CAREER_STAGES, PRO_INDUSTRIES, PRO_LOOKING_FOR, PRO_NETWORK_STYLES, PRO_PRIMARY_GOALS,
  PRO_WORK_SITUATIONS, MENTORSHIP_PREFS, INDUSTRY_SCOPES,
} = serverVocab;

const ALL_LISTS = {
  PROJECT_PATHS, PROJECT_TYPES, PROJECT_PRIMARY_GOALS, PROJECT_STAGES, PROJECT_PREF_STAGES,
  PROJECT_INDUSTRIES, EXPERIENCE_LEVELS, COMPENSATION, WORK_STYLES, COMMITMENTS,
  PROJECT_TIMELINES, COLLAB_FORMATS, FUNDING,
  CAREER_STAGES, PRO_INDUSTRIES, PRO_LOOKING_FOR, PRO_NETWORK_STYLES, PRO_PRIMARY_GOALS,
  PRO_WORK_SITUATIONS, MENTORSHIP_PREFS, INDUSTRY_SCOPES,
};

// ── 1. server/client vocabulary data deep-equal ─────────────────────────────
check('server and client collabVocabulary.js are deep-equal', () => {
  for (const [k, v] of Object.entries(serverVocab)) {
    if (typeof v === 'function') continue;
    assert.ok(k in clientVocab, `client is missing export "${k}"`);
    assert.ok(isDeepStrictEqual(v, clientVocab[k]), `"${k}" differs between server and client`);
  }
  for (const k of Object.keys(clientVocab)) {
    if (typeof clientVocab[k] === 'function') continue;
    assert.ok(k in serverVocab, `server is missing export "${k}"`);
  }
});

// ── 2. server skillCatalog.js vs client SKILL_CATS deep-equal ───────────────
check('server skillCatalog.js and client SKILL_CATS are deep-equal', () => {
  assert.ok(isDeepStrictEqual(serverSkillCats, clientSkillCats));
});

// ── 3. every rebuilt constant deep-equals the snapshot ──────────────────────
const REBUILD_MAP = [
  ['PROF_CARDS_STAGE', asCards(CAREER_STAGES)],
  ['PROF_CHIPS_INDUSTRY', asChips(PRO_INDUSTRIES)],
  ['PROF_CHIPS_GOALS', asChips(PRO_LOOKING_FOR)],
  ['PROF_CARDS_NETWORK', asCards(PRO_NETWORK_STYLES)],
  ['PROF_CARDS_PRIMARY_GOAL', asCards(PRO_PRIMARY_GOALS)],
  ['PROF_CHIPS_WORKSIT', asChips(PRO_WORK_SITUATIONS)],
  ['PROF_CARDS_MENTOR', asCards(MENTORSHIP_PREFS)],
  ['PROF_CARDS_INDUSTRY_PREF', asCards(INDUSTRY_SCOPES)],
  ['PROJECT_CHIPS_TYPES', asChips(PROJECT_TYPES)],
  ['PROJECT_CARDS_PATH', asCards(PROJECT_PATHS)],
  ['PROJECT_CARDS_PRIMARY_GOAL', asCards(PROJECT_PRIMARY_GOALS)],
  ['PROJECT_CARDS_STAGE', asCards(PROJECT_STAGES)],
  ['PROJECT_CHIPS_INDUSTRY', asChips(PROJECT_INDUSTRIES)],
  ['PROJECT_CARDS_EXPERIENCE', asCards(EXPERIENCE_LEVELS)],
  ['PROJECT_CHIPS_OFFER', asChips(COMPENSATION)],
  ['PROJECT_CHIPS_PREF_STAGE', asChips(PROJECT_PREF_STAGES)],
  ['PROJECT_CARDS_WORKSTYLE', asCards(WORK_STYLES)],
  ['PROJECT_CARDS_TIME', asCards(COMMITMENTS)],
  ['PROJECT_CHIPS_TIMELINE', asChips(PROJECT_TIMELINES)],
  ['PROJECT_CARDS_LOCATION', asCards(COLLAB_FORMATS)],
  ['PROJECT_CARDS_FUNDING', asCards(FUNDING)],
];
for (const [name, rebuilt] of REBUILD_MAP) {
  check(`rebuilt ${name} deep-equals snapshot`, () => {
    assert.ok(isDeepStrictEqual(rebuilt, snapshot[name]), `mismatch:\n  rebuilt=${JSON.stringify(rebuilt)}\n  snapshot=${JSON.stringify(snapshot[name])}`);
  });
}
check('rebuilt EXPERIENCE_OPTIONS (RoleBuilder) deep-equals snapshot', () => {
  const rebuilt = ['Any level', ...EXPERIENCE_LEVELS.map(l => l.label)];
  assert.ok(isDeepStrictEqual(rebuilt, snapshot.EXPERIENCE_OPTIONS));
});

// ── 4. keys unique + snake_case; PROJECT_PREF_STAGES = stages + any ─────────
for (const [name, items] of Object.entries(ALL_LISTS)) {
  check(`${name}: keys unique and snake_case`, () => {
    const seen = new Set();
    for (const it of items) {
      assert.match(it.key, /^[a-z][a-z0-9_]*$/, `"${it.key}" is not snake_case`);
      assert.ok(!seen.has(it.key), `duplicate key "${it.key}"`);
      seen.add(it.key);
    }
  });
}
check('PROJECT_PREF_STAGES is PROJECT_STAGES plus one "any" item', () => {
  assert.equal(PROJECT_PREF_STAGES.length, PROJECT_STAGES.length + 1);
  for (let i = 0; i < PROJECT_STAGES.length; i++) {
    assert.ok(isDeepStrictEqual(PROJECT_PREF_STAGES[i], PROJECT_STAGES[i]));
  }
  assert.equal(PROJECT_PREF_STAGES.at(-1).key, 'any');
});

// ── 5. ROLE_SUGGESTIONS keys/skills are valid ────────────────────────────────
check('every ROLE_SUGGESTIONS key is a PROJECT_TYPES key, and every type has suggestions', () => {
  const typeKeys = new Set(PROJECT_TYPES.map(t => t.key));
  const suggKeys = Object.keys(roleSuggestions);
  for (const k of suggKeys) assert.ok(typeKeys.has(k), `"${k}" is not a PROJECT_TYPES key`);
  for (const t of PROJECT_TYPES) assert.ok(suggKeys.includes(t.key), `PROJECT_TYPES "${t.key}" has no suggestions`);
});
check('every suggested skill is an exact SKILL_CATS chip', () => {
  const allChips = new Set(serverSkillCats.flatMap(c => c.chips));
  for (const [typeKey, roles] of Object.entries(roleSuggestions)) {
    for (const { title, skills } of roles) {
      for (const skill of skills) {
        assert.ok(allChips.has(skill), `"${skill}" (role "${title}" under "${typeKey}") is not an exact SKILL_CATS chip`);
      }
    }
  }
});

// ── 6. keyForLabel round-trips every item by chip, label and key ────────────
for (const [name, items] of Object.entries(ALL_LISTS)) {
  check(`${name}: keyForLabel round-trips chip/label/key for every item`, () => {
    for (const it of items) {
      assert.equal(keyForLabel(items, display(it)), it.key, `chip string for "${it.key}"`);
      assert.equal(keyForLabel(items, it.label), it.key, `label for "${it.key}"`);
      assert.equal(keyForLabel(items, it.key), it.key, `key for "${it.key}"`);
    }
  });
}

// ── 7. skillLabel ────────────────────────────────────────────────────────────
check('skillLabel: "🐍 Python", "Python" and " python " are equal', () => {
  const a = skillLabel('🐍 Python'), b = skillLabel('Python'), c = skillLabel(' python ');
  assert.equal(a, b);
  assert.equal(b, c);
});
check('skillLabel: "Data science" equals "📊 Data Science"', () => {
  assert.equal(skillLabel('Data science'), skillLabel('📊 Data Science'));
});
check('skillLabel: "Underwater welding" and "Overwater welding" differ', () => {
  assert.notEqual(skillLabel('Underwater welding'), skillLabel('Overwater welding'));
});
check('skillLabel: "🧑‍💻 Freelancer / consultant" gives "freelancer / consultant"', () => {
  assert.equal(skillLabel('🧑‍💻 Freelancer / consultant'), 'freelancer / consultant');
});

// ── 8. normalizeDeepDive ─────────────────────────────────────────────────────
check('normalizeDeepDive: social returns null', () => {
  assert.equal(normalizeDeepDive('social', {}), null);
});

check('normalizeDeepDive: full Building answer set', () => {
  const result = normalizeDeepDive('project', {
    chips: {
      'proj-types': [display(PROJECT_TYPES[2])], // film_video
      'proj-industry': [display(PROJECT_INDUSTRIES[0])],
      'proj-skills': ['📹 Video Editing', '📹 Video Editing', ' 🎬 Film / TV Acting '],
      'proj-offer': [display(COMPENSATION[0]), display(COMPENSATION[1])],
      'proj-timeline': [display(PROJECT_TIMELINES[1])],
    },
    cards: {
      'proj-path': display(PROJECT_PATHS.find(p => p.key === 'building')),
      'proj-location': display(COLLAB_FORMATS.find(c => c.key === 'remote')),
      'proj-primary-goal': display(PROJECT_PRIMARY_GOALS[0]),
      'proj-stage': display(PROJECT_STAGES[1]),
      'proj-funding': display(FUNDING[0]),
      'proj-workstyle': display(WORK_STYLES[0]),
      'proj-time': display(COMMITMENTS[0]),
    },
    textValues: {},
    roles: [{ title: 'Editor', slots: 2, skills: ['📹 Video Editing'], experience: 'Experienced' }],
  });
  assert.equal(result.path, 'building');
  assert.deepEqual(result.types, ['film_video']);
  assert.equal(result.collabFormat, 'remote');
  assert.equal(result.primaryGoal, PROJECT_PRIMARY_GOALS[0].key);
  assert.deepEqual(result.skills, ['📹 Video Editing', '🎬 Film / TV Acting']);
  assert.ok(result.building, 'building must be present');
  assert.equal(result.building.stage, PROJECT_STAGES[1].key);
  assert.deepEqual(result.building.offer, [COMPENSATION[0].key, COMPENSATION[1].key]);
  assert.equal(result.building.roles.length, 1);
  assert.equal(result.building.roles[0].title, 'Editor');
  assert.equal(result.building.roles[0].slots, 2);
  assert.equal(result.building.roles[0].experience, EXPERIENCE_LEVELS.find(l => l.label === 'Experienced').key);
  assert.equal(result.joining, null, 'joining must be null on the Building-only path');
  assert.equal(result.workStyle, WORK_STYLES[0].key);
  assert.equal(result.commitment, COMMITMENTS[0].key);
  assert.equal(result.timeline, PROJECT_TIMELINES[1].key);
});

check('normalizeDeepDive: full Joining answer set', () => {
  const result = normalizeDeepDive('project', {
    chips: {
      'proj-types': [display(PROJECT_TYPES[0])],
      'proj-want-roles': ['Illustrator', 'Illustrator', ' Unity developer '],
      'proj-return': [display(COMPENSATION[2])],
      'proj-pref-stage': [display(PROJECT_PREF_STAGES[0]), display(PROJECT_PREF_STAGES[1])],
    },
    cards: {
      'proj-path': display(PROJECT_PATHS.find(p => p.key === 'joining')),
      'proj-experience': display(EXPERIENCE_LEVELS[2]),
    },
    textValues: {},
    roles: [{ title: 'should be ignored', slots: 1, skills: [], experience: 'Any level' }],
  });
  assert.equal(result.path, 'joining');
  assert.equal(result.building, null, 'building must be null on the Joining-only path');
  assert.ok(result.joining);
  assert.deepEqual(result.joining.wantRoles, ['Illustrator', 'Unity developer']);
  assert.equal(result.joining.experience, EXPERIENCE_LEVELS[2].key);
  assert.deepEqual(result.joining.wantsInReturn, [COMPENSATION[2].key]);
  assert.deepEqual(result.joining.prefStages, [PROJECT_PREF_STAGES[0].key, PROJECT_PREF_STAGES[1].key]);
});

check('normalizeDeepDive: Either set has both groups filled', () => {
  const result = normalizeDeepDive('project', {
    chips: { 'proj-pref-stage': [display(PROJECT_PREF_STAGES.find(s => s.key === 'any'))] },
    cards: { 'proj-path': display(PROJECT_PATHS.find(p => p.key === 'either')) },
    textValues: {},
    roles: [],
  });
  assert.equal(result.path, 'either');
  assert.ok(result.building, 'building must be present on Either');
  assert.ok(result.joining, 'joining must be present on Either');
  assert.deepEqual(result.joining.prefStages, [], '"any" collapses to an empty array');
});

check('normalizeDeepDive: Professional set', () => {
  const result = normalizeDeepDive('professional', {
    chips: {
      goals: [display(PRO_LOOKING_FOR[0])],
      'prof-worksit': [display(PRO_WORK_SITUATIONS[0])],
      industry: [display(PRO_INDUSTRIES[0])],
      'prof-skills': ['🐍 Python'],
    },
    cards: {
      stage: display(CAREER_STAGES[1]),
      'prof-primary-goal': display(PRO_PRIMARY_GOALS[0]),
      'prof-mentor': display(MENTORSHIP_PREFS[0]),
      'prof-indpref': display(INDUSTRY_SCOPES[0]),
      network: display(PRO_NETWORK_STYLES[0]),
    },
    textValues: { 'prof-title': '  Staff Engineer  ', 'prof-org': 'TrueHive' },
  });
  assert.deepEqual(result.lookingFor, [PRO_LOOKING_FOR[0].key]);
  assert.equal(result.title, 'Staff Engineer');
  assert.equal(result.org, 'TrueHive');
  assert.equal(result.workSituation, PRO_WORK_SITUATIONS[0].key);
  assert.equal(result.careerStage, CAREER_STAGES[1].key);
  assert.deepEqual(result.industries, [PRO_INDUSTRIES[0].key]);
  assert.deepEqual(result.skills, ['🐍 Python']);
  assert.equal(result.primaryGoal, PRO_PRIMARY_GOALS[0].key);
  assert.equal(result.mentorship, MENTORSHIP_PREFS[0].key);
  assert.equal(result.industryScope, INDUSTRY_SCOPES[0].key);
  assert.equal(result.networkStyle, PRO_NETWORK_STYLES[0].key);
});

check('normalizeDeepDive: custom "+ Something else" entries land in …Other', () => {
  const result = normalizeDeepDive('project', {
    chips: { 'proj-types': [display(PROJECT_TYPES[0]), 'A homemade board game studio'] },
    cards: {},
    textValues: {},
    roles: [],
  });
  assert.deepEqual(result.types, [PROJECT_TYPES[0].key]);
  assert.deepEqual(result.typesOther, ['A homemade board game studio']);
});

check('normalizeDeepDive: unknown single-select card value is dropped with a warning', () => {
  const origWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const result = normalizeDeepDive('project', {
      chips: {},
      cards: { 'proj-path': 'Some made-up value nobody picked' },
      textValues: {},
      roles: [],
    });
    assert.equal(result.path, null);
    assert.ok(warnings.length >= 1, 'expected a console.warn for the unknown value');
  } finally {
    console.warn = origWarn;
  }
});

check(`normalizeDeepDive: ${serverVocab.COLLAB_LIMITS.maxRoles + 2} roles trimmed to ${serverVocab.COLLAB_LIMITS.maxRoles} with a warning`, () => {
  const origWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const overLimit = serverVocab.COLLAB_LIMITS.maxRoles + 2;
    const roles = Array.from({ length: overLimit }, (_, i) => ({ title: `Role ${i}`, slots: 1, skills: [], experience: 'Any level' }));
    const result = normalizeDeepDive('project', {
      chips: {},
      cards: { 'proj-path': display(PROJECT_PATHS.find(p => p.key === 'building')) },
      textValues: {},
      roles,
    });
    assert.equal(result.building.roles.length, serverVocab.COLLAB_LIMITS.maxRoles);
    assert.ok(warnings.length >= 1, 'expected a console.warn for the role-count trim');
  } finally {
    console.warn = origWarn;
  }
});

check('COLLAB_LIMITS: server and client are deep-equal', () => {
  assert.ok(isDeepStrictEqual(serverVocab.COLLAB_LIMITS, clientVocab.COLLAB_LIMITS));
  for (const [k, v] of Object.entries(serverVocab.COLLAB_LIMITS)) {
    assert.equal(typeof v, 'number', `${k} should be a number`);
    assert.ok(v > 0, `${k} should be positive`);
  }
});

console.log(`\n${total - failures}/${total} checks passed.`);
if (failures > 0) {
  console.log(`${failures} FAILED.`);
  process.exit(1);
}
process.exit(0);
