import { useState } from 'react';

import type { InstanceQuestionAIGradingInfo } from '../../../ee/lib/ai-grading/types.js';
import type { StaffInstanceQuestionGroup, StaffUser } from '../../../lib/client/safe-db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

import { type ConflictGradingJobProps, ConflictGradingModal } from './ConflictGradingModal.js';
import { GradingForm } from './GradingForm.js';
import type { RubricGradingData } from './queries.js';

interface GradingPanelProps {
  csrfToken: string;
  modifiedAt: string;
  submissionId: string;
  maxAutoPoints: number;
  maxManualPoints: number;
  maxPoints: number;
  autoPoints: number;
  manualPoints: number;
  totalPoints: number;
  submissionFeedback: string | null;
  rubricData: RubricData | null;
  rubricGrading: RubricGradingData | null;
  openIssues: { id: string; open: boolean | null }[];
  graders: StaffUser[] | null;
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
  hasEditPermission: boolean;
  showInstanceQuestionGroup: boolean;
  selectedInstanceQuestionGroup: StaffInstanceQuestionGroup | null;
  instanceQuestionGroups?: StaffInstanceQuestionGroup[];
  skipGradedSubmissions: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
  onToggleRubricSettings?: () => void;
  graderGuidelinesRendered: string | null;
  conflictGradingJob: ConflictGradingJobProps | null;
  conflictGradingJobDateFormatted: string | null;
  conflictLastGraderName: string | null;
  existingDateFormatted: string | null;
}

export function InstanceQuestionGradingPanel(props: GradingPanelProps) {
  const {
    csrfToken,
    modifiedAt,
    submissionId,
    maxAutoPoints,
    maxManualPoints,
    maxPoints,
    autoPoints,
    manualPoints,
    submissionFeedback,
    openIssues,
    graders,
    aiGradingInfo,
    hasEditPermission,
    showInstanceQuestionGroup,
    selectedInstanceQuestionGroup,
    instanceQuestionGroups,
    skipGradedSubmissions,
    showSubmissionsAssignedToMeOnly: showSubmissionsAssignedToMeOnlyProp,
    graderGuidelinesRendered,
    onToggleRubricSettings,
    conflictGradingJob,
    conflictGradingJobDateFormatted,
    conflictLastGraderName,
    existingDateFormatted,
  } = props;

  const { rubricData } = props;
  const rubricGrading = props.rubricGrading;

  const disabled = !hasEditPermission;
  const showSubmissionsAssignedToMeOnly = !hasEditPermission
    ? false
    : showSubmissionsAssignedToMeOnlyProp;

  const [showConflictModal, setShowConflictModal] = useState(!!conflictGradingJob);

  return (
    <>
      <GradingForm
        key={submissionId}
        csrfToken={csrfToken}
        modifiedAt={modifiedAt}
        submissionId={submissionId}
        maxAutoPoints={maxAutoPoints}
        maxManualPoints={maxManualPoints}
        maxPoints={maxPoints}
        initialAutoPoints={autoPoints}
        initialManualPoints={manualPoints}
        submissionFeedback={submissionFeedback}
        rubricData={rubricData}
        rubricGrading={rubricGrading}
        openIssues={openIssues}
        graders={graders}
        aiGradingInfo={aiGradingInfo}
        disabled={disabled}
        skipText="Next"
        context="main"
        showInstanceQuestionGroup={showInstanceQuestionGroup}
        selectedInstanceQuestionGroupProp={selectedInstanceQuestionGroup}
        instanceQuestionGroups={instanceQuestionGroups}
        skipGradedSubmissions={skipGradedSubmissions}
        showSubmissionsAssignedToMeOnly={showSubmissionsAssignedToMeOnly}
        graderGuidelinesRendered={graderGuidelinesRendered}
        onToggleRubricSettings={onToggleRubricSettings}
      />

      {conflictGradingJob && (
        <ConflictGradingModal
          show={showConflictModal}
          csrfToken={csrfToken}
          modifiedAt={modifiedAt}
          submissionId={submissionId}
          maxAutoPoints={maxAutoPoints}
          maxManualPoints={maxManualPoints}
          maxPoints={maxPoints}
          autoPoints={autoPoints}
          manualPoints={manualPoints}
          submissionFeedback={submissionFeedback}
          rubricData={rubricData}
          rubricGrading={rubricGrading}
          openIssues={openIssues}
          graders={graders}
          skipGradedSubmissions={skipGradedSubmissions}
          showSubmissionsAssignedToMeOnly={showSubmissionsAssignedToMeOnly}
          conflictGradingJob={conflictGradingJob}
          conflictGradingJobDateFormatted={conflictGradingJobDateFormatted}
          conflictLastGraderName={conflictLastGraderName}
          existingDateFormatted={existingDateFormatted}
          onHide={() => setShowConflictModal(false)}
        />
      )}
    </>
  );
}
