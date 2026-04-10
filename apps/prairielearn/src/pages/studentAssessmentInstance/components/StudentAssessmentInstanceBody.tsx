/* eslint-disable @eslint-react/dom-no-dangerously-set-innerhtml -- Pre-rendered HTML from shared template components */
import { useState } from 'react';
import { Modal } from 'react-bootstrap';

import { Scorebar } from '../../../components/Scorebar.js';
import { formatPoints } from '../../../lib/format.js';

import type {
  ClientQuestionRow,
  RowRenderedHtml,
  StudentAssessmentInstanceBodyProps,
} from './types.js';

export function StudentAssessmentInstanceBody({
  assessmentType,
  assessmentSetAbbreviation,
  assessmentNumber,
  assessmentTitle,
  isTeamWork,
  assessmentInstance,
  remainingMs,
  active,
  authorizedEdit,
  creditDateString,
  password,
  showClosedAssessment,
  hasManualGradingQuestion,
  hasAutoGradingQuestion,
  someQuestionsAllowRealTimeGrading,
  someQuestionsForbidRealTimeGrading,
  assessmentTextHtml,
  accessRulesPopoverHtml,
  groupWorkInfoHtml,
  questionRows,
  rowRenderedHtml,
  savedAnswers,
  suspendedSavedAnswers,
  zoneTitleColspan,
  firstUncrossedLockpointZoneNumber,
  allQuestionsAnswered,
  urlPrefix,
  csrfToken,
  userGroupRoles,
  isGroupAssessment,
  showTimeLimitExpiredModal,
}: StudentAssessmentInstanceBodyProps) {
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [showTimeLimitExpired, setShowTimeLimitExpired] = useState(showTimeLimitExpiredModal);
  const [activeLockpointZoneId, setActiveLockpointZoneId] = useState<string | null>(null);
  const [lockpointConfirmed, setLockpointConfirmed] = useState(false);

  const assessmentInstanceOpen = !!assessmentInstance.open;
  const allQuestionsDisabled = !someQuestionsAllowRealTimeGrading;
  const showExamFooterContent = assessmentType === 'Exam' && assessmentInstanceOpen && active;
  const showUnauthorizedEditWarning = !authorizedEdit;
  const showCardFooter = showExamFooterContent || showUnauthorizedEditWarning;

  const hasUnmetAdvanceScorePercBeforeLockpoint = (zoneNumber: number) =>
    questionRows.some(
      (row) =>
        row.questionAccessMode === 'blocked_sequence' &&
        (row.zoneNumber < zoneNumber || (row.zoneNumber === zoneNumber && row.startNewZone)),
    );

  function isLockpointCrossable(row: ClientQuestionRow) {
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
            {assessmentSetAbbreviation}
            {assessmentNumber}: {assessmentTitle}
          </h1>
          {isTeamWork && (
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
                    accessRulesPopoverHtml={accessRulesPopoverHtml}
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
                    accessRulesPopoverHtml={accessRulesPopoverHtml}
                  />
                </div>
              </>
            )}
            {groupWorkInfoHtml != null && (
              <div className="col-lg-12">
                <div dangerouslySetInnerHTML={{ __html: groupWorkInfoHtml }} />
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
                assessmentType={assessmentType}
                hasAutoGradingQuestion={hasAutoGradingQuestion}
                hasManualGradingQuestion={hasManualGradingQuestion}
                someQuestionsAllowRealTimeGrading={someQuestionsAllowRealTimeGrading}
              />
            </thead>
            <tbody>
              <QuestionTableBody
                questionRows={questionRows}
                rowRenderedHtml={rowRenderedHtml}
                assessmentType={assessmentType}
                hasAutoGradingQuestion={hasAutoGradingQuestion}
                hasManualGradingQuestion={hasManualGradingQuestion}
                someQuestionsAllowRealTimeGrading={someQuestionsAllowRealTimeGrading}
                assessmentInstanceOpen={assessmentInstanceOpen}
                zoneTitleColspan={zoneTitleColspan}
                urlPrefix={urlPrefix}
                userGroupRoles={userGroupRoles}
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
                someQuestionsAllowRealTimeGrading={someQuestionsAllowRealTimeGrading}
                someQuestionsForbidRealTimeGrading={someQuestionsForbidRealTimeGrading}
                savedAnswers={savedAnswers}
                suspendedSavedAnswers={suspendedSavedAnswers}
                authorizedEdit={authorizedEdit}
                password={password}
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
        isGroupAssessment={isGroupAssessment}
        confirmed={lockpointConfirmed}
        csrfToken={csrfToken}
        onHide={() => setActiveLockpointZoneId(null)}
        onConfirmChange={setLockpointConfirmed}
      />

      <TimeLimitExpiredModalReact
        show={showTimeLimitExpired}
        onHide={() => setShowTimeLimitExpired(false)}
      />
    </>
  );
}

// ============================================================
// Display sub-components
// ============================================================

function AssessmentStatus({
  assessmentInstanceOpen,
  active,
  creditDateString,
  accessRulesPopoverHtml,
}: {
  assessmentInstanceOpen: boolean;
  active: boolean;
  creditDateString: string | null;
  accessRulesPopoverHtml: string;
}) {
  if (assessmentInstanceOpen && active) {
    return (
      <>
        Assessment is <strong>open</strong> and you can answer questions.
        <br />
        Available credit: {creditDateString}{' '}
        <span dangerouslySetInnerHTML={{ __html: accessRulesPopoverHtml }} />
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
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
  someQuestionsAllowRealTimeGrading,
}: {
  assessmentType: string;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  someQuestionsAllowRealTimeGrading: boolean;
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
                content="The number of points that would be earned for a 100% correct answer on the next attempt. If retries are available for the question then a list of further points is shown, where the <i>n</i>-th value is the number of points that would be earned for a 100% correct answer on the <i>n</i>-th attempt."
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

function ExamQuestionHelpPopover({ title, content }: { title: string; content: string }) {
  return (
    <button
      type="button"
      className="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-placement="auto"
      data-bs-title={title}
      data-bs-content={content}
    >
      <i className="fa fa-question-circle" aria-hidden="true" />
    </button>
  );
}

// ============================================================
// Question table
// ============================================================

function QuestionTableBody({
  questionRows,
  rowRenderedHtml,
  assessmentType,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
  someQuestionsAllowRealTimeGrading,
  assessmentInstanceOpen,
  zoneTitleColspan,
  urlPrefix,
  userGroupRoles,
  isLockpointCrossable,
  hasUnmetAdvanceScorePercBeforeLockpoint,
  onCrossLockpoint,
}: {
  questionRows: ClientQuestionRow[];
  rowRenderedHtml: RowRenderedHtml[];
  assessmentType: string;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  someQuestionsAllowRealTimeGrading: boolean;
  assessmentInstanceOpen: boolean;
  zoneTitleColspan: number;
  urlPrefix: string;
  userGroupRoles: string | null;
  isLockpointCrossable: (row: ClientQuestionRow) => boolean;
  hasUnmetAdvanceScorePercBeforeLockpoint: (zoneNumber: number) => boolean;
  onCrossLockpoint: (zoneId: string) => void;
}) {
  let previousZoneHadInfo = false;

  return (
    <>
      {questionRows.map((row, index) => {
        const rendered = rowRenderedHtml[index];
        const zoneHasInfo =
          row.zoneTitle != null || row.zoneHasMaxPoints || row.zoneHasBestQuestions;
        const showZoneInfo = row.startNewZone && (zoneHasInfo || previousZoneHadInfo);

        if (row.startNewZone) {
          previousZoneHadInfo = zoneHasInfo;
        }

        const isBlocked =
          row.questionAccessMode === 'blocked_sequence' ||
          row.questionAccessMode === 'blocked_lockpoint';

        const rowLabelText =
          assessmentType === 'Exam'
            ? `Question ${row.questionNumber}`
            : row.questionTitle?.trim()
              ? `${row.questionNumber}. ${row.questionTitle}`
              : row.questionNumber;

        return (
          <QuestionRowGroup
            key={row.id}
            row={row}
            rendered={rendered}
            assessmentType={assessmentType}
            hasAutoGradingQuestion={hasAutoGradingQuestion}
            hasManualGradingQuestion={hasManualGradingQuestion}
            someQuestionsAllowRealTimeGrading={someQuestionsAllowRealTimeGrading}
            assessmentInstanceOpen={assessmentInstanceOpen}
            zoneTitleColspan={zoneTitleColspan}
            showZoneInfo={showZoneInfo}
            zoneHasInfo={zoneHasInfo}
            isBlocked={isBlocked}
            rowLabelText={rowLabelText}
            urlPrefix={urlPrefix}
            userGroupRoles={userGroupRoles}
            isLockpointCrossable={isLockpointCrossable}
            hasUnmetAdvanceScorePercBeforeLockpoint={hasUnmetAdvanceScorePercBeforeLockpoint}
            onCrossLockpoint={onCrossLockpoint}
          />
        );
      })}
    </>
  );
}

function QuestionRowGroup({
  row,
  rendered,
  assessmentType,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
  someQuestionsAllowRealTimeGrading,
  assessmentInstanceOpen,
  zoneTitleColspan,
  showZoneInfo,
  zoneHasInfo,
  isBlocked,
  rowLabelText,
  urlPrefix,
  userGroupRoles,
  isLockpointCrossable,
  hasUnmetAdvanceScorePercBeforeLockpoint,
  onCrossLockpoint,
}: {
  row: ClientQuestionRow;
  rendered: RowRenderedHtml;
  assessmentType: string;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  someQuestionsAllowRealTimeGrading: boolean;
  assessmentInstanceOpen: boolean;
  zoneTitleColspan: number;
  showZoneInfo: boolean;
  zoneHasInfo: boolean;
  isBlocked: boolean;
  rowLabelText: string;
  urlPrefix: string;
  userGroupRoles: string | null;
  isLockpointCrossable: (row: ClientQuestionRow) => boolean;
  hasUnmetAdvanceScorePercBeforeLockpoint: (zoneNumber: number) => boolean;
  onCrossLockpoint: (zoneId: string) => void;
}) {
  const hasStatusColumn = assessmentType === 'Exam';

  return (
    <>
      {row.startNewZone && row.lockpoint && (
        <LockpointRow
          row={row}
          colspan={zoneTitleColspan}
          crossable={isLockpointCrossable(row)}
          blockedByAdvanceScorePerc={hasUnmetAdvanceScorePercBeforeLockpoint(row.zoneNumber)}
          onCrossLockpoint={onCrossLockpoint}
        />
      )}
      {showZoneInfo && (
        <tr>
          <th colSpan={zoneTitleColspan}>
            {zoneHasInfo ? (
              <div className="d-flex align-items-center gap-2">
                {row.zoneTitle && <span>{row.zoneTitle}</span>}
                {row.zoneHasMaxPoints && (
                  <ZoneInfoPopover
                    label={
                      row.zoneTitle
                        ? `maximum ${row.zoneMaxPoints} points`
                        : `Maximum ${row.zoneMaxPoints} points`
                    }
                    content={`Of the points that you are awarded for answering these ${row.zoneQuestionCount} questions, at most ${row.zoneMaxPoints} will count toward your total points.`}
                  />
                )}
                {row.zoneHasBestQuestions && (
                  <ZoneInfoPopover
                    label={
                      row.zoneTitle || row.zoneHasMaxPoints
                        ? `best ${row.zoneBestQuestions} of ${row.zoneQuestionCount} questions`
                        : `Best ${row.zoneBestQuestions} of ${row.zoneQuestionCount} questions`
                    }
                    content={`Of these ${row.zoneQuestionCount} questions, only the ${row.zoneBestQuestions} with the highest number of awarded points will count toward your total points.`}
                  />
                )}
              </div>
            ) : (
              '\u00a0'
            )}
          </th>
        </tr>
      )}
      <tr className={isBlocked ? 'bg-light pl-sequence-locked' : ''}>
        <td>
          <div className="d-flex align-items-center">
            <RowLabel
              row={row}
              userGroupRoles={userGroupRoles}
              urlPrefix={urlPrefix}
              hasStatusColumn={hasStatusColumn}
              rowLabelText={rowLabelText}
            />
          </div>
        </td>
        {assessmentType === 'Exam' ? (
          <ExamQuestionCells
            rendered={rendered}
            hasAutoGradingQuestion={hasAutoGradingQuestion}
            hasManualGradingQuestion={hasManualGradingQuestion}
            someQuestionsAllowRealTimeGrading={someQuestionsAllowRealTimeGrading}
            assessmentInstanceOpen={assessmentInstanceOpen}
          />
        ) : (
          <HomeworkQuestionCells
            rendered={rendered}
            hasAutoGradingQuestion={hasAutoGradingQuestion}
            hasManualGradingQuestion={hasManualGradingQuestion}
          />
        )}
      </tr>
    </>
  );
}

function ExamQuestionCells({
  rendered,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
  someQuestionsAllowRealTimeGrading,
  assessmentInstanceOpen,
}: {
  rendered: RowRenderedHtml;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  someQuestionsAllowRealTimeGrading: boolean;
  assessmentInstanceOpen: boolean;
}) {
  return (
    <>
      <td
        className="align-middle lh-1"
        dangerouslySetInnerHTML={{ __html: rendered.statusHtml ?? '' }}
      />
      {hasAutoGradingQuestion && someQuestionsAllowRealTimeGrading && (
        <td
          className="text-center"
          dangerouslySetInnerHTML={{ __html: rendered.availablePointsHtml ?? '' }}
        />
      )}
      {someQuestionsAllowRealTimeGrading || !assessmentInstanceOpen ? (
        <>
          {hasAutoGradingQuestion && hasManualGradingQuestion && (
            <>
              <td
                className="text-center"
                dangerouslySetInnerHTML={{ __html: rendered.autoPointsHtml ?? '' }}
              />
              <td
                className="text-center"
                dangerouslySetInnerHTML={{ __html: rendered.manualPointsHtml ?? '' }}
              />
            </>
          )}
          <td
            className="text-center"
            dangerouslySetInnerHTML={{ __html: rendered.totalPointsHtml ?? '' }}
          />
        </>
      ) : (
        <>
          {hasAutoGradingQuestion && hasManualGradingQuestion && (
            <>
              <td
                className="text-center"
                dangerouslySetInnerHTML={{ __html: rendered.autoPointsHtml ?? '' }}
              />
              <td
                className="text-center"
                dangerouslySetInnerHTML={{ __html: rendered.manualPointsHtml ?? '' }}
              />
            </>
          )}
          <td
            className="text-center"
            dangerouslySetInnerHTML={{ __html: rendered.totalPointsHtml ?? '' }}
          />
        </>
      )}
    </>
  );
}

function HomeworkQuestionCells({
  rendered,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
}: {
  rendered: RowRenderedHtml;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
}) {
  return (
    <>
      {hasAutoGradingQuestion && (
        <>
          <td
            className="text-center"
            dangerouslySetInnerHTML={{ __html: rendered.availablePointsHtml ?? '' }}
          />
          <td
            className="text-center"
            dangerouslySetInnerHTML={{ __html: rendered.variantHistoryHtml ?? '' }}
          />
        </>
      )}
      {hasAutoGradingQuestion && hasManualGradingQuestion && (
        <>
          <td
            className="text-center"
            dangerouslySetInnerHTML={{ __html: rendered.autoPointsHtml ?? '' }}
          />
          <td
            className="text-center"
            dangerouslySetInnerHTML={{ __html: rendered.manualPointsHtml ?? '' }}
          />
        </>
      )}
      <td
        className="text-center"
        dangerouslySetInnerHTML={{ __html: rendered.totalPointsHtml ?? '' }}
      />
    </>
  );
}

function ZoneInfoPopover({ label, content }: { label: string; content: string }) {
  return (
    <button
      type="button"
      className="btn btn-xs btn-secondary"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-content={content}
    >
      {label}&nbsp;
      <i className="far fa-question-circle" aria-hidden="true" />
    </button>
  );
}

function LockpointRow({
  row,
  colspan,
  crossable,
  blockedByAdvanceScorePerc,
  onCrossLockpoint,
}: {
  row: ClientQuestionRow;
  colspan: number;
  crossable: boolean;
  blockedByAdvanceScorePerc: boolean;
  onCrossLockpoint: (zoneId: string) => void;
}) {
  if (row.lockpointCrossed) {
    return (
      <tr className="table-light">
        <td colSpan={colspan} className="py-2">
          <div className="d-flex">
            <i className="fas fa-check-circle text-success me-2 mt-1" aria-hidden="true" />
            <div>
              <span className="fw-bold">Lockpoint</span>
              <small className="text-muted d-block">{row.lockpointCrossedInfo}</small>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  if (crossable) {
    return (
      <tr className="table-warning">
        <td colSpan={colspan} className="py-2">
          <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
            <div className="d-flex">
              <i className="fas fa-lock text-warning me-2 mt-1" aria-hidden="true" />
              <div>
                <span className="fw-bold">Lockpoint</span>
                <small className="text-muted d-block">
                  After proceeding, you will not be able to submit answers to previous questions.
                </small>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-warning btn-sm text-nowrap"
              onClick={() => onCrossLockpoint(row.zoneId)}
            >
              Proceed to next questions
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="table-light">
      <td colSpan={colspan} className="py-2">
        <div className="d-flex">
          <i className="fas fa-lock text-secondary me-2 mt-1" aria-hidden="true" />
          <div>
            <span className="fw-bold text-muted">Lockpoint</span>
            <small className="text-muted d-block">
              {blockedByAdvanceScorePerc
                ? 'A previous question requires a higher score before you can proceed past this lockpoint.'
                : 'Complete previous questions to unlock.'}
            </small>
          </div>
        </div>
      </td>
    </tr>
  );
}

function RowLabel({
  row,
  userGroupRoles,
  rowLabelText,
  urlPrefix,
  hasStatusColumn,
}: {
  row: ClientQuestionRow;
  userGroupRoles: string | null;
  rowLabelText: string;
  urlPrefix: string;
  hasStatusColumn: boolean;
}) {
  let lockMessage: string | null = null;
  let showLink = true;

  if (row.questionAccessMode === 'blocked_sequence') {
    showLink = false;
    lockMessage =
      row.prevQuestionAccessMode === 'blocked_sequence'
        ? 'A previous question must be completed before you can access this one.'
        : `You must score at least ${row.prevAdvanceScorePerc}% on ${row.prevTitle} to unlock this question.`;
  } else if (row.questionAccessMode === 'blocked_lockpoint') {
    showLink = false;
  } else if (!(row.groupRolePermissions?.canView ?? true)) {
    showLink = false;
    lockMessage = `Your current group role (${userGroupRoles}) restricts access to this question.`;
  } else if (row.questionAccessMode === 'read_only_lockpoint') {
    lockMessage =
      'You can no longer submit answers to this question because you have advanced past a lockpoint.';
  }

  return (
    <>
      {showLink ? (
        <a href={`${urlPrefix}/instance_question/${row.id}/`}>{rowLabelText}</a>
      ) : (
        <span className="text-muted">{rowLabelText}</span>
      )}
      {row.questionAccessMode === 'blocked_lockpoint' && !hasStatusColumn ? (
        <span className="badge bg-secondary ms-1" data-testid="locked-instance-question-row">
          Locked
        </span>
      ) : lockMessage != null ? (
        <button
          type="button"
          className="btn btn-xs border text-secondary ms-1"
          data-bs-toggle="popover"
          data-bs-container="body"
          data-bs-html="true"
          data-bs-content={lockMessage}
          data-testid="locked-instance-question-row"
          aria-label="Locked"
        >
          <i className="fas fa-lock" aria-hidden="true" />
        </button>
      ) : null}
      {row.fileCount > 0 && (
        <button
          type="button"
          className="btn btn-xs border text-secondary ms-1"
          data-bs-toggle="popover"
          data-bs-container="body"
          data-bs-html="true"
          data-bs-content={`Personal notes: ${row.fileCount}`}
          aria-label="Has personal note attachments"
        >
          <i className="fas fa-paperclip" />
        </button>
      )}
    </>
  );
}

// ============================================================
// Exam footer
// ============================================================

function ExamFooterContent({
  someQuestionsAllowRealTimeGrading,
  someQuestionsForbidRealTimeGrading,
  savedAnswers,
  suspendedSavedAnswers,
  authorizedEdit,
  password,
  showClosedAssessment,
  csrfToken,
  onFinish,
}: {
  someQuestionsAllowRealTimeGrading: boolean;
  someQuestionsForbidRealTimeGrading: boolean;
  savedAnswers: number;
  suspendedSavedAnswers: number;
  authorizedEdit: boolean;
  password: string | null;
  showClosedAssessment: boolean;
  csrfToken: string;
  onFinish: () => void;
}) {
  if (someQuestionsAllowRealTimeGrading) {
    return (
      <>
        <form name="grade-form" method="POST">
          <input type="hidden" name="__action" value="grade" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          {savedAnswers > 0 ? (
            <button type="submit" className="btn btn-info" disabled={!authorizedEdit}>
              Grade {savedAnswers} saved {savedAnswers !== 1 ? 'answers' : 'answer'}
            </button>
          ) : (
            <button type="submit" className="btn btn-info" disabled>
              No saved answers to grade
            </button>
          )}
        </form>
        <ul className="mb-0">
          {suspendedSavedAnswers > 1 && (
            <li>
              There are {suspendedSavedAnswers} saved answers that cannot be graded yet because
              their grade rate has not been reached. They are marked with the{' '}
              <i className="fa fa-hourglass-half" /> icon above. Reload this page to update this
              information.
            </li>
          )}
          {suspendedSavedAnswers === 1 && (
            <li>
              There is one saved answer that cannot be graded yet because its grade rate has not
              been reached. It is marked with the <i className="fa fa-hourglass-half" /> icon above.
              Reload this page to update this information.
            </li>
          )}
          <li>
            Submit your answer to each question with the <strong>Save &amp; Grade</strong> or{' '}
            <strong>Save only</strong> buttons on the question page.
          </li>
          <li>
            Look at <strong>Status</strong> to confirm that each question has been{' '}
            {someQuestionsForbidRealTimeGrading ? 'either saved or graded' : 'graded'}. Questions
            with <strong>Available points</strong> can be attempted again for more points.
            Attempting questions again will never reduce the points you already have.
          </li>
          {password != null || !showClosedAssessment || someQuestionsForbidRealTimeGrading ? (
            <li>
              After you have answered all the questions completely, click here:{' '}
              <button
                className="btn btn-danger"
                disabled={!authorizedEdit}
                type="button"
                onClick={onFinish}
              >
                Finish assessment
              </button>
            </li>
          ) : (
            <li>
              When you are done, please logout and close your browser. If you have any saved answers
              when you leave, they will be automatically graded before your final score is computed.
            </li>
          )}
        </ul>
      </>
    );
  }

  return (
    <ul className="mb-0">
      <li>
        Submit your answer to each question with the <strong>Save</strong> button on the question
        page.
      </li>
      <li>
        After you have answered all the questions completely, click here:{' '}
        <button
          className="btn btn-danger"
          disabled={!authorizedEdit}
          type="button"
          onClick={onFinish}
        >
          Finish assessment
        </button>
      </li>
    </ul>
  );
}

// ============================================================
// React-Bootstrap modals
// ============================================================

function ConfirmFinishModal({
  show,
  onHide,
  allQuestionsAnswered,
  csrfToken,
}: {
  show: boolean;
  onHide: () => void;
  allQuestionsAnswered: boolean;
  csrfToken: string;
}) {
  return (
    <Modal show={show} onHide={onHide}>
      <form method="POST">
        <Modal.Header closeButton>
          <Modal.Title>All done?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!allQuestionsAnswered && (
            <div className="alert alert-warning">There are still unanswered questions.</div>
          )}
          <p className="text-danger">
            <strong>Warning</strong>: You will not be able to answer any more questions after
            finishing the assessment.
          </p>
          <p>Are you sure you want to finish, complete, and close out the assessment?</p>
        </Modal.Body>
        <Modal.Footer>
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" name="__action" value="finish">
            Finish assessment
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function CrossLockpointModal({
  show,
  onHide,
  zoneId,
  isGroupAssessment,
  confirmed,
  onConfirmChange,
  csrfToken,
}: {
  show: boolean;
  onHide: () => void;
  zoneId: string | null;
  isGroupAssessment: boolean;
  confirmed: boolean;
  onConfirmChange: (confirmed: boolean) => void;
  csrfToken: string;
}) {
  return (
    <Modal show={show} onHide={onHide}>
      <form method="POST">
        <Modal.Header closeButton>
          <Modal.Title>Proceed to next questions?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            After proceeding, you will not be able to submit answers to previous questions. You can
            still review your previous submissions.
          </p>
          {isGroupAssessment && (
            <p className="fw-bold">
              This will affect all group members. No one in your group will be able to submit
              answers to previous questions.
            </p>
          )}
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="lockpoint-confirm"
              checked={confirmed}
              onChange={(e) => onConfirmChange(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="lockpoint-confirm">
              I understand that I will not be able to submit answers to previous questions
            </label>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <input type="hidden" name="zone_id" value={zoneId ?? ''} />
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            Cancel
          </button>
          <button
            type="submit"
            name="__action"
            value="cross_lockpoint"
            className="btn btn-warning"
            disabled={!confirmed}
          >
            Confirm
          </button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function TimeLimitExpiredModalReact({ show, onHide }: { show: boolean; onHide: () => void }) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Time limit expired</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>Your time limit expired and your assessment is now finished.</p>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-primary" onClick={onHide}>
          OK
        </button>
      </Modal.Footer>
    </Modal>
  );
}
