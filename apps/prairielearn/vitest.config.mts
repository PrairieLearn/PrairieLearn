import { join } from 'path';

import { configDefaults, defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification, type Vitest } from 'vitest/node';
import { GithubActionsReporter } from 'vitest/reporters';
// Vitest will try to intelligently sequence the test suite based on which ones
// are slowest. However, this depends on cached data from previous runs, which
// isn't available in CI. So, we manually specify the slowest tests here and
// use a custom sequencer to always run them first.
const SLOW_TESTS = [
  'src/tests/exampleCourseQuestions.test.ts',
  'src/tests/fileEditor.test.ts',
  'src/tests/homework.test.ts',
  'src/tests/exam.test.ts',
  'src/tests/accessibility/index.test.ts',
  'src/tests/cron.test.ts',
];

class CustomSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    const sortedFiles = await super.sort(files);

    // Put all the slow tests at the beginning.
    const slowTests = sortedFiles.filter((file) =>
      SLOW_TESTS.some((slowTest) => file.moduleId.includes(slowTest)),
    );
    const otherTests = sortedFiles.filter(
      (file) => !SLOW_TESTS.some((slowTest) => file.moduleId.includes(slowTest)),
    );

    return [...slowTests, ...otherTests];
  }

  async shard(files: TestSpecification[]) {
    return super.shard(files);
  }
}

/**
 * GitHub expects that when formatting an error message, the filename is relative to the project root.
 * Since we run in a Docker container for CI, we need to ensure that the filename matches what GitHub expects.
 * https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-an-error-message
 *
 * Vitest may add a first-party API to make this easier:
 * https://github.com/vitest-dev/vitest/issues/8008
 */
export class CustomGithubReporter extends GithubActionsReporter {
  override onInit(ctx: Vitest) {
    super.onInit(ctx);
    const origLog = this.ctx.logger.log;
    this.ctx.logger.log = (...args: any[]) => {
      if (args.length === 1) {
        args[0] = args[0].replaceAll(/(file=)\/PrairieLearn\//g, '$1');
      }

      origLog.call(this.ctx.logger, ...args);
    };
  }
}

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
export default defineConfig(({ mode }) => {
  const isRunningOnDist = mode === 'dist';
  return {
    test: {
      reporters: process.env.GITHUB_ACTIONS ? ['default', new CustomGithubReporter()] : ['default'],
      include: isRunningOnDist
        ? [join(import.meta.dirname, 'dist/**/*.test.js')]
        : [...configDefaults.include],
      exclude: isRunningOnDist
        ? configDefaults.exclude.filter((e) => !e.includes('/dist/'))
        : configDefaults.exclude,
      globalSetup: isRunningOnDist
        ? join(import.meta.dirname, './dist/tests/vitest.globalSetup.js')
        : join(import.meta.dirname, './src/tests/vitest.globalSetup.mts'),
      setupFiles: isRunningOnDist
        ? [join(import.meta.dirname, './dist/tests/vitest.testSetup.js')]
        : [join(import.meta.dirname, './src/tests/vitest.testSetup.mts')],
      passWithNoTests: true,
      hookTimeout: 20_000,
      testTimeout: 20_000,
      isolate: false,
      sequence: {
        sequencer: CustomSequencer,
      },
      coverage: {
        all: true,
        include: ['src/**'],
        reporter: ['html', 'text-summary', 'cobertura'],
      },
    },
  };
});
