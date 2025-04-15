import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
const sql = sqldb.loadSqlEquiv(import.meta.url);

import {
  AlternativeGroupSchema,
  AssessmentQuestionSchema,
  AssessmentsFormatForQuestionSchema,
  IdSchema,
  QuestionSchema,
  TagSchema,
  TopicSchema,
  ZoneSchema,
} from '../lib/db-types.js';

export const AssessmentQuestionRowSchema = AssessmentQuestionSchema.extend({
  alternative_group_number_choose: AlternativeGroupSchema.shape.number_choose,
  alternative_group_number: AlternativeGroupSchema.shape.number,
  alternative_group_size: z.number(),
  assessment_question_advance_score_perc: AlternativeGroupSchema.shape.advance_score_perc,
  course_id: IdSchema,
  course_sharing_name: z.string().nullable(),
  number: z.string().nullable(),
  open_issue_count: z.coerce.number().nullable(),
  other_assessments: AssessmentsFormatForQuestionSchema.nullable(),
  sync_errors: QuestionSchema.shape.sync_errors,
  sync_warnings: QuestionSchema.shape.sync_warnings,
  topic: TopicSchema,
  qid: QuestionSchema.shape.qid,
  start_new_zone: z.boolean().nullable(),
  start_new_alternative_group: z.boolean().nullable(),
  tags: TagSchema.pick({ color: true, id: true, name: true }).array().nullable(),
  title: QuestionSchema.shape.title,
  zone_best_questions: ZoneSchema.shape.best_questions,
  zone_has_best_questions: z.boolean().nullable(),
  zone_has_max_points: z.boolean().nullable(),
  zone_max_points: ZoneSchema.shape.max_points,
  zone_number_choose: ZoneSchema.shape.number_choose,
  zone_number: ZoneSchema.shape.number,
  zone_title: ZoneSchema.shape.title,
});
export type AssessmentQuestionRow = z.infer<typeof AssessmentQuestionRowSchema>;

export async function selectAssessmentQuestions(
  assessment_id: string,
): Promise<AssessmentQuestionRow[]> {
  const rows = await sqldb.queryRows(
    sql.select_assessment_questions,
    { assessment_id },
    AssessmentQuestionRowSchema,
  );

  return rows;
}
