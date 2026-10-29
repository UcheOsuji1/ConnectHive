import { test, expect } from '@playwright/test';
import { trackPage, assertNoHorizontalOverflow, assertNoBrokenImages, assertNonEmptyTitle } from './helpers.js';

// Prompt 74 Step 4: production smoke test — read-only, logged out, against
// the real live site. No qa- fixtures, no state changes, no login. Full
// absolute URLs throughout, independent of the local dev baseURL every
// other spec in this folder uses.

const SITE = 'https://truehive.app';
const API  = 'https://api.truehive.app';

test.describe('Step 4 — Production smoke test', () => {
  test('API health', async ({ request }) => {
    const res = await request.get(`${API}/api/health`);
    expect(res.status()).toBe(200);
  });

  test('/admin/reports is invisible to a logged-out visitor', async ({ request }) => {
    // requireAuth runs before requireSiteAdmin (router.use order in
    // admin.js) — a request with no session at all never reaches the
    // admin check, so 401 here is the correct outcome, not 404. 404 is
    // what an AUTHENTICATED non-admin gets (confirmed in Flow 14).
    const res = await request.get(`${API}/api/admin/reports`);
    expect(res.status()).toBe(401);
  });

  for (const [name, path] of [
    ['landing page', '/'],
    ['Find Your Hive', '/find-your-hive'],
    ['Privacy', '/privacy'],
    ['Terms', '/terms'],
    ['404', '/this-page-does-not-exist-qa-check'],
  ]) {
    test(`${name} loads clean`, async ({ page }) => {
      // /api/auth/me legitimately 401s for every logged-out visitor on
      // every page — same allowlisted path every other flow in this
      // folder already carries in trackPage().
      const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });

      await page.goto(`${SITE}${path}`);
      await page.waitForLoadState('networkidle');

      await assertNonEmptyTitle(page);
      await assertNoHorizontalOverflow(page);
      await assertNoBrokenImages(page);
      expect(tracked.consoleErrors, 'console errors').toEqual([]);
      // The 404 case's own page load is expected to be a 404 response —
      // only flag anything ELSE failing alongside it.
      const unexpected = tracked.failedRequests.filter(f => name !== '404' || !f.startsWith('404 '));
      expect(unexpected, 'failed network requests').toEqual([]);
    });
  }

  test('idle first-request time (free-plan sleep check)', async ({ request }) => {
    const start = Date.now();
    const res = await request.get(`${API}/api/health`);
    const ms = Date.now() - start;
    expect(res.status()).toBe(200);
    test.info().annotations.push({
      type: 'first-request-ms',
      description: `${ms}ms${ms > 5000 ? ' — looks like the free-plan server was asleep; report this' : ''}`,
    });
  });

  test('HTTPS redirect and Cache-Control headers', async ({ request }) => {
    const httpRes = await request.get('http://truehive.app/', { maxRedirects: 0 }).catch(e => e);
    const status = httpRes.status?.() ?? 0;
    expect([301, 302, 307, 308], 'http:// should redirect to https://').toContain(status);
    const location = httpRes.headers?.()?.location ?? '';
    expect(location.startsWith('https://')).toBe(true);

    const res = await request.get(`${SITE}/`);
    const cacheControl = res.headers()['cache-control'];
    test.info().annotations.push({ type: 'cache-control', description: cacheControl ?? '(none set)' });
  });
});
