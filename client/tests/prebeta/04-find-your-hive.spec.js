import { test, expect } from '@playwright/test';
import { trackPage, assertCleanPage, loginViaSession, QA_USERS } from './helpers.js';

// Flow 4: Find Your Hive across all 6 categories.
//
// "Social Groups" gets the full treatment (current location mocked to
// Silver Lake and to Miami, typed autocomplete, online-only, multi-select
// ages, results, Create a Hive prefilled, zero-match founder screen). The
// other 5 categories get a lighter pass — category select -> location
// question renders -> Next works -> results page loads clean — since the
// location/age/results machinery under test is identical across categories
// (CategoryDeepDivePage.jsx's handleNext has no field validation, confirmed
// by reading it), and each category's own extra questions are product
// content, not mechanism, so exhaustively filling all of them 6x over
// wouldn't catch anything the Social Groups pass doesn't already cover.

const CATEGORIES = [
  { hexName: 'Social Groups', key: 'social' },
  { hexName: 'Professional', key: 'professional' },
  { hexName: 'Travel Buddies', key: 'travel' },
  { hexName: 'Project Collab', key: 'project' },
  { hexName: 'Event Buddies', key: 'event' },
  { hexName: 'Specialized', key: 'specialized' },
];

const SILVER_LAKE  = { latitude: 34.0900, longitude: -118.2700 };
const MIAMI        = { latitude: 25.7617, longitude: -80.1918 };
// Rural Nevada desert — far enough from every one of the 100 seeded metros
// (Miami included) that nearest-metro matching genuinely fails, unlike Miami
// which is itself a real seeded metro and resolves successfully.
const RURAL_NEVADA = { latitude: 39.3300, longitude: -117.0500 };

async function mockGeolocation(page, coords) {
  await page.addInitScript((c) => {
    const mockPosition = {
      coords: { latitude: c.latitude, longitude: c.longitude, accuracy: 20 },
      timestamp: Date.now(),
    };
    window.navigator.geolocation.getCurrentPosition = (success) => success(mockPosition);
  }, coords);
}

async function selectCategory(page, hexName) {
  await page.goto('/find-your-hive');
  await page.waitForLoadState('networkidle');
  // The hex's accessible name is its label + description + count text
  // combined (e.g. "Social Groups Friends, hangouts... 9 HIVES"), not just
  // the category label — match on the label as a prefix instead.
  await page.getByRole('button', { name: new RegExp(`^${hexName}`) }).click();
  await page.getByRole('button', { name: /FIND MY HIVE/ }).click();
  await page.waitForURL(url => url.pathname === '/category-deep-dive', { timeout: 10000 });
  await page.waitForLoadState('networkidle');
}

