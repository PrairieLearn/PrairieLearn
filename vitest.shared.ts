import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ignore from 'ignore';
import { defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

import { DurationsReporter, loadDurations, specDurationKey } from './vitest.durations';

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

// Files with no recorded duration (new files, or no durations file at all)
// are assumed to take this long.
const DEFAULT_DURATION_MS = 1000;

/**
 * Splits test files across CI shards using durations recorded from a previous
 * run (see `vitest.durations.ts`), so that each shard gets about the same amount
 * of work. Shards can't coordinate with each other while they run, but every
 * shard sees the same files and the same durations, so they all compute the
 * same assignment independently.
 */
class CustomSequencer extends BaseSequencer {
  private durations = loadDurations();

  private duration(spec: TestSpecification) {
    return this.durations?.get(specDurationKey(spec)) ?? DEFAULT_DURATION_MS;
  }

  private sortByDuration(files: TestSpecification[]) {
    return files
      .map((spec) => ({ spec, key: specDurationKey(spec), duration: this.duration(spec) }))
      .sort((a, b) => b.duration - a.duration || a.key.localeCompare(b.key))
      .map(({ spec }) => spec);
  }

  async sort(files: TestSpecification[]) {
    // Without recorded durations, fall back to Vitest's own ordering, which
    // uses durations cached from previous local runs.
    if (!this.durations) return super.sort(files);

    // Start the longest files first so that they don't end up running alone
    // at the end of the run.
    return this.sortByDuration(files);
  }

  async shard(files: TestSpecification[]) {
    const { index, count } = this.ctx.config.shard!;

    // Greedily assign each file, longest first, to the shard with the least
    // work so far.
    const loads = Array.from({ length: count }, () => 0);
    const assigned: TestSpecification[][] = Array.from({ length: count }, () => []);
    for (const spec of this.sortByDuration(files)) {
      const shard = loads.indexOf(Math.min(...loads));
      loads[shard] += this.duration(spec);
      assigned[shard].push(spec);
    }

    return assigned[index - 1];
  }
}

const githubActionsReporter: ['github-actions', { onWritePath(path: string): string }] = [
  'github-actions',
  {
    onWritePath(path: string) {
      // GitHub expects that when formatting an error message, the filename is relative to the project root.
      // Since we run in a Docker container for CI, we need to ensure that the filename matches what GitHub expects.
      // https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-an-error-message
      return path.replace(/^\/PrairieLearn\//, '');
    },
  },
];

export const sharedConfig = defineConfig({
  test: {
    isolate: false,
    sequence: {
      sequencer: CustomSequencer,
    },
    reporters: [
      ...(process.env.VITEST_DURATIONS_OUTPUT
        ? [new DurationsReporter(process.env.VITEST_DURATIONS_OUTPUT)]
        : []),
      ...(process.env.GITHUB_ACTIONS
        ? ['default', ...(process.env.SHARDED_TESTS ? ['blob'] : []), githubActionsReporter]
        : ['default']),
    ],
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
