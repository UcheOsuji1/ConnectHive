// node --import ./src/checks/prompt71b-isolated.mjs src/checks/prompt71b.mjs
import assert from 'node:assert/strict';
import { pool } from '../db/index.js';
import { resolveMetro, resolveLocationMetro, searchPlaces } from '../lib/metros.js';
import { createHive, updateHive, getFilterFacets, getSuggestions, matchHives, joinWaitlist } from '../controllers/hivesController.js';
import { setupProfile, getProfile } from '../controllers/usersController.js';
assert.equal(process.env.P71B_ISOLATED, '1', 'Run using the isolated preload; production writes are forbidden.');
const log = console.log;
console.log = (...args) => { if (!String(args[0]).startsWith('[db]')) log(...args); };
let checks = 0;
function check(ok, name) { assert.ok(ok, name); checks++; log(`PASS ${name}`); }
async function call(handler, userId, body = {}, params = {}, query = {}) {
  let status = 200, data;
  const res = { status(n) { status = n; return this; }, json(value) { data = value; return this; } };
  await handler({ userId, body, params, query }, res);
  return { status, data };
}
async function seedUser(name) {
  const { rows: [u] } = await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, NULL) RETURNING user_id', [`${name}@p71b.invalid`]);
  await pool.query('INSERT INTO profiles (user_id, full_name, age) VALUES ($1, $2, 25)', [u.user_id, name]);
  return u.user_id;
}
try {
  check((await searchPlaces('Santa Monica')).some(p => p.display_name === 'Santa Monica' && p.state_code === 'CA' && p.metro_key === 'los-angeles'), 'city autocomplete retains state and correct metro');
  check((await searchPlaces('Silver')).some(p => p.display_name === 'Silver Lake' && p.metro_key === 'los-angeles'), 'neighborhood autocomplete retains correct metro');
  check((await searchPlaces('Santa Monica, CA')).some(p => p.display_name === 'Santa Monica'), 'pasted city/state label remains searchable');
  check((await searchPlaces('Silver La')).some(p => p.display_name === 'Silver Lake'), 'partial neighborhood suffix is not mistaken for a state');
  check((await searchPlaces('Los Angeles area')).some(p => p.kind === 'metro' && p.metro_key === 'los-angeles'), 'metropolitan areas are selectable autocomplete results');
  for (const [text, expected] of [['Los Angeles area', 'los-angeles'], ['Los Angeles area, CA', 'los-angeles'], ['Santa Monica, CA', 'los-angeles'], ['Silver Lake', 'los-angeles'], ['Miami area', 'miami'], ['Arlington', null], ['Unknown Village', null]]) {
    check(await resolveMetro(text) === expected, `recognition: ${text}`);
  }
  check((await searchPlaces('zzzzNotAPlace')).length === 0, 'unknown autocomplete produces empty results');
  await assert.rejects(resolveLocationMetro('Santa Monica, CA', 'miami'), err => err.status === 400);
  check(true, 'mismatched city and metro rejected');
  await assert.rejects(resolveLocationMetro('Unknown Village', 'los-angeles'), err => err.status === 400);
  check(true, 'unknown text cannot acquire a forged metro');
  const owner = await seedUser('owner'), viewer = await seedUser('viewer'), admin = await seedUser('admin');
  const make = async (name, location, meetingType, metroKey) => {
    const r = await call(createHive, owner, { name, location, meetingType, metroKey, category: 'social', cadence: 'Weekly', maxMembers: 10 });
    assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data.hive;
  };
  const la = await make('LA Fixture', 'Santa Monica, CA', 'in-person', 'los-angeles');
  const hybrid = await make('Hybrid Fixture', 'Silver Lake, CA', 'hybrid');
  const miami = await make('Miami Fixture', 'Miami Beach, FL', 'in-person');
  const online = await make('Online Fixture', 'Anywhere', 'online', 'miami');
  const manual = await make('Manual Review Fixture', 'San Fernando Valley, CA', 'in-person');
  check(la.metro_key === 'los-angeles' && hybrid.metro_key === 'los-angeles' && online.metro_key === null && manual.metro_key === null, 'create preserves physical/hybrid/online/manual distinctions');
  const before = (await pool.query('SELECT COUNT(*)::int AS n FROM hives')).rows[0].n;
  const mismatch = await call(createHive, owner, { name: 'Bad fixture', category: 'social', meetingType: 'in-person', location: 'Santa Monica, CA', metroKey: 'miami' });
  check(mismatch.status === 400 && (await pool.query('SELECT COUNT(*)::int AS n FROM hives')).rows[0].n === before, 'invalid association creates no Hive or orphan');
  check((await call(updateHive, viewer, { location: 'Miami, FL' }, { id: la.hive_id })).status === 403, 'unauthorized Hive edits denied');
  await pool.query("INSERT INTO hive_members (hive_id, user_id, role) VALUES ($1, $2, 'admin')", [la.hive_id, admin]);
  const edited = await call(updateHive, admin, { location: 'Miami Beach, FL', metro_key: null }, { id: la.hive_id });
  check(edited.status === 200 && edited.data.hive.metro_key === 'miami', 'authorized admin edit resolves new city server-side');
  const invalidEdit = await call(updateHive, owner, { location: 'Silver Lake, CA', metro_key: 'miami' }, { id: hybrid.hive_id });
  check(invalidEdit.status === 400 && (await pool.query('SELECT metro_key FROM hives WHERE hive_id=$1', [hybrid.hive_id])).rows[0].metro_key === 'los-angeles', 'forged edit fails without changing saved area');
  await call(updateHive, owner, { description: 'Preserve manual review', location: manual.location, metro_key: null }, { id: manual.hive_id });
  check((await pool.query('SELECT metro_key FROM hives WHERE hive_id=$1', [manual.hive_id])).rows[0].metro_key === null, 'legacy unresolved Hive not silently remapped');
  const facets = await call(getFilterFacets, viewer, {}, {}, { location: 'Silver Lake, CA', metro_key: 'los-angeles' });
  check(facets.data.categoryCounts['Social Groups'] === 2 && facets.data.connectionOptions.find(o => o.value === 'in-person').count === 0, 'Refine counts match LA neighborhood plus online, excluding Miami and unresolved');
  const anywhere = await call(getFilterFacets, viewer);
  check(anywhere.data.categoryCounts['Social Groups'] === 5, 'Anywhere removes geographic constraint');
  const onlineFacets = await call(getFilterFacets, viewer, {}, {}, { location: 'Silver Lake, CA', connection: 'online' });
  check(onlineFacets.data.categoryCounts['Social Groups'] === 1, 'Refine connection filter combines with metro filtering');
  const suggestions = await call(getSuggestions, viewer, {}, {}, { location: 'Santa Monica, CA' });
  check(suggestions.data.hives.length === 2 && suggestions.data.hives.every(h => [hybrid.hive_id, online.hive_id].includes(h.hive_id)), 'main-page suggestions honor neighborhood/metro relationship');
  const match = await call(matchHives, viewer, { category: 'social', searchMode: 'area', searchMetroKey: 'los-angeles', refineFilters: { connection: ['hybrid'], groupSize: ['small'], cadence: ['weekly'] } });
  check(match.data.hives.length === 1 && match.data.hives[0].hive_id === hybrid.hive_id, 'Refine connection/size/cadence carried into actual matching');
  const badWait = await call(joinWaitlist, viewer, { category: 'social', location: 'Silver Lake, CA', metro_key: 'miami' });
  check(badWait.status === 400 && (await pool.query('SELECT COUNT(*)::int AS n FROM waitlist')).rows[0].n === 0, 'waitlist cannot persist a mismatched area');
  check((await call(joinWaitlist, viewer, { category: 'social', metro_key: 'not-a-metro' })).status === 400, 'waitlist validates area-only keys');
  const profileBody = { full_name: 'Profile Fixture', age: 29, location: 'Silver Lake, CA', bio: 'Keep this bio', school_company: 'Keep this school', interests: ['Art'], skills: ['Design'], goals: ['growth'], availability: ['Weekends'], social_preferences: { frequency: 'Weekly' } };
  await call(setupProfile, viewer, profileBody);
  const profile = (await call(getProfile, viewer)).data.profile;
  await call(setupProfile, viewer, { ...profile, location: 'Santa Monica, CA' });
  const saved = (await call(getProfile, viewer)).data.profile;
  check(saved.location === 'Santa Monica, CA' && saved.bio === profile.bio && saved.school_company === profile.school_company && JSON.stringify(saved.interests) === JSON.stringify(profile.interests), 'profile location edit preserves unrelated saved fields');
  await call(setupProfile, viewer, { ...saved, location: 'My unlisted hometown' });
  check((await call(getProfile, viewer)).data.profile.location === 'My unlisted hometown', 'profile manual fallback persists unchanged');
  log(`${checks} checks passed; isolated database only.`);
} finally { await pool.end(); }
