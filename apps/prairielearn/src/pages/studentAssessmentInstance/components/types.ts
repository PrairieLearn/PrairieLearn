import type { AccessTimelineEntry } from '../../../lib/assessment-access-control/resolver.js';
import {
  type StudentAccessRule,
  type StudentAssessment,
  type StudentAssessmentInstance,
  type StudentAssessmentInstanceAuthzResult,
  type StudentAssessmentSet,
  type StudentGroupConfig,
  type StudentGroupRole,
} from '../../../lib/client/safe-db-types.js';

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
export interface StudentGroupRoleAssignment {
  roleName: string;
  teamRoleId: string;
}

export interface StudentGroupInfo {
  groupName: string;
  joinCode: string;
  groupMembers: { uid: string; id: string }[];
  groupSize: number;
  rolesInfo?: {
    roleAssignments: Record<string, StudentGroupRoleAssignment[]>;
    groupRoles: (StudentGroupRole & { count: number })[];
    validationErrors: (StudentGroupRole & { count: number })[];
    disabledRoles: string[];
    rolesAreBalanced: boolean;
    usersWithoutRoles: { uid: string; id: string }[];
  };
}

export interface StudentAssessmentInstanceBodyProps {
  assessment: StudentAssessment;
  assessmentSet: StudentAssessmentSet;
  assessmentInstance: StudentAssessmentInstance;
  remainingMs: number | null;

  authzResult: StudentAssessmentInstanceAuthzResult;

  assessmentTextHtml: string | null;
  accessRules: StudentAccessRule[];
  accessTimeline: AccessTimelineEntry[];
  displayTimezone: string;
  groupConfig: StudentGroupConfig | null;
  groupInfo: StudentGroupInfo | null;
  userCanAssignRoles: boolean;

  questionRows: StudentQuestionRow[];

  csrfToken: string;
  userGroupRoles: string | null;
  isGroupAssessment: boolean;
  showTimeLimitExpiredModal: boolean;
}
