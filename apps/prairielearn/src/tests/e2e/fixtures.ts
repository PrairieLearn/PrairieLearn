/* eslint-disable react-hooks/rules-of-hooks */
import { test as base } from '@playwright/test';

interface TestFixtures {
  /** Override baseURL to be the worker-specific URL */
  baseURL: string;
}

interface WorkerFixtures {
  workerPort: number;
}

const BASE_PORT = 3000;

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
    async (_, use, workerInfo) => {
      const port = BASE_PORT + workerInfo.workerIndex;

      // workerIndex is 0-based, but we want our database names to start at 1.
      process.env.TEST_WORKER_INDEX = String(workerInfo.workerIndex + 1);
      process.env.PORT = String(port);

      // This import implicitly starts the server
      const { close } = await import('../../server.js');

      await use(port);

      // Clean up the server
      await close();
      delete process.env.TEST_WORKER_INDEX;
      delete process.env.PORT;
    },
    { scope: 'worker' },
  ],

  // Override baseURL to use the worker-specific port
  baseURL: async ({ workerPort }, use) => {
    await use(`http://localhost:${workerPort}`);
  },
});

export { expect } from '@playwright/test';
