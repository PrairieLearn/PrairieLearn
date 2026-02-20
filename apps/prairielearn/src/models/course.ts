import assert from 'assert';

import { execa } from 'execa';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { calculateCourseRolePermissions } from '../lib/authz-data-lib.js';
import { type Course, CourseSchema, type EnumCourseRole } from '../lib/db-types.js';

import { insertAuditLog } from './audit-log.js';

const sql = loadSqlEquiv(import.meta.url);

const CourseWithPermissionsSchema = CourseSchema.extend({
  permissions_course: z.object({
    course_role: z.enum(['None', 'Previewer', 'Viewer', 'Editor', 'Owner']),
  }),
});
export type CourseWithPermissions = Course & {
  permissions_course: {
    course_role: EnumCourseRole;
    has_course_permission_own: boolean;
    has_course_permission_edit: boolean;
    has_course_permission_view: boolean;
    has_course_permission_preview: boolean;
  };
};

export async function selectCourseById(course_id: string): Promise<Course> {
  return await queryRow(sql.select_course_by_id, { course_id }, CourseSchema);
}

export async function selectOptionalCourseById(course_id: string): Promise<Course | null> {
  return await queryOptionalRow(sql.select_course_by_id, { course_id }, CourseSchema);
}

export async function selectCourseByShortName(shortName: string): Promise<Course> {
  return await queryRow(sql.select_course_by_short_name, { short_name: shortName }, CourseSchema);
}

export function getLockNameForCoursePath(coursePath: string): string {
  return `coursedir:${coursePath}`;
}

export async function getCourseCommitHash(coursePath: string): Promise<string> {
  try {
    const { stdout } = await execa('git', ['rev-parse', 'HEAD'], {
      cwd: coursePath,
      env: process.env,
    });
    return stdout.trim();
  } catch (err: any) {
    throw new error.AugmentedError(`Could not get git status; exited with code ${err.exitCode}`, {
      data: {
        stdout: err.stdout,
        stderr: err.stderr,
      },
    });
  }
}

/**
 * Gets the default branch from a git repository by querying origin/HEAD.
 * Returns 'master' as fallback if the query fails.
 */
export async function getGitDefaultBranch(coursePath: string): Promise<string> {
  try {
    const { stdout } = await execa('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
      cwd: coursePath,
      env: process.env,
    });
    // Strip 'origin/' prefix if present
    const branch = stdout.trim().replace(/^origin\//, '');
    return branch || 'master';
  } catch {
    return 'master';
  }
}

/**
 * Gets the remote URL for 'origin' from a git repository.
 * Returns null if the query fails.
 */
export async function getGitRemoteUrl(coursePath: string): Promise<string | null> {
  try {
    const { stdout } = await execa('git', ['remote', 'get-url', 'origin'], {
      cwd: coursePath,
      env: process.env,
    });
    return stdout.trim() || null;
  } catch {
    return null;
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
  await execute(sql.update_course_commit_hash, {
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
}): Promise<CourseWithPermissions[]> {
  const rawCourses = await queryRows(
    sql.select_courses_with_staff_access,
    { user_id, is_administrator },
    CourseWithPermissionsSchema,
  );

  // Users always have access to the example course.
  const courses = rawCourses.map((c) => {
    const course_role = run(() => {
      if (c.example_course && ['None', 'Previewer'].includes(c.permissions_course.course_role)) {
        return 'Viewer';
      }
      return c.permissions_course.course_role;
    });
    return {
      ...c,
      permissions_course: {
        course_role,
        ...calculateCourseRolePermissions(course_role),
      },
    };
  });
  if (!is_administrator) return courses;

  // The above query isn't aware of administrator status. We need to update the
  // permissions to reflect that the user is an administrator.
  return courses.map((c) => ({
    ...c,
    permissions_course: {
      course_role: 'Owner',
      ...calculateCourseRolePermissions('Owner'),
    },
  })) satisfies CourseWithPermissions[];
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

/**
 * Selects a course by its path. If it doesn't already exist, it is created
 * using the provided options, if specified.
 */
export async function selectOrInsertCourseByPath(
  coursePath: string,
  options?: { branch?: string; repository?: string | null },
): Promise<Course> {
  return await queryRow(
    sql.select_or_insert_course_by_path,
    {
      path: coursePath,
      branch: options?.branch ?? 'master',
      repository: options?.repository ?? null,
    },
    CourseSchema,
  );
}

export async function deleteCourse({
  course_id,
  authn_user_id,
}: {
  course_id: string;
  authn_user_id: string;
}) {
  await runInTransactionAsync(async () => {
    const deletedCourse = await queryOptionalRow(sql.delete_course, { course_id }, CourseSchema);
    if (deletedCourse == null) {
      throw new Error('Course to delete not found');
    }
    await insertAuditLog({
      authn_user_id,
      action: 'soft_delete',
      table_name: 'courses',
      row_id: course_id,
      new_state: deletedCourse,
      course_id,
      institution_id: deletedCourse.institution_id,
    });
  });
}

export async function insertCourse({
  institution_id,
  short_name,
  title,
  display_timezone,
  path,
  repository,
  branch,
  authn_user_id,
}: Pick<
  Course,
  'institution_id' | 'short_name' | 'title' | 'display_timezone' | 'path' | 'repository' | 'branch'
> & {
  authn_user_id: string;
}): Promise<Course> {
  return await runInTransactionAsync(async () => {
    const course = await queryRow(
      sql.insert_course,
      {
        institution_id,
        short_name,
        title,
        display_timezone,
        path,
        repository,
        branch,
      },
      CourseSchema,
    );
    await insertAuditLog({
      authn_user_id,
      action: 'insert',
      table_name: 'courses',
      row_id: course.id,
      new_state: course,
      institution_id,
      course_id: course.id,
    });
    return course;
  });
}

/**
 * Update the `show_getting_started` column for a course.
 */
export async function updateCourseShowGettingStarted({
  course_id,
  show_getting_started,
}: {
  course_id: string;
  show_getting_started: boolean;
}) {
  await execute(sql.update_course_show_getting_started, {
    course_id,
    show_getting_started,
  });
}

/**
 * Update the `sharing_name` column for a course.
 */
export async function updateCourseSharingName({
  course_id,
  sharing_name,
}: {
  course_id: string;
  sharing_name: string;
}): Promise<void> {
  await execute(sql.update_course_sharing_name, {
    course_id,
    sharing_name,
  });
}

/**
 * Look up courses by sharing names (may return null if non-existent)
 */
export async function findCoursesBySharingNames(
  sharing_names: string[],
): Promise<Map<string, Course | null>> {
  const rows = await queryRows(sql.find_courses_by_sharing_names, { sharing_names }, CourseSchema);

  const result = new Map<string, Course | null>();
  for (const name of sharing_names) result.set(name, null);

  for (const row of rows) {
    // We looked up the courses by sharing name, so this should hold for all courses
    assert(row.sharing_name);

    if (row.sharing_name) {
      result.set(row.sharing_name, row);
    }
  }
  return result;
}
