import sqldb = require('@prairielearn/postgres');
import AnsiUp from 'ansi_up';
import {
  CourseInstance,
  TopicSchema,
  TagSchema,
  AssessmentsFormatForQuestionSchema,
} from '../lib/db-types';
import { z } from 'zod';

const QuestionsPageDataSchema = z.object({
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
  tags: z.array(TagSchema).nullable(),
  assessments: AssessmentsFormatForQuestionSchema.nullable(),
});
export type QuestionsPageData = z.infer<typeof QuestionsPageDataSchema>;

export interface QuestionsPageDataAnsified extends QuestionsPageData {
  sync_errors_ansified?: string | null;
  sync_warnings_ansified?: string | null;
}

const ansiUp = new AnsiUp();
const sql = sqldb.loadSqlEquiv(__filename);

export async function selectQuestionsForCourse(
  course_id: string | number,
  course_instances: CourseInstance[],
): Promise<QuestionsPageDataAnsified[]> {
  const rows = await sqldb.queryRows(
    sql.select_questions_for_course,
    {
      course_id: course_id,
    },
    QuestionsPageDataSchema,
  );

  const ci_ids = course_instances.map((ci) => ci.id);
  const questions = rows.map((row) => ({
    ...row,
    sync_errors_ansified: row.sync_errors && ansiUp.ansi_to_html(row.sync_errors),
    sync_warnings_ansified: row.sync_warnings && ansiUp.ansi_to_html(row.sync_warnings),
    assessments: row.assessments
      ? row.assessments.filter((assessment) => ci_ids.includes(assessment.course_instance_id))
      : null,
  }));
  return questions;
}


export async function selectPublicQuestionsForCourse(
  course_id: string | number
): Promise<QuestionsPageData[]> {
  const rows = await sqldb.queryRows(
    sql.select_public_questions_for_course,
    {
      course_id: course_id,
    },
    QuestionsPageDataSchema,
  );

  return rows;
}
