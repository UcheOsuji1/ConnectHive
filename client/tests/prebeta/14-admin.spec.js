import { test, expect } from '@playwright/test';
import { trackPage, assertCleanPage, loginViaSession, QA_USERS } from './helpers.js';

// Flow 14: Admin — /admin/reports (incl. "Hives without an area"),
// /admin/newsletter, /admin/funnel all 404 for a normal user, work for
// admin. Desktop Chrome only — pure mechanism.

const ADMIN_ROUTES = [
  { path: '/admin/reports',    apiPath: '/api/admin/reports',          heading: 'TrueHive Report Queue' },
  { path: '/admin/newsletter', apiPath: '/api/admin/newsletter/status', heading: 'Newsletter' },
  { path: '/admin/funnel',     apiPath: '/api/admin/funnel',           heading: 'Signup Funnel' },
];

test.describe('Flow 14 — Admin', () => {
  for (const { path, apiPath, heading } of ADMIN_ROUTES) {
    test(`${path} works for an admin, 404s for a normal user`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');

      // Normal user: requireSiteAdmin 404s, same "invisible, not forbidden"
      // convention as a disabled tool or a non-member's pair chat. Hits
      // the real underlying data endpoint for each page directly, not a
      // guessed path — a wrong guess could 404 for the wrong reason
      // (Express's own default handler, not requireSiteAdmin).
      const memberPage = await page.context().browser().newContext().then(c => c.newPage());
      await loginViaSession(memberPage, QA_USERS.member1);
      const blockedRes = await memberPage.request.get(apiPath);
      expect(blockedRes.status()).toBe(404);
      await memberPage.close();

      // Admin (SITE_ADMIN_EMAILS, set up in Flow 11): the real page loads.
      const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
      await loginViaSession(page, QA_USERS.owner1);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await assertCleanPage(page, tracked);
      await expect(page.getByRole('heading', { name: heading, exact: false }).first()).toBeVisible({ timeout: 10000 });
    });
  }

  test('"Hives without an area" tab on /admin/reports', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await page.goto('/admin/reports');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    await page.getByRole('tab', { name: 'Hives without an area' }).click();
    // This tool deliberately isn't scoped to qa- fixtures — it's meant to
    // surface every real Hive missing an area, and the dev database already
    // has some from earlier (non-qa-) work. Assert the tab actually loaded
    // (the empty state, or a real table), not what it specifically contains.
    await expect(
      page.getByText("Every in-person or hybrid Hive has an area.").or(page.locator('table'))
    ).toBeVisible({ timeout: 10000 });
  });
});
