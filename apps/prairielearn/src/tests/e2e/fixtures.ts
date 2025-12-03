/* eslint-disable react-hooks/rules-of-hooks */
import fs from 'node:fs/promises';

import { test as base } from '@playwright/test';
import * as tmp from 'tmp-promise';

import type { Config } from '../../lib/config.js';

export { expect } from '@playwright/test';

interface TestFixtures {
  /** Override baseURL to be the worker-specific URL */
  baseURL: string;
}

interface WorkerFixtures {
  workerPort: number;
}

const BASE_PORT = 3014;

/**
 * Worker-scoped fixture that configures Playwright tests to use worker-specific ports.
 * Each Playwright worker gets its own server instance with its own isolated database.
 *
 * The server auto-starts when TEST_WORKER_INDEX is set (see server.ts).
 * The TEST_WORKER_INDEX environment variable is used to determine which database
 * to use for this worker, ensuring test isolation across parallel workers.
 *
 * See https://playwright.dev/docs/test-fixtures#automatic-fixtures and
 * https://playwright.dev/docs/test-parallel#isolate-test-data-between-parallel-workers
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  workerPort: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      // Pick a unique port based on the worker index.
      const port = BASE_PORT + workerInfo.workerIndex + 1;

      // Initialize the database with the test utils.
      const { setupDatabases, after: destroyDatabases } = await import('../helperDb.js');
      const setupResults = await setupDatabases({ configurePool: false });

      await tmp.withFile(
        async (tmpFile) => {
          // Construct a test-specific config and write it to disk.
          const config: Partial<Config> = {
            serverPort: String(port),
            postgresqlUser: setupResults.user,
            postgresqlDatabase: setupResults.database,
            postgresqlHost: setupResults.host,
            devMode: true, // We need this to start up the asset server.
          };
          await fs.writeFile(tmpFile.path, JSON.stringify(config, null, 2));

          process.env.NODE_ENV = 'test';
          process.env.PL_CONFIG_PATH = tmpFile.path;
          process.env.PL_START_SERVER = 'true';

          // This import implicitly starts the server
          const { close } = await import('../../server.js');

          try {
            await use(port);
          } finally {
            // Clean up the server
            await close();

            // Tear down the testing database.
            await destroyDatabases();
          }
        },
        { postfix: 'config.json' },
      );
    },
    { scope: 'worker' },
  ],

  // Override baseURL to use the worker-specific port
  baseURL: async ({ workerPort }, use) => {
    await use(`http://localhost:${workerPort}`);
  },
});
