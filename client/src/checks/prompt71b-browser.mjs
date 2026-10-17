// Run with Vite serving this checkout on 127.0.0.1:5173. All API calls are mocked.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = join(tmpdir(), 'truehive-prompt71b');
await mkdir(dir, { recursive: true });
const browser = await chromium.launch();
let checks = 0;
const shots = [], captured = [];
const check = (ok, label) => { assert.ok(ok, label); checks++; console.log(`PASS ${label}`); };
const la = { metro_key: 'los-angeles', name: 'Los Angeles area', lat: 34.0522, lng: -118.2437 };
const places = [
  { display_name: 'Santa Monica', state_code: 'CA', metro_key: la.metro_key, metro_name: la.name },
  { display_name: 'Silver Lake', state_code: 'CA', metro_key: la.metro_key, metro_name: la.name },
  { display_name: la.name, state_code: null, metro_key: la.metro_key, metro_name: la.name, kind: 'metro' },
];
const fixtureHive = { hive_id: 'fixture', hive_name: 'Location Fixture Hive', category_name: 'Social Groups', my_role: 'owner', location: 'Santa Monica, CA', metro_key: la.metro_key, location_type: 'hybrid', welcome_seen_at: '2026-10-17', onboarding_status: 'completed', max_members: 10, member_count: 1 };
const fixtureProfile = { full_name: 'Jordan Fixture', age: 28, location: 'Santa Monica, CA', bio: 'Existing bio stays', school_company: 'Existing school stays', interests: ['Art'], skills: ['Design'], goals: ['growth'], availability: ['Weekends'], social_preferences: {} };
async function screenshot(page, name) { const file = join(dir, `${name}.png`); await page.screenshot({ path: file }); shots.push(file); }
try {
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', recordVideo: { dir, size: { width, height: 900 } } });
    let profile = { ...fixtureProfile }, hive = { ...fixtureHive }, hasProfile = true;
    const bodies = [], errors = [];
    await ctx.route('**/socket.io/**', route => route.abort());
    await ctx.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url());
      const body = req.postDataJSON();
      captured.push({ path: url.pathname + url.search, method: req.method(), body });
      let data = {};
      if (url.pathname === '/api/auth/me') data = { user: { userId: 'viewer', fullName: 'Jordan Fixture', hasProfile, hasActiveHive: true, emailVerified: true } };
      else if (url.pathname === '/api/metros') data = [la];
      else if (url.pathname === '/api/metros/places') {
        const q = url.searchParams.get('q').toLowerCase();
        if (q === 'error') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Fixture failure"}' });
        if (q === 'slow') { await new Promise(r => setTimeout(r, 600)); data = [{ ...places[0], display_name: 'Stale Town' }]; }
        else if (q === 'long') data = [{ ...places[0], display_name: 'A Very Long Recognized Neighborhood Name With Many Words' }];
        else data = places.filter(p => p.display_name.toLowerCase().startsWith(q.split(',')[0]));
      }
      else if (url.pathname === '/api/hives/filter-facets') data = { locations: [], categoryCounts: { 'Social Groups': 2 }, connectionOptions: ['online', 'in-person', 'hybrid'].map(value => ({ value, count: 2 })), sizeOptions: [{ value: 'small', count: 2 }], cadenceOptions: [{ value: 'weekly', count: 2 }] };
      else if (url.pathname === '/api/hives/suggestions') data = { hives: [] };
      else if (url.pathname === '/api/users/profile') data = { profile };
      else if (url.pathname === '/api/users/profile/setup') { bodies.push(body); profile = { ...profile, ...body }; data = { profile }; }
      else if (url.pathname === '/api/hives/match') { bodies.push(body); data = { hives: [], area: la, isLaunchArea: true, waitingCount: 0 }; }
      else if (url.pathname === '/api/hives' && req.method() === 'POST') { bodies.push(body); data = { id: 'fixture' }; }
      else if (url.pathname === '/api/hives/fixture') {
        if (req.method() === 'PATCH') { bodies.push(body); hive = { ...hive, ...body }; }
        data = { hive };
      }
      else if (url.pathname.endsWith('/tools')) data = { tools: ['itinerary', 'opportunities', 'rides'].map(key => ({ key, enabled: true, scope: key === 'rides' ? 'both' : 'hive', settings: { editors: 'members' } })) };
      else if (url.pathname.endsWith('/plan-rules')) data = { plan_proposers: 'owners', plan_approval: 'owner', vote_min_yes: 3, vote_window_hours: 48, suggestions_per_day: 3 };
      else if (url.pathname.endsWith('/plans/p1')) data = { plan: { post_id: 'p1', hive_id: 'fixture', headline: 'A physical activity', event_at: '2026-11-01T18:00:00Z', event_location: 'Meet at the north gate', viewer_rsvp: 'going' } };
      else if (url.pathname.endsWith('/rides/board')) data = { offers: [], requests: [] };
      else if (url.pathname === '/api/events/p1/attendees') data = { going: [], maybe: [], not_going: [], outside: { going: 0, maybe: 0, not_going: 0 } };
      else if (url.pathname.includes('/notifications')) data = { notifications: [], unread_count: 0 };
      else data = { tools: [], members: [], groups: [], trips: [], plans: [], opportunities: [], requests: [], offers: [], counts: {}, items: [] };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    async function open(path, state = {}) {
      await page.goto(`${process.env.P71_BASE_URL || "http://127.0.0.1:5173"}${path}`);
      await page.evaluate(s => history.replaceState({ ...history.state, usr: s }, ''), state);
      await page.reload();
    }
    async function choose(input, q, name) {
      await input.fill(q);
      const option = page.getByRole('option', { name });
      await option.waitFor();
      await option.click();
    }
    await open('/find-your-hive');
    if (width < 760) await page.getByRole('button', { name: /^Refine/ }).click();
    const refine = page.getByRole('combobox', { name: 'Location' }).filter({ visible: true });
    await refine.fill('Santa');
    await page.getByRole('option', { name: /Santa Monica/ }).waitFor();
    await screenshot(page, `refine-${width}`);
    await refine.press('ArrowDown');
    await refine.press('Enter');
    await expect(refine).toHaveValue('Santa Monica, CA');
    await expect(refine).toHaveAttribute('aria-expanded', 'false');
    check(await refine.evaluate(e => document.activeElement === e), `keyboard selection retains focus at ${width}`);
    await page.waitForTimeout(300);
    check(captured.some(r => r.path.includes('filter-facets?') && r.path.includes('metro_key=los-angeles')), `Refine sends metro to real filter API at ${width}`);
    const inPerson = page.locator('.fo').filter({ hasText: 'In-person' }).filter({ visible: true });
    await inPerson.locator('input').check();
    const hex = page.locator('.hexout').filter({ hasText: 'Social Groups' }).filter({ visible: true });
    await hex.click();
    await page.getByRole('button', { name: 'FIND MY HIVE →', exact: true }).click();
    const deepInput = page.getByRole('combobox', { name: 'Location' });
    await expect(deepInput).toHaveValue('Santa Monica, CA');
    await page.locator('.cdd-nav-next').click();
    await page.locator('.hd-founder-stage').waitFor();
    check(bodies.at(-1).searchMetroKey === 'los-angeles' && bodies.at(-1).refineFilters.connection.includes('in-person'), `Refine survives category/deep-dive/matching at ${width}`);
    await open('/find-your-hive');
    if (width < 760) await page.getByRole('button', { name: /^Refine/ }).click();
    const area = page.getByRole('combobox', { name: 'Location' }).filter({ visible: true });
    await choose(area, 'Silver', /Silver Lake/);
    await page.getByRole('button', { name: 'Anywhere · Clear location' }).filter({ visible: true }).click();
    await expect(area).toHaveValue('');
    check(true, `Anywhere clears selected area at ${width}`);
    await area.fill('slow'); await page.waitForTimeout(250);
    await area.fill('Silver'); await page.getByRole('option', { name: /Silver Lake/ }).waitFor(); await page.waitForTimeout(500);
    check(await page.getByRole('option', { name: /Stale Town/ }).count() === 0, `late response never replaces newer suggestions at ${width}`);
    await area.press('Escape'); await expect(area).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(150); check(await page.getByRole('listbox').count() === 0, `Escape closes dropdown at ${width}`);
    await area.fill('zzzz'); await page.getByText('No recognized locations. You can keep your typed location.').waitFor();
    await expect(area).toHaveValue('zzzz'); check(true, `empty results preserve manual value at ${width}`);
    await area.fill('error'); await page.getByText('Suggestions unavailable. You can still type your city.').waitFor();
    await expect(area).toHaveValue('error'); check(true, `API failure leaves manual input usable at ${width}`);
    await area.fill('long'); await page.getByRole('option', { name: /A Very Long/ }).waitFor();
    const bounds = await page.locator('.area-location-popup').evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, top: r.top, width: innerWidth, height: innerHeight }; });
    check(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height, `long suggestion popup stays in viewport at ${width}`);
    check(await page.locator('.area-location-popup').evaluate(el => getComputedStyle(el).animationName) === 'none', `reduced motion disables popup animation at ${width}`);
    await screenshot(page, `long-dropdown-${width}`);
    hasProfile = false;
    await open('/profile-setup');
    const setupInput = page.getByRole('combobox', { name: 'Location' });
    await choose(setupInput, 'Santa', /Santa Monica/);
    await expect(setupInput).toHaveValue('Santa Monica, CA');
    await setupInput.fill('Silver'); await page.getByRole('option', { name: /Silver Lake/ }).waitFor();
    await screenshot(page, `profile-setup-${width}`);
    check(true, `profile setup uses shared city/state suggestions at ${width}`);
    hasProfile = true;
    await open('/profile/edit');
    const editInput = page.getByRole('combobox', { name: 'Location' });
    await expect(editInput).toHaveValue('Santa Monica, CA');
    await choose(editInput, 'Silver', /Silver Lake/);
    await page.locator('#ps-s1').getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Saved ✓', { exact: true }).waitFor();
    check(profile.location === 'Silver Lake, CA' && profile.bio === fixtureProfile.bio && profile.school_company === fixtureProfile.school_company, `profile edit persists location without erasing other fields at ${width}`);
    await editInput.fill('Santa'); await page.getByRole('option', { name: /Santa Monica/ }).waitFor();
    await screenshot(page, `profile-edit-${width}`);
    await open('/create-hive', { category: 'social', prefillData: { searchMode: 'area', searchPlaceLabel: 'Silver Lake', searchMetroKey: la.metro_key } });
    const createInput = page.getByRole('combobox', { name: 'Location' });
    await expect(createInput).toHaveValue('Silver Lake');
    await createInput.fill('Santa'); await page.getByRole('option', { name: /Santa Monica/ }).waitFor();
    await screenshot(page, `create-${width}`);
    await page.getByRole('option', { name: /Santa Monica/ }).click();
    await page.getByPlaceholder('e.g. LA Startup Builders').fill('Location Fixture');
    await page.getByRole('button', { name: 'Launch Hive →', exact: true }).click();
    await page.waitForURL('**/hive/fixture');
    check(bodies.at(-1).location === 'Santa Monica, CA' && bodies.at(-1).metroKey === la.metro_key, `Create changes prefill and submits geographic association at ${width}`);
    await open('/hive/fixture/settings');
    const settingsInput = page.getByRole('combobox', { name: 'Location' });
    await expect(settingsInput).toHaveValue('Santa Monica, CA');
    await settingsInput.fill('Silver'); await page.getByRole('option', { name: /Silver Lake/ }).waitFor();
    await screenshot(page, `settings-${width}`);
    await page.getByRole('option', { name: /Silver Lake/ }).click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).first().click();
    await page.getByText('Changes saved.', { exact: true }).waitFor();
    check(hive.location === 'Silver Lake, CA' && hive.metro_key === la.metro_key, `Settings submits updated city and metro at ${width}`);
    await open('/hive/fixture/tools/itinerary');
    await page.getByRole('button', { name: '+ New trip', exact: true }).click();
    const destination = page.getByRole('combobox', { name: 'Trip destination' });
    await choose(destination, 'Silver', /Silver Lake/);
    await expect(destination).toHaveValue('Silver Lake, CA');
    await destination.fill('Santa'); await page.getByRole('option', { name: /Santa Monica/ }).waitFor();
    await screenshot(page, `trip-${width}`);
    check(true, `trip destination uses shared area search at ${width}`);
    await open('/hive/fixture/tools/opportunities');
    await page.getByRole('button', { name: '+ Post an opportunity', exact: true }).click();
    const opportunity = page.getByRole('combobox', { name: 'Opportunity location' });
    await choose(opportunity, 'Santa', /Santa Monica/);
    await page.getByRole('checkbox', { name: 'Remote', exact: true }).check();
    await expect(opportunity).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Remote', exact: true }).uncheck();
    await expect(opportunity).toHaveValue('Santa Monica, CA');
    await opportunity.fill('Silver'); await page.getByRole('option', { name: /Silver Lake/ }).waitFor();
    await screenshot(page, `opportunity-${width}`);
    check(true, `opportunity area search preserves Remote and typed value at ${width}`);
    await open('/hive/fixture/events/p1');
    await page.getByRole('button', { name: '+ Offer a ride', exact: true }).click();
    const departure = page.getByRole('combobox', { name: 'Leaving from' });
    await choose(departure, 'Silver', /Silver Lake/);
    await expect(departure).toHaveValue('Silver Lake, CA');
    await page.getByRole('button', { name: '+ Request a ride', exact: true }).click();
    const pickup = page.getByRole('combobox', { name: 'Pickup area' });
    await choose(pickup, 'Santa', /Santa Monica/);
    await expect(pickup).toHaveValue('Santa Monica, CA');
    await pickup.fill('Silver'); await page.getByRole('option', { name: /Silver Lake/ }).waitFor();
    await screenshot(page, `rides-${width}`);
    check(true, `ride departure and pickup areas use shared search at ${width}`);
    check(errors.length === 0, `no browser exceptions at ${width}: ${errors.join('; ')}`);
    await ctx.close();
  }
  const motion = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', recordVideo: { dir, size: { width: 1440, height: 900 } } });
  await motion.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().url().includes('/auth/me') ? { user: { userId: 'new-user', hasProfile: false } } : route.request().url().includes('/metros/places') ? [places[1]] : {}) }));
  const motionPage = await motion.newPage();
  await motionPage.goto(`${process.env.P71_BASE_URL || 'http://127.0.0.1:5173'}/profile-setup`);
  const motionInput = motionPage.getByRole('combobox', { name: 'Location' });
  await motionInput.waitFor();
  const before = await motionInput.boundingBox();
  await motionInput.fill('Silver'); await motionPage.getByRole('option', { name: /Silver Lake/ }).waitFor();
  const after = await motionInput.boundingBox();
  check(Math.abs(before.y - after.y) < 1 && before.height === after.height, 'opening autocomplete does not shift the form layout');
  check(await motionPage.locator('.area-location-popup').evaluate(el => getComputedStyle(el).animationName) === 'area-location-enter', 'normal-motion popup uses the lightweight entrance animation');
  await motionInput.press('Escape'); await motionPage.waitForTimeout(180);
  check(await motionPage.locator('.area-location-popup').count() === 0, 'animated close removes the popup cleanly');
  await motion.close();
  await writeFile(join(dir, 'report.json'), JSON.stringify({ checks, screenshots: shots }, null, 2));
  await writeFile(join(dir, 'network.json'), JSON.stringify(captured, null, 2));
  console.log(`${checks} checks passed. Screenshots and screen recordings: ${dir}`);
} finally { await browser.close(); }
