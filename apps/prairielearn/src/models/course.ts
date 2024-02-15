import { promisify } from 'util';
import { exec } from 'child_process';
import { z } from 'zod';
import { loadSqlEquiv, queryRow, queryAsync, queryRows } from '@prairielearn/postgres';
import * as error from '@prairielearn/error';

import { Course, CourseSchema } from '../lib/db-types';

const sql = loadSqlEquiv(__filename);

const CourseWithPermissionsSchema = CourseSchema.extend({
  permissions_course: z.object({
    course_role: z.enum(['None', 'Previewer', 'Viewer', 'Editor', 'Owner']),
    has_course_permission_own: z.boolean(),
    has_course_permission_edit: z.boolean(),
    has_course_permission_view: z.boolean(),
    has_course_permission_preview: z.boolean(),
  }),
});

export async function selectCourseById(course_id: string): Promise<Course> {
  return await queryRow(
    sql.select_course_by_id,
    {
      course_id,
    },
    CourseSchema,
  );
}

export function getLockNameForCoursePath(coursePath: string): string {
  return `coursedir:${coursePath}`;
}

export async function getCourseCommitHash(coursePath: string): Promise<string> {
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

/**
 * Loads the current commit hash from disk and stores it in the database. This
 * will also add the `commit_hash` property to the given course object.
 */
export async function updateCourseCommitHash(course: {
  id: string;
  path: string;
}): Promise<string> {
  const hash = await getCourseCommitHash(course.path);
  await queryAsync(sql.update_course_commit_hash, {
    course_id: course.id,
    commit_hash: hash,
  });
  return hash;
}

/**
 * If the provided course object contains a commit hash, that will be used;
 * otherwise, the commit hash will be loaded from disk and stored in the
 * database.
 *
 * This should only ever really need to happen at max once per course - in the
 * future, the commit hash will already be in the course object and will be
 * updated during course sync.
 */
export async function getOrUpdateCourseCommitHash(course: {
  id: string;
  path: string;
  commit_hash?: string | null;
}): Promise<string> {
  return course.commit_hash ?? (await updateCourseCommitHash(course));
}

/**
 * Returns all courses to which the given user has staff access.
 *
 * Note that this does not take into account any effective user overrides that
 * may be in place. It is the caller's responsibility to further restrict
 * the results if necessary.
 */
export async function selectCoursesWithStaffAccess({
  user_id,
  is_administrator,
}: {
  user_id: string;
  is_administrator: boolean;
}) {
  const courses = await queryRows(
    sql.select_courses_with_staff_access,
    { user_id, is_administrator },
    CourseWithPermissionsSchema,
  );
  return courses;
}

/**
 * Returns all courses to which the given user has edit access.
 *
 * Note that this does not take into account any effective user overrides that
 * may be in place. It is the caller's responsibility to further restrict
 * the results if necessary.
 */
export async function selectCoursesWithEditAccess({
  user_id,
  is_administrator,
}: {
  user_id: string;
  is_administrator: boolean;
}) {
  const courses = await selectCoursesWithStaffAccess({
    user_id,
    is_administrator,
  });
  return courses.filter((c) => c.permissions_course.has_course_permission_edit);
}

export async function selectOrInsertCourseByPath(coursePath: string): Promise<Course> {
  return await queryRow(sql.select_or_insert_course_by_path, { path: coursePath }, CourseSchema);
}
