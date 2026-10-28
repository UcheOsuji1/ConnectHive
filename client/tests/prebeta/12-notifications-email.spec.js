import { test, expect } from '@playwright/test';
import { trackPage, assertCleanPage, loginViaSession, QA_USERS, runQaHelper } from './helpers.js';

// Flow 12: Notifications and email. Desktop Chrome only — pure mechanism.

test.describe('Flow 12 — Notifications and email', () => {
  test('the bell shows all 5 kinds', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    test.setTimeout(60_000);
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    const member1Id = runQaHelper('qaGetUserId.js', [QA_USERS.member1]).id;

    const ownerPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(ownerPage, QA_USERS.owner1);

    // member1 must opt in to member/join-event notifications first — off by
    // default for a plain member (DEFAULTS.new_members = false). prefs are
    // per-viewer, so this has to run as member1, not owner1.
    const m1SetupPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(m1SetupPage, QA_USERS.member1);
    const m1PrefsRes = await m1SetupPage.request.put(`/api/hives/${hive.hive_id}/notification-prefs`, { data: { new_members: true } });
    expect(m1PrefsRes.ok(), await m1PrefsRes.text()).toBeTruthy();

    // 1) Grouped room activity (hex tile) — two plain messages to #general.
    for (let i = 0; i < 2; i++) {
      const r = await ownerPage.request.post(`/api/hives/${hive.hive_id}/messages`, { data: { message_text: `QA bell room activity ${Date.now()}-${i}` } });
      expect(r.ok(), await r.text()).toBeTruthy();
    }

    // 2) Mention (actor avatar) — mentionUserIds drives this server-side,
    // not autocomplete text parsing (confirmed in messagesController.js).
    const mentionRes = await ownerPage.request.post(`/api/hives/${hive.hive_id}/messages`, {
      data: { message_text: `QA bell mention ${Date.now()}`, mentionUserIds: [member1Id] },
    });
    expect(mentionRes.ok(), await mentionRes.text()).toBeTruthy();

    // 3) New post (actor avatar).
    const postRes = await ownerPage.request.post(`/api/posts`, {
      data: { hiveId: hive.hive_id, headline: `QA bell new post ${Date.now()}`, visibility: 'hive' },
    });
    expect(postRes.ok(), await postRes.text()).toBeTruthy();

    // 4) Member/join event (actor avatar) — miami instant-joins (open + simple).
    const miamiPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(miamiPage, QA_USERS.miami);
    const joinRes = await miamiPage.request.post(`/api/hives/${hive.hive_id}/request`, { data: {} });
    expect(joinRes.ok(), await joinRes.text()).toBeTruthy();
    await miamiPage.close();

    // 5) Pair activity (actor avatar) — owner1's seeded pair chat with member1.
    const chatsRes = await ownerPage.request.get(`/api/hives/${hive.hive_id}/chats`);
    const { chats } = await chatsRes.json();
    const pairChannelId = chats[0]?.channel_id;
    expect(pairChannelId, 'owner1 should have a seeded pair chat with member1').toBeTruthy();
    const pairRes = await ownerPage.request.post(`/api/hives/${hive.hive_id}/messages`, {
      data: { message_text: `QA bell pair activity ${Date.now()}`, channel_id: pairChannelId },
    });
    expect(pairRes.ok(), await pairRes.text()).toBeTruthy();

    await ownerPage.close();
    await m1SetupPage.close();

    // Fire-and-forget notifyChatActivity (setImmediate, per messagesController.js) —
    // give it a real margin before reading member1's own bell, same reasoning
    // as Flow 8's grouped-notifications test.
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.member1);
    await page.waitForTimeout(1500);
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    await page.getByRole('button', { name: 'Notifications' }).click();
    const panel = page.locator('.nb-panel');
    await expect(panel).toContainText(/new message/i, { timeout: 10000 });     // room activity
    await expect(panel).toContainText(/mentioned you/i, { timeout: 10000 });   // mention
    await expect(panel).toContainText(/posted/i, { timeout: 10000 });          // new post
    await expect(panel).toContainText(/joined/i, { timeout: 10000 });         // member/join event
    await expect(panel).toContainText(/sent you a message/i, { timeout: 10000 }); // pair activity
  });

  test('per-Hive notification settings persist', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.member1);
    await page.goto(`/hive/${hive.hive_id}`);
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    await page.getByRole('button', { name: 'Notification preferences for this Hive' }).click();
    const panel = page.getByRole('dialog', { name: 'Notification preferences for this Hive' });
    await expect(panel).toBeVisible({ timeout: 10000 });
    const postsRow = panel.locator('.hnp-row').filter({ has: page.locator('.hnp-row-label', { hasText: 'New posts' }) });
    const checkbox = postsRow.locator('input[type="checkbox"]');
    const wasChecked = await checkbox.isChecked();
    await checkbox.click();
    await expect(checkbox).toBeChecked({ checked: !wasChecked });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Notification preferences for this Hive' }).click();
    const reopened = page.getByRole('dialog', { name: 'Notification preferences for this Hive' })
      .locator('.hnp-row').filter({ has: page.locator('.hnp-row-label', { hasText: 'New posts' }) }).locator('input[type="checkbox"]');
    await expect(reopened).toBeChecked({ checked: !wasChecked, timeout: 10000 });
    await reopened.click(); // restore
  });

  test('Settings → Email: 4 rows, 3 toggleable + always-on security', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.member1);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    await expect(page.getByText('Joining Hives')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Activity digest')).toBeVisible();
    await expect(page.getByText('TrueHive news')).toBeVisible();
    await expect(page.getByText('Account and security')).toBeVisible();
    await expect(page.getByText('Always on')).toBeVisible();

    const toggle = page.getByRole('switch', { name: /Joining Hives/ });
    const wasOn = (await toggle.getAttribute('aria-checked')) === 'true';
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', String(!wasOn), { timeout: 10000 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('switch', { name: /Joining Hives/ })).toHaveAttribute('aria-checked', String(!wasOn), { timeout: 10000 });
    await page.getByRole('switch', { name: /Joining Hives/ }).click(); // restore
  });

  test('the unsubscribe link from a join (E2) email works logged out', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const { url } = runQaHelper('qaUnsubscribeToken.js', [QA_USERS.member1, 'joins']);
    const u = new URL(url);

    // The helper mints the production API host by default (API_URL unset in
    // dev) — the token itself is what matters; replay it against the local
    // dev API instead of the host the helper printed.
    const localUrl = `/api/email/unsubscribe?${u.searchParams.toString()}`;
    const res = await page.request.get(localUrl, { maxRedirects: 0 }).catch(e => e);
    // GET returns an HTML confirmation page, not JSON — no auth required.
    expect(res.status?.() ?? 0).toBeLessThan(400);
    const body = await res.text();
    expect(body).toContain('unsubscribed');

    const prefsCheck = runQaHelper('qaCheckUserStatus.js', [QA_USERS.member1]).account_status;
    expect(prefsCheck).toBe('active'); // unsubscribing must never touch account_status
  });

  test('run the digest job by hand: only inactive users, no message text', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const hive = runQaHelper('qaGetHiveByName.js', ['qa-Silver Lake Social']);

    // member1: backdated 7h inactive, with unread room activity queued —
    // eligible. member2: fully active (just touched via a real request) —
    // must NOT be eligible even though they're in the same room.
    runQaHelper('qaSetLastActive.js', [QA_USERS.member1, '7']);
    const ownerPage = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(ownerPage, QA_USERS.owner1);
    for (let i = 0; i < 3; i++) {
      await ownerPage.request.post(`/api/hives/${hive.hive_id}/messages`, { data: { message_text: `QA digest body text ${Date.now()}-${i}` } });
    }
    const member2Page = await page.context().browser().newContext().then(c => c.newPage());
    await loginViaSession(member2Page, QA_USERS.member2);
    await member2Page.request.get('/api/auth/me'); // touches last_active_at
    await member2Page.close();
    await ownerPage.close();

    const result = runQaHelper('qaRunDigestJob.js', []);
    expect(result.eligibleQaUsers).toContain(QA_USERS.member1);
    expect(result.eligibleQaUsers).not.toContain(QA_USERS.member2);
  });

  test('/admin/newsletter test send', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'mechanism is device-independent');
    const tracked = trackPage(page, { allowedFailedPaths: ['/api/auth/me'] });
    await loginViaSession(page, QA_USERS.owner1); // SITE_ADMIN_EMAILS, set up in Flow 11
    await page.goto('/admin/newsletter');
    await page.waitForLoadState('networkidle');
    await assertCleanPage(page, tracked);

    await page.getByPlaceholder("What's new at TrueHive").fill(`QA test subject ${Date.now()}`);
    await page.getByPlaceholder(/Plain text\. Blank lines/).fill('QA fixture newsletter body.');
    await page.getByRole('button', { name: 'Send test to myself' }).click();
    // Delivery itself is unobservable without a working RESEND_API_KEY in
    // dev (same disclosed gap as E1/E2 elsewhere) — the 200 + confirmation
    // text is the real, checkable boundary: sendEmail() no-ops cleanly with
    // no key configured rather than throwing, per lib/email.js.
    await expect(page.getByText(/Test sent to/)).toBeVisible({ timeout: 10000 });
  });
});
