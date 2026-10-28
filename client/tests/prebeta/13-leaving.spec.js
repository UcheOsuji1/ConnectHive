import { test, expect } from '@playwright/test';
import { trackPage, assertCleanPage, loginViaSession, loginAs, QA_USERS, QA_PASSWORD, runQaHelper } from './helpers.js';

// Flow 13: Leaving — delete account with blockers shown, confirm, /goodbye,
// log back in to cancel; the purge job on a past-dated qa- user shows
// "Deleted member". Desktop Chrome only — pure mechanism.

test.describe('Flow 13 — Leaving', () => {
  test('a sole owner with other active members sees the real blocker', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    // owner2 owns qa-Downtown LA Builders, which also has owner3 as an
    // active admin — exactly the shape _ownershipBlockers() flags (any
    // other active member, any role). Cancel out, not actually deleted —
    // other flows still need owner2 and Downtown LA Builders intact.
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner2);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText(/other active members/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/qa-Downtown LA Builders/)).toBeVisible();
    // No Cancel button renders in the blocker state itself (per
    // DeleteAccountRow.jsx — only the no-blockers branch has one); closing
    // the panel just means not re-opening it.
  });

  test('delete account: confirm, /goodbye, then log back in to cancel', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    test.setTimeout(60_000);
    // "unfinished" owns no Hive — no ownership blocker, a clean path
    // straight to the reauth step.
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.unfinished);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    // loginViaSession mints a token directly, never touching last_login —
    // _isLoginFresh(NULL) is false, so reauth is always required here.
    await expect(page.getByText('Confirm your password to continue.')).toBeVisible({ timeout: 10000 });
    await page.locator('.acct-delete-password').fill(QA_PASSWORD);
    await page.getByRole('button', { name: 'Delete My Account' }).click();

    await page.waitForURL('**/goodbye', { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Your account is scheduled for deletion' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/permanently deleted/i)).toBeVisible();

    const statusAfterDelete = runQaHelper('qaCheckUserStatus.js', [QA_USERS.unfinished]);
    expect(statusAfterDelete.account_status).toBe('pending_deletion');

    // Logging back in through the real form cancels it — same mechanism
    // Flow 2 already proved; here it's exercised from the deletion side.
    await page.getByRole('link', { name: 'Log back in' }).click();
    await page.waitForURL('**/login', { timeout: 10000 });
    await loginAs(page, QA_USERS.unfinished);

    const statusAfterLogin = runQaHelper('qaCheckUserStatus.js', [QA_USERS.unfinished]);
    expect(statusAfterLogin.account_status).toBe('active');
  });

  test('the purge job on a past-dated qa- user shows "Deleted member"', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    // member2 (Jamal Price) already authored a seeded chat message here —
    // real content to watch flip to "Deleted member" after purge, not a
    // fixture built just for this assertion.
    runQaHelper('qaScheduleDeletionPast.js', [QA_USERS.member2]);

    const result = runQaHelper('qaRunPurgeJob.js', []);
    expect(result.usersPurged).toBeGreaterThanOrEqual(1);

    // Purging rewrites the user's own email (to deleted-<uuid>@...), so
    // this account no longer matches any qa- helper's email lookup from
    // here on — expected, not a bug: it's the same one-way anonymisation
    // a real deletion does. seedBeta.js's own cleanup also won't find it
    // by the old qa- email on the next re-seed, same reason.
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    await page.goto(`/hive/${hive.hive_id}/chat`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    await expect(page.getByText('Same! Looking forward to the Saturday meetup.')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.hc-msg-row', { hasText: 'Same! Looking forward to the Saturday meetup.' }))
      .toContainText('Deleted member', { timeout: 10000 });
  });
});
