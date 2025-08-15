import crypto from 'node:crypto';

import { slash } from '@vitest/utils/helpers';
import { resolve } from 'pathe';
import { defineConfig, mergeConfig } from 'vitest/config';
import {
  BaseSequencer,
  type TestCase,
  type TestModuleState,
  type TestSpecification,
} from 'vitest/node';
import { DefaultReporter } from 'vitest/reporters';

// Vitest will try to intelligently sequence the test suite based on which ones
// are slowest. However, this depends on cached data from previous runs, which
// isn't available in CI. So, we manually specify the slowest tests here and
// use a custom sequencer to always run them first.
const SLOW_TESTS_SHARDS: Record<number, string[]> = {
  1: ['src/tests/exampleCourseQuestionsComplete.test.ts'],
  2: ['src/tests/exampleCourseQuestions.test.ts'],
  3: ['src/tests/homework.test.ts', 'src/tests/fileEditor.test.ts'],
  4: ['src/tests/accessibility/index.test.ts', 'src/tests/cron.test.ts', 'src/tests/exam.test.ts'],
};

const SLOW_TESTS = Object.values(SLOW_TESTS_SHARDS).flat();

// Each shard will get a certain slice of the tests outside of SLOW_TESTS.
// This is a rough heuristic to try to balance the runtime of each shard.
// For example, shard 3 will get 2/7 of these other tests.
const NUM_SLICES = 7;
const SHARD_SLICES: Record<number, { start: number; end: number }> = {
  1: { start: 0, end: 0 },
  2: { start: 0, end: 1 },
  3: { start: 1, end: 3 },
  4: { start: 3, end: NUM_SLICES },
};

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

    const { index, count } = config.shard!;
    if (count !== 4) {
      throw new Error('Expected 4 shards');
    }

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

/**
 * This custom reporter is used to override the default reporter
 * to not print successful tests live. They clutter the output,
 * making it harder to see slow and failing tests as they occur.
 */
export class SlowAndFailingReporter extends DefaultReporter {
  renderSucceed = false;
  onTestRunStart(_: readonly TestSpecification[]): void {}
  printTestCase(moduleState: TestModuleState, test: TestCase) {
    // The original reporter prints all test case failures in a module if *any* in that
    // module failed.

    // This custom reporter overrides the default reporter to *only* print the slow
    // and failing tests.
    // See https://github.com/vitest-dev/vitest/blob/512ac7f8d6f3ccb242dc14972f1bcda93abfeed2/packages/vitest/src/node/reporters/base.ts#L212-L214
    if (moduleState === 'failed') {
      moduleState = 'passed';
    }
    super.printTestCase(moduleState, test);
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
          ...(process.env.SHARDED_TESTS ? ['blob'] : []),
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
      : [new SlowAndFailingReporter()],
  },
});

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      projects: ['{apps,packages}/*/vitest.config.ts'],
      coverage: {
        reporter: ['html', 'text-summary', 'cobertura'],
        include: ['{apps,packages}/*/src/**/*.{ts,tsx}'],
      },
    },
  }),
);
