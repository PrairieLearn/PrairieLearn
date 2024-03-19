import { loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';
import { z } from 'zod';
import { type CourseInstance, CourseInstanceSchema } from '../lib/db-types';
import { idsEqual } from '../lib/id';

const sql = loadSqlEquiv(__filename);

const CourseInstanceAuthzSchema = CourseInstanceSchema.extend({
  formatted_start_date: z.string(),
  formatted_end_date: z.string(),
  has_course_instance_permission_view: z.boolean(),
});
export type CourseInstanceAuthz = z.infer<typeof CourseInstanceAuthzSchema>;

export async function selectCourseInstanceById(
  course_instance_id: string,
): Promise<CourseInstance | null> {
  return queryOptionalRow(
    sql.select_course_instance_by_id,
    { course_instance_id },
    CourseInstanceSchema,
  );
}

/**
 * Returns all course instances to which the given user has staff access.
 *
 * If the user is emulating another user, the results will be filtered to only
 * include course instances to which both the authenticated user and the
 * emulated user have access.
 */
export async function selectCourseInstancesWithStaffAccess({
  course_id,
  user_id,
  authn_user_id,
  is_administrator,
  authn_is_administrator,
}: {
  course_id: string;
  user_id: string;
  authn_user_id: string;
  is_administrator: boolean;
  authn_is_administrator: boolean;
}) {
  const authnCourseInstances = await queryRows(
    sql.select_course_instances_with_staff_access,
    { user_id: authn_user_id, is_administrator: authn_is_administrator, course_id },
    CourseInstanceAuthzSchema,
  );

  if (idsEqual(user_id, authn_user_id)) {
    return authnCourseInstances;
  }

  const authzCourseInstances = await queryRows(
    sql.select_course_instances_with_staff_access,
    { user_id, is_administrator, course_id },
    CourseInstanceAuthzSchema,
  );

  // Retain only the course instances for which the authn user also has access.
  const authnCourseIds = new Set(authnCourseInstances.map((c) => c.id));
  return authzCourseInstances.filter((authzCourseInstance) => {
    return authnCourseIds.has(authzCourseInstance.id);
  });
}
