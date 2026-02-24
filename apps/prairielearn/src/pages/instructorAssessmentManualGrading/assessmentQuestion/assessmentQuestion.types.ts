import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { AIGradingStatsSchema } from '../../../ee/lib/ai-grading/types.js';
import {
  RawStaffInstanceQuestionSchema,
  StaffAssessmentQuestionSchema,
  StaffInstanceQuestionSchema,
} from '../../../lib/client/safe-db-types.js';

export const InstanceQuestionRowSchema = z.object({
  instance_question: StaffInstanceQuestionSchema,
  assessment_open: z.boolean(),
  uid: z.string().nullable(),
  assigned_grader_name: z.string().nullable(),
  last_grader_name: z.string().nullable(),
  assessment_question: StaffAssessmentQuestionSchema,
  user_or_group_name: z.string().nullable(),
  open_issue_count: z.number().nullable(),
  rubric_grading_item_ids: z.array(IdSchema),
  enrollment_id: IdSchema.nullable(),
});
export const InstanceQuestionRowWithAIGradingStatsSchema = z.object({
  ...InstanceQuestionRowSchema.shape,
  instance_question: RawStaffInstanceQuestionSchema.extend(AIGradingStatsSchema.shape).brand(
    'StaffInstanceQuestion',
  ),
});

export type InstanceQuestionRowWithAIGradingStats = z.infer<
  typeof InstanceQuestionRowWithAIGradingStatsSchema
>;

// Grading status values for filtering
export const GRADING_STATUS_VALUES = ['Requires grading', 'Graded'] as const;
export type GradingStatusValue = (typeof GRADING_STATUS_VALUES)[number];
