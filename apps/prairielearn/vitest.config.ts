import { join } from 'path';

import { defineConfig, mergeConfig } from 'vitest/config';

import { sharedConfig } from '../../vitest.config';

// We support running our tests in two modes:
//
// - Directly against the source files in `src/`, in which case we rely on
//   Vite to transpile files on the fly. Useful for quick iteration.
//
// - Against the compiled files in `dist/`, in which case we use the compiled
// files directly without compilation. This is useful for CI and for ensuring
// that the code that will actually run in production is tested.
//
// We use the presence of any arguments starting with `dist/` or containing
// `/dist/` to determine whether we're running in the latter mode.
const isRunningOnDist = process.argv
  .slice(2)
  .some((arg) => arg.startsWith('dist/') || arg.includes('/dist/'));

const dockerSmokeTests = ['src/tests/exampleCourseQuestions.test.ts'];

export default defineConfig(({ mode }) => {
  // For CI, we want to run a subset of tests natively, and a subset of tests only in Docker.
  // We control this via the `mode` argument passed to the Vitest CLI
  // We do this instead of defining separate projects as we want this toggle available in
  // the root project config and this config, and projects aren't inherited by the root config.
  if (mode === 'docker-smoke-tests' && isRunningOnDist) {
    throw new Error('Cannot run docker-smoke-tests tests on dist files.');
  }

  // The executor-smoke-test mode runs inside the executor Docker container,
  // which has no Postgres. Skip globalSetup/setupFiles that require a DB.
  const isExecutorSmokeTest = mode === 'executor-smoke-test';

  return mergeConfig(
    sharedConfig,
    defineConfig({
      test: {
        name: '@prairielearn/prairielearn',
        dir: isRunningOnDist ? `${import.meta.dirname}/dist` : `${import.meta.dirname}/src`,
        include: mode === 'docker-smoke-tests' ? dockerSmokeTests : undefined,
        exclude: isExecutorSmokeTest ? ['**/e2e/**'] : ['**/e2e/**', '**/executor.test.*'],
        globalSetup: isExecutorSmokeTest
          ? []
          : isRunningOnDist
            ? join(import.meta.dirname, './dist/tests/vitest.globalSetup.js')
            : join(import.meta.dirname, './src/tests/vitest.globalSetup.ts'),
        setupFiles: isExecutorSmokeTest
          ? []
          : isRunningOnDist
            ? [join(import.meta.dirname, './dist/tests/vitest.testSetup.js')]
            : [join(import.meta.dirname, './src/tests/vitest.testSetup.ts')],
        passWithNoTests: true,
        hookTimeout: 20_000,
        testTimeout: 10_000,

        coverage: {
          include: ['src/**/*.{ts,tsx}'],
          reporter: ['html', 'text-summary', 'cobertura'],
        },
      },
    }),
  );
});
