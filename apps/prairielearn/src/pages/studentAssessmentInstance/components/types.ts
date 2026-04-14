import type { AccessTimelineEntry } from '../../../lib/assessment-access-control/resolver.js';
import type {
  StudentAccessRule,
  StudentAssessment,
  StudentAssessmentInstance,
  StudentAssessmentInstanceAuthzResult,
  StudentAssessmentQuestion,
  StudentAssessmentSet,
  StudentGroupConfig,
  StudentGroupRole,
  StudentInstanceQuestion__UNSAFE,
  StudentQuestion,
  StudentUser,
  StudentZone,
} from '../../../lib/client/safe-db-types.js';

export interface StudentQuestionRow {
  zone: StudentZone;
  instance_question: StudentInstanceQuestion__UNSAFE;
  assessment_question: StudentAssessmentQuestion;
  question: StudentQuestion;
  start_new_zone: boolean;
  lockpoint_crossed: boolean;
  lockpoint_crossed_info: string | null;
  question_number: string;
  question_access_mode: string;
  prev_advance_score_perc: number | null;
  prev_title: string | null;
  prev_question_access_mode: string | null;
  group_role_permissions?: { can_view: boolean; can_submit: boolean };
  file_count: number;
  zone_question_count: number;
  allow_grade_left_ms: number;
  instance_question_open: boolean;
  previous_variants: StudentVariantWithScore[] | null;
}

export interface StudentVariantWithScore {
  id: string;
  open: boolean | null;
  max_submission_score: number;
}

export interface GradingConfig {
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  someQuestionsAllowRealTimeGrading: boolean;
  someQuestionsForbidRealTimeGrading: boolean;
}

export interface StudentGroupRoleWithCount extends StudentGroupRole {
  count: number;
}

export interface StudentRoleAssignment {
  role_name: string;
  team_role_id: string;
}

export interface StudentGroupInfo {
  group_name: string;
  join_code: string;
  group_members: Pick<StudentUser, 'uid' | 'id'>[];
  group_size: number;
  roles_info?: {
    role_assignments: Record<string, StudentRoleAssignment[]>;
    group_roles: StudentGroupRoleWithCount[];
    validation_errors: StudentGroupRoleWithCount[];
    disabled_roles: string[];
    roles_are_balanced: boolean;
    users_without_roles: Pick<StudentUser, 'uid' | 'id'>[];
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
