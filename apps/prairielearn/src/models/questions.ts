import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  TopicSchema,
  SharingSetSchema,
  AssessmentsFormatForQuestionSchema,
  TagSchema,
} from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';

const QuestionsPageDataSchema = z.object({
  id: z.string(),
  qid: z.string(),
  title: z.string(),
  sync_errors: z.string().nullable().optional(),
  sync_warnings: z.string().nullable().optional(),
  grading_method: z.string(),
  external_grading_image: z.string().nullable(),
  display_type: z.string(),
  open_issue_count: z.number().default(0),
  topic: TopicSchema,
  tags: z.array(TagSchema).nullable(),
  shared_publicly: z.boolean().optional(),
  sharing_sets: z.array(SharingSetSchema).nullable().optional(),
  assessments: AssessmentsFormatForQuestionSchema.nullable().optional(),
});
export type QuestionsPageData = z.infer<typeof QuestionsPageDataSchema>;

const sql = sqldb.loadSqlEquiv(import.meta.url);

export async function selectQuestionsForCourse(
  course_id: string | number,
  course_instance_ids: string[],
): Promise<QuestionsPageData[]> {
  const rows = await sqldb.queryRows(
    sql.select_questions_for_course,
    {
      course_id,
    },
    QuestionsPageDataSchema,
  );

  const questions = rows.map((row) => ({
    ...row,
    assessments:
      row.assessments?.filter((assessment) =>
        course_instance_ids.some((id) => idsEqual(id, assessment.course_instance_id)),
      ) ?? null,
  }));
  return questions;
}

export async function selectPublicQuestionsForCourse(
  course_id: string | number,
): Promise<QuestionsPageData[]> {
  const rows = await sqldb.queryRows(
    sql.select_public_questions_for_course,
    {
      course_id,
    },
    QuestionsPageDataSchema,
  );

  return rows;
}
