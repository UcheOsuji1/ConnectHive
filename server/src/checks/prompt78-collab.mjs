// Prompt 78 — Collab database and API (Pro & Project plan, Step 2).
// Runs against the real dev database (same one `npm run db:migrate` targets)
// through the real controller functions, in-process — same pattern as
// prompt71b.mjs's `call()` helper. Every fixture is tagged with a unique
// run marker and deleted in a `finally` block; the final check confirms
// zero stray rows survive.
//
//   node src/checks/prompt78-collab.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool, query } from '../db/index.js';
import {
  createHive, requestToJoin, getHiveRequests, reviewRequest, removeMember,
  getHiveCollab, updateHiveCollab, updateMemberCollabRole,
  matchHives, quickFindHives, getCategoryCounts,
} from '../controllers/hivesController.js';
import { updateCollabProfile, getProfile, getMemberProfile } from '../controllers/usersController.js';

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
    [`p78-${RUN}-${name}@test.invalid`],
  );
  await pool.query(`INSERT INTO profiles (user_id, full_name, age) VALUES ($1, $2, 30)`, [u.user_id, name]);
  userIds.push(u.user_id);
  return u.user_id;
}

async function makeHive(owner, category, overrides = {}) {
  const r = await call(createHive, owner, {
    name: `p78-${RUN}-${category}-${randomUUID().slice(0, 6)}`,
    category, meetingType: 'online', joinPolicy: 'open', discoverable: true,
    // Prompt 80: compensation (Project) / an industry or Cross-industry
    // (Professional) are now required at create too. Every pre-80 test here
    // attaches its own roles/basics via a later PUT /collab, so a minimal
    // default here keeps createHive itself happy without changing what any
    // of those later PUTs actually test.
    ...(category === 'project' && !overrides.collab ? { collab: { compensation: ['paid'] } } : {}),
    ...(category === 'professional' && !overrides.collab ? { collab: { audience_scope: 'cross' } } : {}),
    ...overrides,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  hiveIds.push(r.data.hive.hive_id);
  return r.data.hive;
}

async function cleanup() {
  if (hiveIds.length) await pool.query('DELETE FROM hives WHERE hive_id = ANY($1::uuid[])', [hiveIds]);
  if (userIds.length) await pool.query('DELETE FROM users WHERE user_id = ANY($1::uuid[])', [userIds]);
}

try {
  // Clean up any stray rows a previous crashed/killed run left behind.
  // Hives first — a user who still owns one can't be deleted (hives.
  // creator_user_id has no ON DELETE CASCADE).
  await pool.query(`DELETE FROM hives WHERE hive_name LIKE 'p78-%'`);
  await pool.query(`DELETE FROM users WHERE email LIKE 'p78-%@test.invalid'`);

  // One owner per Hive — the billing session's free-tier active-Hive-limit
  // trigger caps a single user at 1 active Hive, and this script must not
  // touch that trigger (shared dev database; another session may be
  // exercising it concurrently).
  const owner = await seedUser('owner');
  const applicantA = await seedUser('applicantA');
  const applicantB = await seedUser('applicantB');
  const stranger = await seedUser('stranger');

  // ── PUT /collab: add/edit/reorder/delete roles ───────────────────────────
  const ownerProj = await seedUser('ownerProj');
  const projectHive = await makeHive(ownerProj, 'project', { joinPolicy: 'request', maxMembers: 10 });
  const put1 = await call(updateHiveCollab, ownerProj, {
    project_types: ['app_software'], compensation: ['paid', 'equity'],
    roles: [
      { title: 'Backend developer', slots: 2, skills: ['Python', 'python '], experience_level: 'some' },
      { title: 'Designer', slots: 1, skills: [] },
    ],
  }, { id: projectHive.hive_id });
  check(put1.status === 200, 'PUT /collab: creates basics + 2 new roles');
  check(put1.data.roles.length === 2 && put1.data.roles[0].title === 'Backend developer' && put1.data.roles[0].skills.length === 1,
    'PUT /collab: role skills deduped (Python / python -> 1)');
  check(put1.data.labels.app_software === '📱 App / Software team', 'PUT /collab: labels map includes a real display string');
  const [backendRole, designerRole] = put1.data.roles;

  const put2 = await call(updateHiveCollab, ownerProj, {
    compensation: ['paid'],
    roles: [
      { role_id: designerRole.role_id, title: 'Lead designer', slots: 1, skills: [] },
      { title: 'Marketer', slots: 1, skills: [] },
    ],
  }, { id: projectHive.hive_id });
  check(put2.status === 200, 'PUT /collab: second save succeeds');
  const titles = put2.data.roles.map(r => r.title);
  check(titles.length === 2 && titles[0] === 'Lead designer' && titles[1] === 'Marketer',
    'PUT /collab: edit + reorder + delete(Backend developer) applied in one call');
  const marketerRole = put2.data.roles[1];
  check(!(await query('SELECT 1 FROM hive_roles WHERE role_id = $1', [backendRole.role_id])).rows.length,
    'PUT /collab: role dropped from the array is actually deleted');

  // ── Missing compensation -> 400 ───────────────────────────────────────────
  const noComp = await call(updateHiveCollab, ownerProj, { roles: [] }, { id: projectHive.hive_id });
  check(noComp.status === 400 && /offer collaborators/.test(noComp.data.error),
    'PUT /collab: Project Hive with no compensation key is rejected');

  // ── Cross-category fields -> 400 both ways ────────────────────────────────
  const ownerPro = await seedUser('ownerPro');
  const proHive = await makeHive(ownerPro, 'professional', { joinPolicy: 'open' });
  const crossA = await call(updateHiveCollab, ownerPro, { compensation: ['paid'] }, { id: proHive.hive_id });
  check(crossA.status === 400 && /Professional Hive/.test(crossA.data.error),
    'PUT /collab: project-only field on a Professional Hive rejected');
  const crossB = await call(updateHiveCollab, ownerProj, { audience_scope: 'same', compensation: ['paid'] }, { id: projectHive.hive_id });
  check(crossB.status === 400 && /Project Hive/.test(crossB.data.error),
    'PUT /collab: professional-only field on a Project Hive rejected');
  const proSave = await call(updateHiveCollab, ownerPro, {
    pro_industries: ['tech_software'], career_stages: ['mid'], audience_scope: 'cross',
  }, { id: proHive.hive_id });
  check(proSave.status === 200 && proSave.data.roles.length === 0,
    'PUT /collab: Professional Hive basics save with no roles at all');

  // ── Role capacity error — exact message ───────────────────────────────────
  const ownerCap = await seedUser('ownerCap');
  const capHive = await makeHive(ownerCap, 'project', { joinPolicy: 'open', maxMembers: 5 });
  const capPut = await call(updateHiveCollab, ownerCap, {
    compensation: ['paid'],
    roles: [{ title: 'A', slots: 3, skills: [] }, { title: 'B', slots: 3, skills: [] }],
  }, { id: capHive.hive_id });
  check(capPut.status === 400 &&
    capPut.data.error === 'These roles add 6 open spots, but your Hive only has room for 4 more members. Raise the member limit or reduce spots.',
    'PUT /collab: capacity error uses the exact specified message');

  // ── Role-aware join: request + accept sets collab_role_id ────────────────
  const reqA = await call(requestToJoin, applicantA, { role_id: designerRole.role_id }, { id: projectHive.hive_id });
  check(reqA.status === 200 && reqA.data.requested === true, 'requestToJoin: role-targeted request accepted');
  const requests1 = (await call(getHiveRequests, ownerProj, {}, { id: projectHive.hive_id })).data.requests;
  const rowA = requests1.find(r => r.user_id === applicantA);
  check(rowA.role?.role_id === designerRole.role_id && rowA.role.title === 'Lead designer',
    'getHiveRequests: request carries { role_id, title }');
  const acceptA = await call(reviewRequest, ownerProj, { action: 'accept' }, { id: projectHive.hive_id, requestId: rowA.request_id });
  check(acceptA.status === 200 && acceptA.data.roleFilled === false, 'reviewRequest: accept into an open role succeeds');
  const memberRowA = (await query(
    'SELECT collab_role_id FROM hive_members WHERE hive_id=$1 AND user_id=$2', [projectHive.hive_id, applicantA],
  )).rows[0];
  check(memberRowA.collab_role_id === designerRole.role_id, 'reviewRequest: accepted member has collab_role_id set to the requested role');

  // ── Closed-role request -> 400 ────────────────────────────────────────────
  // PUT replaces the full role list — every call here must still list
  // Marketer too, or it gets deleted along with whatever else is omitted.
  await call(updateHiveCollab, ownerProj, {
    compensation: ['paid'],
    roles: [
      { role_id: designerRole.role_id, title: 'Lead designer', slots: 1, skills: [], status: 'closed' },
      { role_id: marketerRole.role_id, title: 'Marketer', slots: 1, skills: [] },
    ],
  }, { id: projectHive.hive_id });
  const closedReq = await call(requestToJoin, applicantB, { role_id: designerRole.role_id }, { id: projectHive.hive_id });
  check(closedReq.status === 400 && /no longer open/.test(closedReq.data.error), 'requestToJoin: closed role rejected with 400');
  // Reopen it for the rest of the suite.
  await call(updateHiveCollab, ownerProj, {
    compensation: ['paid'],
    roles: [
      { role_id: designerRole.role_id, title: 'Lead designer', slots: 1, skills: [], status: 'open' },
      { role_id: marketerRole.role_id, title: 'Marketer', slots: 1, skills: [] },
    ],
  }, { id: projectHive.hive_id });

  // ── Bad portfolio_url -> 400 ──────────────────────────────────────────────
  const badUrl = await call(requestToJoin, applicantB, { portfolioUrl: 'not-a-url' }, { id: projectHive.hive_id });
  check(badUrl.status === 400, 'requestToJoin: invalid portfolio_url rejected with 400');

  // ── Lowering slots below filled -> 400 ────────────────────────────────────
  // Raise Marketer to 2 slots and fill both before trying to lower it back.
  await call(updateHiveCollab, ownerProj, {
    compensation: ['paid'],
    roles: [
      { role_id: designerRole.role_id, title: 'Lead designer', slots: 1, skills: [] },
      { role_id: marketerRole.role_id, title: 'Marketer', slots: 2, skills: [] },
    ],
  }, { id: projectHive.hive_id });
  const marketerFillerA = await seedUser('marketerFillerA');
  const marketerFillerB = await seedUser('marketerFillerB');
  await call(requestToJoin, marketerFillerA, { role_id: marketerRole.role_id }, { id: projectHive.hive_id });
  const marketerReqB = await call(requestToJoin, marketerFillerB, { role_id: marketerRole.role_id }, { id: projectHive.hive_id });
  check(marketerReqB.status === 200 && marketerReqB.data.requested === true, 'requestToJoin: second request for a 2-slot role still pending');
  const marketerRequests = (await call(getHiveRequests, ownerProj, {}, { id: projectHive.hive_id })).data.requests;
  const marketerReqAId = marketerRequests.find(r => r.user_id === marketerFillerA).request_id;
  const marketerReqBId = marketerRequests.find(r => r.user_id === marketerFillerB).request_id;
  await call(reviewRequest, ownerProj, { action: 'accept' }, { id: projectHive.hive_id, requestId: marketerReqAId });
  await call(reviewRequest, ownerProj, { action: 'accept' }, { id: projectHive.hive_id, requestId: marketerReqBId });

  const belowFilled = await call(updateHiveCollab, ownerProj, {
    compensation: ['paid'],
    roles: [{ role_id: marketerRole.role_id, title: 'Marketer', slots: 1, skills: [] }],
  }, { id: projectHive.hive_id });
  check(belowFilled.status === 400 && /spots can't go below that/.test(belowFilled.data.error),
    'PUT /collab: lowering slots below current filled count rejected by name');
  // DB unchanged by the rejected write.
  const stillTwo = (await query('SELECT slots FROM hive_roles WHERE role_id=$1', [marketerRole.role_id])).rows[0];
  check(Number(stillTwo.slots) === 2, 'PUT /collab: rejected slots-below-filled write left the row untouched');

  // ── Last-spot race: exactly one winner ────────────────────────────────────
  const ownerRace = await seedUser('ownerRace');
  const raceHive = await makeHive(ownerRace, 'project', { joinPolicy: 'request' });
  const racePut = await call(updateHiveCollab, ownerRace, {
    compensation: ['paid'], roles: [{ title: 'Sole slot', slots: 1, skills: [] }],
  }, { id: raceHive.hive_id });
  const raceRole = racePut.data.roles[0];
  const racerX = await seedUser('racerX');
  const racerY = await seedUser('racerY');
  await call(requestToJoin, racerX, { role_id: raceRole.role_id }, { id: raceHive.hive_id });
  await call(requestToJoin, racerY, { role_id: raceRole.role_id }, { id: raceHive.hive_id });
  const raceRequests = (await call(getHiveRequests, ownerRace, {}, { id: raceHive.hive_id })).data.requests;
  const reqX = raceRequests.find(r => r.user_id === racerX).request_id;
  const reqY = raceRequests.find(r => r.user_id === racerY).request_id;
  const [raceResX, raceResY] = await Promise.all([
    call(reviewRequest, ownerRace, { action: 'accept' }, { id: raceHive.hive_id, requestId: reqX }),
    call(reviewRequest, ownerRace, { action: 'accept' }, { id: raceHive.hive_id, requestId: reqY }),
  ]);
  const winners = [raceResX, raceResY].filter(r => r.data.roleFilled === false);
  const losers = [raceResX, raceResY].filter(r => r.data.roleFilled === true);
  check(winners.length === 1 && losers.length === 1, 'reviewRequest: concurrent accepts for the last spot — exactly one wins');
  const { rows: raceMembers } = await query(
    'SELECT user_id, collab_role_id FROM hive_members WHERE hive_id=$1 AND user_id = ANY($2::uuid[])',
    [raceHive.hive_id, [racerX, racerY]],
  );
  check(raceMembers.length === 2 && raceMembers.filter(m => m.collab_role_id === raceRole.role_id).length === 1,
    'reviewRequest: both racers still joined the Hive, only one holds the role');

  // ── Forced mid-transaction failure leaves nothing ─────────────────────────
  // A genuine Postgres-level failure (not a mock) triggered by a NUL byte in
  // a TEXT column — Postgres rejects it outright ("invalid byte sequence"),
  // and JS validation has no reason to strip it, so it reaches the second
  // role's real INSERT inside the same transaction as the first role's real
  // (successful) UPDATE. Proves the whole PUT rolls back, not just the
  // statement that failed.
  const ownerFail = await seedUser('ownerFail');
  const failHive = await makeHive(ownerFail, 'project', { joinPolicy: 'open' });
  const failPut = await call(updateHiveCollab, ownerFail, {
    compensation: ['paid'], roles: [{ title: 'Keep me', slots: 1, skills: [] }],
  }, { id: failHive.hive_id });
  const keepMeRole = failPut.data.roles[0];
  const beforeFail = await query('SELECT role_id, title, slots FROM hive_roles WHERE hive_id=$1 ORDER BY position', [failHive.hive_id]);
  const beforeHiveRow = (await query('SELECT compensation, collab_updated_at FROM hives WHERE hive_id=$1', [failHive.hive_id])).rows[0];

  const injected = await call(updateHiveCollab, ownerFail, {
    compensation: ['equity'],
    roles: [
      { role_id: keepMeRole.role_id, title: 'Keep me RENAMED', slots: 1, skills: [] },
      { title: 'Bad\u0000Role', slots: 1, skills: [] },
    ],
  }, { id: failHive.hive_id });
  check(injected.status === 500, 'PUT /collab: the NUL-byte role write genuinely fails at the DB level, not JS validation');

  const afterFail = await query('SELECT role_id, title, slots FROM hive_roles WHERE hive_id=$1 ORDER BY position', [failHive.hive_id]);
  const afterHiveRow = (await query('SELECT compensation, collab_updated_at FROM hives WHERE hive_id=$1', [failHive.hive_id])).rows[0];
  check(
    JSON.stringify(beforeFail.rows) === JSON.stringify(afterFail.rows) &&
    JSON.stringify(beforeHiveRow) === JSON.stringify(afterHiveRow),
    'PUT /collab: the first role\'s real UPDATE (title -> "Keep me RENAMED") and the basics UPDATE are both rolled back when the second role fails',
  );

  // ── Member leaves reopens the spot ────────────────────────────────────────
  const ownerLeave = await seedUser('ownerLeave');
  const leaveHiveRow = await makeHive(ownerLeave, 'project', { joinPolicy: 'open', discoverable: true });
  const leavePut = await call(updateHiveCollab, ownerLeave, {
    compensation: ['paid'], roles: [{ title: 'Only slot', slots: 1, skills: [] }],
  }, { id: leaveHiveRow.hive_id });
  const leaveRole = leavePut.data.roles[0];

  const countsBeforeFill = (await call(getCategoryCounts, stranger)).data.counts
    .find(c => c.category_name === 'Project Collaboration').hive_count;
  const matchBeforeFill = (await call(matchHives, stranger, { category: 'project', searchMode: 'online' })).data.hives
    .some(h => h.hive_id === leaveHiveRow.hive_id);
  check(matchBeforeFill, 'matchHives: Hive with an open role is still discoverable');

  // Fill the only slot directly (role_id provided on an open-join Hive).
  const filler = await seedUser('filler');
  await call(requestToJoin, filler, { role_id: leaveRole.role_id }, { id: leaveHiveRow.hive_id });

  const countsAfterFill = (await call(getCategoryCounts, stranger)).data.counts
    .find(c => c.category_name === 'Project Collaboration').hive_count;
  check(countsAfterFill === countsBeforeFill - 1, 'getCategoryCounts: all-roles-filled Hive drops out of the count');
  const matchAfterFill = (await call(matchHives, stranger, { category: 'project', searchMode: 'online' })).data.hives
    .some(h => h.hive_id === leaveHiveRow.hive_id);
  check(!matchAfterFill, 'matchHives: all-roles-filled Hive is hidden from discovery');
  const nameSearchAfterFill = (await call(quickFindHives, stranger, {}, {}, { q: leaveHiveRow.hive_name.slice(0, 10) })).data.hives
    .some(h => h.hive_id === leaveHiveRow.hive_id);
  check(!nameSearchAfterFill, 'quickFindHives: name search also hides an all-roles-filled Hive');
  const codeSearchAfterFill = (await call(quickFindHives, stranger, {}, {}, { q: leaveHiveRow.hive_code })).data.hives
    .some(h => h.hive_id === leaveHiveRow.hive_id);
  check(codeSearchAfterFill, 'quickFindHives: exact TH- code still reaches an all-roles-filled Hive');
  const pageStillWorks = (await call(getHiveCollab, filler, {}, { id: leaveHiveRow.hive_id })).status === 200;
  check(pageStillWorks, 'getHiveCollab: an all-roles-filled Hive\'s own page still loads fine');

  await call(removeMember, ownerLeave, {}, { id: leaveHiveRow.hive_id, userId: filler });
  const matchAfterLeave = (await call(matchHives, stranger, { category: 'project', searchMode: 'online' })).data.hives
    .some(h => h.hive_id === leaveHiveRow.hive_id);
  check(matchAfterLeave, 'matchHives: Hive reappears once the role-filling member leaves');

  // ── Reopening via raising the slot cap also brings it back ───────────────
  const ownerReopen = await seedUser('ownerReopen');
  const reopenHive = await makeHive(ownerReopen, 'project', { joinPolicy: 'open', discoverable: true });
  const reopenPut = await call(updateHiveCollab, ownerReopen, {
    compensation: ['paid'], roles: [{ title: 'Cap slot', slots: 1, skills: [] }],
  }, { id: reopenHive.hive_id });
  const reopenRole = reopenPut.data.roles[0];
  const filler2 = await seedUser('filler2');
  await call(requestToJoin, filler2, { role_id: reopenRole.role_id }, { id: reopenHive.hive_id });
  check(!(await call(matchHives, stranger, { category: 'project', searchMode: 'online' })).data.hives.some(h => h.hive_id === reopenHive.hive_id),
    'matchHives: freshly-filled Hive is hidden before reopening');
  await call(updateHiveCollab, ownerReopen, {
    compensation: ['paid'], roles: [{ role_id: reopenRole.role_id, title: 'Cap slot', slots: 2, skills: [] }],
  }, { id: reopenHive.hive_id });
  check((await call(matchHives, stranger, { category: 'project', searchMode: 'online' })).data.hives.some(h => h.hive_id === reopenHive.hive_id),
    'matchHives: raising the slot cap reopens the Hive to discovery');

  // ── Non-member GET leaks no member identities ─────────────────────────────
  const strangerView = await call(getHiveCollab, stranger, {}, { id: projectHive.hive_id });
  const strangerJson = JSON.stringify(strangerView.data);
  check(strangerView.status === 200 && !('members' in (strangerView.data.roles?.[0] ?? {})),
    'getHiveCollab: non-member response has no `members` key on any role');
  check(!strangerJson.includes(applicantA) && !strangerJson.includes('applicantA'),
    'getHiveCollab: non-member response grep-clean of the accepted member\'s id/name');
  const ownerView = await call(getHiveCollab, ownerProj, {}, { id: projectHive.hive_id });
  check(ownerView.data.roles.find(r => r.role_id === designerRole.role_id)?.members?.[0]?.user_id === applicantA,
    'getHiveCollab: owner/admin view does carry member identities');

  // ── links + deep_dive_answers scoping ──────────────────────────────────────
  const linksOk = await call(updateCollabProfile, owner, {
    links: [{ label: 'LinkedIn', url: 'https://linkedin.com/in/example' }, { label: 'LinkedIn', url: 'https://linkedin.com/in/example' }],
  });
  check(linksOk.status === 200 && linksOk.data.links.length === 1, 'updateCollabProfile: duplicate link URLs deduped');
  const badLink = await call(updateCollabProfile, owner, { links: [{ label: 'LinkedIn', url: 'not-a-url' }] });
  check(badLink.status === 400, 'updateCollabProfile: invalid link URL rejected with 400');
  const tooManyLinks = await call(updateCollabProfile, owner, {
    links: [
      { label: 'LinkedIn', url: 'https://a.example' }, { label: 'GitHub', url: 'https://b.example' },
      { label: 'Website', url: 'https://c.example' }, { label: 'Other', url: 'https://d.example' },
    ],
  });
  check(tooManyLinks.status === 400, 'updateCollabProfile: more than 3 links rejected with 400');

  const deepDiveSave = await call(updateCollabProfile, owner, {
    deepDive: { category: 'project', answers: { chips: {}, cards: { 'proj-path': '🛠️ Building a team' }, textValues: {}, roles: [] } },
  });
  check(deepDiveSave.status === 200, 'updateCollabProfile: deepDive save succeeds');
  const ownOwnProfile = (await call(getProfile, owner)).data.profile;
  check(ownOwnProfile.deep_dive_answers?.project?.path === 'building',
    'getProfile: own profile\'s deep_dive_answers.project holds a KEY ("building"), not a display string');
  const othersView = (await call(getMemberProfile, stranger, {}, { id: owner })).data.profile;
  check('links' in othersView && !('deep_dive_answers' in othersView),
    'getMemberProfile: another user\'s profile response carries links but never deep_dive_answers');

  // ── Prompt 80: create-with-collab, the industries rule, maxProIndustries,
  // and the create-transaction rollback ────────────────────────────────────
  const ownerCreateA = await seedUser('ownerCreateA');
  const createProject = await call(createHive, ownerCreateA, {
    name: `p78-${RUN}-create-project`, category: 'project', meetingType: 'online',
    joinPolicy: 'open', maxMembers: 10,
    collab: {
      project_types: ['film_video'], compensation: ['paid'],
      roles: [{ title: 'Director', slots: 1, skills: [] }, { title: 'Editor', slots: 2, skills: [] }],
    },
  });
  check(createProject.status === 201, 'createHive: Project Hive with collab basics + roles succeeds');
  hiveIds.push(createProject.data.hive.hive_id);
  check(createProject.data.hive.project_types?.[0] === 'film_video' && createProject.data.hive.compensation?.[0] === 'paid',
    'createHive: returned hive carries collab basics as keys');
  const { rows: createdRoles } = await query(
    'SELECT title, position FROM hive_roles WHERE hive_id=$1 ORDER BY position', [createProject.data.hive.hive_id],
  );
  check(createdRoles.length === 2 && createdRoles[0].title === 'Director' && createdRoles[1].title === 'Editor',
    'createHive: roles inserted in order with position = array index');

  const ownerCreateB = await seedUser('ownerCreateB');
  const createNoComp = await call(createHive, ownerCreateB, {
    name: `p78-${RUN}-create-nocomp`, category: 'project', meetingType: 'online', joinPolicy: 'open',
    collab: { project_types: ['film_video'] },
  });
  check(createNoComp.status === 400 && /offer collaborators/.test(createNoComp.data.error),
    'createHive: Project Hive with no compensation is rejected with the same message');

  const ownerCreateC = await seedUser('ownerCreateC');
  const createPro = await call(createHive, ownerCreateC, {
    name: `p78-${RUN}-create-pro`, category: 'professional', meetingType: 'online', joinPolicy: 'open',
    collab: { pro_industries: ['tech_software'], career_stages: ['mid'], audience_scope: 'same' },
  });
  check(createPro.status === 201, 'createHive: Professional Hive with collab basics succeeds');
  hiveIds.push(createPro.data.hive.hive_id);

  const ownerCreateD = await seedUser('ownerCreateD');
  const createProNoInd = await call(createHive, ownerCreateD, {
    name: `p78-${RUN}-create-pronoind`, category: 'professional', meetingType: 'online', joinPolicy: 'open',
    collab: { audience_scope: 'same' },
  });
  check(createProNoInd.status === 400 && /Pick at least one industry/.test(createProNoInd.data.error),
    'createHive: Professional Hive with no industries and scope "same" is rejected — the industries rule applies at create');

  const ownerCreateE = await seedUser('ownerCreateE');
  const createProCross = await call(createHive, ownerCreateE, {
    name: `p78-${RUN}-create-procross`, category: 'professional', meetingType: 'online', joinPolicy: 'open',
    collab: { audience_scope: 'cross' },
  });
  check(createProCross.status === 201, 'createHive: Professional Hive with Cross-industry and no industries succeeds');
  hiveIds.push(createProCross.data.hive.hive_id);

  const ownerCreateF = await seedUser('ownerCreateF');
  const createProTooMany = await call(createHive, ownerCreateF, {
    name: `p78-${RUN}-create-promax`, category: 'professional', meetingType: 'online', joinPolicy: 'open',
    collab: {
      audience_scope: 'same',
      pro_industries: ['tech_software', 'finance_investing', 'startups', 'design_and_creative', 'marketing', 'healthcare'],
    },
  });
  check(createProTooMany.status === 201 && createProTooMany.data.hive.pro_industries.length === 5,
    'createHive: maxProIndustries caps a 6-industry Professional create at 5');
  hiveIds.push(createProTooMany.data.hive.hive_id);

  const ownerCreateG = await seedUser('ownerCreateG');
  const createCrossCat = await call(createHive, ownerCreateG, {
    name: `p78-${RUN}-create-crosscat`, category: 'social', meetingType: 'online', joinPolicy: 'open',
    collab: { compensation: ['paid'] },
  });
  check(createCrossCat.status === 400, 'createHive: a collab key on a non-collab category is rejected with 400');

  const ownerCreateH = await seedUser('ownerCreateH');
  const createOverCap = await call(createHive, ownerCreateH, {
    name: `p78-${RUN}-create-overcap`, category: 'project', meetingType: 'online', joinPolicy: 'open', maxMembers: 5,
    collab: {
      compensation: ['paid'],
      roles: [{ title: 'A', slots: 3, skills: [] }, { title: 'B', slots: 3, skills: [] }],
    },
  });
  check(createOverCap.status === 400 &&
    createOverCap.data.error === 'These roles add 6 open spots, but your Hive only has room for 4 more members. Raise the member limit or reduce spots.',
    'createHive: capacity error at create uses the exact message, owner counted as 1');

  // Forced mid-transaction failure on create: a real Postgres NUL-byte error
  // on the second role must leave no Hive, no rooms, no roles behind at all.
  const ownerCreateI = await seedUser('ownerCreateI');
  const failCreateName = `p78-${RUN}-create-fail`;
  const createFail = await call(createHive, ownerCreateI, {
    name: failCreateName, category: 'project', meetingType: 'online', joinPolicy: 'open',
    collab: {
      compensation: ['paid'],
      roles: [{ title: 'Keep me', slots: 1, skills: [] }, { title: 'Bad\u0000Role', slots: 1, skills: [] }],
    },
  });
  check(createFail.status === 500, 'createHive: the NUL-byte role write genuinely fails at the DB level');
  const { rows: strayCreateHives } = await query('SELECT hive_id FROM hives WHERE hive_name = $1', [failCreateName]);
  check(strayCreateHives.length === 0, 'createHive: a mid-transaction failure leaves no Hive row behind at all');

  log(`\n${checks} checks passed.`);
} finally {
  await cleanup();
  const { rows: [{ n: strayUsers }] } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE email LIKE 'p78-%@test.invalid'`);
  assert.equal(strayUsers, 0, 'cleanup left stray fixture users behind');
  log('cleanup verified: 0 stray rows.');
  await pool.end();
}
