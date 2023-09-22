import sqldb = require('@prairielearn/postgres');
import AnsiUp from 'ansi_up';
import {
  CourseInstance,
  TopicSchema,
  TagsForQuestionSchema,
  AssessmentsFormatForQuestionSchema,
} from '../lib/db-types';
import { z } from 'zod';

const QuestionsTableDataSchema = z.object({
  id: z.string(),
  qid: z.string(),
  title: z.string(),
  sync_errors: z.string().nullable(),
  sync_warnings: z.string().nullable(),
  grading_method: z.string(),
  external_grading_image: z.string().nullable(),
  display_type: z.string(),
  open_issue_count: z.string(),
  topic: TopicSchema,
  tags: TagsForQuestionSchema,
  assessments: AssessmentsFormatForQuestionSchema,
});

const ansiUp = new AnsiUp();
const sql = sqldb.loadSqlEquiv(__filename);

export async function selectQuestionsForCourse(
  course_id: string | number,
  course_instances: CourseInstance[],
) {
  const rows = await sqldb.queryRows(
    sql.select_questions_for_course,
    {
      course_id: course_id,
    },
    QuestionsTableDataSchema,
  );

  const ci_ids = course_instances.map((ci) => ci.id);
  const questions = rows.map((row) => {
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
