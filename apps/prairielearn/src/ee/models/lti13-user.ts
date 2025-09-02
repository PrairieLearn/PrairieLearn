import { z } from 'zod';

import { execute, loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';

import {
  type CourseInstance,
  IdSchema,
  Lti13InstanceSchema,
  type User,
  UserSchema,
} from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Updates (or inserts) a row in the `lti13_users` table.
 */
export async function updateLti13UserSub({
  user_id,
  lti13_instance_id,
  sub,
}: {
  user_id: string;
  lti13_instance_id: string;
  sub: string;
}) {
  await execute(sql.update_lti13_users, {
    user_id,
    lti13_instance_id,
    sub,
  });
}

export async function selectLti13InstanceIdentitiesForCourseInstance({
  course_instance,
  user,
}: {
  course_instance: CourseInstance;
  user: User;
}) {
  return await queryRows(
    sql.select_lti13_instance_identities_for_course_instance,
    {
      course_instance_id: course_instance.id,
      user_id: user.user_id,
    },
    z.object({
      lti13_instance: Lti13InstanceSchema,
      lti13_user_id: IdSchema.nullable(),
    }),
  );
}

/**
 * Selects a user by their LTI 1.3 sub claim for a given LTI 1.3 instance.
 */
export async function selectOptionalUserByLti13Sub({
  lti13_instance_id,
  sub,
}: {
  lti13_instance_id: string;
  sub: string;
}): Promise<User | null> {
  return await queryOptionalRow(
    sql.select_user_by_lti13_sub,
    { lti13_instance_id, sub },
    UserSchema,
  );
}
