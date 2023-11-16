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

/**
 * Returns all courses to which the given user has staff access.
 *
 * Note that this does not take into account any effective user overrides that
 * may be in place. It is the caller's responsibility to further restrict
 * the results if necessary.
 */
export async function selectCoursesWithStaffAccess({
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

/**
 * Returns all courses to which the given user has edit access.
 *
 * Note that this does not take into account any effective user overrides that
 * may be in place. It is the caller's responsibility to further restrict
 * the results if necessary.
 */
export async function selectCoursesWithEditAccess({
  user_id,
  is_administrator,
}: {
  user_id: string;
  is_administrator: boolean;
}) {
  const courses = await selectCoursesWithStaffAccess({
    user_id,
    is_administrator,
  });
  return courses.filter((c) => c.permissions_course.has_course_permission_edit);
}
