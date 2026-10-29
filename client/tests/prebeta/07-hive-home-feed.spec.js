import { test, expect } from '@playwright/test';
import { trackPage, assertCleanPage, loginViaSession, QA_USERS, runQaHelper } from './helpers.js';

// Flow 7: Hive Home, feed and followers.

test.describe('Flow 7 — Hive Home, feed and followers', () => {
  test('owner/admin can post; a plain member sees no Post button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);

    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await page.goto(`/hive/${hive.hive_id}`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    await expect(page.getByRole('button', { name: /Post an update/ })).toBeVisible();

    const memberPage = await page.context().browser().newContext().then(c => c.newPage());
    const memberTracked = trackPage(memberPage, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(memberPage, QA_USERS.member1); // plain member, not owner/admin
    await memberPage.goto(`/hive/${hive.hive_id}`);
    await memberPage.waitForLoadState('networkidle');
    await assertCleanPage(memberPage, memberTracked);
    await expect(memberPage.getByRole('button', { name: /Post an update/ })).toHaveCount(0);
    await memberPage.close();
  });

  test('post, comment, react, and see the reactors', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    const headline = `QA Flow7 post ${Date.now()}`;

    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await page.goto(`/hive/${hive.hive_id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Post an update/ }).click();
    await page.getByPlaceholder(/What.s happening in your Hive/).fill(headline);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText(headline)).toBeVisible({ timeout: 10000 });
    await assertCleanPage(page, tracked);

    const scope = page.locator('.post-card', { hasText: headline }).first();

    await scope.getByRole('button', { name: /Like/ }).first().click();
    await expect(scope.getByRole('button', { name: /Like|Liked/ }).first()).toHaveClass(/reacted/);

    await scope.locator('.post-summary-count').click();
    // "Maya Sutton" (owner1) appears many places on the page — scope to the
    // reactors popup itself, not a page-wide text match.
    await expect(page.locator('.post-reactors-modal')).toContainText('Maya Sutton', { timeout: 10000 });
    await page.getByRole('button', { name: 'Close' }).click(); // closes .post-reactors-overlay
    await expect(page.locator('.post-reactors-overlay')).toHaveCount(0);

    await scope.locator('.post-comment-btn').click();
    const commentText = `QA fixture comment ${Date.now()}`;
    await page.getByPlaceholder('Add a comment…').fill(commentText);
    await page.keyboard.press('Enter');
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10000 });
  });

  test('a follower who is not a member sees only public posts', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    const publicHeadline = `QA Flow7 PUBLIC ${Date.now()}`;
    const hiveOnlyHeadline = `QA Flow7 HIVE-ONLY ${Date.now()}`;

    // Owner creates one public and one Hive-only post.
    const ownerPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(ownerPage, QA_USERS.owner1);
    await ownerPage.goto(`/hive/${hive.hive_id}`);
    await ownerPage.waitForLoadState('networkidle');

    await ownerPage.getByRole('button', { name: /Post an update/ }).click();
    await ownerPage.getByPlaceholder(/What.s happening in your Hive/).fill(hiveOnlyHeadline);
    await ownerPage.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(ownerPage.getByText(hiveOnlyHeadline)).toBeVisible({ timeout: 10000 });

    await ownerPage.getByRole('button', { name: /Post an update/ }).click();
    await ownerPage.getByPlaceholder(/What.s happening in your Hive/).fill(publicHeadline);
    // The visibility picker only renders once CreatePostModal resolves which
    // Hive is selected (canSetPublic needs selectedHive.role) — wait for it
    // rather than assuming it's there the instant the modal opens.
    const publicRadio = ownerPage.getByRole('radio').last();
    await expect(ownerPage.getByText('Who can see this')).toBeVisible({ timeout: 10000 });
    await publicRadio.check();
    await expect(publicRadio).toBeChecked();
    await ownerPage.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(ownerPage.getByText(publicHeadline)).toBeVisible({ timeout: 10000 });
    await ownerPage.close();

    // "unfinished" follows (not joins) the Hive, then views it as a
    // non-member — not miami: Flow 6's instant-join test permanently
    // makes miami a full MEMBER of this same Hive in a combined-suite
    // run, which breaks this test's whole premise (they'd see the real
    // member Hive Home feed, not the non-member preview). "unfinished"
    // is never added to Silver Lake Social by any other flow.
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me', '/tools', '/posts'] });
    await loginViaSession(page, QA_USERS.unfinished);
    const followRes = await page.request.post(`/api/hives/${hive.hive_id}/follow`, { data: {} });
    expect(followRes.ok()).toBeTruthy();

    try {
      await page.goto(`/hive/${hive.hive_id}`);
      await page.waitForLoadState('networkidle');
      await assertCleanPage(page, tracked);
      // The non-member preview (HiveDashboardLayout.jsx) renders each post
      // as a plain unstyled div with no distinguishing class — scope to
      // the Posts tab panel's own text instead of a page-wide search.
      await expect(page.getByText(publicHeadline)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(hiveOnlyHeadline)).toHaveCount(0);
    } finally {
      await page.request.delete(`/api/hives/${hive.hive_id}/follow`);
    }
  });

  test('a new post notifies members', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    const headline = `QA Flow7 notify ${Date.now()}`;

    const ownerPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(ownerPage, QA_USERS.owner1);
    await ownerPage.goto(`/hive/${hive.hive_id}`);
    await ownerPage.waitForLoadState('networkidle');
    await ownerPage.getByRole('button', { name: /Post an update/ }).click();
    await ownerPage.getByPlaceholder(/What.s happening in your Hive/).fill(headline);
    await ownerPage.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(ownerPage.getByText(headline)).toBeVisible({ timeout: 10000 });
    await ownerPage.close();

    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.member1); // plain member of Silver Lake Social
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    await page.getByRole('button', { name: 'Notifications' }).click();
    await expect(page.locator('.nb-panel')).toContainText(headline, { timeout: 10000 });
  });
});
