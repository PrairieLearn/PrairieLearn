import { useState } from 'react';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import { Scorebar } from '../../../components/Scorebar.js';
import type { StudentAccessRule } from '../../../lib/client/safe-db-types.js';
import { formatPoints } from '../../../lib/format.js';
import { getRoleNamesForUser } from '../../../lib/groups.shared.js';

import { ExamFooterContent } from './ExamFooterContent.js';
import { GroupWorkInfoContainer } from './GroupWorkInfoContainer.js';
import { QuestionTableBody } from './QuestionTableBody.js';
import { ConfirmFinishModal, CrossLockpointModal, TimeLimitExpiredModal } from './modals.js';
import type {
  GradingConfig,
  StudentAssessmentInstanceBodyProps,
  StudentQuestionRow,
} from './types.js';

StudentAssessmentInstanceBody.displayName = 'StudentAssessmentInstanceBody';

export function StudentAssessmentInstanceBody({
  assessment,
  assessmentSet,
  assessmentInstance,
  remainingMs,
  authzResult,
  assessmentTextHtml,
  accessRules,
  groupConfig,
  groupInfo,
  hasCourseInstancePermissionEdit,
  questionRows,
  csrfToken,
  user,
  showTimeLimitExpiredModal,
}: StudentAssessmentInstanceBodyProps) {
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [showTimeLimitExpired, setShowTimeLimitExpired] = useState(showTimeLimitExpiredModal);
  const [activeLockpointZoneId, setActiveLockpointZoneId] = useState<string | null>(null);
  const [lockpointConfirmed, setLockpointConfirmed] = useState(false);
  const {
    active,
    authorized_edit: authorizedEdit,
    credit_date_string: creditDateString,
    has_password: hasPassword,
    show_closed_assessment: showClosedAssessment,
  } = authzResult;

  const assessmentInstanceOpen = !!assessmentInstance.open;

  const gradingConfig: GradingConfig = {
    hasAutoGradingQuestion: questionRows.some(
      (row) => row.maxAutoPoints || row.autoPoints || !row.maxPoints,
    ),
    hasManualGradingQuestion: questionRows.some(
      (row) => row.maxManualPoints || row.manualPoints || row.requiresManualGrading,
    ),
    someQuestionsAllowRealTimeGrading: questionRows.some((row) => row.allowRealTimeGrading),
    someQuestionsForbidRealTimeGrading: questionRows.some((row) => !row.allowRealTimeGrading),
  };
  const {
    hasAutoGradingQuestion,
    hasManualGradingQuestion,
    someQuestionsAllowRealTimeGrading,
    someQuestionsForbidRealTimeGrading,
  } = gradingConfig;

  const allQuestionsDisabled = !someQuestionsAllowRealTimeGrading;
  const showExamFooterContent = assessment.type === 'Exam' && assessmentInstanceOpen && active;
  const showUnauthorizedEditWarning = !authorizedEdit;
  const showCardFooter = showExamFooterContent || showUnauthorizedEditWarning;

  const { savedAnswers, suspendedSavedAnswers } = run(() => {
    let saved = 0;
    let suspended = 0;
    for (const row of questionRows) {
      if (row.status === 'saved') {
        if (row.allowGradeLeftMs > 0) {
          suspended++;
        } else if ((row.maxAutoPoints || !row.maxManualPoints) && row.allowRealTimeGrading) {
          saved++;
        }
      }
    }
    return { savedAnswers: saved, suspendedSavedAnswers: suspended };
  });

  const allQuestionsAnswered = questionRows.every((row) => row.status !== 'unanswered');

  const firstUncrossedLockpointZoneNumber = questionRows
    .filter((row) => row.startNewZone && row.lockpoint && !row.lockpointCrossed)
    .map((row) => row.zoneNumber)
    .sort((a, b) => a - b)[0];

  const zoneTitleColspan = run(() => {
    const trailingColumnsCount =
      assessment.type === 'Exam'
        ? hasAutoGradingQuestion && someQuestionsAllowRealTimeGrading
          ? 2
          : hasAutoGradingQuestion && hasManualGradingQuestion
            ? 3
            : 1
        : (hasAutoGradingQuestion ? 2 : 0) + 1;

    return assessment.type === 'Exam'
      ? hasAutoGradingQuestion && hasManualGradingQuestion && someQuestionsAllowRealTimeGrading
        ? 6
        : 2 + trailingColumnsCount
      : hasAutoGradingQuestion && hasManualGradingQuestion
        ? 6
        : 1 + trailingColumnsCount;
  });

  const hasUnmetAdvanceScorePercBeforeLockpoint = (zoneNumber: number) =>
    questionRows.some(
      (row) =>
        row.questionAccessMode === 'blocked_sequence' &&
        (row.zoneNumber < zoneNumber || (row.zoneNumber === zoneNumber && row.startNewZone)),
    );

  function isLockpointCrossable(row: StudentQuestionRow): boolean {
    return (
      assessmentInstanceOpen &&
      active &&
      authorizedEdit &&
      row.lockpoint &&
      !row.lockpointCrossed &&
      row.zoneNumber === firstUncrossedLockpointZoneNumber &&
      !hasUnmetAdvanceScorePercBeforeLockpoint(row.zoneNumber)
    );
  }

  return (
    <>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h1>
            {assessmentSet.abbreviation}
            {assessment.number}: {assessment.title}
          </h1>
          {assessment.team_work && (
            <>
              &nbsp;
              <i className="fas fa-users" />
            </>
          )}
        </div>

        <div className="card-body">
          <RealTimeGradingInformationAlert
            allQuestionsDisabled={allQuestionsDisabled}
            someQuestionsDisabled={someQuestionsForbidRealTimeGrading}
            assessmentInstanceOpen={assessmentInstanceOpen}
          />
          <div className="row align-items-center">
            {allQuestionsDisabled && assessmentInstanceOpen ? (
              <>
                <div className="col-md-3 col-sm-12">
                  Total points: {formatPoints(assessmentInstance.max_points)}
                  {assessmentInstance.max_bonus_points ? (
                    <>
                      <br />({assessmentInstance.max_bonus_points} bonus{' '}
                      {assessmentInstance.max_bonus_points > 1 ? 'points' : 'point'} possible)
                    </>
                  ) : null}
                </div>
                <div className="col-md-9 col-sm-12">
                  <AssessmentStatus
                    assessmentInstanceOpen={assessmentInstanceOpen}
                    active={active}
                    creditDateString={creditDateString}
                    accessRules={accessRules}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="col-md-3 col-sm-6">
                  Total points: {formatPoints(assessmentInstance.points)}/
                  {formatPoints(assessmentInstance.max_points)}
                  {assessmentInstance.max_bonus_points ? (
                    <>
                      <br />({assessmentInstance.max_bonus_points} bonus{' '}
                      {assessmentInstance.max_bonus_points > 1 ? 'points' : 'point'} possible)
                    </>
                  ) : null}
                </div>
                <div className="col-md-3 col-sm-6">
                  <Scorebar score={assessmentInstance.score_perc} />
                </div>
                <div className="col-md-6 col-sm-12">
                  <AssessmentStatus
                    assessmentInstanceOpen={assessmentInstanceOpen}
                    active={active}
                    creditDateString={creditDateString}
                    accessRules={accessRules}
                  />
                </div>
              </>
            )}
            {groupConfig != null && groupInfo != null && (
              <div className="col-lg-12">
                <GroupWorkInfoContainer
                  groupConfig={groupConfig}
                  groupInfo={groupInfo}
                  user={user}
                  hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
                  csrfToken={csrfToken}
                />
              </div>
            )}
          </div>

          {assessmentInstanceOpen && remainingMs != null && (
            <div className="alert alert-secondary mt-4" role="alert">
              <div className="row">
                <div className="col-md-2 col-sm-12 col-xs-12">
                  <div id="countdownProgress" />
                </div>
                <div className="col-md-10 col-sm-12 col-xs-12">
                  Time remaining: <span id="countdownDisplay" />
                </div>
              </div>
            </div>
          )}
          {assessmentTextHtml && (
            <div className="card bg-light mb-0 mt-4">
              {/* eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- Course-authored assessment text */}
              <div className="card-body" dangerouslySetInnerHTML={{ __html: assessmentTextHtml }} />
            </div>
          )}
        </div>

        <div className="table-responsive">
          <table
            className="table table-sm table-hover"
            aria-label="Questions"
            data-testid="assessment-questions"
          >
            <thead>
              <InstanceQuestionTableHeader
                assessmentType={assessment.type}
                gradingConfig={gradingConfig}
              />
            </thead>
            <tbody>
              <QuestionTableBody
                questionRows={questionRows}
                assessmentType={assessment.type}
                gradingConfig={gradingConfig}
                assessmentInstanceOpen={assessmentInstanceOpen}
                zoneTitleColspan={zoneTitleColspan}
                courseInstanceId={assessment.course_instance_id}
                userGroupRoles={
                  groupInfo?.rolesInfo
                    ? getRoleNamesForUser(groupInfo.rolesInfo.roleAssignments, user.uid).join(', ')
                    : null
                }
                isLockpointCrossable={isLockpointCrossable}
                hasUnmetAdvanceScorePercBeforeLockpoint={hasUnmetAdvanceScorePercBeforeLockpoint}
                onCrossLockpoint={(zoneId) => {
                  setActiveLockpointZoneId(zoneId);
                  setLockpointConfirmed(false);
                }}
              />
            </tbody>
          </table>
        </div>

        {showCardFooter && (
          <div className="card-footer d-flex flex-column gap-3">
            {showExamFooterContent && (
              <ExamFooterContent
                gradingConfig={gradingConfig}
                savedAnswers={savedAnswers}
                suspendedSavedAnswers={suspendedSavedAnswers}
                authorizedEdit={authorizedEdit}
                hasPassword={hasPassword}
                showClosedAssessment={showClosedAssessment}
                csrfToken={csrfToken}
                onFinish={() => setShowConfirmFinish(true)}
              />
            )}
            {showUnauthorizedEditWarning && (
              <div className="alert alert-warning mb-0" role="alert">
                You are viewing the assessment of a different user and so are not authorized to
                submit questions for grading or to mark the assessment as complete.
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmFinishModal
        show={showConfirmFinish}
        allQuestionsAnswered={allQuestionsAnswered}
        csrfToken={csrfToken}
        onHide={() => setShowConfirmFinish(false)}
      />

      <CrossLockpointModal
        show={activeLockpointZoneId != null}
        zoneId={activeLockpointZoneId}
        isGroupAssessment={groupConfig != null}
        confirmed={lockpointConfirmed}
        csrfToken={csrfToken}
        onHide={() => setActiveLockpointZoneId(null)}
        onConfirmChange={setLockpointConfirmed}
      />

      <TimeLimitExpiredModal
        show={showTimeLimitExpired}
        onHide={() => setShowTimeLimitExpired(false)}
      />
    </>
  );
}

// ============================================================
// Small display sub-components
// ============================================================

function AssessmentStatus({
  assessmentInstanceOpen,
  active,
  creditDateString,
  accessRules,
}: {
  assessmentInstanceOpen: boolean;
  active: boolean;
  creditDateString: string | null;
  accessRules: StudentAccessRule[];
}) {
  if (assessmentInstanceOpen && active) {
    return (
      <>
        Assessment is <strong>open</strong> and you can answer questions.
        <br />
        Available credit: {creditDateString} <StudentAccessRulesPopover accessRules={accessRules} />
      </>
    );
  }

  return (
    <>
      Assessment is <strong>closed</strong> and you cannot answer questions.
    </>
  );
}

function RealTimeGradingInformationAlert({
  allQuestionsDisabled,
  someQuestionsDisabled,
  assessmentInstanceOpen,
}: {
  allQuestionsDisabled: boolean;
  someQuestionsDisabled: boolean;
  assessmentInstanceOpen: boolean;
}) {
  if (allQuestionsDisabled && assessmentInstanceOpen) {
    return (
      <div className="alert alert-warning">
        This assessment will only be graded after it is finished. You should save answers for all
        questions and your exam will be graded later. You can use the{' '}
        <span className="badge badge-outline text-bg-light">Finish assessment</span> button below to
        finish and calculate your final grade.
      </div>
    );
  }
  if (someQuestionsDisabled && assessmentInstanceOpen) {
    return (
      <div className="alert alert-info">
        Some questions in this assessment allow real-time grading while others will only be graded
        after the assessment is finished. Check the individual question pages to see which grading
        mode applies to each question. You can use the{' '}
        <span className="badge badge-outline text-bg-light">Finish assessment</span> button below to
        finish and calculate your final grade.
      </div>
    );
  }
  return null;
}

function InstanceQuestionTableHeader({
  assessmentType,
  gradingConfig: {
    hasAutoGradingQuestion,
    hasManualGradingQuestion,
    someQuestionsAllowRealTimeGrading,
  },
}: {
  assessmentType: string;
  gradingConfig: GradingConfig;
}) {
  const trailingColumns =
    assessmentType === 'Exam' ? (
      <>
        {hasAutoGradingQuestion && someQuestionsAllowRealTimeGrading ? (
          <>
            <th className="text-center">
              Available points{' '}
              <ExamQuestionHelpPopover
                title="Available points"
                content={
                  <>
                    The number of points that would be earned for a 100% correct answer on the next
                    attempt. If retries are available for the question then a list of further points
                    is shown, where the <i>n</i>-th value is the number of points that would be
                    earned for a 100% correct answer on the <i>n</i>-th attempt.
                  </>
                }
              />
            </th>
            <th className="text-center">
              Awarded points{' '}
              <ExamQuestionHelpPopover
                title="Awarded points"
                content="The number of points already earned, as a fraction of the maximum possible points for the question."
              />
            </th>
          </>
        ) : hasAutoGradingQuestion && hasManualGradingQuestion ? (
          <>
            <th className="text-center">Auto-grading points</th>
            <th className="text-center">Manual grading points</th>
            <th className="text-center">Total points</th>
          </>
        ) : (
          <th className="text-center">Points</th>
        )}
      </>
    ) : (
      <>
        {hasAutoGradingQuestion && (
          <>
            <th className="text-center">Value</th>
            <th className="text-center">Variant history</th>
          </>
        )}
        <th className="text-center">Awarded points</th>
      </>
    );

  if (assessmentType === 'Exam') {
    if (hasAutoGradingQuestion && hasManualGradingQuestion && someQuestionsAllowRealTimeGrading) {
      return (
        <>
          <tr>
            <th rowSpan={2}>Question</th>
            <th rowSpan={2}>Status</th>
            <th className="text-center" colSpan={2}>
              Auto-grading
            </th>
            <th className="text-center" rowSpan={2}>
              Manual grading points
            </th>
            <th className="text-center" rowSpan={2}>
              Total points
            </th>
          </tr>
          <tr>{trailingColumns}</tr>
        </>
      );
    }
    return (
      <tr>
        <th>Question</th>
        <th>Status</th>
        {trailingColumns}
      </tr>
    );
  }

  // Homework
  if (hasAutoGradingQuestion && hasManualGradingQuestion) {
    return (
      <>
        <tr>
          <th rowSpan={2}>Question</th>
          <th className="text-center" colSpan={3}>
            Auto-grading
          </th>
          <th className="text-center" rowSpan={2}>
            Manual grading points
          </th>
          <th className="text-center" rowSpan={2}>
            Total points
          </th>
        </tr>
        <tr>{trailingColumns}</tr>
      </>
    );
  }
  return (
    <tr>
      <th>Question</th>
      {trailingColumns}
    </tr>
  );
}

function StudentAccessRulesPopover({ accessRules }: { accessRules: StudentAccessRule[] }) {
  return (
    <OverlayTrigger
      trigger="click"
      popover={{
        header: 'Access details',
        body: (
          <table className="table" aria-label="Access details">
            <thead>
              <tr>
                <th>Credit</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {accessRules.map((rule) => (
                <tr key={`${rule.credit}-${rule.start_date}-${rule.end_date}`}>
                  <td>{rule.credit}</td>
                  <td>{rule.start_date}</td>
                  <td>{rule.end_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ),
      }}
      rootClose
    >
      <button type="button" className="btn btn-xs btn-ghost" aria-label="Access details">
        <i className="fa fa-question-circle" aria-hidden="true" />
      </button>
    </OverlayTrigger>
  );
}

function ExamQuestionHelpPopover({ title, content }: { title: string; content: React.ReactNode }) {
  return (
    <OverlayTrigger
      trigger="click"
      popover={{
        header: title,
        body: content,
      }}
      rootClose
    >
      <button type="button" className="btn btn-xs btn-ghost" aria-label={title}>
        <i className="fa fa-question-circle" aria-hidden="true" />
      </button>
    </OverlayTrigger>
  );
}
