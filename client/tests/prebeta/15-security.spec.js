import { test, expect } from '@playwright/test';
import { trackPage, assertCleanPage, loginViaSession, QA_USERS, runQaHelper } from './helpers.js';

// Flow 15: Security spot checks. Desktop Chrome only — pure mechanism.

test.describe('Flow 15 — Security spot checks', () => {
  test('a non-member calling 10 member-only endpoints gets refused', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Downtown LA Builders']); // owner2; miami is not a member
    await loginViaSession(page, QA_USERS.miami);

    const checks = [
      ['GET',  `/api/hives/${hive.hive_id}/messages`],
      ['POST', `/api/hives/${hive.hive_id}/messages`, { message_text: 'QA xss probe' }],
      ['GET',  `/api/hives/${hive.hive_id}/plan-rules`],
      ['GET',  `/api/hives/${hive.hive_id}/tools`],
      ['GET',  `/api/hives/${hive.hive_id}/posts`],
      ['GET',  `/api/hives/${hive.hive_id}/reports`],
      ['GET',  `/api/hives/${hive.hive_id}/notification-prefs`],
      ['GET',  `/api/hives/${hive.hive_id}/plans`],
      ['POST', `/api/hives/${hive.hive_id}/plan-suggestions/00000000-0000-0000-0000-000000000000/vote`, { vote: 'yes' }],
      ['POST', `/api/hives/${hive.hive_id}/plans/00000000-0000-0000-0000-000000000000/checkin`],
    ];

    for (const [method, path, data] of checks) {
      const res = method === 'GET'
        ? await page.request.get(path)
        : await page.request.post(path, data ? { data } : {});
      expect([403, 404], `${method} ${path} -> ${res.status()}`).toContain(res.status());
    }
  });

  test('cross-Hive access: a real member of one Hive is refused on another', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const downtown = runQaHelper('qaGetHiveByName.js', ['qa-Downtown LA Builders']);
    // member1 is a real, active member of Silver Lake Social — but not of
    // Downtown LA Builders. Per-Hive membership must not read as "any
    // membership anywhere."
    await loginViaSession(page, QA_USERS.member1);
    const res = await page.request.get(`/api/hives/${downtown.hive_id}/messages`);
    expect([403, 404]).toContain(res.status());
  });

  test('an XSS payload renders as text everywhere it can be typed', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    const payload = `<script>window.__xss_fired=true</script>QA xss ${Date.now()}`;

    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1);

    // Chat message.
    await page.goto(`/hive/${hive.hive_id}/chat`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[aria-label="Message input"]');
    await page.getByLabel('Message input').fill(payload);
    await page.getByLabel('Send message').click();
    await expect(page.getByRole('log', { name: 'Chat messages' }).getByText(payload)).toBeVisible({ timeout: 10000 });

    // Post headline.
    await page.goto(`/hive/${hive.hive_id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Post an update/ }).click();
    await page.getByPlaceholder(/What.s happening in your Hive/).fill(payload);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText(payload)).toBeVisible({ timeout: 10000 });

    await assertCleanPage(page, tracked); // also re-checks for console errors across both
    const fired = await page.evaluate(() => window.__xss_fired === true);
    expect(fired, 'the payload must never execute as script').toBe(false);
    const scriptTags = await page.locator('script', { hasText: '__xss_fired' }).count();
    expect(scriptTags, 'no live <script> element should carry the payload').toBe(0);
  });

  test('.html and .svg attachments are refused or served inertly', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    // A 4xx from Cloudinary's own upload endpoint here IS the expected,
    // desired outcome for a refused upload — not an unexpected app bug.
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me', 'cloudinary.com'] });
    await loginViaSession(page, QA_USERS.owner1);
    await page.goto(`/hive/${hive.hive_id}/chat`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[aria-label="Message input"]');

    const fs = (await import('fs')).default;
    const os = (await import('os')).default;
    const path = (await import('path')).default;

    for (const [ext, body] of [
      ['html', '<html><body><script>window.__inline_xss=true</script>hi</body></html>'],
      ['svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__inline_xss=true</script></svg>'],
    ]) {
      const file = path.join(os.tmpdir(), `qa-attack-${Date.now()}.${ext}`);
      fs.writeFileSync(file, body);
      await page.setInputFiles('input.hc-file-input:not([accept])', file);

      // Either the upload itself is refused (stays 'error'/never reaches
      // 'done', so Send stays disabled and nothing to follow up on), or it
      // succeeds and produces a URL — only the second case needs the
      // inert-delivery check.
      const doneChip = page.locator('.hc-staged-chip--done');
      const errorChip = page.locator('.hc-staged-chip--error');
      await expect(doneChip.or(errorChip)).toBeVisible({ timeout: 20000 });

      if (await doneChip.count()) {
        await page.getByLabel('Send message').click();
        const link = page.locator('.hc-att-file-card, a[href*=".' + ext + '"]').last();
        await expect(link).toBeVisible({ timeout: 10000 });
        const href = await link.getAttribute('href');
        expect(href, `uploaded .${ext} should have a real delivery URL`).toBeTruthy();

        const fetched = await page.request.get(href);
        const contentType = fetched.headers()['content-type'] ?? '';
        const disposition = fetched.headers()['content-disposition'] ?? '';
        const servedAsLiveMarkup = /text\/html|image\/svg\+xml/i.test(contentType) && !/attachment/i.test(disposition);
        expect(servedAsLiveMarkup, `.${ext} must not be delivered as live, inline-rendered ${contentType}`).toBe(false);
      } else {
        const errMsg = await page.locator('.hc-staged-chip--error').getAttribute('title');
        test.info().annotations.push({ type: `${ext}-upload-refused`, description: errMsg ?? '(no message)' });
      }
      fs.unlinkSync(file);
      // Clear the composer between attempts regardless of which branch ran.
      await page.getByLabel('Message input').fill('');
    }
    await assertCleanPage(page, tracked);
  });

  test('rate limits trigger (login, 10/15min per IP)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'already exercised on Flow 2/5/11 — this is the dedicated spot check Prompt 74 asks for here');
    // Deliberately wrong password against a real password-based account
    // (not the Google-only fixture, which would 400 for an unrelated
    // reason), same IP — never a real credential, so this can't succeed
    // and accidentally consume a login.
    let sawRefusal = false;
    for (let i = 0; i < 12 && !sawRefusal; i++) {
      const res = await page.request.post('/api/auth/login', {
        data: { email: QA_USERS.unfinished, password: 'definitely-wrong' },
      });
      if (res.status() === 429) { sawRefusal = true; break; }
      expect(res.status(), `attempt ${i + 1} should be a credential failure, not something else`).toBe(401);
    }
    expect(sawRefusal, 'the login endpoint should rate-limit repeated attempts').toBe(true);
  });
});
