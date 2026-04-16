import { z } from 'zod';

import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import {
  AssessmentQuestionSchema,
  EnumQuestionAccessModeSchema,
  InstanceQuestionSchema,
  QuestionSchema,
} from '../../lib/db-types.js';
import { SimpleVariantWithScoreSchema } from '../../models/variant.js';

export const InstanceQuestionRowSchema = InstanceQuestionSchema.extend({
  start_new_zone: z.boolean(),
  zone_id: IdSchema,
  zone_number: z.number(),
  zone_title: z.string().nullable(),
  lockpoint: z.boolean(),
  lockpoint_crossed: z.boolean(),
  lockpoint_crossed_at: DateFromISOString.nullable(),
  lockpoint_crossed_authn_user_uid: z.string().nullable(),
  question_title: QuestionSchema.shape.title,
  max_points: z.number().nullable(),
  max_manual_points: z.number().nullable(),
  max_auto_points: z.number().nullable(),
  init_points: z.number().nullable(),
  grade_rate_minutes: AssessmentQuestionSchema.shape.grade_rate_minutes,
  allow_real_time_grading: AssessmentQuestionSchema.shape.allow_real_time_grading,
  row_order: z.number(),
  question_number: z.string(),
  zone_max_points: z.number().nullable(),
  zone_has_max_points: z.boolean(),
  zone_best_questions: z.number().nullable(),
  zone_has_best_questions: z.boolean(),
  zone_question_count: z.number(),
  file_count: z.number(),
  question_access_mode: EnumQuestionAccessModeSchema,
  prev_advance_score_perc: z.number().nullable(),
  prev_title: z.string().nullable(),
  prev_question_access_mode: EnumQuestionAccessModeSchema.nullable(),
  allowGradeLeftMs: z.number().default(0), // Computed after the query if needed, defaults to zero if grade_rate_minutes is null
  previous_variants: z.array(SimpleVariantWithScoreSchema).optional(),
  group_role_permissions: z
    .object({
      can_view: z.boolean(),
      can_submit: z.boolean(),
    })
    .optional(),
});
export type InstanceQuestionRow = z.infer<typeof InstanceQuestionRowSchema>;
