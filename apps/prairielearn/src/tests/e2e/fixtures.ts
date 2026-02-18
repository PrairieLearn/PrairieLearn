/* eslint-disable react-hooks/rules-of-hooks */
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { test as base } from '@playwright/test';
import * as tmp from 'tmp-promise';

import type { Config } from '../../lib/config.js';
import { TEST_COURSE_PATH } from '../../lib/paths.js';

import { setupWorkerServer } from './serverUtils.js';

export { expect } from '@playwright/test';

interface TestFixtures {
  /** Override baseURL to be the worker-specific URL */
  baseURL: string;
}

interface WorkerFixtures {
  workerPort: number;
  /** Path to the temporary writable copy of testCourse */
  testCoursePath: string;
}

/**
 * Creates a Playwright test instance with worker-specific server fixtures.
 *
 * Each Playwright worker gets its own server instance with its own isolated database
 * and a separate writable copy of testCourse.
 *
 * See https://playwright.dev/docs/test-fixtures#automatic-fixtures and
 * https://playwright.dev/docs/test-parallel#isolate-test-data-between-parallel-workers
 */
export function createTest(configOverrides?: Partial<Config>) {
  return base.extend<TestFixtures, WorkerFixtures>({
    testCoursePath: [
      // eslint-disable-next-line no-empty-pattern
      async ({}, use) => {
        const tempDir = await tmp.dir({ unsafeCleanup: true });
        const tempTestCoursePath = path.join(tempDir.path, 'testCourse');
        await fs.cp(TEST_COURSE_PATH, tempTestCoursePath, { recursive: true });

        // The file editor requires git
        execSync('git init -b master', { cwd: tempTestCoursePath });
        execSync('git add -A', { cwd: tempTestCoursePath });
        execSync('git config user.name "Dev User"', { cwd: tempTestCoursePath });
        execSync('git config user.email "dev@example.com"', { cwd: tempTestCoursePath });
        execSync('git commit -m "Initial commit"', { cwd: tempTestCoursePath });

        await use(tempTestCoursePath);

        await tempDir.cleanup();
      },
      { scope: 'worker' },
    ],

    workerPort: [
      async ({ testCoursePath }, use, workerInfo) => {
        await setupWorkerServer(workerInfo, use, {
          courseDirs: [testCoursePath],
          configOverrides,
        });
      },
      { scope: 'worker' },
    ],

    // Override baseURL to use the worker-specific port
    baseURL: async ({ workerPort }, use) => {
      await use(`http://localhost:${workerPort}`);
    },
  });
}

export const test = createTest();
