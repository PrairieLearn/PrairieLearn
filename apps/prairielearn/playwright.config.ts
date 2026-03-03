import { defineConfig, devices } from '@playwright/test';

// Set the NODE_ENV to 'test' for the Playwright tests.
// Certain model functions are only allowed to be called in a test environment.
process.env.NODE_ENV = 'test';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Note: Image snapshots will not work as expected since
 * we run CI in a different environment than local development.
 */
export default defineConfig({
  testDir: './src/tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['blob', { outputDir: 'test-results/blob-report' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
