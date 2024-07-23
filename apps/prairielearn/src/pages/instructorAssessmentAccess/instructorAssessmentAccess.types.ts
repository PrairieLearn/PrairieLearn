import { z } from 'zod';

import { AssessmentAccessRuleSchema, IdSchema } from '../../lib/db-types.js';

export const JsonAssessmentAccessRuleSchema = AssessmentAccessRuleSchema.pick({
  mode: true,
  uids: true,
  start_date: true,
  end_date: true,
  active: true,
  credit: true,
  time_limit_min: true,
  password: true,
  exam_uuid: true,
  show_closed_assessment: true,
  show_closed_assessment_score: true,
});
export type JsonAssessmentAccessRule = z.infer<typeof JsonAssessmentAccessRuleSchema>;

export const AssessmentAccessRuleRowSchema = z.object({
  assessment_access_rule: JsonAssessmentAccessRuleSchema,
  pt_course: z
    .object({
      id: IdSchema,
      name: z.string(),
    })
    .nullable(),
  pt_exam: z
    .object({
      course_id: IdSchema,
      id: IdSchema,
      name: z.string(),
      uuid: z.string(),
    })
    .nullable(),
});
export type AssessmentAccessRuleRow = z.infer<typeof AssessmentAccessRuleRowSchema>;
