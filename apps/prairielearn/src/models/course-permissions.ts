import { z } from 'zod';

import * as error from '@prairielearn/error';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  type CourseInstancePermission,
  CourseInstancePermissionSchema,
  type CoursePermission,
  CoursePermissionSchema,
  type EnumCourseInstanceRole,
  EnumCourseInstanceRoleSchema,
  EnumCourseRoleSchema,
  type User,
} from '../lib/db-types.js';

import { selectOrInsertUserByUid } from './user.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Inserts course permissions for a user identified by UID. If the user doesn't
 * exist, they are created first. This only allows stepping up in permissions;
 * if the user already has a higher role, the role is not changed.
 */
export async function insertCoursePermissionsByUserUid({
  course_id,
  uid,
  course_role,
  authn_user_id,
}: {
  course_id: string;
  uid: string;
  course_role: NonNullable<CoursePermission['course_role']>;
  authn_user_id: string;
}): Promise<User> {
  return await runInTransactionAsync(async () => {
    const user = await selectOrInsertUserByUid(uid);
    await insertCoursePermissionsByUserId({
      course_id,
      user_id: user.id,
      course_role,
      authn_user_id,
    });
    return user;
  });
}

/**
 * Inserts course permissions for a user identified by user ID. This only allows
 * stepping up in permissions; if the user already has a higher role, the role
 * is not changed.
 */
async function insertCoursePermissionsByUserId({
  course_id,
  user_id,
  course_role,
  authn_user_id,
}: {
  course_id: string;
  user_id: string;
  course_role: NonNullable<CoursePermission['course_role']>;
  authn_user_id: string;
}): Promise<void> {
  await execute(sql.insert_course_permissions, {
    course_id,
    user_id,
    course_role,
    authn_user_id,
  });
}

/**
 * Updates the course role for an existing course_permissions record.
 * Throws a 404 error if no course permissions exist for the user.
 */
export async function updateCoursePermissionsRole({
  course_id,
  user_id,
  course_role,
  authn_user_id,
}: {
  course_id: string;
  user_id: string;
  course_role: NonNullable<CoursePermission['course_role']>;
  authn_user_id: string;
}): Promise<void> {
  const result = await queryOptionalRow(
    sql.update_course_permissions_role,
    { course_id, user_id, course_role, authn_user_id },
    CoursePermissionSchema,
  );
  if (!result) {
    throw new error.HttpStatusError(404, 'No course permissions to update');
  }
}

/**
 * Deletes course permissions for one or more users. Also deletes all
 * enrollments for these users in instances of this course. Does not throw
 * an error if no course permissions exist.
 */
export async function deleteCoursePermissions({
  course_id,
  user_id,
  authn_user_id,
}: {
  course_id: string;
  user_id: string | string[];
  authn_user_id: string;
}): Promise<void> {
  await execute(sql.delete_course_permissions, {
    course_id,
    user_ids: Array.isArray(user_id) ? user_id : [user_id],
    authn_user_id,
  });
}

/**
 * Deletes course permissions for all users who are not owners of the course.
 */
export async function deleteCoursePermissionsForNonOwners({
  course_id,
  authn_user_id,
}: {
  course_id: string;
  authn_user_id: string;
}): Promise<void> {
  await runInTransactionAsync(async () => {
    const nonOwners = await queryRows(
      sql.select_and_lock_non_owners,
      { course_id },
      CoursePermissionSchema,
    );
    await deleteCoursePermissions({
      course_id,
      user_id: nonOwners.map((user) => user.id),
      authn_user_id,
    });
  });
}

/**
 * Deletes course permissions for users who have no access to the course
 * (i.e., course_role is 'None' and they have no course instance permissions
 * with a role greater than 'None').
 */
export async function deleteCoursePermissionsForUsersWithoutAccess({
  course_id,
  authn_user_id,
}: {
  course_id: string;
  authn_user_id: string;
}): Promise<void> {
  await runInTransactionAsync(async () => {
    const usersWithoutAccess = await queryRows(
      sql.select_and_lock_course_permissions_without_access,
      { course_id },
      CoursePermissionSchema,
    );
    await deleteCoursePermissions({
      course_id,
      user_id: usersWithoutAccess.map((user) => user.user_id),
      authn_user_id,
    });
  });
}

