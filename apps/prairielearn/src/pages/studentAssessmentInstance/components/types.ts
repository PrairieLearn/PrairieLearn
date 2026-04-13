import {
  type StudentAssessment,
  type StudentAssessmentInstanceAuthzResult,
  type StudentAssessmentInstance__UNSAFE,
  type StudentAssessmentSet,
} from '../../../lib/client/safe-db-types.js';

// Client-safe row type for the hydrated component. This mirrors the fields
// from InstanceQuestionRow that the client actually needs, without pulling
// in db-types.ts schemas that the safe-db-types lint rule forbids.
export interface ClientQuestionRow {
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
  previousVariants: ClientVariantWithScore[] | null;
}

export interface ClientVariantWithScore {
  id: string;
  open: boolean | null;
  maxSubmissionScore: number;
}

// Client-safe access rule for the popover.
export interface ClientAccessRule {
  credit: string;
  startDate: string;
  endDate: string;
}

// Client-safe group work info for the hydrated component.
export interface ClientGroupConfig {
  studentAuthzJoin: boolean | null;
  studentAuthzLeave: boolean | null;
  hasRoles: boolean;
  minimum: number | null;
  maximum: number | null;
}

export interface ClientGroupRoleAssignment {
  roleName: string;
  teamRoleId: string;
}

export interface ClientGroupRole {
  id: string;
  roleName: string;
  minimum: number | null;
  maximum: number | null;
  canAssignRoles: boolean | null;
  count: number;
}

export interface ClientGroupInfo {
  groupName: string;
  joinCode: string;
  groupMembers: { uid: string; id: string }[];
  groupSize: number;
  rolesInfo?: {
    roleAssignments: Record<string, ClientGroupRoleAssignment[]>;
    groupRoles: ClientGroupRole[];
    validationErrors: ClientGroupRole[];
    disabledRoles: string[];
    rolesAreBalanced: boolean;
    usersWithoutRoles: { uid: string; id: string }[];
  };
}

export interface StudentAssessmentInstanceBodyProps {
  assessment: StudentAssessment;
  assessmentSet: StudentAssessmentSet;
  assessmentInstance: StudentAssessmentInstance__UNSAFE;
  remainingMs: number | null;

  authzResult: StudentAssessmentInstanceAuthzResult;

  hasManualGradingQuestion: boolean;
  hasAutoGradingQuestion: boolean;
  someQuestionsAllowRealTimeGrading: boolean;
  someQuestionsForbidRealTimeGrading: boolean;

  assessmentTextHtml: string | null;
  accessRules: ClientAccessRule[];
  groupConfig: ClientGroupConfig | null;
  groupInfo: ClientGroupInfo | null;
  userCanAssignRoles: boolean;

  questionRows: ClientQuestionRow[];

  savedAnswers: number;
  suspendedSavedAnswers: number;
  zoneTitleColspan: number;
  firstUncrossedLockpointZoneNumber: number | undefined;
  allQuestionsAnswered: boolean;

  urlPrefix: string;
  csrfToken: string;
  userGroupRoles: string | null;
  isGroupAssessment: boolean;
  showTimeLimitExpiredModal: boolean;
}
