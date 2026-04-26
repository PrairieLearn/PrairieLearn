import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  AssessmentSchema,
  AssessmentSetSchema,
  QuestionSchema,
  SharingSetSchema,
  TagSchema,
  TopicSchema,
} from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';

const QuestionsPageDataSchema = QuestionSchema.pick({
  id: true,
  grading_method: true,
  external_grading_image: true,
  workspace_image: true,
  share_publicly: true,
  share_source_publicly: true,
}).extend({
  // These are non-nullable in this context because the queries filter out draft questions.
  qid: z.string(),
  title: z.string(),
  // The public questions query does not select these columns, so they must be optional.
  sync_errors: QuestionSchema.shape.sync_errors.optional(),
  sync_warnings: QuestionSchema.shape.sync_warnings.optional(),
  display_type: z.string(),
  open_issue_count: z.number().default(0),
  topic: TopicSchema,
  tags: z.array(TagSchema).nullable(),
  sharing_sets: z.array(SharingSetSchema).nullable().optional(),
  assessments: z
    .array(
      z.object({
        assessment: AssessmentSchema.pick({
          id: true,
          course_instance_id: true,
          number: true,
        }),
        assessment_set: AssessmentSetSchema.pick({
          abbreviation: true,
          color: true,
          name: true,
        }),
      }),
    )
    // The public questions endpoint does not have assessments, so we need to make this optional.
    .optional(),
});
export type QuestionsPageData = z.infer<typeof QuestionsPageDataSchema>;

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function selectQuestionsForCourse(
  course_id: string | number,
  course_instance_ids: string[],
): Promise<QuestionsPageData[]> {
  const rows = await sqldb.queryRows(
    sql.select_questions_for_course,
    { course_id },
    QuestionsPageDataSchema,
  );

  const questions = rows.map((row) => ({
    ...row,
    assessments: (row.assessments ?? []).filter((a) =>
      course_instance_ids.some((id) => idsEqual(id, a.assessment.course_instance_id)),
    ),
  }));
  return questions;
}

export async function selectPublicQuestionsForCourse(
  course_id: string | number,
): Promise<QuestionsPageData[]> {
  const rows = await sqldb.queryRows(
    sql.select_public_questions_for_course,
    { course_id },
    QuestionsPageDataSchema,
  );

  return rows;
}
