import { test, expect } from '@playwright/test';
import { trackPage, assertCleanPage, loginViaSession, QA_USERS, runQaHelper } from './helpers.js';

// Flow 11: Safety — report message/post/comment/person/Hive, second
// reporter auto-hides, owner Manage Hive Reports, admin /admin/reports,
// block/unblock, 11th report in an hour refused. Desktop Chrome only —
// pure mechanism, no cross-device behavior.

async function reportViaApi(page, { targetType, targetId, reason = 'spam' }) {
  const res = await page.request.post('/api/reports', { data: { targetType, targetId, reason } });
  return res;
}

test.describe('Flow 11 — Safety', () => {
  test('report a message in chat; the second reporter auto-hides it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);

    const ownerPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(ownerPage, QA_USERS.owner1);
    await ownerPage.goto(`/hive/${hive.hive_id}/chat`);
    await ownerPage.waitForLoadState('networkidle');
    await ownerPage.waitForSelector('[aria-label="Message input"]');
    const text = `QA report-target message ${Date.now()}`;
    await ownerPage.getByLabel('Message input').fill(text);
    await ownerPage.getByLabel('Send message').click();
    const log = ownerPage.getByRole('log', { name: 'Chat messages' });
    await expect(log.getByText(text)).toBeVisible({ timeout: 10000 });

    for (const reporter of [QA_USERS.member1, QA_USERS.member2]) {
      const repPage = await page.context().browser().newContext().then(c => c.newPage());
      const tracked = trackPage(repPage, { allowedFailedPaths: ['/api/auth/me'] });
      await loginViaSession(repPage, reporter);
      await repPage.goto(`/hive/${hive.hive_id}/chat`);
      await repPage.waitForLoadState('networkidle');
      await assertCleanPage(repPage, tracked);
      const theirRow = repPage.locator('.hc-msg-row').filter({ hasText: text }).last();
      await theirRow.hover();
      await theirRow.getByRole('button', { name: 'Report' }).click();
      await expect(repPage.getByRole('heading', { name: 'Report this message' })).toBeVisible({ timeout: 10000 });
      await repPage.getByText('Spam or scam').click();
      const [reportResponse] = await Promise.all([
        repPage.waitForResponse(r => r.url().endsWith('/api/reports') && r.request().method() === 'POST'),
        repPage.getByRole('button', { name: 'Send report' }).click(),
      ]);
      expect(reportResponse.ok(), await reportResponse.text()).toBeTruthy();
      await expect(repPage.getByRole('heading', { name: 'Report sent' })).toBeVisible({ timeout: 10000 });
      await repPage.close();
    }

    // The sender's own view — an uninvolved-in-reporting third party — must
    // also see it hidden, proving this is real server-side state (hidden_at
    // set on the row), not just the reporter's own client-side self-hide.
    await ownerPage.reload();
    await ownerPage.waitForLoadState('networkidle');
    await expect(ownerPage.locator('.sf-hidden-placeholder')).toContainText("hidden while it's being reviewed", { timeout: 10000 });
    await ownerPage.close();
  });

  test('report a post and a comment', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);

    const ownerPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(ownerPage, QA_USERS.owner1);
    await ownerPage.goto(`/hive/${hive.hive_id}`);
    await ownerPage.waitForLoadState('networkidle');
    const postHeadline = `QA report-target post ${Date.now()}`;
    await ownerPage.getByRole('button', { name: /Post an update/ }).click();
    await ownerPage.getByPlaceholder(/What.s happening in your Hive/).fill(postHeadline);
    await ownerPage.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(ownerPage.getByText(postHeadline)).toBeVisible({ timeout: 10000 });

    const commentText = `QA report-target comment ${Date.now()}`;
    const scope = ownerPage.locator('.post-card', { hasText: postHeadline }).first();
    await scope.locator('.post-comment-btn').click();
    await ownerPage.getByPlaceholder('Add a comment…').fill(commentText);
    await ownerPage.keyboard.press('Enter');
    await expect(ownerPage.getByText(commentText)).toBeVisible({ timeout: 10000 });
    await ownerPage.close();

    // Report the post as member1.
    const m1Page = await page.context().browser().newContext().then(c => c.newPage());
    const tracked1 = trackPage(m1Page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(m1Page, QA_USERS.member1);
    await m1Page.goto(`/hive/${hive.hive_id}`);
    await m1Page.waitForLoadState('networkidle');
    await assertCleanPage(m1Page, tracked1);
    const postScope = m1Page.locator('.post-card', { hasText: postHeadline }).first();
    await postScope.getByRole('button', { name: 'Report', exact: true }).click();
    await expect(m1Page.getByRole('heading', { name: 'Report this post' })).toBeVisible({ timeout: 10000 });
    await m1Page.getByText('Spam or scam').click();
    await m1Page.getByRole('button', { name: 'Send report' }).click();
    await expect(m1Page.getByRole('heading', { name: 'Report sent' })).toBeVisible({ timeout: 10000 });
    await m1Page.close();

    // Report the comment as member2.
    const m2Page = await page.context().browser().newContext().then(c => c.newPage());
    const tracked2 = trackPage(m2Page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(m2Page, QA_USERS.member2);
    await m2Page.goto(`/hive/${hive.hive_id}`);
    await m2Page.waitForLoadState('networkidle');
    await assertCleanPage(m2Page, tracked2);
    const commentScope = m2Page.locator('.post-card', { hasText: postHeadline }).first();
    await commentScope.locator('.post-comment-btn').click(); // comments panel starts collapsed
    await expect(commentScope.getByText(commentText)).toBeVisible({ timeout: 10000 });
    await commentScope.locator('.post-comment-item', { hasText: commentText })
      .getByRole('button', { name: 'Report', exact: true }).click();
    await expect(m2Page.getByRole('heading', { name: 'Report this comment' })).toBeVisible({ timeout: 10000 });
    await m2Page.getByText('Spam or scam').click();
    await m2Page.getByRole('button', { name: 'Send report' }).click();
    await expect(m2Page.getByRole('heading', { name: 'Report sent' })).toBeVisible({ timeout: 10000 });
    await m2Page.close();
  });

  test('report a person and a Hive', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    const miamiId = runQaHelper('qaGetUserId.js', [QA_USERS.miami]).id;

    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.member1);
    await page.goto(`/profile/${miamiId}`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    await page.getByRole('button', { name: 'Profile actions' }).click();
    await page.getByRole('button', { name: /^Report /, exact: false }).click();
    await expect(page.getByRole('heading', { name: /^Report /, exact: false })).toBeVisible({ timeout: 10000 });
    await page.getByText('Spam or scam').click();
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('heading', { name: 'Report sent' })).toBeVisible({ timeout: 10000 });

    // "Report this Hive" only renders in HiveDashboardLayout.jsx's
    // non-member header (next to Follow/Join) — there is no equivalent
    // entry point on the full member Hive Home page a member actually
    // lands on. Reported as a finding (Flow 11 report), not fixed here:
    // whether a member should be able to report the whole Hive from
    // inside it is a product decision, not a one-line bug. Exercised here
    // via the one path the feature genuinely supports: a non-member
    // previewing the Hive before joining.
    // "unfinished", not miami: Flow 6's instant-join test permanently
    // makes miami a full MEMBER of this same Hive in a combined-suite
    // run, which would land them on the member Hive Home page instead
    // of this non-member preview — confirmed directly. "unfinished" is
    // never added to Silver Lake Social by any other flow.
    const nonMemberPage = await page.context().browser().newContext().then(c => c.newPage());
    const trackedHive = trackPage(nonMemberPage, { allowedFailedPaths: ['/api/auth/me', '/tools', '/posts'] });
    await loginViaSession(nonMemberPage, QA_USERS.unfinished);
    await nonMemberPage.goto(`/hive/${hive.hive_id}`);
    await nonMemberPage.waitForLoadState('networkidle');
    await assertCleanPage(nonMemberPage, trackedHive);
    await nonMemberPage.getByRole('button', { name: 'Report this Hive' }).click();
    await expect(nonMemberPage.getByRole('heading', { name: /^Report qa-/ })).toBeVisible({ timeout: 10000 });
    await nonMemberPage.getByText('Spam or scam').click();
    await nonMemberPage.getByRole('button', { name: 'Send report' }).click();
    await expect(nonMemberPage.getByRole('heading', { name: 'Report sent' })).toBeVisible({ timeout: 10000 });
    await nonMemberPage.close();
  });

  test('owner Manage Hive Reports: remove, keep, remove member', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);

    const ownerPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(ownerPage, QA_USERS.owner1);
    await ownerPage.goto(`/hive/${hive.hive_id}`);
    await ownerPage.waitForLoadState('networkidle');

    const makePostAs = async (authorPage, authorLoggedIn) => {
      const headline = `QA resolve-target ${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!authorLoggedIn) {
        await authorPage.goto(`/hive/${hive.hive_id}`);
        await authorPage.waitForLoadState('networkidle');
      }
      await authorPage.getByRole('button', { name: /Post an update/ }).click();
      await authorPage.getByPlaceholder(/What.s happening in your Hive/).fill(headline);
      await authorPage.getByRole('button', { name: 'Post', exact: true }).click();
      await expect(authorPage.getByText(headline)).toBeVisible({ timeout: 10000 });
      return headline;
    };
    const [removeTarget, keepTarget] = [await makePostAs(ownerPage, true), await makePostAs(ownerPage, true)];

    // The "remove member" target must be authored by someone OTHER than
    // both reporters below (self-reports are refused server-side). A plain
    // member has no "Post an update" button at all (owner/admin only, per
    // Flow 7) — a chat message is the one thing any member can author, and
    // ReportCard handles target_type 'message' the same way as a post.
    const member2Page = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(member2Page, QA_USERS.member2);
    await member2Page.goto(`/hive/${hive.hive_id}/chat`);
    await member2Page.waitForLoadState('networkidle');
    await member2Page.waitForSelector('[aria-label="Message input"]');
    const memberTarget = `QA resolve-target message ${Date.now()}`;
    await member2Page.getByLabel('Message input').fill(memberTarget);
    await member2Page.getByLabel('Send message').click();
    await expect(member2Page.getByRole('log', { name: 'Chat messages' }).getByText(memberTarget)).toBeVisible({ timeout: 10000 });
    await member2Page.close();

    const reportMessageTwice = async (text, reporters) => {
      for (const reporter of reporters) {
        const repPage = await page.context().browser().newContext().then(c => c.newPage());
        await loginViaSession(repPage, reporter);
        await repPage.goto(`/hive/${hive.hive_id}/chat`);
        await repPage.waitForLoadState('networkidle');
        const row = repPage.locator('.hc-msg-row').filter({ hasText: text }).last();
        await row.hover();
        await row.getByRole('button', { name: 'Report' }).click();
        await repPage.getByText('Spam or scam').click();
        await repPage.getByRole('button', { name: 'Send report' }).click();
        await expect(repPage.getByRole('heading', { name: 'Report sent' })).toBeVisible({ timeout: 10000 });
        await repPage.close();
      }
    };

    const reportPostTwice = async (headline, reporters) => {
      for (const reporter of reporters) {
        const repPage = await page.context().browser().newContext().then(c => c.newPage());
        await loginViaSession(repPage, reporter);
        await repPage.goto(`/hive/${hive.hive_id}`);
        await repPage.waitForLoadState('networkidle');
        const scope = repPage.locator('.post-card', { hasText: headline }).first();
        await scope.getByRole('button', { name: 'Report', exact: true }).click();
        await repPage.getByText('Spam or scam').click();
        await repPage.getByRole('button', { name: 'Send report' }).click();
        await expect(repPage.getByRole('heading', { name: 'Report sent' })).toBeVisible({ timeout: 10000 });
        await repPage.close();
      }
    };
    await reportPostTwice(removeTarget, [QA_USERS.member1, QA_USERS.member2]);
    await reportPostTwice(keepTarget, [QA_USERS.member1, QA_USERS.member2]);
    await reportMessageTwice(memberTarget, [QA_USERS.owner1, QA_USERS.member1]);

    await ownerPage.goto(`/hive/${hive.hive_id}/reports`);
    await ownerPage.waitForLoadState('networkidle');

    const card = (headline) => ownerPage.locator('.hmrp-card', { hasText: headline });
    await expect(card(removeTarget)).toBeVisible({ timeout: 10000 });
    await card(removeTarget).getByRole('button', { name: 'Remove post' }).click();
    await expect(card(removeTarget)).toHaveCount(0, { timeout: 10000 });

    await card(keepTarget).getByRole('button', { name: 'Keep it' }).click();
    await expect(card(keepTarget)).toHaveCount(0, { timeout: 10000 });

    const mCard = card(memberTarget);
    await mCard.getByRole('button', { name: /Remove .+ from Hive/ }).click();
    await mCard.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(mCard).toHaveCount(0, { timeout: 10000 });

    // Confirm "keep" actually restored visibility and "remove" didn't.
    // getByText alone also matches the Hive Home activity feed's own echo
    // of the same headline — scope to the post card itself.
    await ownerPage.goto(`/hive/${hive.hive_id}`);
    await ownerPage.waitForLoadState('networkidle');
    await expect(ownerPage.locator('.post-card', { hasText: keepTarget })).toBeVisible({ timeout: 10000 });
    await expect(ownerPage.locator('.post-card', { hasText: removeTarget })).toHaveCount(0);
    await ownerPage.close();
  });

  test('admin /admin/reports: remove and suspend, then unsuspend', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const miamiEmail = QA_USERS.miami;

    const repPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(repPage, QA_USERS.owner2);
    const miamiId = runQaHelper('qaGetUserId.js', [miamiEmail]).id;
    const reportRes = await reportViaApi(repPage, { targetType: 'user', targetId: miamiId, reason: 'fake_or_minor' });
    expect(reportRes.ok(), await reportRes.text()).toBeTruthy();
    await repPage.close();

    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1); // SITE_ADMIN_EMAILS — dev-only, Flow 14 setup
    await page.goto('/admin/reports');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    const row = page.locator('tr', { hasText: 'Isabela Cruz' });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole('button', { name: 'Review' }).click();
    await expect(page.getByRole('button', { name: 'Remove & suspend account' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Remove & suspend account' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('tr', { hasText: 'Isabela Cruz' })).toHaveCount(0, { timeout: 10000 });

    const status = runQaHelper('qaCheckUserStatus.js', [miamiEmail]);
    expect(status.account_status).toBe('suspended');

    await page.getByRole('tab', { name: /Suspended/ }).click();
    const suspendedRow = page.locator('tr', { hasText: 'Isabela Cruz' });
    await expect(suspendedRow).toBeVisible({ timeout: 10000 });
    await suspendedRow.getByRole('button', { name: 'Unsuspend' }).click();
    await expect(suspendedRow).toHaveCount(0, { timeout: 10000 });

    const restored = runQaHelper('qaCheckUserStatus.js', [miamiEmail]);
    expect(restored.account_status).toBe('active');
  });

  test('block and unblock', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const miamiId = runQaHelper('qaGetUserId.js', [QA_USERS.miami]).id;

    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.member1);
    await page.goto(`/profile/${miamiId}`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    await page.getByRole('button', { name: 'Profile actions' }).click();
    await page.getByRole('button', { name: /^Block /, exact: false }).click();
    await expect(page.getByRole('heading', { name: /^Block .+\?/ })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /^Block /, exact: false }).last().click();
    await expect(page.getByText('Blocked. Taking you back…')).toBeVisible({ timeout: 10000 });

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    const row = page.locator('.acct-blocked-row', { hasText: 'Isabela Cruz' });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole('button', { name: 'Unblock' }).click();
    await expect(row).toHaveCount(0, { timeout: 10000 });
  });

  test('the 11th report in an hour is refused', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    // A dedicated reporter untouched by every other test in this file — the
    // rate limiter is in-memory on the server (express-rate-limit), not
    // reset by re-seeding the database, so reusing a reporter used earlier
    // in this same hour would make this flaky across iterations.
    await loginViaSession(page, QA_USERS.unfinished);
    const miamiId = runQaHelper('qaGetUserId.js', [QA_USERS.miami]).id;

    let successCount = 0;
    let sawRefusal = false;
    for (let i = 0; i < 12 && !sawRefusal; i++) {
      const res = await reportViaApi(page, { targetType: 'user', targetId: miamiId, reason: 'other' });
      if (res.status() === 429) { sawRefusal = true; break; }
      expect(res.ok(), `attempt ${i + 1}: ${res.status()} ${await res.text()}`).toBeTruthy();
      successCount++;
    }
    expect(sawRefusal, 'the report endpoint should refuse once the hourly cap is hit').toBe(true);
    expect(successCount, 'the cap is documented as 10/hour').toBeLessThanOrEqual(10);
  });
});
