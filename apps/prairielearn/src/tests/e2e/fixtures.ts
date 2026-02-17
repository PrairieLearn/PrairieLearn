/* eslint-disable react-hooks/rules-of-hooks */
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { test as base } from '@playwright/test';
import * as tmp from 'tmp-promise';

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
 * Worker-scoped fixture that configures Playwright tests to use worker-specific ports.
 * Each Playwright worker gets its own server instance with its own isolated database
 * and a separate writable copy of testCourse.
 *
 * The server is started as a subprocess and we wait for the "PrairieLearn server ready"
 * message in the output to know when it's ready.
 *
 * The testCoursePath fixture provides the path to the temporary copy of testCourse,
 * which can be safely modified by tests without affecting other workers or the
 * original testCourse directory.
 *
 * See https://playwright.dev/docs/test-fixtures#automatic-fixtures and
 * https://playwright.dev/docs/test-parallel#isolate-test-data-between-parallel-workers
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
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
      });
    },
    { scope: 'worker' },
  ],

  // Override baseURL to use the worker-specific port
  baseURL: async ({ workerPort }, use) => {
    await use(`http://localhost:${workerPort}`);
  },
});
