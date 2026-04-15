import { z } from 'zod';

import { DateFromISOString } from '@prairielearn/zod';

import {
  type StudentAccessRule,
  type StudentAssessment,
  type StudentAssessmentInstanceAuthzResult,
  StudentAssessmentInstanceSchema__UNSAFE,
  StudentAssessmentQuestionSchema,
  type StudentAssessmentSet,
  type StudentGroupConfig,
  StudentGroupRoleWithCountSchema,
  StudentInstanceQuestionSchema__UNSAFE,
  StudentQuestionSchema,
  type StudentUser,
  StudentUserSchema,
  StudentZoneSchema,
} from '../../../lib/client/safe-db-types.js';
import { EnumQuestionAccessModeSchema } from '../../../lib/db-types.js';
import { RoleAssignmentSchema } from '../../../lib/groups.shared.js';
import {
  type SimpleVariantWithScore,
  SimpleVariantWithScoreSchema,
} from '../../../models/variant.js';

export const SafeStudentAssessmentInstanceSchema = z
  .object({
    assessment_instance: StudentAssessmentInstanceSchema__UNSAFE,
    some_questions_allow_real_time_grading: z.boolean(),
  })
  .transform(({ assessment_instance, some_questions_allow_real_time_grading }) => {
    // When real-time grading is fully disabled and the instance is open,
    // don't leak score data to the client — the UI only shows max_points.
    if (!some_questions_allow_real_time_grading && assessment_instance.open) {
      return { ...assessment_instance, points: null, score_perc: null };
    }
    return { ...assessment_instance };
  })
  .brand('SafeStudentAssessmentInstance');
export type SafeStudentAssessmentInstance = z.output<typeof SafeStudentAssessmentInstanceSchema>;

export type StudentVariantWithScore = Pick<
  SimpleVariantWithScore,
  'id' | 'open' | 'max_submission_score'
>;

export const InstanceQuestionRowSchema = z.object({
  zone: StudentZoneSchema,
  instance_question: StudentInstanceQuestionSchema__UNSAFE,
  assessment_question: StudentAssessmentQuestionSchema,
  question: StudentQuestionSchema,
  start_new_zone: z.boolean(),
  lockpoint_crossed: z.boolean(),
  lockpoint_crossed_at: DateFromISOString.nullable(),
  lockpoint_crossed_authn_user_uid: z.string().nullable(),
  row_order: z.number(),
  question_number: z.string(),
  question_access_mode: EnumQuestionAccessModeSchema,
  zone_question_count: z.number(),
  file_count: z.number(),
  prev_advance_score_perc: z.number().nullable(),
  prev_title: z.string().nullable(),
  prev_question_access_mode: EnumQuestionAccessModeSchema.nullable(),
  allowGradeLeftMs: z.number().default(0),
  previous_variants: z.array(SimpleVariantWithScoreSchema).optional(),
  group_role_permissions: z
    .object({
      can_view: z.boolean(),
      can_submit: z.boolean(),
    })
    .optional(),
});
export type InstanceQuestionRow = z.infer<typeof InstanceQuestionRowSchema>;

export const StudentQuestionRowSchema = InstanceQuestionRowSchema.omit({ row_order: true })
  .extend({ assessmentInstanceOpen: z.boolean() })
  .transform(({ assessmentInstanceOpen, allowGradeLeftMs, previous_variants, ...rest }) => {
    const redactScores =
      assessmentInstanceOpen && !rest.assessment_question.allow_real_time_grading;

    return {
      ...rest,
      instance_question: {
        ...rest.instance_question,
        auto_points: redactScores ? null : rest.instance_question.auto_points,
        manual_points: redactScores ? null : rest.instance_question.manual_points,
        points: redactScores ? null : rest.instance_question.points,
        score_perc: redactScores ? null : rest.instance_question.score_perc,
        open: assessmentInstanceOpen && rest.instance_question.open,
        points_list_original: redactScores ? null : rest.instance_question.points_list_original,
        points_list: redactScores ? null : rest.instance_question.points_list,
        highest_submission_score: redactScores
          ? null
          : rest.instance_question.highest_submission_score,
        current_value: redactScores ? null : rest.instance_question.current_value,
      },
      allow_grade_left_ms: allowGradeLeftMs,
      previous_variants: redactScores
        ? null
        : (previous_variants?.map(({ id, open, max_submission_score }) => ({
            id,
            open,
            max_submission_score,
          })) ?? null),
    };
  });
export type StudentQuestionRow = z.output<typeof StudentQuestionRowSchema>;

export interface GradingConfig {
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  someQuestionsAllowRealTimeGrading: boolean;
  someQuestionsForbidRealTimeGrading: boolean;
}

// Client-safe group work info for the hydrated component.
const StudentRolesInfoSchema = z.object({
  roleAssignments: z.record(z.array(RoleAssignmentSchema)),
  groupRoles: z.array(StudentGroupRoleWithCountSchema),
  validationErrors: z.array(StudentGroupRoleWithCountSchema),
  disabledRoles: z.array(z.string()),
  rolesAreBalanced: z.boolean(),
  usersWithoutRoles: z.array(StudentUserSchema),
});

export const StudentGroupInfoSchema = z.object({
  groupName: z.string(),
  joinCode: z.string(),
  groupMembers: z.array(StudentUserSchema),
  groupSize: z.number(),
  rolesInfo: StudentRolesInfoSchema.optional(),
});
export type StudentGroupInfo = z.infer<typeof StudentGroupInfoSchema>;

export interface StudentAssessmentInstanceBodyProps {
  assessment: StudentAssessment;
  assessmentSet: StudentAssessmentSet;
  assessmentInstance: SafeStudentAssessmentInstance;
  remainingMs: number | null;
  displayTimezone: string;

  authzResult: StudentAssessmentInstanceAuthzResult;

  assessmentTextHtml: string | null;
  accessRules: StudentAccessRule[];
  groupConfig: StudentGroupConfig | null;
  groupInfo: StudentGroupInfo | null;
  hasCourseInstancePermissionEdit: boolean;

  questionRows: StudentQuestionRow[];

  csrfToken: string;
  user: StudentUser;
  showTimeLimitExpiredModal: boolean;
}
