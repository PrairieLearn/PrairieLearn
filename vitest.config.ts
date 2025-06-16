import crypto from 'node:crypto';

import { resolve } from 'pathe';
import { slash } from 'vite-node/utils';
import { defineConfig, mergeConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification, resolveConfig } from 'vitest/node';

// Vitest will try to intelligently sequence the test suite based on which ones
// are slowest. However, this depends on cached data from previous runs, which
// isn't available in CI. So, we manually specify the slowest tests here and
// use a custom sequencer to always run them first.
const SLOW_TESTS_SHARDS = {
  1: ['src/tests/exampleCourseQuestionsComplete.test.ts'],
  2: ['src/tests/exampleCourseQuestions.test.ts'],
  3: ['src/tests/homework.test.ts', 'src/tests/fileEditor.test.ts'],
  4: ['src/tests/accessibility/index.test.ts', 'src/tests/cron.test.ts', 'src/tests/exam.test.ts'],
};

const NUM_SLICES = 7;
const SHARD_SLICES = {
  1: { start: 0, end: 1 },
  2: { start: 1, end: 2 },
  3: { start: 2, end: 4 },
  4: { start: 4, end: NUM_SLICES },
};

const SLOW_TESTS = Object.values(SLOW_TESTS_SHARDS).flat();

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
    const { config } = this.ctx;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { index } = config.shard!;

    // Some shards run slower tests, so other shards should take more 'slices'
    // so that the runtimes of each shard are approximately balanced.
    const sliceSize = Math.ceil(files.length / NUM_SLICES);
    const { start, end }: { start: number; end: number } = SHARD_SLICES[index];
    const shardStart = sliceSize * start;
    const shardEnd = sliceSize * end;

    // Implementation: https://github.com/vitest-dev/vitest/blob/cecc4e/packages/vitest/src/node/sequencers/BaseSequencer.ts#L16-L33
    const originalShardTests = files
      .filter((file) => {
        // Filter out the slow tests, as they are handled separately
        return !(
          file.project.config.root.includes('apps/prairielearn') &&
          SLOW_TESTS.some((slowTest) => file.moduleId.includes(slowTest))
        );
      })
      .map((spec) => {
        const fullPath = resolve(slash(config.root), slash(spec.moduleId));
        const specPath = fullPath?.slice(config.root.length);
        return {
          spec,
          hash: crypto.hash('sha1', specPath, 'hex'),
        };
      })
      .sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0))
      .slice(shardStart, shardEnd)
      .map(({ spec }) => spec);

    // Manually assign the slow tests to different shards to avoid multiple
    // slow tests being placed on the same shard
    const slowShardFiles = SLOW_TESTS_SHARDS[index];
    const slowShardTests = files.filter((file) => {
      return (
        file.project.config.root.includes('apps/prairielearn') &&
        slowShardFiles.some((slowTest) => file.moduleId.includes(slowTest))
      );
    });

    const shardTests = [...originalShardTests, ...slowShardTests];
    return shardTests;
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
