import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @three-stone/api dev',
      reuseExistingServer: !process.env.CI,
      url: 'http://127.0.0.1:3001/api/health/ready',
    },
    {
      command: 'pnpm dev --host 127.0.0.1',
      reuseExistingServer: !process.env.CI,
      url: 'http://127.0.0.1:5173',
    },
  ],
});
