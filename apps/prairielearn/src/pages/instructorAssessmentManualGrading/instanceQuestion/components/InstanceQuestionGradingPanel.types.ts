export type ManualGradingContext = 'conflicting' | 'existing' | 'main';

export interface GradingPanelRubricData {
  maxExtraPoints: number;
  minPoints: number;
  replaceAutoPoints: boolean;
  startingPoints: number;
  items: {
    descriptionRendered: string;
    explanationRendered: string;
    graderNoteRendered: string;
    id: string;
    keyBinding: string | null;
    points: number;
  }[];
}

export interface InstanceQuestionGradingPanelProps {
  context: ManualGradingContext;
  disabled: boolean;
  aiGradingMode: boolean;
  assessmentQuestion: {
    maxAutoPoints: number;
    maxManualPoints: number;
    maxPoints: number;
  };
  instanceQuestion: {
    autoPoints: number;
    manualPoints: number;
    modifiedAt: string;
  };
  submission: {
    feedback: string;
    id: string;
    rubricGrading: {
      adjustPoints: number;
      rubricItems: Record<string, { score: number }> | null;
    } | null;
  };
  graders: { id: string; name: string; uid: string }[];
  graderGuidelinesRendered: string | null;
  gradedByHumanName: string | null;
  aiGradingInfo: {
    selectedRubricItemIds: string[];
    submissionManuallyGraded: boolean;
  } | null;
  openIssueIds: string[];
  rubricData: GradingPanelRubricData | null;
  showInstanceQuestionGroup: boolean;
  instanceQuestionGroups: {
    description: string;
    id: string;
    name: string;
  }[];
  selectedInstanceQuestionGroupId: string | null;
  manualInstanceQuestionGroupUrl: string;
  skipGradedSubmissions: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
  skipText: string;
  enableSingleKeyShortcuts: boolean;
  csrfToken: string;
}

export interface GradingFormState {
  adjustmentPercentage: string;
  adjustmentPoints: string;
  autoEditing: boolean;
  autoPercentage: string;
  autoPoints: string;
  closeIssueIds: Set<string>;
  feedback: string;
  manualPercentage: string;
  manualPoints: string;
  selectedGroupId: string | null;
  selectedRubricItemIds: Set<string>;
  showAdjustment: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
  skipGradedSubmissions: boolean;
}
