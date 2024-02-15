import { loadSqlEquiv, queryRow, runInTransactionAsync } from '@prairielearn/postgres';

import { CoursePermission, CoursePermissionSchema } from '../lib/db-types';
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
}): Promise<CoursePermission> {
  return await runInTransactionAsync(async () => {
    const user = await selectOrInsertUserByUid(uid);
    return await queryRow(
      sql.insert_course_permissions,
      { user_id: user.user_id, course_id, course_role, authn_user_id },
      CoursePermissionSchema,
    );
  });
}
