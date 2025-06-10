import { join } from 'path';

import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

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

// For CI, we want to run a subset of tests natively, and a subset of tests only in Docker.
// We control this via the `mode` argument passed to the Vitest CLI
const dockerOnlyTests = ['src/tests/exampleCourseQuestions.test.ts'];

export default defineConfig(({ mode }) => {
  let include: string[] = configDefaults.include;
  let exclude: string[] = configDefaults.exclude;

  if (mode === 'only-docker') {
    if (isRunningOnDist) throw new Error('Cannot run only-docker tests on dist files.');
    include = dockerOnlyTests;
  } else if (mode === 'only-local') {
    if (isRunningOnDist) throw new Error('Cannot run only-local tests on dist files.');
    exclude = [...dockerOnlyTests, ...configDefaults.exclude];
  } else if (isRunningOnDist) {
    include = [join(import.meta.dirname, 'dist/**/*.test.js')];
    exclude = configDefaults.exclude.filter((e) => !e.includes('/dist/'));
  }

  return mergeConfig(
    sharedConfig,
    defineConfig({
      test: {
        name: '@prairielearn/prairielearn',
        include,
        exclude,
        globalSetup: isRunningOnDist
          ? join(import.meta.dirname, './dist/tests/vitest.globalSetup.js')
          : join(import.meta.dirname, './src/tests/vitest.globalSetup.ts'),
        setupFiles: isRunningOnDist
          ? [join(import.meta.dirname, './dist/tests/vitest.testSetup.js')]
          : [join(import.meta.dirname, './src/tests/vitest.testSetup.ts')],
        passWithNoTests: true,
        hookTimeout: 20_000,
        testTimeout: 10_000,

        coverage: {
          all: true,
          include: ['src/**'],
          reporter: ['html', 'text-summary', 'cobertura'],
        },
      },
    }),
  );
});
