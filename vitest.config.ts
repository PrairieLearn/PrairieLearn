import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { slash } from '@vitest/utils/helpers';
import ignore from 'ignore';
import { dirname, relative, resolve } from 'pathe';
import { defineConfig, mergeConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

// Vitest will try to intelligently sequence the test suite based on which ones
// are slowest. However, this depends on cached data from previous runs, which
// isn't available in CI. So, we manually specify the slowest tests here and
// use a custom sequencer to always run them first.
// Recent per-test timings (from master CI) were used to balance these shards.
// Each of the first five shards is anchored around one of the longest-running
// tests, so that no single shard is dramatically longer than the others.
const SLOW_TESTS_SHARDS: Record<number, string[]> = {
  1: ['src/tests/exampleCourseQuestionsComplete.test.ts'],
  2: ['src/tests/exampleCourseQuestions.test.ts'],
  3: ['src/tests/accessibility/index.test.ts'],
  4: ['src/tests/homework.test.ts', 'src/tests/cron.test.ts'],
  5: ['src/tests/fileEditor.test.ts', 'src/tests/exam.test.ts'],
  6: [],
};

// Each shard gets a contiguous range of the tests outside of SLOW_TESTS, sized
// inversely to how much slow-test work the shard already has.
const NUM_SLICES = 13;
const SHARD_SLICES: Record<number, { start: number; end: number }> = {
  1: { start: 0, end: 0 },
  2: { start: 0, end: 0 },
  3: { start: 0, end: 1 },
  4: { start: 1, end: 4 },
  5: { start: 4, end: 8 },
  6: { start: 8, end: NUM_SLICES },
};

const SHARD_COUNT = Object.keys(SLOW_TESTS_SHARDS).length;

const SLOW_TESTS = Object.values(SLOW_TESTS_SHARDS).flat();

// Save repository root, for running in any directory
const repoRoot = dirname(fileURLToPath(import.meta.url));

// Loads and parses the gitignore file using the ignore package,
// which already handles directories, nested paths and edge cases
// using the same rules Git uses.
const gitignore = ignore();
const gitignorePath = resolve(repoRoot, '.gitignore');
if (existsSync(gitignorePath)) {
  gitignore.add(readFileSync(gitignorePath, 'utf8'));
}

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
    if (count !== SHARD_COUNT) {
      throw new Error(`Expected ${SHARD_COUNT} shards`);
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
      : ['default'],
  },
  server: {
    watch: {
      // The file-watching system calls this function for every file change.
      // Returning true means "ignore this file".
      ignored: (filePath: string) => {
        // Absolute paths need to be converted to relative paths,
        // because .gitignore rules are evaluated relative to the root.
        const relativePath = relative(repoRoot, filePath);

        // relative() can return an empty string, causing an error
        // if passed as an argument to the ignores function, so this case
        // should be short-circuited.
        if (!relativePath || relativePath.startsWith('..')) {
          return false;
        }

        return gitignore.ignores(relativePath);
      },
    },
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
