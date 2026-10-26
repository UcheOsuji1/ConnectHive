import { test, expect } from '@playwright/test';
import { trackPage, assertCleanPage } from './helpers.js';

// Flow 1: landing page, every footer/header link, Privacy, Terms, 404.

const FOOTER_LINKS = [
  '/about', '/mission', '/careers', '/blog', '/press', '/contact',
  '/find-your-hive', '/create-hive', '/profile-setup', '/home', '/my-hive',
  '/privacy', '/terms', '/safety',
];
const HEADER_LINKS_LOGGED_OUT = ['/', '/about', '/find-your-hive', '/create-hive', '/login', '/signup'];

test.describe('Flow 1 — Public site', () => {
  test('landing page loads clean', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    // Desktop shows the signup link directly in the header; mobile tucks it
    // behind the hamburger menu (.nav-join-desktop is deliberately hidden
    // there by CSS) — so assert it's reachable, not that it's visible yet.
    await expect(page.locator('a[href="/signup"]').first()).toBeAttached();
  });

  for (const path of HEADER_LINKS_LOGGED_OUT) {
    test(`header link ${path} loads clean`, async ({ page }) => {
      const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await assertCleanPage(page, tracked);
    });
  }

  for (const path of FOOTER_LINKS) {
    test(`footer link ${path} loads clean`, async ({ page }) => {
      const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await assertCleanPage(page, tracked);
    });
  }

  test('Terms: 18+ and deletion wording present', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await page.goto('/terms');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/18 years of age or older|18\+/);
    expect(body.toLowerCase()).toContain('30 days');
  });

  test('Privacy: deletion wording and Sentry/PostHog processor lines present', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).toContain('30 days');
    expect(body).toContain('Sentry');
    expect(body).toContain('PostHog');
    // NOTE: Privacy does not currently say "18+" anywhere (only Terms does) —
    // the prompt's "confirm both say 18+" claim does not hold for this page.
    // Reported, not silently patched — see Finish report.
  });

  test('404 page for an unknown route', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await page.goto('/this-route-does-not-exist-qa74');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).toMatch(/not found|404|doesn't exist|does not exist/);
  });
});
