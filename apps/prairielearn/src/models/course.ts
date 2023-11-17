import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { Course, CourseSchema } from '../lib/db-types';

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
