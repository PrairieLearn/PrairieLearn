import { callValidatedOneRow, loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { Course, CourseSchema } from '../lib/db-types';
import { z } from 'zod';
import { idsEqual } from '../lib/id';

const sql = loadSqlEquiv(__filename);

const CourseWithPermissionsSchema = CourseSchema.extend({
  permissions_course: z.object({
    course_role: z.enum(['None', 'Previewer', 'Viewer', 'Editor', 'Owner']),
    has_course_permission_own: z.boolean(),
    has_course_permission_edit: z.boolean(),
    has_course_permission_view: z.boolean(),
    has_course_permission_preview: z.boolean(),
  }),
});

export async function selectCourseById(course_id: string): Promise<Course> {
  return await queryRow(
    sql.select_course_by_id,
    {
      course_id,
    },
    CourseSchema,
  );
}

export async function selectAuthorizedCourses({
  user_id,
  is_administrator,
  current_course,
  authz_data_overrides,
}: {
  user_id: string;
  is_administrator: boolean;
  current_course: Course;
  authz_data_overrides: any | null | undefined;
}) {
  const { courses } = await callValidatedOneRow(
    'courses_with_staff_access',
    [user_id, is_administrator],
    z.object({
      courses: z.array(CourseWithPermissionsSchema),
    }),
  );

  // If any overrides are in place, we'll confine the user to the current course.
  if (authz_data_overrides) {
    return courses.filter((c) => idsEqual(c.id, current_course.id));
  }

  return courses;
}

export async function selectEditableCourses({
  user_id,
  is_administrator,
  current_course,
  authz_data_overrides,
}: {
  user_id: string;
  is_administrator: boolean;
  current_course: Course;
  authz_data_overrides: any | null | undefined;
}) {
  const courses = await selectAuthorizedCourses({
    user_id,
    is_administrator,
    current_course,
    authz_data_overrides,
  });
  return courses.filter((c) => c.permissions_course.has_course_permission_edit);
}
