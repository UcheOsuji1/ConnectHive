import { test, expect } from '@playwright/test';
import { trackPage, assertCleanPage, loginViaSession, QA_USERS, runQaHelper } from './helpers.js';

// Flow 9: Plans — create, RSVP, edit, cancel, recurring series, check-in and
// roll call, all four suggestion/voting modes. Pure feature mechanics (no
// cross-device interaction, unlike chat's send/reconnect pair) — Desktop
// Chrome only, per the established pattern for this kind of test.

function futureLocal(daysAhead) {
  return new Date(Date.now() + daysAhead * 24 * 3600_000).toISOString().slice(0, 16);
}

// toISOString() is UTC, but a datetime-local input wants the viewer's own
// local wall-clock time — fine when the offset only needs to land "days
// ahead" of now, but check-in's 30-minutes-before window needs the real
// local time or the server computes a start outside that window (or even in
// the past, failing the create form's own future-time validation).
function soonLocal(minutesAhead) {
  const d = new Date(Date.now() + minutesAhead * 60000);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function setPlanRules(page, hiveId, { plan_proposers, plan_approval, vote_min_yes = 1, vote_window_hours = 48, suggestions_per_day = 5 }) {
  const res = await page.request.put(`/api/hives/${hiveId}/plan-rules`, {
    data: { plan_proposers, plan_approval, vote_min_yes, vote_window_hours, suggestions_per_day },
  });
  expect(res.ok(), `plan-rules update failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

test.describe('Flow 9 — Plans', () => {
  test('create a plan; host auto-RSVP Going', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await setPlanRules(page, hive.hive_id, { plan_proposers: 'owners', plan_approval: 'owner' });
    await page.goto(`/hive/${hive.hive_id}/events`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    const title = `QA plan ${Date.now()}`;
    await page.getByRole('button', { name: '＋ Create a Plan' }).click();
    await page.getByPlaceholder("Founders' Rooftop Mixer").fill(title);
    await page.locator('.plans-modal input[type="datetime-local"]').first().fill(futureLocal(3));
    await page.getByRole('button', { name: 'Create Plan', exact: true }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });

    await page.getByText(title).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10000 });
    // The host's own RSVP is set to Going automatically on creation.
    await expect(page.locator('.plans-rsvp-btn')).toContainText('Going', { timeout: 10000 });
  });

  test('RSVP Going/Maybe/Cant go from the plan card and detail page; counts update', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    const ownerPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(ownerPage, QA_USERS.owner1);
    await ownerPage.goto(`/hive/${hive.hive_id}/events`);
    await ownerPage.waitForLoadState('networkidle');
    const title = `QA rsvp plan ${Date.now()}`;
    await ownerPage.getByRole('button', { name: '＋ Create a Plan' }).click();
    await ownerPage.getByPlaceholder("Founders' Rooftop Mixer").fill(title);
    await ownerPage.locator('.plans-modal input[type="datetime-local"]').first().fill(futureLocal(4));
    await ownerPage.getByRole('button', { name: 'Create Plan', exact: true }).click();
    await expect(ownerPage.getByText(title)).toBeVisible({ timeout: 10000 });
    await ownerPage.close();

    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.member1);
    await page.goto(`/hive/${hive.hive_id}/events`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    const card = page.locator('.plans-card', { hasText: title });
    for (const [status, label] of [['going', 'Going'], ['maybe', 'Maybe'], ['not_going', "Can't go"]]) {
      await card.locator('.plans-rsvp-btn').click();
      await page.getByRole('menuitemradio', { name: label }).click();
      await expect(card.locator('.plans-rsvp-btn')).toContainText(label, { timeout: 10000 });
    }

    await card.locator('.plans-people').click();
    // getByText alone also matches the still-visible RSVP button, which
    // carries the same "Can't go" text after the loop above — the drawer's
    // own tab is the one thing actually worth asserting on here, and its
    // role is unambiguous (tab, not button).
    await expect(page.getByRole('tab', { name: "Can't go" })).toBeVisible({ timeout: 10000 });
  });

  test('edit a plan', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await page.goto(`/hive/${hive.hive_id}/events`);
    await page.waitForLoadState('networkidle');

    const title = `QA edit plan ${Date.now()}`;
    await page.getByRole('button', { name: '＋ Create a Plan' }).click();
    await page.getByPlaceholder("Founders' Rooftop Mixer").fill(title);
    await page.locator('.plans-modal input[type="datetime-local"]').first().fill(futureLocal(5));
    await page.getByRole('button', { name: 'Create Plan', exact: true }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });
    await page.getByText(title).click();
    await assertCleanPage(page, tracked);

    const newTitle = `${title} (edited)`;
    await page.getByRole('button', { name: '⋯' }).click();
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit plan' })).toBeVisible({ timeout: 10000 });
    const titleInput = page.locator('.plans-modal input').first();
    await titleInput.fill(newTitle);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { name: newTitle })).toBeVisible({ timeout: 10000 });
  });

  test('cancel a plan', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await page.goto(`/hive/${hive.hive_id}/events`);
    await page.waitForLoadState('networkidle');

    const title = `QA cancel plan ${Date.now()}`;
    await page.getByRole('button', { name: '＋ Create a Plan' }).click();
    await page.getByPlaceholder("Founders' Rooftop Mixer").fill(title);
    await page.locator('.plans-modal input[type="datetime-local"]').first().fill(futureLocal(6));
    await page.getByRole('button', { name: 'Create Plan', exact: true }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });
    await page.getByText(title).click();
    await assertCleanPage(page, tracked);

    await page.getByRole('button', { name: '⋯' }).click();
    await page.getByRole('button', { name: 'Cancel plan' }).click();
    await expect(page.getByRole('dialog', { name: 'Cancel plan' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Cancel this plan', exact: true }).click();
    await expect(page.getByText('This plan was cancelled.')).toBeVisible({ timeout: 10000 });
  });

  test('recurring series: create, series chip, Going to all', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await page.goto(`/hive/${hive.hive_id}/events`);
    await page.waitForLoadState('networkidle');

    const title = `QA series plan ${Date.now()}`;
    await page.getByRole('button', { name: '＋ Create a Plan' }).click();
    await page.getByPlaceholder("Founders' Rooftop Mixer").fill(title);
    await page.locator('.plans-modal input[type="datetime-local"]').first().fill(futureLocal(7));
    await page.getByLabel('Repeats').selectOption('weekly');
    await page.getByLabel('For how many times').fill('3');
    await page.getByRole('button', { name: 'Create Plan', exact: true }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });

    await page.getByText(title).click();
    await assertCleanPage(page, tracked);
    await expect(page.locator('.pd-series-chip')).toContainText('1 of 3', { timeout: 10000 });
    await expect(page.locator('.pd-series-chip')).toContainText('weekly');

    await page.getByRole('button', { name: 'Going to all' }).click();
    await expect(page.locator('.pd-error')).toHaveCount(0);
  });

  test('check-in and roll call', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Every Tool Hive']); // owner4; all 13 tools on
    const ownerPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(ownerPage, QA_USERS.owner4);
    await ownerPage.goto(`/hive/${hive.hive_id}/events`);
    await ownerPage.waitForLoadState('networkidle');
    const title = `QA checkin plan ${Date.now()}`;
    await ownerPage.getByRole('button', { name: '＋ Create a Plan' }).click();
    await ownerPage.getByPlaceholder("Founders' Rooftop Mixer").fill(title);
    // Check-in only opens 30 minutes before the plan starts — schedule it
    // just inside that window, not "a day ahead" like the other fixtures.
    await ownerPage.locator('.plans-modal input[type="datetime-local"]').first().fill(soonLocal(10));
    await ownerPage.getByRole('button', { name: 'Create Plan', exact: true }).click();
    await expect(ownerPage.getByText(title)).toBeVisible({ timeout: 10000 });
    await ownerPage.getByText(title).click();
    const planUrl = ownerPage.url();

    // Self check-in, as a plain member.
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.member1);
    await page.goto(planUrl);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    await page.getByRole('button', { name: "I'm here" }).click();
    await expect(page.getByText("You're checked in")).toBeVisible({ timeout: 10000 });

    // Host roll call, marking a DIFFERENT member who hasn't self-checked-in.
    await ownerPage.getByText('Roll call').scrollIntoViewIfNeeded();
    const member2Row = ownerPage.locator('.ci-row--rollcall', { hasText: 'Jamal Price' });
    await expect(member2Row).toBeVisible({ timeout: 10000 });
    await member2Row.getByRole('button', { name: 'Mark here' }).click();
    await expect(member2Row.locator('.ci-row-check')).toBeVisible({ timeout: 10000 });

    await ownerPage.reload();
    await expect(ownerPage.getByText('2 checked in')).toBeVisible({ timeout: 10000 });
    await ownerPage.close();
  });

  // ── All four suggestion/voting modes (plan_proposers x plan_approval) ──────

  test('mode: owners propose, Hive votes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await setPlanRules(page, hive.hive_id, { plan_proposers: 'owners', plan_approval: 'vote' });
    await page.goto(`/hive/${hive.hive_id}/events`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    const title = `QA owner-vote plan ${Date.now()}`;
    await page.getByRole('button', { name: '＋ Propose a Plan' }).click();
    await expect(page.getByRole('dialog', { name: 'Propose a Plan' })).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder("Founders' Rooftop Mixer").fill(title);
    await page.locator('.plans-modal input[type="datetime-local"]').first().fill(futureLocal(8));
    await page.getByRole('button', { name: 'Propose Plan', exact: true }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });

    // Early approval needs a real majority of CURRENT active members, not
    // just vote_min_yes on its own — voteOutcome's early branch uses
    // max(voteMinYes, floor(members/2)+1). Silver Lake Social starts with
    // 3 (owner1 + member1 + member2), but an earlier flow in the same
    // combined-suite run (Flow 6's instant-join test) can have added a
    // 4th by the time this runs — compute the real count rather than
    // assuming the seeded one, and vote with however many that takes.
    const membersRes = await page.request.get(`/api/hives/${hive.hive_id}/members`);
    const { members } = await membersRes.json();
    const majority = Math.floor(members.length / 2) + 1;
    const voterPool = [QA_USERS.member1, QA_USERS.member2, QA_USERS.miami].slice(0, majority);
    expect(voterPool.length, `need ${majority} voters but only have a pool of 3 non-owner fixtures`).toBeGreaterThanOrEqual(majority);
    for (const voter of voterPool) {
      const voterPage = await page.context().browser().newContext().then(c => c.newPage());
      await loginViaSession(voterPage, voter);
      await voterPage.goto(`/hive/${hive.hive_id}/events`);
      await voterPage.waitForLoadState('networkidle');
      await voterPage.getByRole('tab', { name: /^Suggested/ }).click();
      const card = voterPage.locator('.plans-card--suggestion', { hasText: title });
      await expect(card).toBeVisible({ timeout: 10000 });
      // Closing the context right after click() can abort the vote request
      // before it's sent — click() only waits for the DOM event, not for
      // the onVote handler's own fetch to land. Wait for that response.
      await Promise.all([
        voterPage.waitForResponse(r => /\/plan-suggestions\/.+\/vote$/.test(r.url())),
        card.getByRole('button', { name: '✓ Yes' }).click(),
      ]);
      await voterPage.close();
    }

    // This page has had the Suggested tab's data since before either vote —
    // HivePlansPage has no socket listener for suggestion changes (unlike
    // the chat-embedded suggestion card), so switching tabs reveals the
    // already-fetched, now-stale list rather than re-fetching. A reload is
    // the realistic way a viewer would see the vote's resolution land.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /^Suggested/ }).click();
    await expect(page.locator('.plans-card--suggestion', { hasText: title })).toHaveCount(0, { timeout: 10000 });
  });

  test('mode: members suggest, owner approves', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    // Only an owner/admin can change plan rules — set them as owner1, then
    // switch this same page's session to the member who does the suggesting.
    await loginViaSession(page, QA_USERS.owner1);
    await setPlanRules(page, hive.hive_id, { plan_proposers: 'members', plan_approval: 'owner' });

    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.member1);
    await page.goto(`/hive/${hive.hive_id}/events`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    const title = `QA member-suggest plan ${Date.now()}`;
    await page.getByRole('button', { name: '＋ Suggest a Plan' }).click();
    await expect(page.getByRole('dialog', { name: 'Suggest a Plan' })).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder("Founders' Rooftop Mixer").fill(title);
    await page.locator('.plans-modal input[type="datetime-local"]').first().fill(futureLocal(9));
    await page.getByRole('button', { name: 'Suggest Plan', exact: true }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });

    const ownerPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(ownerPage, QA_USERS.owner1);
    await ownerPage.goto(`/hive/${hive.hive_id}/events`);
    await ownerPage.waitForLoadState('networkidle');
    await ownerPage.getByRole('tab', { name: /^Suggested/ }).click();
    const card = ownerPage.locator('.plans-card--suggestion', { hasText: title });
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(card).toHaveCount(0, { timeout: 10000 });
    await ownerPage.close();
  });

  test('mode: members suggest, Hive votes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    await loginViaSession(page, QA_USERS.owner1);
    await setPlanRules(page, hive.hive_id, { plan_proposers: 'members', plan_approval: 'vote' });

    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.member1);
    await page.goto(`/hive/${hive.hive_id}/events`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    const title = `QA member-vote plan ${Date.now()}`;
    await page.getByRole('button', { name: '＋ Suggest a Plan' }).click();
    await page.getByPlaceholder("Founders' Rooftop Mixer").fill(title);
    await page.locator('.plans-modal input[type="datetime-local"]').first().fill(futureLocal(10));
    await page.getByRole('button', { name: 'Suggest Plan', exact: true }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });

    // The suggester can withdraw their own pending suggestion.
    await page.getByRole('tab', { name: /^Suggested/ }).click();
    const card = page.locator('.plans-card--suggestion', { hasText: title });
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.getByRole('button', { name: 'Withdraw' }).click();
    await expect(card).toHaveCount(0, { timeout: 10000 });
  });

  test('mode: owners-only, no suggest affordance for a plain member', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    await loginViaSession(page, QA_USERS.owner1);
    await setPlanRules(page, hive.hive_id, { plan_proposers: 'owners', plan_approval: 'owner' });

    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.member1);
    await page.goto(`/hive/${hive.hive_id}/events`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    await expect(page.getByRole('button', { name: /Create a Plan|Suggest a Plan|Propose a Plan/ })).toHaveCount(0);
  });
});
