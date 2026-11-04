import { defineConfig, devices } from '@playwright/test';

// Read-only public-site smoke checks for an explicitly started integration frontend.
// No server auto-start, QA seeding, payment entry, or production destination.
const baseURL = process.env.P73_BASE_URL || 'http://localhost:5194';
const origin = new URL(baseURL);
if (!['localhost', '127.0.0.1'].includes(origin.hostname)) throw Error('Loopback integration frontend required');
export default defineConfig({
  testDir: '../../tests/prebeta',
  testMatch: '01-public-site.spec.js',
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: { baseURL },
  projects: [{ name: 'Integrated Desktop', use: { ...devices['Desktop Chrome'] } }],
});
