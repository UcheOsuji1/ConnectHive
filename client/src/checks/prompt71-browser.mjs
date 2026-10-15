// Run from client/: node src/checks/prompt71-browser.mjs
// Browser fixtures intercept API calls; no accounts, email, or database rows are created.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const dir = join(tmpdir(), 'truehive-prompt71');
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const la = { metro_key: 'los-angeles', name: 'Los Angeles area', lat: 34.0522, lng: -118.2437, principalCities: ['Los Angeles'] };
const miami = { metro_key: 'miami', name: 'Miami area', lat: 25.7617, lng: -80.1918, principalCities: ['Miami', 'Miami Beach'] };
const hives = [
  { hive_id: 'la', hive_name: 'Silver Lake Social', location: 'Silver Lake', location_type: 'in-person' },
  { hive_id: 'sm', hive_name: 'Santa Monica Weekends', location: 'Santa Monica', location_type: 'hybrid' },
  { hive_id: 'online', hive_name: 'Online Friends', location_type: 'online' },
].map(h => ({ ...h, category_name: 'Social Groups', description: 'Find your people and make plans together.', tags: ['Friendship'], match_score: 82, member_count: 3, max_members: 10, people_score: null }));
let checks = 0;
const network = [], screenshots = [];
function check(ok, label) { assert.ok(ok, label); checks++; console.log(`PASS ${label}`); }
async function shot(page, name) { const file = join(dir, `${name}.png`); await page.screenshot({ path: file, fullPage: true }); screenshots.push(file); }
async function context(width, geo = { latitude: 34.087, longitude: -118.27 }, denied = false) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, geolocation: geo, permissions: denied ? [] : ['geolocation'], reducedMotion: 'reduce' });
  let result = { hives, area: la, isLaunchArea: true, waitingCount: 4 };
  const bodies = [], errors = [];
  await ctx.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const body = req.postDataJSON();
    network.push({ path: url.pathname + url.search, body });
    let data = {};
    if (url.pathname === '/api/auth/me') data = { user: { userId: 'viewer', email: 'fixture@example.invalid', fullName: 'Launch Tester', hasProfile: true, hasActiveHive: true, emailVerified: true } };
    else if (url.pathname === '/api/config') data = {};
    else if (url.pathname === '/api/metros') data = [la, miami];
    else if (url.pathname === '/api/metros/places') data = [{ display_name: 'Silver Lake', state_code: 'CA', metro_key: 'los-angeles', metro_name: la.name }];
    else if (url.pathname === '/api/hives/match') { data = result; bodies.push(body); }
    else if (url.pathname === '/api/hives/waitlist') { data = { joined: true, waitingCount: 5 }; bodies.push(body); }
    else if (url.pathname === '/api/hives' && req.method() === 'POST') { data = { id: 'created' }; bodies.push(body); }
    else if (url.pathname === '/api/hives/created') data = { hive: { ...hives[0], hive_id: 'created', my_role: 'owner', welcome_seen_at: '2026-10-14' } };
    else if (url.pathname.includes('/notifications')) data = { notifications: [], unread_count: 0 };
    else if (url.pathname === '/api/users/profile') data = { profile: {} };
    else if (url.pathname.includes('/ai-match')) data = { source: 'rules' };
    else data = { hives: [], tools: [], members: [], groups: [] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  async function open(path, state = {}) {
    await page.goto(`http://127.0.0.1:5173${path}`);
    await page.evaluate(state => history.replaceState({ ...history.state, usr: state }, ''), state);
    await page.reload();
  }
  return { ctx, page, open, bodies, errors, setResult: value => { result = value; } };
}
try {
  for (const width of [1440, 390]) {
    const t = await context(width);
    const { page, open } = t;
    await open('/category-deep-dive?category=social', { category: 'social' });
    await page.getByText('21–26', { exact: true }).click();
    await page.getByText('25–32', { exact: true }).click();
    check(await page.getByText('✓ 21–26', { exact: true }).count() === 1 && await page.getByText('✓ 25–32', { exact: true }).count() === 1, `Q1 multi-select at ${width}`);
    await shot(page, `q1-${width}`);
    await page.getByText('Any age', { exact: true }).click();
    check(await page.getByText('✓ 21–26', { exact: true }).count() === 0, `Any age clears ranges at ${width}`);
    await page.getByText('21–26', { exact: true }).click();
    check(await page.getByText('✓ Any age', { exact: true }).count() === 0, `range clears Any age at ${width}`);
    await page.getByRole('button', { name: '📍 Use my current location', exact: true }).click();
    await page.getByText('📍 Los Angeles area', { exact: true }).waitFor();
    check(await page.getByText('Includes Santa Monica, Pasadena, Burbank, Long Beach and the rest of LA County', { exact: true }).count() === 1, `Q2 LA confirmation at ${width}`);
    await shot(page, `q2-${width}`);
    await page.getByRole('button', { name: 'Change', exact: true }).click();
    await page.getByRole('button', { name: "✍️ I'll type it in", exact: true }).click();
    await page.getByPlaceholder('e.g. Los Angeles, CA / New York, NY...').fill('Silver');
    await page.getByRole('button', { name: 'Silver Lake · Los Angeles area', exact: true }).waitFor();
    await shot(page, `q3-${width}`);
    await page.getByRole('button', { name: 'Silver Lake · Los Angeles area', exact: true }).click();
    await page.locator('.cdd-nav-next').click();
    await page.getByRole('heading', { name: "Don't see your Hive?" }).waitFor();
    check(t.bodies.at(-1).searchMetroKey === 'los-angeles' && t.bodies.at(-1).ageBands.includes('21–26'), `answers reach runMatching at ${width}`);
    await shot(page, `r1-${width}`);
    const geometry = await page.evaluate(() => {
      const cards = document.querySelector('.hmd-cards').getBoundingClientRect();
      const panel = document.querySelector('.hmd-founder-panel').getBoundingClientRect();
      return { cardRight: cards.right, cardBottom: cards.bottom, panelLeft: panel.left, panelTop: panel.top };
    });
    check(width < 760 ? geometry.panelTop >= geometry.cardBottom : geometry.panelLeft >= geometry.cardRight, `R1 panel position at ${width}`);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.hmd-results *')].filter(el => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.left < -1 || b.right > innerWidth + 1); }).map(el => el.className));
    check(overflow.length === 0, `R1 element bounds at ${width}: ${overflow.join(',')}`);
    await page.getByRole('button', { name: 'Join the queue', exact: true }).click();
    await page.getByRole('button', { name: "You're in the queue ✓", exact: true }).waitFor();
    check(t.bodies.at(-1).metro_key === 'los-angeles', `R1 waitlist sends LA area at ${width}`);
    await page.goBack();
    await page.getByText('✓ 21–26', { exact: true }).waitFor();
    check(await page.getByPlaceholder('e.g. Los Angeles, CA / New York, NY...').inputValue() === 'Silver Lake, CA', `Back restores answers at ${width}`);
    await page.locator('.cdd-nav-next').click();
    await page.getByRole('button', { name: 'Create a Hive', exact: true }).click();
    await page.getByPlaceholder('e.g. Austin, TX').waitFor();
    check(await page.getByPlaceholder('e.g. Austin, TX').inputValue() === 'Silver Lake', `Create prefilled location at ${width}`);
    check((await page.locator('.ch-locked-field-left').innerText()).includes('Social Groups'), `Create prefilled category at ${width}`);
    await page.getByRole('button', { name: 'Change', exact: true }).click();
    await page.locator('.ch-cat-card').filter({ hasText: 'Professional' }).click();
    check(await page.locator('.ch-cat-card.selected').innerText().then(s => s.includes('Professional')), `prefilled category remains editable at ${width}`);
    await page.locator('.ch-cat-card').filter({ hasText: 'Social Groups' }).click();
    await shot(page, `create-${width}`);
    t.setResult({ hives: [hives[2]], area: miami, isLaunchArea: false, waitingCount: 2 });
    await open('/hive-discovery', { category: 'social', chips: { 'social-location': ["✍️ I'll type it in"] }, textValues: { 'social-city': 'Miami' }, metroKeys: { 'social-location': 'miami' } });
    await page.getByRole('heading', { name: 'TrueHive is in Los Angeles first' }).waitFor();
    await shot(page, `r2-${width}`);
    await page.getByRole('button', { name: 'Tell me when Miami opens', exact: true }).click();
    await page.getByRole('button', { name: "We'll email you when Miami opens.", exact: true }).waitFor();
    check(t.bodies.at(-1).metro_key === 'miami', `R2 waitlist sends Miami area at ${width}`);
    t.setResult({ hives: [], area: la, isLaunchArea: true, waitingCount: 0 });
    await open('/hive-discovery', { category: 'social', textValues: { 'social-city': 'Silver Lake' } });
    await page.locator('.hd-founder-stage').waitFor();
    check(await page.getByRole('heading', { name: 'Become the founder', exact: true }).count() === 1, `LA zero matches preserves founder screen at ${width}`);
    await shot(page, `la-empty-${width}`);
    t.setResult({ hives: [], area: miami, isLaunchArea: false, waitingCount: 0 });
    await open('/hive-discovery', { category: 'social', textValues: { 'social-city': 'Miami' } });
    await page.getByRole('heading', { name: 'TrueHive is in Los Angeles first' }).waitFor();
    check(!await page.locator('.hmd-outside-copy').innerText().then(s => s.includes('online Hive')), `R2 zero online copy at ${width}`);
    t.setResult({ hives: [hives[2]], area: null, isLaunchArea: false, needsArea: true });
    await open('/hive-discovery', { category: 'social' });
    await page.getByRole('button', { name: 'Add your city →', exact: true }).waitFor();
    check(await page.locator('.hmd-area-prompt').count() === 1, `needsArea prompt at ${width}`);
    check(t.errors.length === 0, `no browser errors at ${width}: ${t.errors.join(',')}`);
    await t.ctx.close();
  }
  for (const denied of [false, true]) {
    const t = await context(390, { latitude: 39.5, longitude: -116.5 }, denied);
    await t.open('/category-deep-dive?category=social', { category: 'social' });
    await t.page.getByRole('button', { name: '📍 Use my current location', exact: true }).click();
    await t.page.getByText("We couldn't find your area. Type your city instead.", { exact: true }).waitFor();
    check(true, denied ? 'permission denied falls back to typing' : 'rural Nevada falls back to typing');
    await t.ctx.close();
  }
  const t = await context(1440);
  for (const category of ['social', 'professional', 'travel', 'project', 'event', 'specialized']) {
    await t.open(`/category-deep-dive?category=${category}`, { category });
    const question = t.page.locator('.cdd-section-label').filter({ hasText: 'What city or area are you in?' });
    await question.waitFor();
    check(await question.count() === 1, `${category} has shared location question`);
  }
  await t.ctx.close();
  check(!network.some(r => /latitude|longitude|34\.087|-118\.27|39\.5|-116\.5/i.test(JSON.stringify(r))), 'network contains no browser coordinates');
  await writeFile(join(dir, 'network.json'), JSON.stringify(network, null, 2));
  await writeFile(join(dir, 'report.json'), JSON.stringify({ checks, screenshots }, null, 2));
  console.log(`${checks} checks passed. Evidence: ${dir}`);
} finally { await browser.close(); }
