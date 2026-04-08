import z from 'zod';

import {
  AssessmentModuleSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  SprocAuthzAssessmentSchema,
} from '../lib/db-types.js';

export const SelectAndAuthzAssessmentSchema = z.object({
  assessment: AssessmentSchema,
  assessment_set: AssessmentSetSchema,
  assessment_module: AssessmentModuleSchema.nullable(),
  authz_result: SprocAuthzAssessmentSchema,
  assessment_label: z.string(),
});

export type ResLocalsAssessment = z.infer<typeof SelectAndAuthzAssessmentSchema>;
