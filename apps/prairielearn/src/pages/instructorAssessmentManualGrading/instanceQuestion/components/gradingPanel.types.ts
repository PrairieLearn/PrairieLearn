import type { InstanceQuestionAIGradingInfo } from '../../../../ee/lib/ai-grading/types.js';
import type { RubricData } from '../../../../lib/manualGrading.types.js';

export interface GradingPanelGrader {
  id: string;
  name: string | null;
  uid: string;
}

export interface GradingPanelGroup {
  id: string | null;
  instance_question_group_name: string;
  instance_question_group_description: string | null;
}

export interface GradingPanelIssue {
  id: string;
}

export interface GradingPanelProps {
  context: 'main' | 'existing' | 'conflicting';
  csrfToken: string;
  modifiedAt: string;
  submissionId: string;
  maxAutoPoints: number;
  maxManualPoints: number;
  maxPoints: number | null;
  autoPoints: number;
  manualPoints: number;
  points: number;
  rubricData: RubricData | null;
  selectedRubricItemIds: string[];
  adjustPoints: number;
  graderGuidelinesHtml: string | null;
  feedback: string;
  openIssues: GradingPanelIssue[];
  graders: GradingPanelGrader[];
  disable: boolean;
  skipText: string;
  aiGradingMode: boolean;
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
  showInstanceQuestionGroup: boolean;
  selectedInstanceQuestionGroup: GradingPanelGroup;
  instanceQuestionGroups: GradingPanelGroup[];
  skipGradedSubmissions: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
  gradedByHumanName: string | null;
  enableSingleKeyShortcuts: boolean;
  manualInstanceQuestionGroupUrl: string | null;
}

export interface GradingPanelRefreshDetail {
  panel: GradingPanelProps;
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
  submissionPanel?: string;
  submissionId?: string;
  preserveSelections?: boolean;
}
