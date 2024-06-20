import { z } from 'zod';

import { AssessmentQuestionSchema, InstanceQuestionSchema } from '../../../lib/db-types.js';

export const InstanceQuestionRowSchema = InstanceQuestionSchema.extend({
  modified_at: z.string(),
  assessment_open: z.boolean(),
  uid: z.string().nullable(),
  assigned_grader_name: z.string().nullable(),
  last_grader_name: z.string().nullable(),
  assessment_question: AssessmentQuestionSchema,
  user_or_group_name: z.string().nullable(),
  open_issue_count: z.number().nullable(),
  index: z.number(),
});
export type InstanceQuestionRow = z.infer<typeof InstanceQuestionRowSchema>;
