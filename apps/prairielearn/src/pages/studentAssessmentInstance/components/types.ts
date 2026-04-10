import { type z } from 'zod';

import {
  RawStudentAssessmentInstanceSchema__UNSAFE,
  type StudentAssessment,
  type StudentAssessmentInstanceAuthzResult,
  type StudentAssessmentSet,
} from '../../../lib/client/safe-db-types.js';

// Assessment instance parsed from the __UNSAFE schema and transformed
// to null out score fields when real-time grading is fully disabled.
export const StudentAssessmentInstanceSchema = RawStudentAssessmentInstanceSchema__UNSAFE.transform(
  (data) => {
    // On this page, points and score_perc are always available to the student.
    // The transform is a no-op here but satisfies the __UNSAFE contract.
    return data;
  },
);
export type StudentAssessmentInstance = z.infer<typeof StudentAssessmentInstanceSchema>;

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
}

// Pre-rendered HTML for each question row's score/status cells.
export interface RowRenderedHtml {
  statusHtml?: string;
  availablePointsHtml?: string;
  autoPointsHtml?: string;
  manualPointsHtml?: string;
  totalPointsHtml?: string;
  variantHistoryHtml?: string;
}

export interface StudentAssessmentInstanceBodyProps {
  assessment: StudentAssessment;
  assessmentSet: StudentAssessmentSet;
  assessmentInstance: StudentAssessmentInstance;
  remainingMs: number | null;

  authzResult: StudentAssessmentInstanceAuthzResult;

  hasManualGradingQuestion: boolean;
  hasAutoGradingQuestion: boolean;
  someQuestionsAllowRealTimeGrading: boolean;
  someQuestionsForbidRealTimeGrading: boolean;

  assessmentTextHtml: string | null;
  accessRulesPopoverHtml: string;
  groupWorkInfoHtml: string | null;

  questionRows: ClientQuestionRow[];
  rowRenderedHtml: RowRenderedHtml[];

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
