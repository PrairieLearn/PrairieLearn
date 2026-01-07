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
  type User,
} from '../lib/db-types.js';

import { selectOrInsertUserByUid } from './user.js';

const sql = loadSqlEquiv(import.meta.url);

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
    await execute(sql.insert_course_permissions, {
      user_id: user.id,
      course_id,
      course_role,
      authn_user_id,
    });
    return user;
  });
}

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
  // Do not throw an exception if no course permissions to delete
}

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
  const coursePermission = await queryOptionalRow(
    sql.insert_course_instance_permissions,
    { course_id, course_instance_id, user_id, course_instance_role, authn_user_id },
    CoursePermissionSchema,
  );

  /**
   *
   * TODO:
   *
   * Admin defaults to none
   * Everyone else Student data editor
   */

  if (!coursePermission) {
    // console.log('No course permissions found when inserting course instance permissions');
    throw new error.HttpStatusError(
      404,
      'Cannot add permissions for a course instance without course permissions',
    );
  }
  console.log('Inserted course instance permissions:', coursePermission, course_instance_role);
}

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
  // Do not throw an exception if no course instance permissions to delete
}

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
