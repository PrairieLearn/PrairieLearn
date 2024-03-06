import {
  loadSqlEquiv,
  queryAsync,
  queryOptionalRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import * as error from '@prairielearn/error';

import {
  type User,
  type CoursePermission,
  CoursePermissionSchema,
  type CourseInstancePermission,
  CourseInstancePermissionSchema,
} from '../lib/db-types';
import { selectOrInsertUserByUid } from './user';

const sql = loadSqlEquiv(__filename);

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
    await queryAsync(sql.insert_course_permissions, {
      user_id: user.user_id,
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
    throw error.make(404, 'No course permissions to update');
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
  await queryAsync(sql.delete_course_permissions, {
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
      user_id: nonOwners.map((user) => user.user_id),
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
  course_instance_role: NonNullable<CourseInstancePermission['course_instance_role']>;
  authn_user_id: string;
}): Promise<void> {
  const coursePermission = await queryOptionalRow(
    sql.insert_course_instance_permissions,
    { course_id, course_instance_id, user_id, course_instance_role, authn_user_id },
    CoursePermissionSchema,
  );
  if (!coursePermission) {
    throw error.make(
      404,
      'Cannot add permissions for a course instance without course permissions',
    );
  }
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
    throw error.make(404, 'No course instance permissions to update');
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
  await queryAsync(sql.delete_course_instance_permissions, {
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
  await queryAsync(sql.delete_all_course_instance_permissions_for_course, {
    course_id,
    authn_user_id,
  });
}
