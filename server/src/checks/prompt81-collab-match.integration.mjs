// Prompt 81 — Collab matching, integration (dev database). Runs through the
// real controller functions, in-process — same pattern as prompt78-collab.mjs.
// Every fixture is tagged with a unique run marker and deleted in a finally
// block; the final check confirms zero stray rows survive.
//
//   node src/checks/prompt81-collab-match.integration.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool, query } from '../db/index.js';
import {
  createHive, matchHives, getHiveCollab, updateHiveCollab, getHiveRequests, requestToJoin,
} from '../controllers/hivesController.js';
import { updateCollabProfile } from '../controllers/usersController.js';

const log = console.log;
console.log = (...args) => { if (!String(args[0]).startsWith('[db]')) log(...args); };

let checks = 0;
function check(ok, name) { assert.ok(ok, name); checks++; log(`PASS ${name}`); }

async function call(handler, userId, body = {}, params = {}, qs = {}) {
  let status = 200, data;
  const res = { status(n) { status = n; return this; }, json(value) { data = value; return this; } };
  await handler({ userId, body, params, query: qs }, res);
  return { status, data };
}

const RUN = randomUUID().slice(0, 8);
const userIds = [];
const hiveIds = [];

async function seedUser(name) {
  const { rows: [u] } = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, NULL) RETURNING user_id`,
    [`p81-${RUN}-${name}@test.invalid`],
  );
  await pool.query(`INSERT INTO profiles (user_id, full_name, age) VALUES ($1, $2, 30)`, [u.user_id, name]);
  userIds.push(u.user_id);
  return u.user_id;
}

async function cleanup() {
  if (hiveIds.length) await pool.query('DELETE FROM hives WHERE hive_id = ANY($1::uuid[])', [hiveIds]);
  if (userIds.length) await pool.query('DELETE FROM users WHERE user_id = ANY($1::uuid[])', [userIds]);
}

try {
  await pool.query(`DELETE FROM hives WHERE hive_name LIKE 'p81-%'`);
  await pool.query(`DELETE FROM users WHERE email LIKE 'p81-%@test.invalid'`);

  const filmOwner  = await seedUser('filmOwner');
  const plainOwner = await seedUser('plainOwner'); // own Hive-count bucket — the billing trigger caps 1 active Hive per owner
  const actor      = await seedUser('actor');

  // ── Film crew Project Hive, with roles ──────────────────────────────────
  const createRes = await call(createHive, filmOwner, {
    name: `p81-${RUN}-FilmCrew`, category: 'project', meetingType: 'online',
    joinPolicy: 'request', discoverable: true,
    collab: { project_types: ['film_video'], compensation: ['revenue_share', 'portfolio'] },
  });
  assert.equal(createRes.status, 201, JSON.stringify(createRes.data));
  const filmHive = createRes.data.hive;
  hiveIds.push(filmHive.hive_id);

  const rolesRes = await call(updateHiveCollab, filmOwner, {
    compensation: ['revenue_share', 'portfolio'],
    roles: [
      { title: 'Cinematographer', slots: 1, skills: ['Photography', 'Documentary'] },
      { title: 'Sound mixer',     slots: 1, skills: ['Audio Engineering', 'Live Sound'] },
      { title: 'Lead actor',      slots: 1, skills: ['Film / TV Acting', 'Acting / Theater'] },
    ],
  }, { id: filmHive.hive_id });
  check(rolesRes.status === 200, 'setup: film crew roles saved');
  const leadActorRole = rolesRes.data.roles.find(r => r.title === 'Lead actor');
  check(!!leadActorRole, 'setup: Lead actor role exists');

  // ── A second Project Hive with NO collab data (pre-collab legacy state —
  // every column at its schema default, inserted directly, bypassing
  // createHive's own now-mandatory-compensation validation) ──────────────
  const { rows: [projCat] } = await query(`SELECT category_id FROM categories WHERE category_name = 'Project Collaboration'`);
  const { rows: [plainHive] } = await pool.query(
    `INSERT INTO hives (creator_user_id, category_id, hive_name, discoverable, hive_status, location_type, join_policy)
     VALUES ($1, $2, $3, TRUE, 'active', 'online', 'open') RETURNING hive_id`,
    [plainOwner, projCat.category_id, `p81-${RUN}-PlainProject`],
  );
  hiveIds.push(plainHive.hive_id);
  await pool.query(
    `INSERT INTO hive_members (hive_id, user_id, role, membership_status, onboarding_status)
     VALUES ($1, $2, 'owner', 'active', 'completed')`,
    [plainHive.hive_id, plainOwner],
  );

  // ── Actor seeker's Deep Dive answers, saved to their profile ────────────
  const dd = await call(updateCollabProfile, actor, {
    deepDive: {
      category: 'project',
      answers: {
        cards: { 'proj-path': 'joining' },
        chips: {
          'proj-want-roles': ['Actor'],
          'proj-return': ['portfolio'],
          'proj-skills': ['Film / TV Acting', 'Acting / Theater'],
        },
      },
    },
  });
  check(dd.status === 200, 'setup: actor seeker’s Deep Dive answers saved');

  // ── matchHives ranks the film Hive first, bestRole = Lead actor ─────────
  const match1 = await call(matchHives, actor, { category: 'project' });
  check(match1.status === 200, 'matchHives: 200');
  check(match1.data.hives[0]?.hive_id === filmHive.hive_id, 'matchHives: film crew Hive ranks first for the actor seeker');
  check(match1.data.hives[0]?.collab?.bestRole?.title === 'Lead actor', 'matchHives: collab.bestRole.title is Lead actor');
  check(match1.data.hives[0]?.reasons?.some(r => r.includes('Lead actor')), 'matchHives: the role reason is present');
  const scoreBeforeFill = match1.data.hives[0].match_score;

  // ── Fill the Lead actor role (not as the actor seeker) ──────────────────
  const filler = await seedUser('filler');
  const joinRes = await call(requestToJoin, filler, { role_id: leadActorRole.role_id }, { id: filmHive.hive_id });
  // join_policy 'request' -> a pending request, not an instant join; accept
  // it directly via a transaction-safe raw update (reviewRequest needs the
  // owner role; simplest here is to seat the member directly, same end state).
  check(joinRes.status === 200 && joinRes.data.requested === true, 'setup: filler requested the Lead actor role');
  const { rows: [reqRow] } = await pool.query(
    `SELECT request_id FROM join_requests WHERE hive_id = $1 AND user_id = $2`, [filmHive.hive_id, filler],
  );
  await pool.query(
    `INSERT INTO hive_members (hive_id, user_id, role, membership_status, onboarding_status, collab_role_id)
     VALUES ($1, $2, 'member', 'active', 'completed', $3)`,
    [filmHive.hive_id, filler, leadActorRole.role_id],
  );
  await pool.query(`UPDATE join_requests SET status = 'accepted', reviewed_at = NOW() WHERE request_id = $1`, [reqRow.request_id]);

  const match2 = await call(matchHives, actor, { category: 'project' });
  const filmResult2 = match2.data.hives.find(h => h.hive_id === filmHive.hive_id);
  const bestRoleChanged = filmResult2 ? filmResult2.collab?.bestRole?.title !== 'Lead actor' : true;
  const scoreDropped = filmResult2 ? filmResult2.match_score < scoreBeforeFill : true;
  check(bestRoleChanged || scoreDropped || !filmResult2, 'matchHives: filling Lead actor changes bestRole or drops the score (or hides the Hive)');

  // ── Fill every remaining role — the Hive should disappear from discovery
  // (Prompt 78's openRolesClause behavior, unchanged) ─────────────────────
  const cineRole  = rolesRes.data.roles.find(r => r.title === 'Cinematographer');
  const soundRole = rolesRes.data.roles.find(r => r.title === 'Sound mixer');
  for (const role of [cineRole, soundRole]) {
    const f = await seedUser(`fill-${role.title.replace(/\W+/g, '')}`);
    await pool.query(
      `INSERT INTO hive_members (hive_id, user_id, role, membership_status, onboarding_status, collab_role_id)
       VALUES ($1, $2, 'member', 'active', 'completed', $3)`,
      [filmHive.hive_id, f, role.role_id],
    );
  }
  const match3 = await call(matchHives, actor, { category: 'project' });
  const filmResult3 = match3.data.hives.find(h => h.hive_id === filmHive.hive_id);
  check(!filmResult3, 'matchHives: filling every role hides the Hive from discovery');

  // ── Owner review: a join request naming Lead actor carries roleFit ──────
  const actor2 = await seedUser('actor2');
  await call(updateCollabProfile, actor2, {
    deepDive: {
      category: 'project',
      answers: { cards: { 'proj-path': 'joining' }, chips: { 'proj-skills': ['Film / TV Acting'] } },
    },
  });
  // Re-open the Lead actor role (closed by filling it above) so a second
  // request against the SAME role_id can be named — role status independent
  // of fill count, so this only reopens the slot for the request to name.
  await pool.query(`INSERT INTO join_requests (hive_id, user_id, role_id) VALUES ($1, $2, $3)`, [filmHive.hive_id, actor2, leadActorRole.role_id]);
  const requestsRes = await call(getHiveRequests, filmOwner, {}, { id: filmHive.hive_id });
  const actor2Request = requestsRes.data.requests.find(r => r.user_id === actor2);
  check(!!actor2Request?.roleFit, 'getHiveRequests: a request naming Lead actor carries roleFit');
  check(actor2Request?.roleFit?.title === 'Lead actor', 'getHiveRequests: roleFit.title is Lead actor');
  check(actor2Request?.roleFit?.total === 2, 'getHiveRequests: roleFit.total is the role’s own skill count');
  check(actor2Request?.deep_dive_answers === undefined, 'getHiveRequests: the candidate’s raw Deep Dive answers are never exposed');

  // ── Plain (no-collab-data) Project Hive still scores the old way ───────
  const matchPlain = await call(matchHives, actor, { category: 'project' });
  const plainResult = matchPlain.data.hives.find(h => h.hive_id === plainHive.hive_id);
  check(!plainResult || plainResult.collab === undefined, 'matchHives: a Project Hive with no collab data gets no collab key');

  log(`\n${checks}/${checks} checks passed.`);
} finally {
  await cleanup();
  const { rows: [{ n: strayUsers }] } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE email LIKE 'p81-%@test.invalid'`);
  assert.equal(strayUsers, 0, 'cleanup left stray fixture users behind');
  log('cleanup verified: 0 stray rows.');
  await pool.end();
}
