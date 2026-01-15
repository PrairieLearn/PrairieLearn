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
 * Represents a test course repository setup with origin, live, and optionally dev directories.
 */
export interface CourseRepoSetup {
  baseDir: string;
  courseOriginDir: string;
  courseLiveDir: string;
  courseDevDir: string;
  /** Git options for the origin directory. Only present for non-bare origins (populateOrigin). */
  gitOptionsOrigin: GitOptions | null;
  /** Git options for the live directory. */
  gitOptionsLive: GitOptions;
}

interface CreateCourseRepoOptions {
  /** Path to course template to copy. Mutually exclusive with populateOrigin. */
  courseTemplateDir?: string;

  /**
   * Function to populate the origin directory with course content.
   * Called before git init. Must create the directory and write files.
   * Results in a non-bare origin that can receive direct commits.
   * Mutually exclusive with courseTemplateDir.
   */
  populateOrigin?: (originDir: string) => Promise<void>;

  /** Whether to create a dev directory clone. Default: true if courseTemplateDir, false if populateOrigin. */
  createDevDir?: boolean;
}

/**
 * Creates a test course repository setup with git capabilities.
 *
 * Two patterns are supported:
 * 1. Template-based: Pass a courseTemplateDir path (or just a string). Creates a bare origin,
 *    clones to live, copies template, commits, pushes, and clones to dev.
 * 2. Programmatic: Pass a populateOrigin callback. Calls the callback to write files,
 *    then initializes a non-bare git repo, commits, and clones to live.
 */
export async function createCourseRepo(
  optionsOrTemplateDir: CreateCourseRepoOptions | string,
): Promise<CourseRepoSetup> {
  const options: CreateCourseRepoOptions =
    typeof optionsOrTemplateDir === 'string'
      ? { courseTemplateDir: optionsOrTemplateDir }
      : optionsOrTemplateDir;

  if (options.courseTemplateDir && options.populateOrigin) {
    throw new Error('Cannot specify both courseTemplateDir and populateOrigin');
  }
  if (!options.courseTemplateDir && !options.populateOrigin) {
    throw new Error('Must specify either courseTemplateDir or populateOrigin');
  }

  const baseDir = tmp.dirSync().name;
  const courseOriginDir = path.join(baseDir, 'courseOrigin');
  const courseLiveDir = path.join(baseDir, 'courseLive');
  const courseDevDir = path.join(baseDir, 'courseDev');

  let gitOptionsOrigin: GitOptions | null = null;

  if (options.courseTemplateDir) {
    // Template pattern: bare origin, clone to live, copy template, commit, push
    await execa('git', ['-c', 'init.defaultBranch=master', 'init', '--bare', courseOriginDir], {
      cwd: '.',
      env: process.env,
    });
    await execa('git', ['clone', courseOriginDir, courseLiveDir], { cwd: '.', env: process.env });
    await fs.copy(options.courseTemplateDir, courseLiveDir);
    const execOptions = { cwd: courseLiveDir, env: process.env };
    await execa('git', ['add', '-A'], execOptions);
    await execa('git', ['commit', '-m', 'Initial commit'], execOptions);
    await execa('git', ['push', 'origin', 'master'], execOptions);
  } else {
    // Programmatic pattern: populate origin, git init, commit, clone to live
    await options.populateOrigin!(courseOriginDir);
    gitOptionsOrigin = { cwd: courseOriginDir, env: process.env };
    await execa('git', ['-c', 'init.defaultBranch=master', 'init'], gitOptionsOrigin);
    await execa('git', ['add', '-A'], gitOptionsOrigin);
    await execa('git', ['commit', '-m', 'Initial commit'], gitOptionsOrigin);
    await execa('git', ['clone', courseOriginDir, courseLiveDir], { cwd: '.', env: process.env });
  }

  const createDevDir = options.createDevDir ?? !!options.courseTemplateDir;
  if (createDevDir) {
    await execa('git', ['clone', courseOriginDir, courseDevDir], { cwd: '.', env: process.env });
  }

  return {
    baseDir,
    courseOriginDir,
    courseLiveDir,
    courseDevDir,
    gitOptionsOrigin,
    gitOptionsLive: { cwd: courseLiveDir, env: process.env },
  };
}
