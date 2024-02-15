import { loadSqlEquiv, queryAsync, runInTransactionAsync } from '@prairielearn/postgres';

import { type User, type CoursePermission } from '../lib/db-types';
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
