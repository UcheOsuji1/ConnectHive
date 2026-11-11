// Prompt 82 — Open roles for seekers, applying for a role, reviewing by role.
// Integration (dev database), through the real controller functions — same
// pattern as prompt78/81. Fixture tagged 'p82-', deleted in a finally block.
//
//   node src/checks/prompt82-open-roles.integration.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool, query } from '../db/index.js';
import {
  createHive, getHiveCollab, updateHiveCollab, getHiveRequests, requestToJoin, reviewRequest,
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
    [`p82-${RUN}-${name}@test.invalid`],
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
  await pool.query(`DELETE FROM hives WHERE hive_name LIKE 'p82-%'`);
  await pool.query(`DELETE FROM users WHERE email LIKE 'p82-%@test.invalid'`);

  const owner = await seedUser('owner');
  const actor = await seedUser('actor');
  const stranger = await seedUser('stranger');

  const createRes = await call(createHive, owner, {
    name: `p82-${RUN}-FilmCrew`, category: 'project', meetingType: 'online',
    joinPolicy: 'request', discoverable: true,
    collab: { project_types: ['film_video'], compensation: ['revenue_share', 'portfolio'] },
  });
  assert.equal(createRes.status, 201, JSON.stringify(createRes.data));
  const hive = createRes.data.hive;
  hiveIds.push(hive.hive_id);

  const rolesRes = await call(updateHiveCollab, owner, {
    compensation: ['revenue_share', 'portfolio'],
    roles: [
      { title: 'Lead actor',  slots: 1, skills: ['Film / TV Acting', 'Acting / Theater'] },
      { title: 'Sound mixer', slots: 1, skills: ['Audio Engineering', 'Live Sound'] },
    ],
  }, { id: hive.hive_id });
  const leadRole  = rolesRes.data.roles.find(r => r.title === 'Lead actor');
  const soundRole = rolesRes.data.roles.find(r => r.title === 'Sound mixer');

  await call(updateCollabProfile, actor, {
    deepDive: {
      category: 'project',
      answers: { cards: { 'proj-path': 'joining' }, chips: { 'proj-skills': ['Film / TV Acting', 'Acting / Theater'] } },
    },
  });

  // ── viewerFit + viewerBestRoleId (never another user's) ─────────────────
  const collabAsActor = await call(getHiveCollab, actor, {}, { id: hive.hive_id });
  check(collabAsActor.status === 200, 'getHiveCollab: 200 for the actor seeker');
  const leadInActorView = collabAsActor.data.roles.find(r => r.role_id === leadRole.role_id);
  check(leadInActorView.viewerFit?.matched === 2 && leadInActorView.viewerFit?.total === 2, 'getHiveCollab: actor’s viewerFit on Lead actor is 2 of 2');
  check(leadInActorView.viewerFit?.have?.includes('Film / TV Acting'), 'getHiveCollab: viewerFit.have lists the matched skill');
  check(collabAsActor.data.viewerBestRoleId === leadRole.role_id, 'getHiveCollab: viewerBestRoleId is Lead actor for the actor seeker');

  const collabAsStranger = await call(getHiveCollab, stranger, {}, { id: hive.hive_id });
  const leadInStrangerView = collabAsStranger.data.roles.find(r => r.role_id === leadRole.role_id);
  check(!leadInStrangerView.viewerFit || leadInStrangerView.viewerFit.matched === 0, 'getHiveCollab: a stranger with no Deep Dive answers gets no meaningful viewerFit');
  check(collabAsStranger.data.viewerBestRoleId !== leadRole.role_id || collabAsStranger.data.viewerBestRoleId === null, 'getHiveCollab: viewerBestRoleId is never the actor’s own best role for a different viewer');

  // ── bestRole on a no-role request ────────────────────────────────────────
  const joinRes = await call(requestToJoin, actor, { portfolioUrl: null }, { id: hive.hive_id });
  check(joinRes.status === 200 && joinRes.data.requested === true, 'setup: actor requested with no specific role');
  const requestsRes1 = await call(getHiveRequests, owner, {}, { id: hive.hive_id });
  const actorReq = requestsRes1.data.requests.find(r => r.user_id === actor);
  check(actorReq.role === null, 'getHiveRequests: the request itself names no role');
  check(actorReq.bestRole?.role_id === leadRole.role_id, 'getHiveRequests: bestRole for a no-role request is Lead actor');
  check(actorReq.bestRole?.title === 'Lead actor', 'getHiveRequests: bestRole.title is Lead actor');
  check(Array.isArray(actorReq.links), 'getHiveRequests: the applicant’s public links array is present');
  check(actorReq.deep_dive_answers === undefined, 'getHiveRequests: raw Deep Dive answers never exposed');

  // ── Accept with role_id override: a DIFFERENT role than bestRole/none ───
  const acceptRes = await call(reviewRequest, owner, { action: 'accept', role_id: soundRole.role_id }, { id: hive.hive_id, requestId: actorReq.request_id });
  check(acceptRes.status === 200 && acceptRes.data.reviewed === true, 'reviewRequest: accept with an explicit role_id override succeeds');
  const { rows: [memberRow] } = await pool.query(
    `SELECT collab_role_id FROM hive_members WHERE hive_id = $1 AND user_id = $2`, [hive.hive_id, actor],
  );
  check(memberRow.collab_role_id === soundRole.role_id, 'reviewRequest: the override role_id (not bestRole, not null) is what got assigned');

  const { rows: [notifRow] } = await pool.query(
    `SELECT title FROM notifications WHERE user_id = $1 AND type = 'request_accepted' ORDER BY created_at DESC LIMIT 1`,
    [actor],
  );
  check(notifRow?.title === `You're in ${hive.hive_name} as Sound mixer`, `notification text is "You're in {Hive} as {role}" (got: ${notifRow?.title})`);

  // ── Accept with role_id: null (member, no role) ─────────────────────────
  const stranger2 = await seedUser('stranger2');
  await call(requestToJoin, stranger2, { role_id: leadRole.role_id }, { id: hive.hive_id });
  const { rows: [req2Row] } = await pool.query(`SELECT request_id FROM join_requests WHERE hive_id = $1 AND user_id = $2`, [hive.hive_id, stranger2]);
  const acceptNullRes = await call(reviewRequest, owner, { action: 'accept', role_id: null }, { id: hive.hive_id, requestId: req2Row.request_id });
  check(acceptNullRes.status === 200, 'reviewRequest: accept with explicit role_id:null succeeds');
  const { rows: [member2Row] } = await pool.query(
    `SELECT collab_role_id FROM hive_members WHERE hive_id = $1 AND user_id = $2`, [hive.hive_id, stranger2],
  );
  check(member2Row.collab_role_id === null, 'reviewRequest: role_id:null accepts as a member with no role, even though the request named Lead actor');

  // ── Omitted role_id uses the request's own (today’s behavior) ──────────
  const stranger3 = await seedUser('stranger3');
  await call(requestToJoin, stranger3, {}, { id: hive.hive_id }); // no role named
  const { rows: [req3Row] } = await pool.query(`SELECT request_id FROM join_requests WHERE hive_id = $1 AND user_id = $2`, [hive.hive_id, stranger3]);
  const acceptOmittedRes = await call(reviewRequest, owner, { action: 'accept' }, { id: hive.hive_id, requestId: req3Row.request_id });
  check(acceptOmittedRes.status === 200, 'reviewRequest: accept with role_id omitted succeeds (uses the request’s own, here none)');

  // ── The race: role filled between opening and accepting ────────────────
  // Lead actor has 1 slot — stranger2's acceptance above used Sound mixer,
  // so Lead actor is still open. Fill it directly, then accept a pending
  // request naming it and confirm the server's own roleFilled race-safety.
  const filler = await seedUser('filler');
  await pool.query(
    `INSERT INTO hive_members (hive_id, user_id, role, membership_status, onboarding_status, collab_role_id)
     VALUES ($1, $2, 'member', 'active', 'completed', $3)`,
    [hive.hive_id, filler, leadRole.role_id],
  );
  const stranger4 = await seedUser('stranger4');
  await call(requestToJoin, stranger4, { role_id: leadRole.role_id }, { id: hive.hive_id }).catch(() => {});
  // requestToJoin itself re-validates openness at request time (already
  // full by now), so insert the pending request directly to set up the
  // accept-time race specifically.
  await pool.query(`DELETE FROM join_requests WHERE hive_id = $1 AND user_id = $2`, [hive.hive_id, stranger4]);
  const { rows: [raceReq] } = await pool.query(
    `INSERT INTO join_requests (hive_id, user_id, role_id) VALUES ($1, $2, $3) RETURNING request_id`,
    [hive.hive_id, stranger4, leadRole.role_id],
  );
  const raceAcceptRes = await call(reviewRequest, owner, { action: 'accept' }, { id: hive.hive_id, requestId: raceReq.request_id });
  check(raceAcceptRes.status === 200 && raceAcceptRes.data.roleFilled === true, 'reviewRequest: accepting into a role that filled meanwhile returns roleFilled:true');
  const { rows: [member4Row] } = await pool.query(
    `SELECT collab_role_id FROM hive_members WHERE hive_id = $1 AND user_id = $2`, [hive.hive_id, stranger4],
  );
  check(member4Row.collab_role_id === null, 'reviewRequest: the race still accepts the person, just with no role');

  // ── Notification: "{name} applied for {role}" ───────────────────────────
  const stranger5 = await seedUser('stranger5');
  await call(updateCollabProfile, stranger5, { deepDive: { category: 'project', answers: {} } });
  await call(requestToJoin, stranger5, { role_id: soundRole.role_id }, { id: hive.hive_id }).catch(() => {});
  // Sound mixer has 1 slot, already filled by actor above — request itself
  // will 400 ("no longer open"); use a role with room instead for this check.
  const { rows: [extraRoleRow] } = await pool.query(
    `INSERT INTO hive_roles (hive_id, title, slots, skills) VALUES ($1, 'Editor', 2, '[]'::jsonb) RETURNING role_id`,
    [hive.hive_id],
  );
  await call(requestToJoin, stranger5, { role_id: extraRoleRow.role_id }, { id: hive.hive_id });
  const { rows: ownerNotifs } = await pool.query(
    `SELECT title FROM notifications WHERE user_id = $1 AND type = 'join_request' ORDER BY created_at DESC LIMIT 1`,
    [owner],
  );
  check(ownerNotifs[0]?.title?.includes('applied for Editor'), `owner notification reads "{name} applied for {role}" (got: ${ownerNotifs[0]?.title})`);

  log(`\n${checks}/${checks} checks passed.`);
} finally {
  await cleanup();
  const { rows: [{ n: strayUsers }] } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE email LIKE 'p82-%@test.invalid'`);
  assert.equal(strayUsers, 0, 'cleanup left stray fixture users behind');
  log('cleanup verified: 0 stray rows.');
  await pool.end();
}
