import path from 'node:path';

import { execa } from 'execa';

import { contains } from '@prairielearn/path-utils';

type GitChangeType = 'A' | 'M' | 'D';

export type GitChangedFiles = Record<string, GitChangeType>;

/**
 * Identifies the files that changes between two commits in a given course.
 *
 * @param coursePath The course directory to diff
 * @param oldHash The old (previous) hash for the diff
 * @param newHash The new (current) hash for the diff
 * @returns List of changed files
 */
export async function identifyChangedFiles(
  coursePath: string,
  oldHash: string,
  newHash: string,
): Promise<GitChangedFiles> {
  // In some specific scenarios, the course directory and the root of the course
  // repository might be different. For example, the example course is usually
  // manually cloned in production environments, and then the course is added
  // with the path set to the absolute path of the repo _plus_ `exampleCourse/`.
  //
  // In these cases, we need to make sure that the paths we're returning from
  // this function are relative to the course directory, not the root of the
  // repository. To do this, we query git itself for the root of the repository,
  // construct an absolute path for each file, and then trim off the course path.
  const { stdout: topLevelStdout } = await execa('git', ['rev-parse', '--show-toplevel'], {
    cwd: coursePath,
  });
  const topLevel = topLevelStdout.trim();

  const { stdout: diffStdout } = await execa(
    'git',
    ['diff', '--name-only', `${oldHash}..${newHash}`],
    {
      cwd: coursePath,
      // This defaults to 1MB of output, however, we've observed in the past that
      // courses will go long periods of time without syncing, which in turn will
      // result in a large number of changed files. The largest diff we've seen
      // is 1.6MB of text; this new value was chosen to give us plenty of
      // headroom.
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  const changedFiles: GitChangedFiles = {};
  diffStdout
    .trim()
    .split('\n')
    .forEach((f) => {
      const [changeType, filePath] = f.split('\t');

      const absolutePath = path.join(topLevel, filePath);
      if (!contains(coursePath, absolutePath)) return;

      changedFiles[filePath] = changeType as GitChangeType;
    });

  return changedFiles;
}
