import { defineConfig, devices } from '@playwright/test';

// Pre-beta walkthrough (Prompt 74). Against the local dev server + the Neon
// `dev` database only — never run against production. See client/tests/prebeta/.
export default defineConfig({
  testDir: './tests/prebeta',
  fullyParallel: false, // flows share qa- fixture state; keep deterministic
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'iPhone 13',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'Pixel 7',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: '.',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      cwd: '../server',
      url: 'http://localhost:5000/api/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
