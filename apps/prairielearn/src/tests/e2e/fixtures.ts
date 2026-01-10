/* eslint-disable react-hooks/rules-of-hooks */
import fs from 'node:fs/promises';
import path from 'node:path';

import { test as base } from '@playwright/test';
import * as tmp from 'tmp-promise';

import { STANDARD_COURSE_DIRS } from '../../lib/config.js';
import { EXAMPLE_COURSE_PATH, TEST_COURSE_PATH } from '../../lib/paths.js';

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

      // Initialize a git repo so file edits work (the editor requires git)
      const { execSync } = await import('node:child_process');
      execSync('git init', { cwd: tempTestCoursePath });
      execSync('git add -A', { cwd: tempTestCoursePath });
      execSync('git commit -m "Initial commit"', { cwd: tempTestCoursePath });

      await use(tempTestCoursePath);
      // Cleanup happens automatically via unsafeCleanup
    },
    { scope: 'worker' },
  ],

  workerPort: [
    async ({ testCoursePath }, use, workerInfo) => {
      await setupWorkerServer(workerInfo, use, {
        courseDirs: [...STANDARD_COURSE_DIRS, EXAMPLE_COURSE_PATH, testCoursePath],
      });
    },
    { scope: 'worker' },
  ],

  // Override baseURL to use the worker-specific port
  baseURL: async ({ workerPort }, use) => {
    await use(`http://localhost:${workerPort}`);
  },
});
