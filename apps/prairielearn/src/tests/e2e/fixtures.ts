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

/**
 * The config keys that tests may override with `createTest()`.
 *
 * Why this list exists: every Playwright worker boots a single PrairieLearn
 * server (see `utils/server.ts`) and shares it across every spec file that
 * worker runs. Config overrides are not baked into that server at startup.
 * Instead, the `applyConfigOverrides` fixture below POSTs them to the
 * `/__test__/config` route before each test, which mutates the server's live
 * `config` object, and resets them after the test.
 *
 * We used to give each distinct set of overrides its own Playwright worker,
 * which meant its own server process and its own database. Booting a server
 * takes roughly 5-6 seconds, almost all of it Node loading ~10k modules, and
 * workers also need a fresh database and browser. With a dozen or so override
 * groups per CI shard, that churn dominated e2e runtime. Sharing one server per
 * worker cut the slowest shard roughly in half.
 *
 * The catch is that a runtime override only has an effect if the server reads
 * that key from `config` *while handling a request*. Many keys are only read
 * once at startup: for example, `isEnterprise` decides which routes get
 * registered, and `newsFeedUrl` decides whether a cron job is scheduled.
 * Overriding such a key at runtime silently does nothing, so a test could pass
 * without exercising what it claims to, or fail in a confusing way.
 *
 * So `createTest()` only accepts the keys below, each of which has been
 * checked to be read per request. Before adding a key, confirm that every
 * place that reads it does so at request time rather than at module load or
 * during server startup (including anything that caches the value). If a test
 * truly needs a startup-only value, set it for every worker in
 * `utils/server.ts` instead (as is done for `isEnterprise`), provided that
 * doesn't break other tests.
 *
 * This is enforced only by types: `/__test__/config` itself accepts any key.
 */
type RuntimeConfigKey =
  | 'authUid'
  | 'authName'
  | 'authUin'
  | 'authEmail'
  | 'features'
  | 'githubClientToken'
  | 'newsFeedUrl'
  | 'supportSlackUrl'
  | 'supportOfficeHoursUrl';

type RuntimeConfigOverrides = Partial<Pick<Config, RuntimeConfigKey>>;

interface TestFixtures {
  /** Config overrides applied to the worker's server for the duration of each test. */
  configOverrides: RuntimeConfigOverrides;
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
      const setOverrides = async (overrides: RuntimeConfigOverrides) => {
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
 * overrides are applied at runtime rather than when the server starts. Only
 * keys that are read per request can be overridden; see `RuntimeConfigKey`.
 */
export function createTest(configOverrides: RuntimeConfigOverrides) {
  return test.extend({ configOverrides });
}
