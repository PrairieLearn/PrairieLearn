import {
  loadSqlEquiv,
  queryAsync,
  queryOptionalRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { type User, type CoursePermission, CoursePermissionSchema } from '../lib/db-types';
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
    throw new Error('No course permissions to update');
  }
}

export async function deleteCoursePermissions({
  course_id,
  user_id,
  authn_user_id,
}: {
  course_id: string;
  user_id: string;
  authn_user_id: string;
}): Promise<void> {
  await queryAsync(sql.delete_course_permissions, { course_id, user_id, authn_user_id });
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
    for (const nonOwner of nonOwners) {
      await deleteCoursePermissions({ course_id, user_id: nonOwner.user_id, authn_user_id });
    }
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
    for (const user of usersWithoutAccess) {
      await deleteCoursePermissions({ course_id, user_id: user.user_id, authn_user_id });
    }
  });
}
