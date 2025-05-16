import { z } from 'zod';

import {
  AssessmentQuestionSchema,
  InstanceQuestionSchema,
  type User,
} from '../../../lib/db-types.js';

export const InstanceQuestionRowSchema = InstanceQuestionSchema.extend({
  modified_at: z.string(),
  assessment_open: z.boolean(),
  uid: z.string().nullable(),
  assigned_grader_name: z.string().nullable(),
  last_grader_name: z.string().nullable(),
  assessment_question: AssessmentQuestionSchema,
  user_or_group_name: z.string().nullable(),
  open_issue_count: z.number().nullable(),
  human_ai_agreement: z.string().nullish(),
  ai_graded: z.boolean().nullish(),
  human_graded: z.boolean().nullish(),
  ai_graded_with_latest_rubric: z.boolean().nullish(),
  human_graded_with_latest_rubric: z.boolean().nullish(),
});
export type InstanceQuestionRow = z.infer<typeof InstanceQuestionRowSchema>;

export interface InstanceQuestionTableData {
  hasCourseInstancePermissionEdit: boolean;
  urlPrefix: string;
  instancesUrl: string;
  groupWork: boolean;
  maxPoints: number | null;
  maxAutoPoints: number | null;
  aiGradingEnabled: boolean;
  aiGradingMode: boolean;
  courseStaff: User[];
  csrfToken: string;
}
