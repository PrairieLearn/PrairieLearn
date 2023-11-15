import { callValidatedOneRow } from '@prairielearn/postgres';
import { z } from 'zod';
import { IdSchema } from '../lib/db-types';
import { idsEqual } from '../lib/id';

const CourseInstanceAuthzSchema = z.object({
  course_instances: z.array(
    z.object({
      short_name: z.string().nullable(),
      long_name: z.string().nullable(),
      id: IdSchema,
      formatted_start_date: z.string(),
      formatted_end_date: z.string(),
      has_course_instance_permission_view: z.boolean(),
    }),
  ),
});

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
  const { course_instances: authnCourseInstances } = await callValidatedOneRow(
    'course_instances_with_staff_access',
    [authn_user_id, authn_is_administrator, course_id],
    CourseInstanceAuthzSchema,
  );

  if (idsEqual(user_id, authn_user_id)) {
    return authnCourseInstances;
  }

  const { course_instances: authzCourseInstances } = await callValidatedOneRow(
    'course_instances_with_staff_access',
    [user_id, is_administrator, course_id],
    CourseInstanceAuthzSchema,
  );

  // Retain only the course instances for which the authn user also has access.
  const authnCourseIds = new Set(authnCourseInstances.map((c) => c.id));
  return authzCourseInstances.filter((authzCourseInstance) => {
    return authnCourseIds.has(authzCourseInstance.id);
  });
}
