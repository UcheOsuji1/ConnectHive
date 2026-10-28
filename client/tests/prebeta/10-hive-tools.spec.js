import { test, expect } from '@playwright/test';
import { trackPage, assertCleanPage, loginViaSession, QA_USERS, runQaHelper } from './helpers.js';

// Flow 10: Hive Tools smoke test. For each of the 13 tools: open it, create
// one item via the API (fast, reliable — the UI mechanics for each tool's
// own bespoke form are not the point of a smoke test), see it from a second
// member, then turn the tool off and confirm every one of its endpoints 404s
// and its tile disappears from the hub. Desktop Chrome only — pure mechanism.

async function setTool(page, hiveId, key, enabled) {
  const res = await page.request.put(`/api/hives/${hiveId}/tools/${key}`, { data: { enabled } });
  expect(res.ok(), `tool ${key} enabled=${enabled} failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

test.describe('Flow 10 — Hive Tools smoke test', () => {
  let hiveId;

  test.beforeAll(() => {
    hiveId = runQaHelper('qaGetHiveByName.js', ['qa-Every Tool Hive']).hive_id; // owner4; all 13 on
  });

  test('find_time', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    await loginViaSession(page, QA_USERS.owner4);
    const title = `QA find-time ${Date.now()}`;
    const createRes = await page.request.post(`/api/hives/${hiveId}/tools/find_time/polls`, {
      data: {
        title, durationMinutes: 60,
        slots: [new Date(Date.now() + 2*24*3600_000).toISOString(), new Date(Date.now() + 3*24*3600_000).toISOString()],
      },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const memberPage = await page.context().browser().newContext().then(c => c.newPage());
    const tracked = trackPage(memberPage, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(memberPage, QA_USERS.member1);
    await memberPage.goto(`/hive/${hiveId}/tools/find_time`);
    await memberPage.waitForLoadState('networkidle');
    await assertCleanPage(memberPage, tracked);
    await expect(memberPage.getByText(title)).toBeVisible({ timeout: 10000 });
    await memberPage.close();

    await setTool(page, hiveId, 'find_time', false);
    const offRes = await page.request.get(`/api/hives/${hiveId}/tools/find_time/polls`);
    expect(offRes.status()).toBe(404);
    await page.goto(`/hive/${hiveId}/tools`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.thub-tile-name', { hasText: 'Find a time' })).toHaveCount(0);
    await setTool(page, hiveId, 'find_time', true);
  });

  test('split_costs', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    await loginViaSession(page, QA_USERS.owner4);
    const title = `QA split-costs ${Date.now()}`;
    const createRes = await page.request.post(`/api/hives/${hiveId}/tools/split_costs/groups`, { data: { title, currency: 'USD' } });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const memberPage = await page.context().browser().newContext().then(c => c.newPage());
    const tracked = trackPage(memberPage, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(memberPage, QA_USERS.member1);
    await memberPage.goto(`/hive/${hiveId}/tools/split_costs`);
    await memberPage.waitForLoadState('networkidle');
    await assertCleanPage(memberPage, tracked);
    await expect(memberPage.getByText(title)).toBeVisible({ timeout: 10000 });
    await memberPage.close();

    await setTool(page, hiveId, 'split_costs', false);
    const offRes = await page.request.get(`/api/hives/${hiveId}/tools/split_costs/groups`);
    expect(offRes.status()).toBe(404);
    await page.goto(`/hive/${hiveId}/tools`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.thub-tile-name', { hasText: 'Split costs' })).toHaveCount(0);
    await setTool(page, hiveId, 'split_costs', true);
  });

  test('signups', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    await loginViaSession(page, QA_USERS.owner4);
    const title = `QA signups ${Date.now()}`;
    const createRes = await page.request.post(`/api/hives/${hiveId}/tools/signups/lists`, { data: { title } });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const memberPage = await page.context().browser().newContext().then(c => c.newPage());
    const tracked = trackPage(memberPage, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(memberPage, QA_USERS.member1);
    await memberPage.goto(`/hive/${hiveId}/tools/signups`);
    await memberPage.waitForLoadState('networkidle');
    await assertCleanPage(memberPage, tracked);
    await expect(memberPage.getByText(title)).toBeVisible({ timeout: 10000 });
    await memberPage.close();

    await setTool(page, hiveId, 'signups', false);
    const offRes = await page.request.get(`/api/hives/${hiveId}/tools/signups/lists`);
    expect(offRes.status()).toBe(404);
    await page.goto(`/hive/${hiveId}/tools`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.thub-tile-name', { hasText: 'Sign-up lists' })).toHaveCount(0);
    await setTool(page, hiveId, 'signups', true);
  });

  test('docs', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    await loginViaSession(page, QA_USERS.owner4);
    const title = `QA doc ${Date.now()}`;
    const createRes = await page.request.post(`/api/hives/${hiveId}/tools/docs/docs`, { data: { title, body: 'QA fixture doc body.' } });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const memberPage = await page.context().browser().newContext().then(c => c.newPage());
    const tracked = trackPage(memberPage, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(memberPage, QA_USERS.member1);
    await memberPage.goto(`/hive/${hiveId}/tools/docs`);
    await memberPage.waitForLoadState('networkidle');
    await assertCleanPage(memberPage, tracked);
    await expect(memberPage.getByText(title)).toBeVisible({ timeout: 10000 });
    await memberPage.close();

    await setTool(page, hiveId, 'docs', false);
    const offRes = await page.request.get(`/api/hives/${hiveId}/tools/docs/docs`);
    expect(offRes.status()).toBe(404);
    await page.goto(`/hive/${hiveId}/tools`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.thub-tile-name', { hasText: 'Hive docs' })).toHaveCount(0);
    await setTool(page, hiveId, 'docs', true);
  });

  test('goals', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    await loginViaSession(page, QA_USERS.owner4);
    const title = `QA goal ${Date.now()}`;
    const createRes = await page.request.post(`/api/hives/${hiveId}/tools/goals/goals`, {
      data: { title, metric: 'manual', target: 10, periodStart: '2026-01-01', periodEnd: '2026-12-31' },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const memberPage = await page.context().browser().newContext().then(c => c.newPage());
    const tracked = trackPage(memberPage, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(memberPage, QA_USERS.member1);
    await memberPage.goto(`/hive/${hiveId}/tools/goals`);
    await memberPage.waitForLoadState('networkidle');
    await assertCleanPage(memberPage, tracked);
    await expect(memberPage.getByText(title)).toBeVisible({ timeout: 10000 });
    await memberPage.close();

    await setTool(page, hiveId, 'goals', false);
    const offRes = await page.request.get(`/api/hives/${hiveId}/tools/goals/goals`);
    expect(offRes.status()).toBe(404);
    await page.goto(`/hive/${hiveId}/tools`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.thub-tile-name', { hasText: 'Goals' })).toHaveCount(0);
    await setTool(page, hiveId, 'goals', true);
  });

  test('coffee_chats', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    await loginViaSession(page, QA_USERS.owner4);
    // No standalone "item" — opting in is the one state change this tool
    // has outside of its own scheduled pairing job. Pairing itself is a
    // background job, out of scope for a request/response smoke test.
    const optInRes = await page.request.post(`/api/hives/${hiveId}/tools/coffee_chats/optin`);
    expect(optInRes.ok(), await optInRes.text()).toBeTruthy();

    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await page.goto(`/hive/${hiveId}/tools/coffee_chats`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    const memberPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(memberPage, QA_USERS.member1);
    const statusRes = await memberPage.request.get(`/api/hives/${hiveId}/tools/coffee_chats/status`);
    expect(statusRes.ok(), await statusRes.text()).toBeTruthy(); // a second member's own view loads cleanly
    await memberPage.close();

    await setTool(page, hiveId, 'coffee_chats', false);
    const offRes = await page.request.get(`/api/hives/${hiveId}/tools/coffee_chats/status`);
    expect(offRes.status()).toBe(404);
    await page.goto(`/hive/${hiveId}/tools`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.thub-tile-name', { hasText: 'Meet someone new' })).toHaveCount(0);
    await setTool(page, hiveId, 'coffee_chats', true);
  });

  test('mentorship', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    await loginViaSession(page, QA_USERS.owner4);
    // No free-text "title" of its own — opting in as a mentor with a
    // distinctive topic is the one visible, createable item here.
    const topic = `QA mentoring topic ${Date.now()}`;
    const createRes = await page.request.put(`/api/hives/${hiveId}/tools/mentorship/profile`, {
      data: { role: 'mentor', topics: [topic], about: 'QA fixture mentor.', capacity: 2 },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const memberPage = await page.context().browser().newContext().then(c => c.newPage());
    const tracked = trackPage(memberPage, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(memberPage, QA_USERS.member1);
    await memberPage.goto(`/hive/${hiveId}/tools/mentorship`);
    await memberPage.waitForLoadState('networkidle');
    await assertCleanPage(memberPage, tracked);
    await expect(memberPage.getByText(topic)).toBeVisible({ timeout: 10000 });
    await memberPage.close();

    await setTool(page, hiveId, 'mentorship', false);
    const offRes = await page.request.get(`/api/hives/${hiveId}/tools/mentorship/mentors`);
    expect(offRes.status()).toBe(404);
    await page.goto(`/hive/${hiveId}/tools`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.thub-tile-name', { hasText: 'Mentorship' })).toHaveCount(0);
    await setTool(page, hiveId, 'mentorship', true);
  });

  test('opportunities', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    await loginViaSession(page, QA_USERS.owner4);
    const title = `QA opportunity ${Date.now()}`;
    const createRes = await page.request.post(`/api/hives/${hiveId}/tools/opportunities/opportunities`, {
      data: { kind: 'job', title, organization: 'QA Co' },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const memberPage = await page.context().browser().newContext().then(c => c.newPage());
    const tracked = trackPage(memberPage, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(memberPage, QA_USERS.member1);
    await memberPage.goto(`/hive/${hiveId}/tools/opportunities`);
    await memberPage.waitForLoadState('networkidle');
    await assertCleanPage(memberPage, tracked);
    await expect(memberPage.getByText(title)).toBeVisible({ timeout: 10000 });
    await memberPage.close();

    await setTool(page, hiveId, 'opportunities', false);
    const offRes = await page.request.get(`/api/hives/${hiveId}/tools/opportunities/opportunities`);
    expect(offRes.status()).toBe(404);
    await page.goto(`/hive/${hiveId}/tools`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.thub-tile-name', { hasText: 'Opportunities board' })).toHaveCount(0);
    await setTool(page, hiveId, 'opportunities', true);
  });

  test('tasks', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    await loginViaSession(page, QA_USERS.owner4);
    const title = `QA task ${Date.now()}`;
    const createRes = await page.request.post(`/api/hives/${hiveId}/tools/tasks/tasks`, { data: { title } });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const memberPage = await page.context().browser().newContext().then(c => c.newPage());
    const tracked = trackPage(memberPage, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(memberPage, QA_USERS.member1);
    await memberPage.goto(`/hive/${hiveId}/tools/tasks`);
    await memberPage.waitForLoadState('networkidle');
    await assertCleanPage(memberPage, tracked);
    await expect(memberPage.getByText(title)).toBeVisible({ timeout: 10000 });
    await memberPage.close();

    await setTool(page, hiveId, 'tasks', false);
    const offRes = await page.request.get(`/api/hives/${hiveId}/tools/tasks/tasks`);
    expect(offRes.status()).toBe(404);
    await page.goto(`/hive/${hiveId}/tools`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.thub-tile-name', { hasText: 'Task board' })).toHaveCount(0);
    await setTool(page, hiveId, 'tasks', true);
  });

  test('itinerary', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    await loginViaSession(page, QA_USERS.owner4);
    const title = `QA trip ${Date.now()}`;
    const createRes = await page.request.post(`/api/hives/${hiveId}/tools/itinerary/trips`, {
      data: { title, destination: 'Joshua Tree', startsOn: '2026-12-01', endsOn: '2026-12-03' },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const memberPage = await page.context().browser().newContext().then(c => c.newPage());
    const tracked = trackPage(memberPage, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(memberPage, QA_USERS.member1);
    await memberPage.goto(`/hive/${hiveId}/tools/itinerary`);
    await memberPage.waitForLoadState('networkidle');
    await assertCleanPage(memberPage, tracked);
    await expect(memberPage.getByText(title)).toBeVisible({ timeout: 10000 });
    await memberPage.close();

    await setTool(page, hiveId, 'itinerary', false);
    const offRes = await page.request.get(`/api/hives/${hiveId}/tools/itinerary/trips`);
    expect(offRes.status()).toBe(404);
    await page.goto(`/hive/${hiveId}/tools`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.thub-tile-name', { hasText: 'Itinerary' })).toHaveCount(0);
    await setTool(page, hiveId, 'itinerary', true);
  });

  test('rides', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    await loginViaSession(page, QA_USERS.owner4);
    const planTitle = `QA rides plan ${Date.now()}`;
    const planRes = await page.request.post(`/api/hives/${hiveId}/plans`, {
      data: { title: planTitle, planType: 'other', startsAt: new Date(Date.now() + 2*24*3600_000).toISOString() },
    });
    expect(planRes.ok(), await planRes.text()).toBeTruthy();
    const { plan } = await planRes.json();

    const leavingFrom = `QA pickup ${Date.now()}`;
    const createRes = await page.request.post(`/api/hives/${hiveId}/tools/rides/offers`, {
      data: { postId: plan.post_id, seats: 3, leavingFrom },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const memberPage = await page.context().browser().newContext().then(c => c.newPage());
    const tracked = trackPage(memberPage, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(memberPage, QA_USERS.member1);
    await memberPage.goto(`/hive/${hiveId}/events/${plan.post_id}`);
    await memberPage.waitForLoadState('networkidle');
    await assertCleanPage(memberPage, tracked);
    await expect(memberPage.getByText(leavingFrom)).toBeVisible({ timeout: 10000 });
    await memberPage.close();

    await setTool(page, hiveId, 'rides', false);
    const offRes = await page.request.get(`/api/hives/${hiveId}/tools/rides/board`);
    expect(offRes.status()).toBe(404);
    await setTool(page, hiveId, 'rides', true);
  });

  test('ideas', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    await loginViaSession(page, QA_USERS.owner4);
    const title = `QA idea ${Date.now()}`;
    const createRes = await page.request.post(`/api/hives/${hiveId}/tools/ideas/ideas`, { data: { title, kind: 'activity' } });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    const memberPage = await page.context().browser().newContext().then(c => c.newPage());
    const tracked = trackPage(memberPage, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(memberPage, QA_USERS.member1);
    await memberPage.goto(`/hive/${hiveId}/tools/ideas`);
    await memberPage.waitForLoadState('networkidle');
    await assertCleanPage(memberPage, tracked);
    await expect(memberPage.getByText(title)).toBeVisible({ timeout: 10000 });
    await memberPage.close();

    await setTool(page, hiveId, 'ideas', false);
    const offRes = await page.request.get(`/api/hives/${hiveId}/tools/ideas/ideas`);
    expect(offRes.status()).toBe(404);
    await page.goto(`/hive/${hiveId}/tools`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.thub-tile-name', { hasText: 'Ideas board' })).toHaveCount(0);
    await setTool(page, hiveId, 'ideas', true);
  });

  // checkins is plan-scoped with no hub tile of its own (PLAN_SCOPED_NO_TILE
  // in HiveToolsHubPage.jsx) — its self-check-in/roll-call mechanics are
  // already exercised end-to-end in Flow 9. Here: just the toggle-off 404.
  test('checkins — toggle off 404s its plan-scoped endpoints', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    await loginViaSession(page, QA_USERS.owner4);
    const planRes = await page.request.post(`/api/hives/${hiveId}/plans`, {
      data: { title: `QA checkins-toggle plan ${Date.now()}`, planType: 'other', startsAt: new Date(Date.now() + 2*24*3600_000).toISOString() },
    });
    expect(planRes.ok(), await planRes.text()).toBeTruthy();
    const { plan } = await planRes.json();

    await setTool(page, hiveId, 'checkins', false);
    const offRes = await page.request.get(`/api/hives/${hiveId}/plans/${plan.post_id}/checkins`);
    expect(offRes.status()).toBe(404);
    await setTool(page, hiveId, 'checkins', true);
  });
});
