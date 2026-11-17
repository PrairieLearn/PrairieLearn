import { z } from 'zod';

import { DateFromISOString } from '@prairielearn/zod';

import { EnumModeSchema } from '../db-types.js';

import { AccessTimelineEntrySchema } from './timeline.js';

const LegacyAssessmentAccessRuleResultSchema = z.object({
  active: z.boolean().nullable(),
  credit: z.union([z.string(), z.literal('None')]),
  end_date: z.union([z.string(), z.literal('—')]),
  mode: EnumModeSchema.nullable(),
  start_date: z.union([z.string(), z.literal('—')]),
  time_limit_min: z.union([z.string(), z.literal('—')]),
});
export type LegacyAssessmentAccessRuleResult = z.infer<
  typeof LegacyAssessmentAccessRuleResultSchema
>;

// Application-level result consumed after either legacy or modern access control has been resolved.
const AssessmentAuthzResultSchema = z.object({
  access_rules: z.array(LegacyAssessmentAccessRuleResultSchema),
  access_timeline: z.array(AccessTimelineEntrySchema).readonly(),
  active: z.boolean(),
  authorized: z.boolean(),
  credit: z.number().nullable(),
  credit_date_string: z.string().nullable(),
  exam_access_end: DateFromISOString.nullable(),
  mode: EnumModeSchema.nullable(),
  next_active_time: z.string().nullable(),
  password: z.string().nullable(),
  show_before_release: z.boolean(),
  show_closed_assessment: z.boolean(),
  show_closed_assessment_score: z.boolean(),
  time_limit_min: z.number().nullable(),
});
export type AssessmentAuthzResult = z.infer<typeof AssessmentAuthzResultSchema>;

export const AssessmentInstanceAuthzResultSchema = AssessmentAuthzResultSchema.extend({
  authorized_edit: z.boolean(),
  time_limit_expired: z.boolean(),
});
export type AssessmentInstanceAuthzResult = z.infer<typeof AssessmentInstanceAuthzResultSchema>;
