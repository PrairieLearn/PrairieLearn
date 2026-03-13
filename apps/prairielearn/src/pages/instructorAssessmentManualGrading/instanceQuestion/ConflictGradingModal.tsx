import { Modal } from 'react-bootstrap';

import type { StaffUser } from '../../../lib/client/safe-db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

import { GradingForm } from './GradingForm.js';
import type { RubricGradingData } from './queries.js';

export interface ConflictGradingJobProps {
  grader_name: string | null;
  auto_points: number | null;
  manual_points: number | null;
  score: number | null;
  feedback: Record<string, any> | null;
  rubric_grading: RubricGradingData | null;
}

export function ConflictGradingModal({
  show,
  onHide,
  csrfToken,
  modifiedAt,
  submissionId,
  maxAutoPoints,
  maxManualPoints,
  maxPoints,
  autoPoints,
  manualPoints,
  submissionFeedback,
  rubricData,
  rubricGrading,
  openIssues,
  graders,
  skipGradedSubmissions,
  showSubmissionsAssignedToMeOnly,
  conflictGradingJob,
  conflictGradingJobDateFormatted,
  conflictLastGraderName,
  existingDateFormatted,
}: {
  show: boolean;
  onHide: () => void;
  csrfToken: string;
  modifiedAt: string;
  submissionId: string;
  maxAutoPoints: number;
  maxManualPoints: number;
  maxPoints: number;
  autoPoints: number;
  manualPoints: number;
  submissionFeedback: string | null;
  rubricData: RubricData | null;
  rubricGrading: RubricGradingData | null;
  openIssues: { id: string; open: boolean | null }[];
  graders: StaffUser[] | null;
  skipGradedSubmissions: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
  conflictGradingJob: ConflictGradingJobProps;
  conflictGradingJobDateFormatted: string | null;
  conflictLastGraderName: string | null;
  existingDateFormatted: string | null;
}) {
  return (
    <Modal show={show} size="xl" onHide={onHide}>
      <Modal.Header className="bg-danger text-light" closeButton>
        <Modal.Title>Grading conflict identified</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="alert alert-danger" role="alert">
          The submission you have just graded has already been graded by{' '}
          {conflictLastGraderName ?? 'an unknown grader'}. Your score and feedback have not been
          applied. Please review the feedback below and select how you would like to proceed.
        </div>
        <div className="row mb-2">
          <div className="col-lg-6 col-12">
            <div>
              <strong>Existing score and feedback</strong>
            </div>
            <div className="mb-2">
              {existingDateFormatted}, by {conflictLastGraderName ?? 'an unknown grader'}
            </div>
            <div className="card">
              <GradingForm
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
                graders={null}
                disabled={true}
                skipText="Accept existing score"
                context="existing"
                showInstanceQuestionGroup={false}
                selectedInstanceQuestionGroupProp={null}
                skipGradedSubmissions={skipGradedSubmissions}
                showSubmissionsAssignedToMeOnly={showSubmissionsAssignedToMeOnly}
                graderGuidelinesRendered={null}
              />
            </div>
          </div>
          <div className="col-lg-6 col-12">
            <div>
              <strong>Conflicting score and feedback</strong>
            </div>
            <div className="mb-2">
              {conflictGradingJobDateFormatted ? `${conflictGradingJobDateFormatted}, ` : ''}
              by {conflictGradingJob.grader_name}
            </div>
            <div className="card">
              <GradingForm
                csrfToken={csrfToken}
                modifiedAt={modifiedAt}
                submissionId={submissionId}
                maxAutoPoints={maxAutoPoints}
                maxManualPoints={maxManualPoints}
                maxPoints={maxPoints}
                initialAutoPoints={conflictGradingJob.auto_points ?? 0}
                initialManualPoints={conflictGradingJob.manual_points ?? 0}
                submissionFeedback={conflictGradingJob.feedback?.manual ?? null}
                rubricData={rubricData}
                rubricGrading={conflictGradingJob.rubric_grading}
                openIssues={openIssues}
                graders={graders}
                disabled={false}
                skipText="Next"
                context="conflicting"
                showInstanceQuestionGroup={false}
                selectedInstanceQuestionGroupProp={null}
                skipGradedSubmissions={skipGradedSubmissions}
                showSubmissionsAssignedToMeOnly={showSubmissionsAssignedToMeOnly}
                graderGuidelinesRendered={null}
              />
            </div>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
