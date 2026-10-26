import { test, expect } from '@playwright/test';
import { trackPage, assertCleanPage, loginAs, loginViaSession, QA_USERS, runQaHelper } from './helpers.js';

// Flow 3: profile setup, view own profile, view another member's profile,
// a blocked member's profile is a 404.

function uniqueQaEmail(label) {
  return `qa-signup-${label}-${Date.now()}@qa.truehive.test`;
}

test.describe('Flow 3 — Profile', () => {
  test('finish profile setup end to end', async ({ page }, testInfo) => {
    // Registration has its own real per-IP limiter (5/hour — server/src/
    // routes/auth.js). Flow 2's "email sign-up at 18 works" already does one
    // real registration on every project; this test needs a second fresh
    // signup (no profiles row is what actually routes to /profile-setup) —
    // running that on all 3 projects too pushes a full-suite run to 6
    // registrations and trips the limiter (confirmed directly). The wizard
    // form itself doesn't vary by device, so this runs once.
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'registration-rate-limit budget — see comment above');
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    const email = uniqueQaEmail('profile');

    // A fresh signup has no profiles row yet, which is what actually routes
    // to the first-time /profile-setup wizard (an existing profile row —
    // even an incomplete one like qa-unfinished's — redirects away from it;
    // hasProfile is row-existence, not completeness).
    await page.goto('/signup');
    const eighteen = new Date();
    eighteen.setFullYear(eighteen.getFullYear() - 19);
    await page.locator('#su-email').fill(email);
    await page.locator('#su-pw').fill('TestPass123!');
    await page.locator('#su-dob').fill(eighteen.toISOString().split('T')[0]);
    await page.locator('#su-agree').check();
    await page.getByRole('button', { name: /Create Account/ }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/signup'), { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname).toBe('/profile-setup');

    // Only one step's section is ever mounted at a time (show(n) gates on
    // step === n), so a page-level "Continue" locator is unambiguous — and
    // robust against the Location field's autocomplete dropdown, which can
    // still be open (and intercepting/re-rendering around a click) right
    // after fill() if it isn't explicitly dismissed first.
    async function clickContinue(name = /Continue/) {
      await page.getByRole('button', { name }).click();
    }

    // Step 1 — About you
    const s1 = page.locator('#ps-s1');
    await s1.getByPlaceholder('Jordan').fill('QA');
    await s1.getByPlaceholder('Blake').fill('Tester');
    await s1.getByPlaceholder('24').fill('27');
    await s1.getByPlaceholder('Los Angeles, CA').fill('Los Angeles, CA');
    await page.keyboard.press('Escape'); // dismiss the location autocomplete dropdown
    await s1.getByPlaceholder(/I'm a CS student/).fill('QA fixture bio for Flow 3.');
    await clickContinue();
    await expect(page.locator('#ps-s2')).toBeVisible();

    // Steps 2-5 (purpose, interests, skills, vibe) are all optional chip/card
    // selections plus, on step 5, a slider — goNext has no client-side
    // validation (confirmed by reading the code) and the server doesn't
    // require any of them either, so Continue alone is enough to prove the
    // wizard's navigation works end to end without risking an accidental
    // click landing on the slider or some other control that doesn't behave
    // like a simple toggle.
    for (const [fromId, toId] of [['#ps-s2', '#ps-s3'], ['#ps-s3', '#ps-s4'], ['#ps-s4', '#ps-s5'], ['#ps-s5', '#ps-s6']]) {
      await expect(page.locator(fromId)).toBeVisible();
      await clickContinue();
      await expect(page.locator(toId)).toBeVisible();
    }

    // Step 6 — final section. "Find My Hive" saves and advances to a step-7
    // celebration screen (still on /profile-setup — setStep(7), no
    // navigation), which only then links onward.
    await clickContinue(/Find My Hive/);
    await page.getByRole('link', { name: /ENTER THE HIVE/ }).click();
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    expect(new URL(page.url()).pathname).not.toBe('/profile-setup');
  });

  test('view your own profile', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    const body = await page.locator('body').innerText();
    expect(body).toContain('Maya Sutton');
  });

  test('view another member\'s profile', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    const { id: otherId } = runQaHelper('qaGetUserId.js', [QA_USERS.member1]);
    await page.goto(`/profile/${otherId}`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    const body = await page.locator('body').innerText();
    expect(body).toContain('Lena Fischer');
  });

  test('a blocked member\'s profile is a 404', async ({ page }) => {
    const { id: blockedId } = runQaHelper('qaGetUserId.js', [QA_USERS.member2]);
    // The whole point of this test is that every /api/users/:blockedId/*
    // lookup 404s once blocked — that's the expected, correct response.
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me', `/api/users/${blockedId}`] });
    await loginViaSession(page, QA_USERS.owner1);

    const blockRes = await page.request.post(`/api/blocks/${blockedId}`, { data: {} });
    expect(blockRes.ok()).toBeTruthy();
    try {
      await page.goto(`/profile/${blockedId}`);
      await page.waitForLoadState('networkidle');
      await assertCleanPage(page, tracked);
      const body = await page.locator('body').innerText();
      expect(body.toLowerCase()).toMatch(/not found|404|doesn't exist|does not exist/);
    } finally {
      await page.request.delete(`/api/blocks/${blockedId}`);
    }
  });
});
