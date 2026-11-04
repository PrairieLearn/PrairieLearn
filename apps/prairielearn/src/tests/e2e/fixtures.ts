import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { test as base } from '@playwright/test';
import * as tmp from 'tmp-promise';

import type { Config } from '../../lib/config.js';
import type { CourseInstance } from '../../lib/db-types.js';
import { type FeatureName, features } from '../../lib/features/index.js';
import { TEST_COURSE_PATH } from '../../lib/paths.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectCourseByShortName } from '../../models/course.js';
import { syncCourse } from '../helperCourse.js';

import { setupWorkerServer } from './utils/server.js';

export { expect } from '@playwright/test';

interface TestFixtures {
  /** Config overrides applied to the worker's server for the duration of each test. */
  configOverrides: Partial<Config>;
  /** Applies `configOverrides` before each test and resets them afterwards. */
  applyConfigOverrides: undefined;
  /** Override baseURL to be the worker-specific URL */
  baseURL: string;
  /** Enables a feature flag for the duration of the test, disabling it in teardown if it wasn't already enabled. */
  enableFeatureFlag: (name: FeatureName) => Promise<void>;
}

interface WorkerFixtures {
  workerPort: number;
  /** Path to the temporary writable copy of testCourse */
  testCoursePath: string;
  /** The default QA 101 / Sp15 course instance */
  courseInstance: CourseInstance;
}

/**
 * A Playwright test instance with worker-specific server fixtures.
 *
 * Each Playwright worker gets its own server instance with its own isolated database
 * and a separate writable copy of testCourse.
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
      await setupWorkerServer(workerInfo, use, { courseDirs: [testCoursePath] });
    },
    { scope: 'worker' },
  ],

  courseInstance: [
    async ({ testCoursePath, workerPort: _workerPort }, use) => {
      await syncCourse(testCoursePath);

      const course = await selectCourseByShortName('QA 101');
      const courseInstance = await selectCourseInstanceByShortName({
        course,
        shortName: 'Sp15',
      });

      await use(courseInstance);
    },
    { scope: 'worker' },
  ],

  // eslint-disable-next-line no-empty-pattern
  enableFeatureFlag: async ({}, use) => {
    const flagsToDisable: FeatureName[] = [];

    await use(async (name: FeatureName) => {
      const wasEnabled = await features.enabled(name);
      await features.enable(name);
      if (!wasEnabled) {
        flagsToDisable.push(name);
      }
    });

    for (const name of flagsToDisable) {
      await features.disable(name);
    }
  },

  configOverrides: [{}, { option: true }],

  applyConfigOverrides: [
    async ({ configOverrides, workerPort }, use) => {
      const setOverrides = async (overrides: Partial<Config>) => {
        const res = await fetch(`http://localhost:${workerPort}/__test__/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(overrides),
        });
        if (!res.ok) throw new Error(`Failed to set config overrides: ${res.status}`);
      };

      await setOverrides(configOverrides);
      await use(undefined);
      await setOverrides({});
    },
    { auto: true },
  ],

  // Override baseURL to use the worker-specific port
  baseURL: async ({ workerPort }, use) => {
    await use(`http://localhost:${workerPort}`);
  },
});

/**
 * Creates a Playwright test instance whose tests run with the given config
 * overrides. Tests still share worker servers with all other tests, since the
 * overrides are applied at runtime rather than when the server starts.
 */
export function createTest(configOverrides: Partial<Config>) {
  return test.extend({ configOverrides });
}
