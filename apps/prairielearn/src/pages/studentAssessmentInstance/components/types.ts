import { z } from 'zod';

import {
  type StudentAccessRule,
  type StudentAssessment,
  type StudentAssessmentInstanceAuthzResult,
  StudentAssessmentInstanceSchema__UNSAFE,
  type StudentAssessmentSet,
  type StudentGroupConfig,
  StudentGroupRoleWithCountSchema,
  type StudentUser,
  StudentUserSchema,
} from '../../../lib/client/safe-db-types.js';
import { RoleAssignmentSchema } from '../../../lib/groups.shared.js';

export const SafeStudentAssessmentInstanceSchema = z
  .object({
    assessment_instance: StudentAssessmentInstanceSchema__UNSAFE,
    some_questions_allow_real_time_grading: z.boolean(),
  })
  .transform((data) => {
    // When real-time grading is fully disabled and the instance is open,
    // don't leak score data to the client — the UI only shows max_points.
    if (!data.some_questions_allow_real_time_grading && data.assessment_instance.open) {
      data.assessment_instance.points = null;
      data.assessment_instance.score_perc = null;
    }
    return data.assessment_instance;
  })
  .brand('SafeStudentAssessmentInstance');
export type SafeStudentAssessmentInstance = z.output<typeof SafeStudentAssessmentInstanceSchema>;

// Client-safe row type for the hydrated component. This mirrors the fields
// from InstanceQuestionRow that the client actually needs, without pulling
// in db-types.ts schemas that the safe-db-types lint rule forbids.
export interface StudentQuestionRow {
  id: string;
  startNewZone: boolean;
  zoneId: string;
  zoneNumber: number;
  zoneTitle: string | null;
  lockpoint: boolean;
  lockpointCrossed: boolean;
  lockpointCrossedInfo: string | null;
  questionNumber: string;
  questionTitle: string | null;
  questionAccessMode: string;
  prevAdvanceScorePerc: number | null;
  prevTitle: string | null;
  prevQuestionAccessMode: string | null;
  groupRolePermissions?: { canView: boolean; canSubmit: boolean };
  fileCount: number;
  zoneMaxPoints: number | null;
  zoneHasMaxPoints: boolean;
  zoneBestQuestions: number | null;
  zoneHasBestQuestions: boolean;
  zoneQuestionCount: number;

  /** Instance question scoring data (used by React score/status components). */
  autoPoints: number | null;
  manualPoints: number | null;
  points: number | null;
  status: string | null;
  requiresManualGrading: boolean;
  hasLastGrader: boolean;
  maxAutoPoints: number | null;
  maxManualPoints: number | null;
  maxPoints: number | null;
  allowRealTimeGrading: boolean;
  allowGradeLeftMs: number;
  instanceQuestionOpen: boolean;
  pointsListOriginal: number[] | null;
  numberAttempts: number;
  pointsList: number[] | null;
  highestSubmissionScore: number | null;
  currentValue: number | null;
  previousVariants: StudentVariantWithScore[] | null;
}

export interface StudentVariantWithScore {
  id: string;
  open: boolean | null;
  maxSubmissionScore: number;
}

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
