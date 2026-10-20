import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/desktop', timeout: 45000, workers: 1, retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' }
});
