import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool, query } from '../db/index.js';
import { createHive, requestToJoin, reviewRequest } from '../controllers/hivesController.js';
if (process.env.P71B_ISOLATED !== '1') throw Error('Isolated fixture preload required');
let checks = 0;
function pass(condition, label) { assert.ok(condition, label); checks++; console.log(`PASS ${label}`); }
async function user(system = false) {
  return (await query("INSERT INTO users(email,password_hash,is_system,email_verified) VALUES($1,'fixture',$2,true) RETURNING user_id", [`${randomUUID()}@fixture.invalid`, system])).rows[0].user_id;
}
async function call(fn, req) {
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await fn(req, res); return res;
}
const create = (id, extra = {}) => call(createHive, { userId: id, body: { name: 'System exemption fixture', category: 'social', meetingType: 'online', maxMembers: 2, ...extra } });
const join = (id, hive) => call(requestToJoin, { userId: id, params: { id: hive }, body: {} });
try {
  const system = await user(true), free = await user(), member = await user();
  const seed = [];
  for (let i = 0; i < 7; i++) { const r = await create(system); assert.equal(r.code, 201); seed.push(r.body.id); }
  pass(seed.length === 7, 'system account creates 7 active Hives and owner memberships without Plus');
  pass((await create(free)).code === 201, 'normal free user creates first active Hive');
  const denied = await create(free);
  pass(denied.code === 409 && /active Hive limit.*Free/.test(denied.body.error), 'second free Hive returns readable 409');
  pass((await query('SELECT count(*)::int n FROM hives WHERE creator_user_id=$1', [free])).rows[0].n === 1, 'failed creation leaves no extra Hive');
  for (let i = 0; i < 5; i++) assert.equal((await join(member, seed[i])).code, 200);
  const sixth = await join(member, seed[5]);
  pass(sixth.code === 409 && /five free Hives/.test(sixth.body.error), 'sixth seed Hive join returns readable 409 for normal user');
  // System-owned capacity does not prevent real users joining, but their own cap remains.
  const second = await user(), third = await user();
  pass((await join(second, seed[0])).code === 200 && (await join(third, seed[0])).code === 200, 'system-owned Hive admits users beyond configured capacity');
  const ordinary = (await query('SELECT hive_id FROM hives WHERE creator_user_id=$1', [free])).rows[0].hive_id;
  assert.equal((await join(second, ordinary)).code, 200);
  pass((await join(third, ordinary)).code === 400, 'ordinary Hive still enforces configured capacity');
  pass((await join(system, ordinary)).code === 200, 'system membership bypasses its own membership and full-Hive limits');
  await query('UPDATE hives SET max_members=3 WHERE hive_id=$1', [ordinary]);
  pass((await join(third, ordinary)).code === 200, 'system membership does not consume an ordinary Hive capacity slot');
  const approval = await create(system, { joinPolicy: 'request' });
  await query('INSERT INTO join_requests(hive_id,user_id) VALUES($1,$2)', [approval.body.id, member]);
  const request = (await query('SELECT request_id FROM join_requests WHERE hive_id=$1 AND user_id=$2', [approval.body.id, member])).rows[0];
  const reviewed = await call(reviewRequest, { userId: system, params: { id: approval.body.id, requestId: request.request_id }, body: { action: 'accept' } });
  pass(reviewed.code === 409 && /five free Hives/.test(reviewed.body.error), 'approval-based sixth join returns readable 409');
  pass((await query('SELECT status FROM join_requests WHERE request_id=$1', [request.request_id])).rows[0].status === 'pending', 'failed approval rolls back request status');
  for (const [hive, owner] of [[seed[0], system], [ordinary, free]]) {
    await query("INSERT INTO hive_monetization(hive_id,owner_id,monthly_price_cents,benefits,description,cancellation_policy) VALUES($1,$2,100,'fixture','fixture','fixture')", [hive, owner]);
  }
  await query('UPDATE hives SET max_members=1 WHERE hive_id=$1', [seed[0]]);
  pass(true, 'system-owned Hive capacity guard is exempt');
  await assert.rejects(() => query('UPDATE hives SET max_members=2 WHERE hive_id=$1', [ordinary]), e => e.code === 'P7304');
  pass(true, 'ordinary paid Hive capacity guard still rejects undersized capacity');
  const unpaid = await user();
  await assert.rejects(() => query('INSERT INTO hive_members(hive_id,user_id) VALUES($1,$2)', [seed[0], unpaid]), e => e.code === 'P7302');
  pass(true, 'system-owned paid Hive still requires real users to have verified payment');
  console.log(`SYSTEM EXEMPTIONS: ${checks} checks passed.`);
} finally { await pool.end(); }
