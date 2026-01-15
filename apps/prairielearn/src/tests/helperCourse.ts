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
 * Git options for executing commands in a specific directory.
 */
export interface GitOptions {
  cwd: string;
  env: typeof process.env;
}

/**
 * Represents a test course repository fixture with origin, live, and dev directories.
 */
export interface CourseRepoFixture {
  baseDir: string;
  courseOriginDir: string;
  courseLiveDir: string;
  courseDevDir: string;
  /** Git options for the origin directory. Only present for non-bare origins (populateOrigin). */
  gitOptionsOrigin: GitOptions | null;
  /** Git options for the live directory. */
  gitOptionsLive: GitOptions;
}

interface PopulateOriginOptions {
  populateOrigin: (originDir: string) => Promise<void>;
}

/**
 * Creates a test course repository fixture with git capabilities.
 *
 * Two ways to populate the course content:
 * 1. Template-based: Pass a path to a course template directory to copy.
 * 2. Programmatic: Pass a populateOrigin callback to write files directly.
 *
 * Both create the same structure: a non-bare origin repo with clones for live and dev.
 */
export async function createCourseRepoFixture(
  options: PopulateOriginOptions | string,
): Promise<CourseRepoFixture> {
  const baseDir = tmp.dirSync().name;
  const courseOriginDir = path.join(baseDir, 'courseOrigin');
  const courseLiveDir = path.join(baseDir, 'courseLive');
  const courseDevDir = path.join(baseDir, 'courseDev');

  // Populate the origin directory
  if (typeof options === 'string') {
    await fs.copy(options, courseOriginDir);
  } else {
    await options.populateOrigin(courseOriginDir);
  }

  // Initialize git in origin
  const gitOptionsOrigin = { cwd: courseOriginDir, env: process.env };
  await execa('git', ['-c', 'init.defaultBranch=master', 'init'], gitOptionsOrigin);
  await execa('git', ['add', '-A'], gitOptionsOrigin);
  await execa('git', ['commit', '-m', 'Initial commit'], gitOptionsOrigin);
  // Allow pushes to this non-bare repo's checked-out branch
  await execa('git', ['config', 'receive.denyCurrentBranch', 'updateInstead'], gitOptionsOrigin);

  // Clone to live and dev
  await execa('git', ['clone', courseOriginDir, courseLiveDir], { cwd: '.', env: process.env });
  await execa('git', ['clone', courseOriginDir, courseDevDir], { cwd: '.', env: process.env });

  return {
    baseDir,
    courseOriginDir,
    courseLiveDir,
    courseDevDir,
    gitOptionsOrigin,
    gitOptionsLive: { cwd: courseLiveDir, env: process.env },
  };
}