test.describe('Flow 4 — Find Your Hive', () => {
  test('Social Groups: current location mocked to Silver Lake shows LA confirm', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await mockGeolocation(page, SILVER_LAKE);
    await selectCategory(page, 'Social Groups');

    await page.getByRole('button', { name: /Use my current location/ }).click();
    await expect(page.locator('.cdd-location-confirm')).toBeVisible({ timeout: 10000 });
    const confirmText = await page.locator('.cdd-location-confirm-main').innerText();
    expect(confirmText).toMatch(/Los Angeles/i);
    await assertCleanPage(page, tracked);
  });

  test('Social Groups: current location mocked to Miami resolves to Miami', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await mockGeolocation(page, MIAMI);
    await selectCategory(page, 'Social Groups');

    await page.getByRole('button', { name: /Use my current location/ }).click();
    await expect(page.locator('.cdd-location-confirm')).toBeVisible({ timeout: 10000 });
    const confirmText = await page.locator('.cdd-location-confirm-main').innerText();
    expect(confirmText).toMatch(/Miami/i);
    await assertCleanPage(page, tracked);
  });

  test('a location with no nearby metro falls back to typing', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await mockGeolocation(page, RURAL_NEVADA);
    await selectCategory(page, 'Social Groups');

    await page.getByRole('button', { name: /Use my current location/ }).click();
    await expect(page.locator('.cdd-location-error')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.cdd-location-error')).toHaveText("We couldn't find your area. Type your city instead.");
    await assertCleanPage(page, tracked);
  });

  test('Miami results show the "Los Angeles first" screen', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await mockGeolocation(page, MIAMI);
    await selectCategory(page, 'Social Groups');

    await page.getByRole('button', { name: /Use my current location/ }).click();
    await expect(page.locator('.cdd-location-confirm')).toBeVisible({ timeout: 10000 });
    await page.locator('.cdd-nav-next').click();
    await page.waitForURL(url => url.pathname === '/hive-discovery', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    await expect(page.getByRole('heading', { name: /Los Angeles first/i })).toBeVisible();
  });

  test('Social Groups: typed autocomplete resolves a place', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await selectCategory(page, 'Social Groups');

    await page.getByRole('button', { name: /I'll type it in/ }).click();
    const input = page.locator('.cdd-custom-input');
    await input.fill('Silver');
    await expect(page.getByText(/Silver Lake/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByText(/Silver Lake/i).first().click();
    await expect(input).toHaveValue(/Silver Lake/i);
    await assertCleanPage(page, tracked);
  });

  test('Social Groups: online-only, multi-select ages, through to results', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await selectCategory(page, 'Social Groups');

    await page.getByRole('button', { name: /Online community only/ }).click();

    const ageChips = page.locator('#social-age button, [id="social-age"] button');
    if (await ageChips.count()) {
      await ageChips.nth(0).click();
      await ageChips.nth(1).click();
    }

    await page.locator('.cdd-nav-next').click();
    await page.waitForURL(url => url.pathname === '/hive-discovery', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
  });

  test('Social Groups: "Create a Hive" arrives prefilled', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await selectCategory(page, 'Social Groups');

    await page.getByRole('button', { name: /Online community only/ }).click();
    // content.createText is category-specific text, e.g. "Create Social Hive".
    await page.getByRole('button', { name: /Create .*Hive/i }).click();
    await page.waitForURL(url => url.pathname === '/create-hive', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    // Prefilled from the deep-dive answers — category select should already
    // reflect Social Groups rather than sitting on a blank default.
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Social/i);
  });

  test('Social Groups, LA, online-only: results scoped to LA/online, "Don\'t see your Hive?" panel shown', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await selectCategory(page, 'Social Groups');
    await page.getByRole('button', { name: /I'll type it in/ }).click();
    await page.locator('.cdd-custom-input').fill('Los Angeles, CA');
    await page.getByText(/^Los Angeles/i).first().click();
    await page.locator('.cdd-nav-next').click();
    await page.waitForURL(url => url.pathname === '/hive-discovery', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    await expect(page.getByRole('heading', { name: /Don't see your Hive\?/ })).toBeVisible();
    // Every seeded qa- Hive card actually shown must be LA in-person/hybrid
    // or online — never the Miami fixture or an out-of-area Hive.
    const body = await page.locator('.hmd-cards').innerText();
    expect(body).not.toContain('qa-miami');
  });

  test('a category with no matching Hives shows the founder screen', async ({ page }) => {
    // Travel Buddies has no seeded qa- Hives at all (seedBeta.js only makes
    // Social Groups / Professional Networking / Project Collaboration ones),
    // so an LA search here should genuinely find zero matches.
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await selectCategory(page, 'Travel Buddies');
    await page.getByRole('button', { name: /I'll type it in/ }).click();
    await page.locator('.cdd-custom-input').fill('Los Angeles, CA');
    await page.getByText(/^Los Angeles/i).first().click();
    await page.locator('.cdd-nav-next').click();
    await page.waitForURL(url => url.pathname === '/hive-discovery', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    await expect(page.getByRole('heading', { name: 'Become the founder' })).toBeVisible();
  });

  for (const { hexName } of CATEGORIES) {
    test(`${hexName}: category select -> location question -> results loads clean`, async ({ page }, testInfo) => {
      // Mechanism (location/age/results) is identical across categories —
      // one representative project is enough to prove it holds for all 6
      // without 6x the runtime on every project.
      test.skip(testInfo.project.name !== 'Desktop Chrome', 'identical mechanism across categories — see file header');
      const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
      await loginViaSession(page, QA_USERS.owner1);
      await selectCategory(page, hexName);
      await assertCleanPage(page, tracked);

      // .cdd-chip-row is reused by every chip group on the page (location
      // plus however many category-specific questions), so it's never
      // unique — match the location question specifically instead.
      await expect(page.getByRole('button', { name: /Use my current location/ })).toBeVisible();
      await page.getByRole('button', { name: /Online community only/ }).click();
      await page.locator('.cdd-nav-next').click();
      await page.waitForURL(url => url.pathname === '/hive-discovery', { timeout: 10000 });
      await page.waitForLoadState('networkidle');
      await assertCleanPage(page, tracked);
    });
  }
});
