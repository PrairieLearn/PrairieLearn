import type * as express from 'express';

import { test as base } from '@playwright/test';

import * as opentelemetry from '@prairielearn/opentelemetry';

import * as assets from '../../lib/assets.js';
import * as codeCaller from '../../lib/code-caller/index.js';
import { config, loadConfig } from '../../lib/config.js';
import * as load from '../../lib/load.js';
import { initExpress, insertDevUser, startServer, stopServer } from '../../server.js';

interface TestFixtures {
  // Override baseURL to be the worker-specific URL
  baseURL: string;
}

interface WorkerFixtures {
  webServer: express.Express;
  workerPort: number;
}

const BASE_PORT = 3000;

/**
 * Worker-scoped fixture that starts up a PrairieLearn web server instance.
 * Each Playwright worker gets its own server instance with its own isolated database.
 *
 * The TEST_WORKER_INDEX environment variable is used to determine which database
 * to use for this worker, ensuring test isolation across parallel workers.
 *
 * See https://playwright.dev/docs/test-fixtures#automatic-fixtures and
 * https://playwright.dev/docs/test-parallel#isolate-test-data-between-parallel-workers
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Provide the port number for this worker
  workerPort: [
    async ({}, use, workerInfo) => {
      const port = BASE_PORT + workerInfo.workerIndex;
      await use(port);
    },
    { scope: 'worker' },
  ],

  // Override baseURL to use the worker-specific port
  baseURL: async ({ workerPort }, use) => {
    await use(`http://localhost:${workerPort}`);
  },

  webServer: [
    async ({ workerPort }, use, workerInfo) => {
      const { before: setupDatabase, after: cleanupDatabase } = await import('../helperDb.js');

      // Set the TEST_WORKER_INDEX environment variable so that the server
      // knows to use the worker-specific database configuration.
      // workerIndex is 0-based, but we want our database names to start at 1.
      process.env.TEST_WORKER_INDEX = String(workerInfo.workerIndex + 1);

      // Initialize OpenTelemetry (disabled for tests)
      await opentelemetry.init({ openTelemetryEnabled: false });

      // Set up the database for this worker (creates from template if needed)
      await setupDatabase();

      // Load config (this is normally done in server.ts, but we need to do it
      // before starting the server so we can override the port)
      await loadConfig([]);

      // Override the server port for this worker
      config.serverPort = String(workerPort);

      // Disable actually starting the server in server.ts
      config.startServer = false;

      // Insert dev user
      await insertDevUser();

      // Set up load estimators
      load.initEstimator('request', 1);
      load.initEstimator('authed_request', 1);
      load.initEstimator('python', 1);

      // Initialize code callers
      await codeCaller.init({ lazyWorkers: true });

      // Initialize assets (required before initExpress)
      await assets.init();

      // Initialize and start the Express server
      const app = await initExpress();
      await startServer(app);

      // Provide the app to tests (though most tests will just use the baseURL)
      await use(app);

      // Cleanup: close resources in reverse order
      await assets.close();
      await codeCaller.finish();
      await stopServer();
      load.close();

      // Clean up the database for this worker
      await cleanupDatabase();

      // Clean up the environment variable
      delete process.env.TEST_WORKER_INDEX;
    },
    { scope: 'worker', auto: true },
  ],
});

export { expect } from '@playwright/test';
