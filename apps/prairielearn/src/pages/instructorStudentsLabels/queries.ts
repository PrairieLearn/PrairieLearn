import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { StudentLabelWithUserDataSchema } from './instructorStudentsLabels.types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function getStudentLabelsWithUserData(courseInstanceId: string) {
  return await queryRows(
    sql.select_student_labels_with_user_data,
    { course_instance_id: courseInstanceId },
    StudentLabelWithUserDataSchema,
  );
}