/**
 * Inserts or updates course instance permissions for a user. If the user doesn't
 * have course permissions yet, a course_permissions record with role 'None' is
 * created first. This allows administrators (who may not have explicit course
 * permissions) to grant themselves course instance access when creating or
 * copying course instances.
 *
 * This only allows stepping up in permissions; if the user already has a higher
 * course instance role, the role is not changed.
 */
export async function insertCourseInstancePermissions({
  course_id,
  course_instance_id,
  user_id,
  course_instance_role,
  authn_user_id,
}: {
  course_id: string;
  course_instance_id: string;
  user_id: string;
  course_instance_role: EnumCourseInstanceRole;
  authn_user_id: string;
}): Promise<void> {
  await runInTransactionAsync(async () => {
    // Ensure the user has a course_permissions record (with at least 'None' role).
    // This is necessary for administrators who may not have explicit course permissions.
    await insertCoursePermissionsByUserId({
      course_id,
      user_id,
      course_role: 'None',
      authn_user_id,
    });

    // Now insert the course instance permissions
    await execute(sql.insert_course_instance_permissions, {
      course_id,
      course_instance_id,
      user_id,
      course_instance_role,
      authn_user_id,
    });
  });
}

/**
 * Updates the course instance role for an existing course_instance_permissions
 * record. Throws a 404 error if no course instance permissions exist for the user.
 */
export async function updateCourseInstancePermissionsRole({
  course_id,
  course_instance_id,
  user_id,
  course_instance_role,
  authn_user_id,
}: {
  course_id: string;
  course_instance_id: string;
  user_id: string;
  course_instance_role: NonNullable<CourseInstancePermission['course_instance_role']>;
  authn_user_id: string;
}): Promise<void> {
  const result = await queryOptionalRow(
    sql.update_course_instance_permissions_role,
    { course_id, course_instance_id, user_id, course_instance_role, authn_user_id },
    CourseInstancePermissionSchema,
  );
  if (!result) {
    throw new error.HttpStatusError(404, 'No course instance permissions to update');
  }
}

/**
 * Deletes course instance permissions for a user. Does not throw an error if
 * no course instance permissions exist.
 */
export async function deleteCourseInstancePermissions({
  course_id,
  course_instance_id,
  user_id,
  authn_user_id,
}: {
  course_id: string;
  course_instance_id: string;
  user_id: string;
  authn_user_id: string;
}): Promise<void> {
  await execute(sql.delete_course_instance_permissions, {
    course_id,
    course_instance_id,
    user_id,
    authn_user_id,
  });
}

/**
 * Deletes all course instance permissions for all instances of a course.
 */
export async function deleteAllCourseInstancePermissionsForCourse({
  course_id,
  authn_user_id,
}: {
  course_id: string;
  authn_user_id: string;
}): Promise<void> {
  await execute(sql.delete_all_course_instance_permissions_for_course, {
    course_id,
    authn_user_id,
  });
}

/**
 * Returns the course instance role for a user in a specific course instance,
 * or null if the user has no course instance permissions.
 */
export async function selectCourseInstancePermissionForUser({
  course_instance_id,
  user_id,
}: {
  course_instance_id: string;
  user_id: string;
}) {
  return await queryOptionalRow(
    sql.select_course_instance_permission_for_user,
    { course_instance_id, user_id },
    EnumCourseInstanceRoleSchema,
  );
}

/**
 * Returns the course role for a user in a specific course, or null if the user
 * has no course permissions.
 */
export async function selectCoursePermissionForUser({
  course_id,
  user_id,
}: {
  course_id: string;
  user_id: string;
}) {
  return await queryOptionalRow(
    sql.select_course_permission_for_user,
    { course_id, user_id },
    EnumCourseRoleSchema,
  );
}

/**
 * Checks if the user is an instructor in at least one course. Also returns true
 * if the user is an administrator, which gives them instructor-like access to
 * all courses.
 */
export async function userIsInstructorInAnyCourse({
  user_id,
}: {
  user_id: string;
}): Promise<boolean> {
  const result = await queryOptionalRow(
    sql.user_is_instructor_in_any_course,
    { user_id },
    z.boolean(),
  );
  return result ?? false;
}
