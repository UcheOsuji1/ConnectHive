// Run from server/: node src/checks/prompt71.mjs
// All fixtures and controller writes share one transaction, rolled back even on failure.
import '../env.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/index.js';
import { normalizePlace, resolveMetro } from '../lib/metros.js';
import { matchHives, createHive, updateHive, joinWaitlist } from '../controllers/hivesController.js';

const log = console.log;
console.log = (...args) => { if (!String(args[0]).startsWith('[db]')) log(...args); };
const client = await pool.connect();
const originalQuery = pool.query.bind(pool);
const originalConnect = pool.connect.bind(pool);
pool.query = (...args) => client.query(...args);
// Controllers may open a transaction: keep it inside the outer rollback boundary.
pool.connect = async () => ({
  query: (sql, params) => client.query(sql === 'BEGIN' ? 'SAVEPOINT p71_controller' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT p71_controller' : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT p71_controller' : sql, params),
  release() {},
});
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks++; log(`PASS ${label}`); }
async function call(handler, body, userId, params = {}) {
  let status = 200, data;
  const response = { status(n) { status = n; return this; }, json(value) { data = value; return this; } };
  await handler({ body, userId, params }, response);
  assert.ok(status < 400, `${handler.name}: ${status} ${JSON.stringify(data)}`);
  return data;
}
const prefix = `p71-${randomUUID()}`;
async function seedUser(age = 25, location = null) {
  const { rows: [user] } = await client.query('INSERT INTO users (email, password_hash, email_verified) VALUES ($1, NULL, TRUE) RETURNING user_id', [`${prefix}-${randomUUID()}@example.invalid`]);
  await client.query('INSERT INTO profiles (user_id, full_name, age, location) VALUES ($1, $2, $3, $4)', [user.user_id, 'Prompt 71 fixture', age, location]);
  return user.user_id;
}
async function seedHive(owner, location, meetingType, category = 'social') {
  return (await call(createHive, { name: `${prefix} ${location || meetingType}`, category, location, meetingType }, owner)).hive;
}
try {
  await client.query('BEGIN');
  const samples = [null, '', '   ', 'Silver Lake', '  Santa   Monica, CA ', 'DTLA', 'St. Louis', 'Ft. Worth', 'Miami Beach, FL', 'Los Angeles, USA', 'Hollywood!', "O'Fallon", 'Winston-Salem', 'Springfield', 'Burbank', 'New York', 'Echo\tPark', 'San Pedro', 'Irvine', '...'];
  for (const sample of samples) {
    const { rows: [row] } = await client.query('SELECT normalize_place($1) AS value', [sample]);
    assert.equal(normalizePlace(sample), row.value, `normalization: ${sample}`);
  }
  check(true, '20-string SQL/JS normalization agreement');
  for (const [place, expected] of [['Silver Lake', 'los-angeles'], ['Santa Monica, CA', 'los-angeles'], ['DTLA', 'los-angeles'], ['Long Beach', 'los-angeles'], ['Irvine', 'los-angeles'], ['Miami Beach, FL', 'miami'], ['Springfield', null]]) {
    check(await resolveMetro(place) === expected, `resolveMetro(${place})`);
  }
  const searcher = await seedUser(25, 'Miami Beach, FL');
  const owner = await seedUser(49);
  const la = await seedHive(owner, 'Silver Lake', 'in-person');
  const sm = await seedHive(owner, 'Santa Monica, CA', 'hybrid');
  const miami = await seedHive(owner, 'Miami Beach, FL', 'in-person');
  const online = await seedHive(owner, null, 'online');
  const unknown = await seedHive(owner, 'Uncharted Place', 'in-person');
  const ids = [la, sm, miami, online, unknown].map(h => h.hive_id);
  // Existing data can occupy the top-20 cap; scope matching's candidate SELECT to fixture ids.
  pool.query = (sql, params) => {
    if (sql.includes('SELECT h.*') && sql.includes('h.discoverable = TRUE')) {
      sql = sql.replace('h.discoverable = TRUE', `h.discoverable = TRUE AND h.hive_id = ANY($${params.length + 1}::uuid[])`);
      params = [...params, ids];
    }
    return client.query(sql, params);
  };
  const match = body => call(matchHives, { category: 'social', ...body }, searcher);
  const resultLA = await match({ searchMetroKey: 'los-angeles', searchMode: 'area' });
  check(resultLA.hives.length === 3 && resultLA.hives.every(h => [la, sm, online].some(f => f.hive_id === h.hive_id)), 'LA returns Silver Lake, Santa Monica, online; excludes Miami and NULL area');
  check(resultLA.area.metro_key === 'los-angeles' && resultLA.isLaunchArea, 'LA response area and launch flag');
  const resultMiami = await match({ searchMetroKey: 'miami', searchMode: 'area' });
  check(resultMiami.hives.length === 2 && resultMiami.isLaunchArea === false, 'Miami returns Miami and online');
  check((await match({ searchMode: 'online' })).hives.every(h => h.location_type === 'online'), 'online-only filtering');
  await client.query('UPDATE profiles SET location = NULL WHERE user_id = $1', [searcher]);
  const noArea = await match({});
  check(noArea.needsArea && noArea.hives.length === 1, 'no area returns online and needsArea');
  await client.query("UPDATE profiles SET location = 'Miami Beach, FL' WHERE user_id = $1", [searcher]);
  check((await match({ textValues: { 'social-city': 'Silver Lake' } })).area.metro_key === 'los-angeles', 'legacy typed-city body overrides saved Miami profile');
  check((await match({ textValues: { 'social-city': 'Uncharted Place' } })).needsArea, 'unknown search city never falls back to saved Miami');
  const other = await seedUser(52);
  await client.query("INSERT INTO hive_members (hive_id, user_id, role, membership_status) VALUES ($1, $2, 'member', 'active')", [la.hive_id, other]);
  const score = r => r.hives.find(h => h.hive_id === la.hive_id);
  const baseline = score(await match({ searchMetroKey: 'los-angeles' }));
  const aged = score(await match({ searchMetroKey: 'los-angeles', ageBands: ['21–32'] }));
  const any = score(await match({ searchMetroKey: 'los-angeles', ageBands: ['Any age'] }));
  check(aged.match_score === Math.max(0, baseline.match_score - 15) && any.match_score === baseline.match_score && aged.ageShare === 0, `age scores baseline=${baseline.match_score}, selected=${aged.match_score}, any=${any.match_score}`);
  await call(updateHive, { location: 'Miami Beach, FL', metro_key: null }, owner, { id: sm.hive_id });
  const { rows: [edited] } = await client.query('SELECT metro_key FROM hives WHERE hive_id = $1', [sm.hive_id]);
  check(edited.metro_key === 'miami', 'free-text Settings save re-resolves area even with explicit NULL key');
  const waitingLA = await call(joinWaitlist, { category: 'social', metro_key: 'los-angeles', location: 'Silver Lake' }, searcher);
  await call(joinWaitlist, { category: 'social', metro_key: 'miami', location: 'Miami' }, searcher);
  const repeat = await call(joinWaitlist, { category: 'social', metro_key: 'los-angeles' }, searcher);
  check(waitingLA.waitingCount === repeat.waitingCount, 'waitlist duplicate is scoped to category and area');
  const { rows: waits } = await client.query('SELECT metro_key FROM waitlist WHERE user_id = $1', [searcher]);
  check(waits.length === 2 && waits.some(w => w.metro_key === 'miami') && waits.some(w => w.metro_key === 'los-angeles'), 'waitlist persists distinct LA and Miami rows');
  check((await match({ searchMetroKey: 'los-angeles' })).waitingCount === waitingLA.waitingCount, 'matching queue count agrees with area-specific waitlist');
  const onlineWait = await call(joinWaitlist, { category: 'social', metro_key: null, location: 'Silver Lake' }, searcher);
  const onlineMatch = await match({ searchMode: 'online', searchMetroKey: 'los-angeles' });
  check(onlineMatch.area === null && onlineMatch.waitingCount === onlineWait.waitingCount, 'explicit online-only waitlist stays in NULL-area bucket despite stale city/key');
  const { rows: [counts] } = await client.query('SELECT (SELECT COUNT(*) FROM metros)::int AS metros, (SELECT COUNT(*) FROM metro_places)::int AS places');
  log('DATASET', JSON.stringify(counts));
  const { rows: leftovers } = await client.query("SELECT hive_name, location FROM hives WHERE hive_status = 'active' AND location_type IN ('in-person', 'hybrid') AND metro_key IS NULL AND hive_id <> ALL($1::uuid[]) ORDER BY hive_name", [ids]);
  log('BACKFILL_LEFTOVERS', JSON.stringify(leftovers));
  log(`${checks} checks passed`);
} finally {
  await client.query('ROLLBACK');
  const { rows: [stray] } = await client.query('SELECT COUNT(*)::int AS users FROM users WHERE email LIKE $1', [`${prefix}%`]);
  assert.equal(stray.users, 0);
  log('Stray fixture users: 0 (all fixture data rolled back)');
  pool.query = originalQuery;
  pool.connect = originalConnect;
  client.release();
  await pool.end();
}
