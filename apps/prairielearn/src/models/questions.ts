import sqldb = require('@prairielearn/postgres');
import AnsiUp from 'ansi_up';
import { CourseInstance } from '../lib/db-types';

const ansiUp = new AnsiUp();
const sql = sqldb.loadSqlEquiv(__filename);

export async function selectQuestionsForCourse(
  course_id: string | number,
  course_instances: CourseInstance[],
) {
  const result = await sqldb.queryAsync(sql.select_questions_for_course, {
    course_id: course_id,
  });

  const ci_ids = course_instances.map((ci) => ci.id);
  const questions = result.rows.map((row) => {
    if (row.sync_errors) row.sync_errors_ansified = ansiUp.ansi_to_html(row.sync_errors);
    if (row.sync_warnings) {
      row.sync_warnings_ansified = ansiUp.ansi_to_html(row.sync_warnings);
    }
    row.assessments = row.assessments?.filter((assessment) =>
      ci_ids.includes(assessment.course_instance_id),
    );
    return row;
  });
  return questions;
}
