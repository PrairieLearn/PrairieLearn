import { z } from 'zod';

import { AIGradingStatsSchema } from '../../../ee/lib/ai-grading/types.js';
import {
  RawStaffAssessmentQuestionSchema,
  RawStaffInstanceQuestionSchema,
  type StaffInstanceQuestionGroup,
} from '../../../lib/client/safe-db-types.js';
import { IdSchema } from '../../../lib/db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

export const InstanceQuestionRowSchema = RawStaffInstanceQuestionSchema.extend({
  assessment_open: z.boolean(),
  uid: z.string().nullable(),
  assigned_grader_name: z.string().nullable(),
  last_grader_name: z.string().nullable(),
  assessment_question: RawStaffAssessmentQuestionSchema,
  user_or_group_name: z.string().nullable(),
  open_issue_count: z.number().nullable(),
  rubric_grading_item_ids: z.array(IdSchema),
  enrollment_id: IdSchema.nullable(),
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
  instanceQuestionGroups: StaffInstanceQuestionGroup[];
}

// Types for batch actions
export type BatchActionData =
  | { assigned_grader: string | null }
  | { requires_manual_grading: boolean }
  | { batch_action: 'ai_grade_assessment_selected'; closed_instance_questions_only?: boolean }
  | {
      batch_action: 'ai_instance_question_group_selected';
      closed_instance_questions_only?: boolean;
    };

export type BatchActionParams =
  | {
      action: 'batch_action';
      actionData: BatchActionData;
      instanceQuestionIds: string[];
    }
  | {
      action:
        | 'ai_grade_assessment_graded'
        | 'ai_grade_assessment_all'
        | 'ai_instance_question_group_assessment_all'
        | 'ai_instance_question_group_assessment_ungrouped';
    };

// Grading status values for filtering
export const GRADING_STATUS_VALUES = ['Requires grading', 'Graded'] as const;
export type GradingStatusValue = (typeof GRADING_STATUS_VALUES)[number];

// Writable version for state management
export const GRADING_STATUS_VALUES_ARRAY: readonly GradingStatusValue[] = GRADING_STATUS_VALUES;
