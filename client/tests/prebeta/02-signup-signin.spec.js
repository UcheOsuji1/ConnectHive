import { test, expect } from '@playwright/test';
import { trackPage, assertCleanPage, loginAs, QA_USERS, QA_PASSWORD, runQaHelper } from './helpers.js';

// Flow 2: sign up and sign in.
//
// The login endpoint is rate-limited to 10 attempts/15min per IP in
// production code that must stay as-is (server/src/routes/auth.js). This
// flow's job is specifically to exercise the real login mechanism (signup
// age gate, verify, forgot/reset, suspended, pending_deletion) — 6 real
// logins' worth — which already uses most of that budget on its own. Running
// the full sequence identically on all 3 projects (18 logins) trips the
// limiter every time, confirmed by hitting it directly during this flow's
// own development. The backend logic under test doesn't vary by device, so
// the full sequence runs once (Desktop Chrome); a separate lightweight test
// below does one real login on every project (including iPhone 13, called
// out as where the real login bug hid before) to still catch device-specific
// rendering/JS issues in the login form itself. Net: 9 logins per full run.
//
// Google sign-in "mocked at the network boundary" is NOT covered here —
// googleCallback (server/src/controllers/authController.js) exchanges the
// code and verifies the ID token server-side via google-auth-library's
// OAuth2Client, making outbound HTTPS calls straight from the Node process.
// Playwright's page.route() only intercepts the browser's own requests, so
// it can't reach that call; faithfully mocking it would mean either adding
// an injectable OAuth client to production code for testability, or forging
// an RS256-signed ID token against a fake JWKS endpoint — both disproportionate
// to one bullet in a 15-flow sweep. Reported, not silently skipped: this needs
// either a dedicated follow-up or stays a human-verified flow (the Finish
// report's "real Google sign-in on the live site" item already covers it).

function uniqueQaEmail(label) {
  return `qa-signup-${label}-${Date.now()}@qa.truehive.test`;
}

