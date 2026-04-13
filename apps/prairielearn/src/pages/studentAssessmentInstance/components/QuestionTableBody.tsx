import { Badge } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import { formatPoints } from '../../../lib/format.js';

import { ExamQuestionAvailablePoints } from './ExamQuestionAvailablePoints.js';
import { ExamQuestionStatus } from './ExamQuestionStatus.js';
import { LockpointRow } from './LockpointRow.js';
import { QuestionVariantHistory } from './QuestionVariantHistory.js';
import { RowLabel } from './RowLabel.js';
import type { ClientQuestionRow } from './types.js';

export function QuestionTableBody({
  questionRows,
  assessmentType,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
  someQuestionsAllowRealTimeGrading,
  someQuestionsForbidRealTimeGrading,
  assessmentInstanceOpen,
  zoneTitleColspan,
  urlPrefix,
  userGroupRoles,
  isLockpointCrossable,
  hasUnmetAdvanceScorePercBeforeLockpoint,
  onCrossLockpoint,
}: {
  questionRows: ClientQuestionRow[];
  assessmentType: string;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  someQuestionsAllowRealTimeGrading: boolean;
  someQuestionsForbidRealTimeGrading: boolean;
  assessmentInstanceOpen: boolean;
  zoneTitleColspan: number;
  urlPrefix: string;
  userGroupRoles: string | null;
  isLockpointCrossable: (row: ClientQuestionRow) => boolean;
  hasUnmetAdvanceScorePercBeforeLockpoint: (zoneNumber: number) => boolean;
  onCrossLockpoint: (zoneId: string) => void;
}) {
  const showZoneInfoByIndex = run(() => {
    const result: boolean[] = [];
    let previousZoneHadInfo = false;
    for (const row of questionRows) {
      const zoneHasInfo = row.zoneTitle != null || row.zoneHasMaxPoints || row.zoneHasBestQuestions;
      result.push(row.startNewZone && (zoneHasInfo || previousZoneHadInfo));
      if (row.startNewZone) {
        previousZoneHadInfo = zoneHasInfo;
      }
    }
    return result;
  });

  return (
    <>
      {questionRows.map((row, index) => {
        const zoneHasInfo =
          row.zoneTitle != null || row.zoneHasMaxPoints || row.zoneHasBestQuestions;

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
            assessmentType={assessmentType}
            hasAutoGradingQuestion={hasAutoGradingQuestion}
            hasManualGradingQuestion={hasManualGradingQuestion}
            someQuestionsAllowRealTimeGrading={someQuestionsAllowRealTimeGrading}
            someQuestionsForbidRealTimeGrading={someQuestionsForbidRealTimeGrading}
            assessmentInstanceOpen={assessmentInstanceOpen}
            zoneTitleColspan={zoneTitleColspan}
            showZoneInfo={showZoneInfoByIndex[index]}
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
  assessmentType,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
  someQuestionsAllowRealTimeGrading,
  someQuestionsForbidRealTimeGrading,
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
  assessmentType: string;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  someQuestionsAllowRealTimeGrading: boolean;
  someQuestionsForbidRealTimeGrading: boolean;
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
  const realTimeGradingPartiallyDisabled =
    someQuestionsAllowRealTimeGrading && someQuestionsForbidRealTimeGrading;

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
            row={row}
            hasAutoGradingQuestion={hasAutoGradingQuestion}
            hasManualGradingQuestion={hasManualGradingQuestion}
            someQuestionsAllowRealTimeGrading={someQuestionsAllowRealTimeGrading}
            realTimeGradingPartiallyDisabled={realTimeGradingPartiallyDisabled}
            assessmentInstanceOpen={assessmentInstanceOpen}
          />
        ) : (
          <HomeworkQuestionCells
            row={row}
            hasAutoGradingQuestion={hasAutoGradingQuestion}
            hasManualGradingQuestion={hasManualGradingQuestion}
            urlPrefix={urlPrefix}
          />
        )}
      </tr>
    </>
  );
}

function ExamQuestionCells({
  row,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
  someQuestionsAllowRealTimeGrading,
  realTimeGradingPartiallyDisabled,
  assessmentInstanceOpen,
}: {
  row: ClientQuestionRow;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  someQuestionsAllowRealTimeGrading: boolean;
  realTimeGradingPartiallyDisabled: boolean;
  assessmentInstanceOpen: boolean;
}) {
  return (
    <>
      <td className="align-middle lh-1">
        <ExamQuestionStatus
          row={row}
          realTimeGradingPartiallyDisabled={realTimeGradingPartiallyDisabled}
        />
      </td>
      {hasAutoGradingQuestion && someQuestionsAllowRealTimeGrading && (
        <td className="text-center">
          <ExamQuestionAvailablePoints row={row} />
        </td>
      )}
      {someQuestionsAllowRealTimeGrading || !assessmentInstanceOpen ? (
        <>
          {hasAutoGradingQuestion && hasManualGradingQuestion && (
            <>
              <td className="text-center">
                <InstanceQuestionPoints row={row} component="auto" />
              </td>
              <td className="text-center">
                <InstanceQuestionPoints row={row} component="manual" />
              </td>
            </>
          )}
          <td className="text-center">
            <InstanceQuestionPoints row={row} component="total" />
          </td>
        </>
      ) : (
        <>
          {hasAutoGradingQuestion && hasManualGradingQuestion && (
            <>
              <td className="text-center">{formatPoints(row.maxAutoPoints)}</td>
              <td className="text-center">{formatPoints(row.maxManualPoints)}</td>
            </>
          )}
          <td className="text-center">{formatPoints(row.maxPoints)}</td>
        </>
      )}
    </>
  );
}

function HomeworkQuestionCells({
  row,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
  urlPrefix,
}: {
  row: ClientQuestionRow;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  urlPrefix: string;
}) {
  return (
    <>
      {hasAutoGradingQuestion && (
        <>
          <td className="text-center">
            {!row.maxAutoPoints ? (
              <>&mdash;</>
            ) : (
              formatPoints((row.currentValue ?? 0) - (row.maxManualPoints ?? 0))
            )}
          </td>
          <td className="text-center">
            <QuestionVariantHistory
              instanceQuestionId={row.id}
              previousVariants={row.previousVariants}
              urlPrefix={urlPrefix}
            />
          </td>
        </>
      )}
      {hasAutoGradingQuestion && hasManualGradingQuestion && (
        <>
          <td className="text-center">
            <InstanceQuestionPoints row={row} component="auto" />
          </td>
          <td className="text-center">
            <InstanceQuestionPoints row={row} component="manual" />
          </td>
        </>
      )}
      <td className="text-center">
        <InstanceQuestionPoints row={row} component="total" />
      </td>
    </>
  );
}

function InstanceQuestionPoints({
  row,
  component,
}: {
  row: ClientQuestionRow;
  component: 'manual' | 'auto' | 'total';
}) {
  const points =
    component === 'auto' ? row.autoPoints : component === 'manual' ? row.manualPoints : row.points;
  const maxPoints =
    component === 'auto'
      ? row.maxAutoPoints
      : component === 'manual'
        ? row.maxManualPoints
        : row.maxPoints;
  const pointsPending =
    (['saved', 'grading'].includes(row.status ?? '') && component !== 'manual') ||
    (row.requiresManualGrading && component !== 'auto');

  // Special case: if this is a manually-graded question in the saved state, don't show
  // a "pending" badge for auto points, since there aren't any pending auto points.
  if (row.status === 'saved' && component === 'auto' && !row.maxAutoPoints && row.maxManualPoints) {
    return <span className="text-nowrap">&mdash;</span>;
  }

  const pointsContent =
    // If the question is unanswered show a dash instead of 0 points, unless
    // the question was manually graded or a regrading process forced the
    // points to be increased.
    row.status === 'unanswered' && !row.hasLastGrader && row.points === 0 ? (
      <>&mdash;</>
    ) : pointsPending ? (
      <Badge bg="info">pending</Badge>
    ) : !points && !maxPoints ? (
      <>&mdash;</>
    ) : (
      <span data-testid="awarded-points">{formatPoints(points)}</span>
    );

  return (
    <span className="text-nowrap">
      {pointsContent}
      {maxPoints ? (
        <small>
          /<span className="text-muted">{maxPoints}</span>
        </small>
      ) : null}
    </span>
  );
}

function ZoneInfoPopover({ label, content }: { label: string; content: string }) {
  return (
    <OverlayTrigger trigger="click" popover={{ body: content }} rootClose>
      <button type="button" className="btn btn-xs btn-secondary">
        {label}&nbsp;
        <i className="far fa-question-circle" aria-hidden="true" />
      </button>
    </OverlayTrigger>
  );
}
