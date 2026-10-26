import { expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../server');

// Shells out to a server/src/db/qa*.js helper (same process that owns the
// Postgres driver — the client has none). Every helper refuses anything
// outside the qa.truehive.test domain, so this can't touch real accounts.
export function runQaHelper(script, args) {
  const out = execFileSync('node', [`src/db/${script}`, ...args], { cwd: SERVER_DIR, encoding: 'utf8' });
  const line = out.trim().split('\n').pop();
  return JSON.parse(line);
}

export const QA_PASSWORD = 'QaBeta2026!';
export const QA_USERS = {
  owner1:     'qa-owner1@qa.truehive.test',
  owner2:     'qa-owner2@qa.truehive.test',
  owner3:     'qa-owner3@qa.truehive.test',
  owner4:     'qa-owner4@qa.truehive.test',
  member1:    'qa-member1@qa.truehive.test',
  member2:    'qa-member2@qa.truehive.test',
  unfinished: 'qa-unfinished@qa.truehive.test',
  googleonly: 'qa-googleonly@qa.truehive.test',
  miami:      'qa-miami@qa.truehive.test',
};

// Attach console-error and failed-network-request listeners before any
// navigation. Call assertCleanPage() after the page has settled to assert
// on what was collected.
export function trackPage(page, { allowedFailedPaths = [] } = {}) {
  const consoleErrors = [];
  const failedRequests = [];

  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // The browser's own "Failed to load resource" line carries no URL, so it
    // can't be matched against allowedFailedPaths here — but every such
    // failure is already captured precisely (with its URL) by the response
    // listener below, so this generic echo would just double-report it.
    if (/^Failed to load resource: the server responded with a status of \d+/.test(text)) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', err => consoleErrors.push(String(err?.message ?? err)));
  page.on('response', res => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (allowedFailedPaths.some(p => url.includes(p))) return;
    failedRequests.push(`${status} ${url}`);
  });

  return { consoleErrors, failedRequests };
}

export async function assertNoHorizontalOverflow(page) {
  // scrollWidth <= innerWidth is not sufficient — overflow-x:hidden masks
  // element-level overflow while the document assertion passes. Check each
  // element's own bounding rect against the viewport instead (CLAUDE.md).
  //
  // But a bounds check with no ancestor awareness over-fires on intentional
  // decorative bleed (e.g. a background hex graphic positioned past its
  // container's edge) that a parent's own overflow:hidden already clips to
  // nothing visible or reachable. That parent's clip box must itself fit the
  // viewport for the clip to count — otherwise the "clip" is just as
  // overflowing as the element inside it.
  const overflowing = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.right > vw + 1)) continue;

      let clipped = false;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.overflow === 'hidden') {
          const ar = a.getBoundingClientRect();
          if (ar.right <= vw + 1) { clipped = true; break; }
        }
      }
      if (clipped) continue;

      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).join('.') : '';
      bad.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} right=${Math.round(r.right)} vw=${vw}`);
    }
    return [...new Set(bad)].slice(0, 10);
  });
  expect(overflowing, 'elements overflowing viewport width (not clipped by any ancestor)').toEqual([]);
}

export async function assertNoBrokenImages(page) {
  const broken = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img'))
      .filter(img => img.complete && img.naturalWidth === 0)
      .map(img => img.currentSrc || img.src));
  expect(broken, 'broken images (naturalWidth 0 after load)').toEqual([]);
}

export async function assertNonEmptyTitle(page) {
  const title = (await page.title()).trim();
  expect(title.length, 'page <title> should be non-empty').toBeGreaterThan(0);
}

// The standard bundle of per-page checks every flow runs after a page settles.
export async function assertCleanPage(page, tracked) {
  await assertNonEmptyTitle(page);
  await assertNoHorizontalOverflow(page);
  await assertNoBrokenImages(page);
  expect(tracked.consoleErrors, 'console errors').toEqual([]);
  expect(tracked.failedRequests, 'failed network requests (4xx/5xx)').toEqual([]);
}

// Spot-check: Tab to each selector in order and confirm a visible focus ring.
export async function assertTabFocusRing(page, selectors) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    await el.focus();
    await expect(el).toBeFocused();
    const hasRing = await el.evaluate(node => {
      const cs = getComputedStyle(node);
      const hasOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      const hasShadowRing = cs.boxShadow !== 'none' && cs.boxShadow !== '';
      return hasOutline || hasShadowRing;
    });
    expect(hasRing, `${sel} should show a visible focus ring when focused`).toBe(true);
  }
}

// Drives the real login form — this is itself one of the flows under test
// (02-signup-signin.spec.js), so it's the only spec file that should call
// this directly. Every other flow should use loginViaSession() below: the
// login endpoint is rate-limited to 10 attempts/15min per IP in production
// code that must stay as-is, and a full 15-flow x 3-project run driving the
// real form every time it just needs "logged in as X" trips that limit fast.
export async function loginAs(page, email, password = QA_PASSWORD) {
  await page.goto('/login');
  await page.locator('#signin-email').fill(email);
  await page.locator('#signin-pw').fill(password);
  await page.getByRole('button', { name: /Sign In to TrueHive|Signing in/ }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

// Mints a real session JWT the same way a real login does (server/src/db/
// qaIssueSessionToken.js mirrors authController.js's signToken exactly) and
// sets it directly as the auth cookie — no form, no rate limit. Use this for
// every flow except the one actually testing login/signup/logout mechanics.
export async function loginViaSession(page, email) {
  const { token } = runQaHelper('qaIssueSessionToken.js', [email]);
  await page.context().addCookies([{
    name: 'token', value: token, domain: 'localhost', path: '/',
    httpOnly: true, sameSite: 'Lax', secure: false,
  }]);
}

export async function logout(page) {
  // Settings page always has a sign-out action regardless of current route.
  await page.goto('/settings');
  const btn = page.getByRole('button', { name: /sign out|log out/i });
  if (await btn.count()) await btn.first().click();
  await page.waitForURL(url => url.pathname === '/login' || url.pathname === '/', { timeout: 10_000 }).catch(() => {});
}
