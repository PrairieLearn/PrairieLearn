import { exec } from 'child_process';
import { callbackify, promisify } from 'util';

import * as sqldb from '@prairielearn/postgres';
import * as error from '@prairielearn/error';

const sql = sqldb.loadSqlEquiv(__filename);

export async function getCommitHashAsync(coursePath: string): Promise<string> {
  try {
    const { stdout } = await promisify(exec)('git rev-parse HEAD', {
      cwd: coursePath,
      env: process.env,
    });
    return stdout.trim();
  } catch (err) {
    throw error.makeWithData(`Could not get git status; exited with code ${err.code}`, {
      stdout: err.stdout,
      stderr: err.stderr,
    });
  }
}
export const getCommitHash = callbackify(getCommitHashAsync);

/**
 * Loads the current commit hash from disk and stores it in the database. This
 * will also add the `commit_hash` property to the given course object.
 */
export async function updateCourseCommitHashAsync(course: {
  id: string;
  path: string;
}): Promise<string> {
  const hash = await getCommitHashAsync(course.path);
  await sqldb.queryAsync(sql.update_course_commit_hash, {
    course_id: course.id,
    commit_hash: hash,
  });
  return hash;
}
export const updateCourseCommitHash = callbackify(updateCourseCommitHashAsync);

/**
 * If the provided course object contains a commit hash, that will be used;
 * otherwise, the commit hash will be loaded from disk and stored in the
 * database.
 *
 * This should only ever really need to happen at max once per course - in the
 * future, the commit hash will already be in the course object and will be
 * updated during course sync.
 */
export async function getOrUpdateCourseCommitHashAsync(course: {
  id: string;
  path: string;
  commit_hash?: string | null;
}): Promise<string> {
  return course.commit_hash ?? (await updateCourseCommitHashAsync(course));
}
export const getOrUpdateCourseCommitHash = callbackify(getOrUpdateCourseCommitHashAsync);
