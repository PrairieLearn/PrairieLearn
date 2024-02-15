import {
  loadSqlEquiv,
  queryAsync,
  queryOptionalRow,
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
