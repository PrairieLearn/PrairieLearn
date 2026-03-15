import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import type { CourseInstance } from '../../lib/db-types.js';

import { StudentLabelWithUserDataSchema } from './instructorStudentsLabels.types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function getStudentLabelsWithUserData(courseInstance: CourseInstance) {
  return await queryRows(
    sql.select_student_labels_with_user_data,
    { course_instance_id: courseInstance.id },
    StudentLabelWithUserDataSchema,
  );
}
