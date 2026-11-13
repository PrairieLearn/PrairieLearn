import { defineConfig, devices } from '@playwright/test';

// Set the NODE_ENV to 'test' for the Playwright tests.
// Certain model functions are only allowed to be called in a test environment.
process.env.NODE_ENV = 'test';

// Keep e2e databases separate from the ones Vitest uses (see `helperDb.ts`).
process.env.PL_TEST_DATABASE_NAMESPACE = 'pltest_e2e';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Note: Image snapshots will not work as expected since
 * we run CI in a different environment than local development.
 */
export default defineConfig({
  globalSetup: './src/tests/e2e/global-setup.ts',
  testDir: './src/tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
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
