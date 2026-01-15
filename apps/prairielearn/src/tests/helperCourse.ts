import * as path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import * as tmp from 'tmp';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as syncFromDisk from '../sync/syncFromDisk.js';

import { makeMockLogger } from './mockLogger.js';

const sql = loadSqlEquiv(import.meta.url);

export async function syncCourse(courseDir = TEST_COURSE_PATH) {
  const { logger, getOutput } = makeMockLogger();
  const syncResult = await syncFromDisk.syncOrCreateDiskToSql(courseDir, logger);
  if (syncResult.status === 'sharing_error' || syncResult.hadJsonErrorsOrWarnings) {
    console.log(getOutput());
    throw new Error(`Errors or warnings found during sync of ${courseDir}`);
  }
}

export async function updateCourseRepository({
  courseId,
  repository,
}: {
  courseId: string;
  repository: string;
}) {
  await execute(sql.update_course_repo, { courseId, repository });
}

/**
 * Represents a test course repository setup with origin, live, and dev directories.
 *
 * - `courseOriginDir`: A bare git repository that acts as the remote origin
 * - `courseLiveDir`: A clone of origin that the server uses (simulates production)
 * - `courseDevDir`: A clone of origin that simulates a developer's local checkout
 */
export interface CourseRepoSetup {
  baseDir: string;
  courseOriginDir: string;
  courseLiveDir: string;
  courseDevDir: string;
}

/**
 * Creates a test course repository setup with git capabilities.
 *
 * This function:
 * 1. Creates a bare git repository (origin)
 * 2. Clones it to a "live" directory
 * 3. Copies course template files to the live directory
 * 4. Commits and pushes the initial content
 * 5. Clones to a "dev" directory for simulating developer changes
 *
 * @param courseTemplateDir - Path to the course template directory to copy into the repo
 * @returns Setup object with paths to all directories
 */
export async function createCourseRepo(courseTemplateDir: string): Promise<CourseRepoSetup> {
  const baseDir = tmp.dirSync().name;
  const courseOriginDir = path.join(baseDir, 'courseOrigin');
  const courseLiveDir = path.join(baseDir, 'courseLive');
  const courseDevDir = path.join(baseDir, 'courseDev');

  // Create bare origin repo with master as default branch
  await execa('git', ['-c', 'init.defaultBranch=master', 'init', '--bare', courseOriginDir], {
    cwd: '.',
    env: process.env,
  });

  // Clone to live directory
  await execa('git', ['clone', courseOriginDir, courseLiveDir], {
    cwd: '.',
    env: process.env,
  });

  // Copy template files
  await fs.copy(courseTemplateDir, courseLiveDir);

  // Add, commit, and push
  const execOptions = { cwd: courseLiveDir, env: process.env };
  await execa('git', ['add', '-A'], execOptions);
  await execa('git', ['commit', '-m', 'Initial commit'], execOptions);
  await execa('git', ['push', 'origin', 'master'], execOptions);

  // Clone to dev directory
  await execa('git', ['clone', courseOriginDir, courseDevDir], {
    cwd: '.',
    env: process.env,
  });

  return {
    baseDir,
    courseOriginDir,
    courseLiveDir,
    courseDevDir,
  };
}

/**
 * Cleans up a course repository setup by removing all directories.
 */
export async function deleteCourseRepo(setup: CourseRepoSetup): Promise<void> {
  await fs.remove(setup.courseOriginDir);
  await fs.remove(setup.courseLiveDir);
  await fs.remove(setup.courseDevDir);
}

/**
 * Git options for executing commands in a specific directory.
 */
export interface GitOptions {
  cwd: string;
  env: typeof process.env;
}

/**
 * Creates a separate git repository setup for testing course sharing scenarios.
 *
 * Unlike `createCourseRepo`, this creates a non-bare origin repository that can
 * be used with `syncUtil.writeCourseToDirectory` for programmatic course creation.
 *
 * @param originDir - Path where the origin repository should be created
 * @param liveDir - Path where the live clone should be created
 * @returns Git options objects for both origin and live directories
 */
export async function createSharingCourseRepo(
  originDir: string,
  liveDir: string,
): Promise<{ gitOptionsOrigin: GitOptions; gitOptionsLive: GitOptions }> {
  const gitOptionsOrigin: GitOptions = { cwd: originDir, env: process.env };
  const gitOptionsLive: GitOptions = { cwd: liveDir, env: process.env };

  // Initialize non-bare origin (content written externally via syncUtil.writeCourseToDirectory)
  await execa('git', ['-c', 'init.defaultBranch=master', 'init'], gitOptionsOrigin);

  return { gitOptionsOrigin, gitOptionsLive };
}

/**
 * Commits content and clones to a live directory for sharing course tests.
 *
 * Call this after writing course content to the origin directory.
 */
export async function commitAndCloneSharingCourse(
  originDir: string,
  liveDir: string,
  gitOptionsOrigin: GitOptions,
): Promise<void> {
  await execa('git', ['add', '-A'], gitOptionsOrigin);
  await execa('git', ['commit', '-m', 'initial commit'], gitOptionsOrigin);
  await fs.mkdir(liveDir, { recursive: true });
  await execa('git', ['clone', originDir, liveDir], {
    cwd: '.',
    env: process.env,
  });
}