test.describe('Flow 2 — Sign up and sign in', () => {
  test('email sign-up at 17 is refused', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me', '/api/auth/register'] });
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    const seventeenYearsAgo = new Date();
    seventeenYearsAgo.setFullYear(seventeenYearsAgo.getFullYear() - 17);
    const dob = seventeenYearsAgo.toISOString().split('T')[0];

    await page.locator('#su-email').fill(uniqueQaEmail('age17'));
    await page.locator('#su-pw').fill('TestPass123!');
    await page.locator('#su-dob').evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, dob).catch(async () => {
      await page.locator('#su-dob').fill(dob);
    });
    await page.locator('#su-agree').check();
    await page.getByRole('button', { name: /Create Account/ }).click();

    await expect(page.getByText(/at least 18 years old/i)).toBeVisible();
    expect(page.url()).toContain('/signup');
    await assertCleanPage(page, tracked);
  });

  test('email sign-up at 18 works and lands past signup', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    const email = uniqueQaEmail('age18');
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    const eighteenYearsAgoMinus1Day = new Date();
    eighteenYearsAgoMinus1Day.setFullYear(eighteenYearsAgoMinus1Day.getFullYear() - 18);
    eighteenYearsAgoMinus1Day.setDate(eighteenYearsAgoMinus1Day.getDate() - 1);
    const dob = eighteenYearsAgoMinus1Day.toISOString().split('T')[0];

    await page.locator('#su-email').fill(email);
    await page.locator('#su-pw').fill('TestPass123!');
    await page.locator('#su-dob').fill(dob);

    // S2: the news opt-in box must be unticked by default.
    await expect(page.locator('#su-news')).not.toBeChecked();

    await page.locator('#su-agree').check();
    await page.getByRole('button', { name: /Create Account/ }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/signup'), { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
  });

  test('a basic real login works (every project, including WebKit)', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginAs(page, QA_USERS.member1);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    expect(new URL(page.url()).pathname.startsWith('/login')).toBe(false);
  });

  test('verify-email strip appears, its link verifies, and it disappears', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'login-rate-limit budget — see file header');
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginAs(page, QA_USERS.member2); // seeded unverified
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.verify-strip')).toBeVisible();
    await expect(page.locator('.verify-strip')).toContainText(QA_USERS.member2);

    const { token } = runQaHelper('qaIssueToken.js', [QA_USERS.member2, 'email_verification']);
    await page.goto(`/verify-email?token=${token}`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    await expect(page.getByText(/verified/i)).toBeVisible();

    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.verify-strip')).toHaveCount(0);

    // member2 is now permanently verified for the rest of this run — the
    // Finish step's full re-seed (which recreates it unverified) is what
    // makes this test re-runnable from scratch, not anything done here.
  });

  test('log out, log in, forgot password, reset, log in', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'login-rate-limit budget — see file header');
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginAs(page, QA_USERS.member1);
    await page.waitForLoadState('networkidle');

    await page.goto('/settings');
    await page.getByRole('button', { name: /log out/i }).click();
    await page.waitForURL(url => url.pathname === '/login' || url.pathname === '/', { timeout: 10000 });

    await loginAs(page, QA_USERS.member1);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    // Forgot -> reset -> log in with the new password.
    await page.goto('/forgot-password');
    await page.locator('#fp-email').fill(QA_USERS.member1);
    await page.getByRole('button', { name: /Send reset link/ }).click();
    await expect(page.getByText(/reset link has been sent/i)).toBeVisible();

    const { token } = runQaHelper('qaIssueToken.js', [QA_USERS.member1, 'password_reset']);
    const newPassword = 'NewQaPass2026!';
    await page.goto(`/reset-password?token=${token}`);
    await page.locator('#rp-pw').fill(newPassword);
    await page.locator('#rp-confirm').fill(newPassword);
    await page.getByRole('button', { name: /Set new password/i }).click();
    await expect(page.getByText(/password updated/i)).toBeVisible();
    await page.waitForURL(url => url.pathname === '/login', { timeout: 10000 });

    await page.locator('#signin-email').fill(QA_USERS.member1);
    await page.locator('#signin-pw').fill(newPassword);
    await page.getByRole('button', { name: /Sign In to TrueHive|Signing in/ }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15000 });

    // Restore the fixture's original password for other flows/re-runs.
    await page.goto('/forgot-password');
    const { token: restoreToken } = runQaHelper('qaIssueToken.js', [QA_USERS.member1, 'password_reset']);
    await page.goto(`/reset-password?token=${restoreToken}`);
    await page.locator('#rp-pw').fill(QA_PASSWORD);
    await page.locator('#rp-confirm').fill(QA_PASSWORD);
    await page.getByRole('button', { name: /Set new password/i }).click();
    await expect(page.getByText(/password updated/i)).toBeVisible();
  });

  test('a suspended account is refused at login with the right message', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'login-rate-limit budget — see file header');
    runQaHelper('qaSetUserStatus.js', [QA_USERS.unfinished, 'suspended']);
    try {
      await page.goto('/login');
      await page.locator('#signin-email').fill(QA_USERS.unfinished);
      await page.locator('#signin-pw').fill(QA_PASSWORD);
      await page.getByRole('button', { name: /Sign In to TrueHive|Signing in/ }).click();
      await expect(page.getByText(/account is suspended/i)).toBeVisible();
      expect(page.url()).toContain('/login');
    } finally {
      runQaHelper('qaSetUserStatus.js', [QA_USERS.unfinished, 'active']);
    }
  });

  test('a pending_deletion login restores the account', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'login-rate-limit budget — see file header');
    runQaHelper('qaSetUserStatus.js', [QA_USERS.unfinished, 'pending_deletion']);
    await page.goto('/login');
    await page.locator('#signin-email').fill(QA_USERS.unfinished);
    await page.locator('#signin-pw').fill(QA_PASSWORD);
    await page.getByRole('button', { name: /Sign In to TrueHive|Signing in/ }).click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15000 });

    const status = runQaHelper('qaCheckUserStatus.js', [QA_USERS.unfinished]);
    expect(status.account_status).toBe('active');
  });
});
