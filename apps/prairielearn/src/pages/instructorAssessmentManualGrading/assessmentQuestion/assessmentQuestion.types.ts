import { z } from 'zod';

import { AIGradingStatsSchema } from '../../../ee/lib/ai-grading/types.js';
import {
  AssessmentQuestionSchema,
  IdSchema,
  type InstanceQuestionGroup,
  InstanceQuestionSchema,
} from '../../../lib/db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

export const InstanceQuestionRowSchema = InstanceQuestionSchema.extend({
  assessment_open: z.boolean(),
  uid: z.string().nullable(),
  assigned_grader_name: z.string().nullable(),
  last_grader_name: z.string().nullable(),
  assessment_question: AssessmentQuestionSchema,
  user_or_group_name: z.string().nullable(),
  open_issue_count: z.number().nullable(),
  rubric_grading_item_ids: z.array(IdSchema),
});
export type InstanceQuestionRow = z.infer<typeof InstanceQuestionRowSchema>;

export const InstanceQuestionRowWithAIGradingStatsSchema = z.object({
  ...InstanceQuestionRowSchema.shape,
  ...AIGradingStatsSchema.shape,
});

export type InstanceQuestionRowWithAIGradingStats = z.infer<
  typeof InstanceQuestionRowWithAIGradingStatsSchema
>;

export interface InstanceQuestionTableData {
  hasCourseInstancePermissionEdit: boolean;
  urlPrefix: string;
  instancesUrl: string;
  groupWork: boolean;
  maxPoints: number | null;
  maxAutoPoints: number | null;
  aiGradingMode: boolean;
  csrfToken: string;
  rubric_data: RubricData | null;
  instanceQuestionGroups: InstanceQuestionGroup[];
}
