import { z } from 'zod';

import { DateFromISOString } from '@prairielearn/zod';

import {
  AssessmentQuestionSchema,
  EnumQuestionAccessModeSchema,
  InstanceQuestionSchema,
  QuestionSchema,
  ZoneSchema,
} from '../../lib/db-types.js';
import { SimpleVariantWithScoreSchema } from '../../models/variant.js';

export const InstanceQuestionRowSchema = z.object({
  zone: ZoneSchema,
  instance_question: InstanceQuestionSchema,
  assessment_question: AssessmentQuestionSchema,
  question: QuestionSchema,
  start_new_zone: z.boolean(),
  lockpoint_crossed: z.boolean(),
  lockpoint_crossed_at: DateFromISOString.nullable(),
  lockpoint_crossed_authn_user_uid: z.string().nullable(),
  row_order: z.number(),
  question_number: z.string(),
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
