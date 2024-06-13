import { z } from 'zod';

import { AssessmentAccessRuleSchema, IdSchema } from '../../lib/db-types.js';

export const AssessmentAccessRulesSchema = z.object({
  assessment_access_rule: AssessmentAccessRuleSchema,
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
export type AssessmentAccessRules = z.infer<typeof AssessmentAccessRulesSchema>;
