import { z } from 'zod';

import {
  AlternativeGroupSchema,
  AssessmentQuestionSchema,
  AssessmentsFormatForQuestionSchema,
  QuestionSchema,
  TagSchema,
  TopicSchema,
  ZoneSchema,
} from '../../lib/db-types.js';

export const AssessmentQuestionRowSchema = AssessmentQuestionSchema.extend({
  alternative_group_number_choose: AlternativeGroupSchema.shape.number_choose,
  alternative_group_number: AlternativeGroupSchema.shape.number,
  alternative_group_size: z.number(),
  assessment_question_advance_score_perc: AlternativeGroupSchema.shape.advance_score_perc,
  display_name: z.string().nullable(),
  is_alternative_group: z.boolean().optional(),
  number: z.string().nullable(),
  open_issue_count: z.string().nullable(),
  other_assessments: AssessmentsFormatForQuestionSchema.nullable(),
  sync_errors_ansified: z.string().optional(),
  sync_errors: QuestionSchema.shape.sync_errors,
  sync_warnings_ansified: z.string().optional(),
  sync_warnings: QuestionSchema.shape.sync_warnings,
  topic: TopicSchema,
  qid: QuestionSchema.shape.qid,
  start_new_zone: z.boolean().nullable(),
  start_new_alternative_group: z.boolean().nullable(),
  tags: TagSchema.pick({ color: true, id: true, name: true }).array().nullable(),
  title: QuestionSchema.shape.title,
  tries_per_variant: z.number().optional(),
  zone_best_questions: ZoneSchema.shape.best_questions,
  zone_has_best_questions: z.boolean().nullable(),
  zone_has_max_points: z.boolean().nullable(),
  zone_max_points: ZoneSchema.shape.max_points,
  zone_number_choose: ZoneSchema.shape.number_choose,
  zone_number: ZoneSchema.shape.number,
  zone_title: ZoneSchema.shape.title,
});
export type AssessmentQuestionRow = z.infer<typeof AssessmentQuestionRowSchema>;

const AssessmentQuestionAlternativeGroupSchema = z.object({
  alternative_group_number: z.number(),
  alternative_group_number_choose: z.number(),
  alternatives: z.array(AssessmentQuestionRowSchema),
  init_points: z.number().nullable(),
  is_alternative_group: z.boolean(),
  max_auto_points: z.number().nullable(),
  max_manual_points: z.number().nullable(),
  max_points: z.number().nullable(),
  points_list: z.array(z.number()),
});
export type AssessmentQuestionAlternativeGroup = z.infer<
  typeof AssessmentQuestionAlternativeGroupSchema
>;

const AssessmentQuestionZoneSchema = z.object({
  bestQuestions: z.number().nullable(),
  maxPoints: z.number().nullable(),
  numberChoose: z.number().nullable(),
  questions: z.array(AssessmentQuestionRowSchema.or(AssessmentQuestionAlternativeGroupSchema)),
  title: z.string(),
});
export type AssessmentQuestionZone = z.infer<typeof AssessmentQuestionZoneSchema>;
