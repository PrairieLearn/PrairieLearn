import { callValidatedOneRow, loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { Course, CourseSchema } from '../lib/db-types';
import { z } from 'zod';

const sql = loadSqlEquiv(__filename);

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
      courses: z.array(CourseSchema),
    }),
  );
  return courses;
}
