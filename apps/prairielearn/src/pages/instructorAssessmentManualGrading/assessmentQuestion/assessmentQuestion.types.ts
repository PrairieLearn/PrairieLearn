import { z } from 'zod';

import {
  AssessmentQuestionSchema,
  InstanceQuestionSchema,
  RubricItemSchema,
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
  ai_graded: z.boolean(),
  last_human_grader: z.string().nullable(), // null if not graded by human
  ai_graded_with_latest_rubric: z.boolean().nullable(), // null if not graded with rubric
  rubric_difference: RubricItemSchema.array().nullable(),
  point_difference: z.number().nullable(),
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
