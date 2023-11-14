import { callValidatedOneRow, loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { Course, CourseSchema } from '../lib/db-types';
import { z } from 'zod';

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
}: {
  user_id: string;
  is_administrator: boolean;
}) {
  const { courses } = await callValidatedOneRow(
    'courses_with_staff_access',
    [user_id, is_administrator],
    z.object({
      courses: z.array(CourseWithPermissionsSchema),
    }),
  );
  return courses;
}

export async function selectEditableCourses({
  user_id,
  is_administrator,
}: {
  user_id: string;
  is_administrator: boolean;
}) {
  const courses = await selectAuthorizedCourses({ user_id, is_administrator });
  return courses.filter((c) => c.permissions_course.has_course_permission_edit);
}
