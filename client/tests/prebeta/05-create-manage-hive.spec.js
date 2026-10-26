import { test, expect } from '@playwright/test';
import { trackPage, assertCleanPage, loginViaSession, QA_USERS, runQaHelper } from './helpers.js';

// Flow 5: create and manage a Hive.

function uniqueHiveName(label) {
  return `qa-Flow5 ${label} ${Date.now()}`;
}

test.describe('Flow 5 — Create and manage a Hive', () => {
  test('create a Hive and its metro area is set', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'one real Hive-creation pass is enough — mechanism is device-independent');
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner3);
    const hiveName = uniqueHiveName('Metro');

    await page.goto('/create-hive');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('e.g. LA Startup Builders').fill(hiveName);
    await page.getByText('Social Groups', { exact: true }).click();
    await page.getByPlaceholder(/What is this Hive about/).fill('QA fixture — Flow 5 metro-area check.');
    await page.getByText('In-person', { exact: true }).click();
    await page.locator('#create-hive-location').fill('Los Angeles, CA');
    await page.getByText(/^Los Angeles, CA/).first().click();

    await page.getByRole('button', { name: /Launch Hive/ }).click();
    await page.waitForURL(url => /^\/hive\//.test(url.pathname), { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    const hive = runQaHelper('qaGetHiveByName.js', [hiveName]);
    expect(hive.metro_key).toBe('los-angeles');
  });

  test('Manage Hive -> General: max-members limits enforced', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1); // owns qa-Silver Lake Social (3 active members)
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);

    await page.goto(`/hive/${hive.hive_id}/settings`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    const field = page.locator('.hw-settings-field', { hasText: 'Max members' });
    const input = field.locator('input');
    // Two "Save changes" buttons exist on this page (General + another
    // section) — scope to the one inside the General settings <form>.
    const saveBtn = page.locator('form').getByRole('button', { name: 'Save changes' });

    await input.fill('1');
    await expect(page.getByText('Max members must be between 2 and 100.')).toBeVisible();
    await expect(saveBtn).toBeDisabled();

    await input.fill('101');
    await expect(page.getByText('Max members must be between 2 and 100.')).toBeVisible();
    await expect(saveBtn).toBeDisabled();

    // Silver Lake Social was seeded with owner1 + member1 + member2 = 3 active.
    await input.fill('2');
    await expect(page.getByText(/already has \d+ members/)).toBeVisible();
    await expect(saveBtn).toBeDisabled();

    await input.fill('');
    await expect(page.getByText('Leave empty for no limit.')).toBeVisible();
    await expect(saveBtn).toBeEnabled();
  });

  test('onboarding builder loads for a Hive with it turned on', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner2); // owns qa-Downtown LA Builders (onboarding: guided)
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Downtown LA Builders']);

    await page.goto(`/hive/${hive.hive_id}/onboarding`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    await expect(page.getByRole('heading', { name: 'Member Onboarding' })).toBeVisible();
  });

  test('Hive Tools: turning one off returns 404 and it disappears from the hub', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me', '/api/hives/'] });
    await loginViaSession(page, QA_USERS.owner4); // owns qa-Every Tool Hive (all 13 on)
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Every Tool Hive']);

    await page.goto(`/hive/${hive.hive_id}/tools`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    await expect(page.getByText('Hive docs')).toBeVisible();

    await page.goto(`/hive/${hive.hive_id}/manage-tools`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('switch', { name: /Turn off Hive docs/ }).click();
    await expect(page.getByRole('switch', { name: /Turn on Hive docs/ })).toBeVisible();

    try {
      await page.goto(`/hive/${hive.hive_id}/tools`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Hive docs')).toHaveCount(0);

      const apiRes = await page.request.get(`/api/hives/${hive.hive_id}/docs`);
      expect(apiRes.status()).toBe(404);
    } finally {
      await page.goto(`/hive/${hive.hive_id}/manage-tools`);
      await page.waitForLoadState('networkidle');
      const onBtn = page.getByRole('switch', { name: /Turn on Hive docs/ });
      if (await onBtn.count()) await onBtn.click();
    }
  });

  test('appearance page loads clean', async ({ page }) => {
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);

    await page.goto(`/hive/${hive.hive_id}/appearance`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
  });

  test('Delete Hive -> restore', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'one real create+delete+restore pass is enough');
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner3);
    const hiveName = uniqueHiveName('DeleteRestore');

    // Create a disposable Hive to delete, rather than risking one of the
    // seeded fixtures other flows/re-runs depend on.
    await page.goto('/create-hive');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('e.g. LA Startup Builders').fill(hiveName);
    await page.getByText('Social Groups', { exact: true }).click();
    await page.getByPlaceholder(/What is this Hive about/).fill('QA fixture — Flow 5 delete/restore check.');
    await page.getByText('Online', { exact: true }).click();
    await page.getByRole('button', { name: /Launch Hive/ }).click();
    await page.waitForURL(url => /^\/hive\//.test(url.pathname), { timeout: 15000 });
    const hiveId = page.url().match(/\/hive\/([^/]+)/)[1];

    await page.goto(`/hive/${hiveId}/settings`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Delete Hive' }).click();
    await page.getByPlaceholder(hiveName).fill(hiveName);
    await page.getByRole('button', { name: 'Delete Hive' }).click();
    await page.waitForURL(url => !url.pathname.includes(`/hive/${hiveId}`), { timeout: 10000 });

    await page.goto('/my-hive');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);
    const restoreBtn = page.getByRole('button', { name: /Restore/ }).first();
    await expect(restoreBtn).toBeVisible();
    await restoreBtn.click();
    await expect(page.getByText(hiveName)).toBeVisible();

    const hive = runQaHelper('qaGetHiveByName.js', [hiveName]);
    expect(hive.hive_id).toBe(hiveId);
  });
});
