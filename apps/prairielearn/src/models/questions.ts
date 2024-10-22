import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  TopicSchema,
  SharingSetSchema,
  AlternativeGroupSchema,
  AssessmentQuestionSchema,
  AssessmentsFormatForQuestionSchema,
  QuestionSchema,
  ZoneSchema,
  TagSchema,
} from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';

const QuestionsPageDataSchema = z.object({
  id: z.string(),
  qid: z.string(),
  title: z.string(),
  sync_errors: z.string().nullable().optional(),
  sync_warnings: z.string().nullable().optional(),
  sync_errors_ansified: z.string().nullable().optional(),  // Added property, TEST
  sync_warnings_ansified: z.string().nullable().optional(),  // Added property, TEST
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

export async function selectAssessmentQuestions(
  assessment_id: string,
  course_id: string,
): Promise<QuestionsPageData[]> {
  const rows = await sqldb.queryRows(
    sql.select_assessment_questions,
    {
      assessment_id,
      course_id,
    },
    AssessmentQuestionRowSchema,
  );

  return rows;
}

export const AssessmentQuestionRowSchema = AssessmentQuestionSchema.extend({
  alternative_group_number_choose: AlternativeGroupSchema.shape.number_choose,
  alternative_group_number: AlternativeGroupSchema.shape.number,
  alternative_group_size: z.number(),
  assessment_question_advance_score_perc: AlternativeGroupSchema.shape.advance_score_perc,
  display_name: z.string().nullable(),
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
