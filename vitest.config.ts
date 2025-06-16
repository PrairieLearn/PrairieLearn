import { defineConfig, mergeConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification, resolveConfig } from 'vitest/node';

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
    const slowTests = sortedFiles.filter((file) => {
      return (
        file.project.config.root.includes('apps/prairielearn') &&
        SLOW_TESTS.some((slowTest) => file.moduleId.includes(slowTest))
      );
    });
    const otherTests = sortedFiles.filter((file) => {
      return (
        !file.project.config.root.includes('apps/prairielearn') ||
        !SLOW_TESTS.some((slowTest) => file.moduleId.includes(slowTest))
      );
    });

    return [...slowTests, ...otherTests];
  }

  async shard(files: TestSpecification[]) {
    return super.shard(files);
  }
}

export const sharedConfig = defineConfig({
  test: {
    isolate: false,
    sequence: {
      sequencer: CustomSequencer,
    },
    reporters: process.env.GITHUB_ACTIONS
      ? [
          'default',
          [
            'github-actions',
            {
              onWritePath(path: string) {
                // GitHub expects that when formatting an error message, the filename is relative to the project root.
                // Since we run in a Docker container for CI, we need to ensure that the filename matches what GitHub expects.
                // https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-an-error-message
                return path.replace(/^\/PrairieLearn\//, '');
              },
            },
          ],
        ]
      : ['default'],
  },
});

export default defineConfig(async ({ mode }) => {
  // Resolve the Vitest configuration for PrairieLearn with the given mode.
  // By default, the configuration is not resolved with the mode.
  const { vitestConfig: prairielearnTestConfig } = await resolveConfig({
    mode,
    config: 'vitest.config.ts',
    root: 'apps/prairielearn',
  });
  return mergeConfig(
    sharedConfig,
    defineConfig({
      test: {
        projects: [
          'packages/*',
          'apps/grader-host',
          'apps/workspace-host',
          {
            test: prairielearnTestConfig,
          },
        ],
        coverage: {
          all: true,
          reporter: ['html', 'text-summary', 'cobertura'],
          include: ['{apps,packages}/*/src/**'],
        },
      },
    }),
  );
});
