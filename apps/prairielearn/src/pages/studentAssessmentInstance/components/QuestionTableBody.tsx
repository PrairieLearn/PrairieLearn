import { Fragment } from 'react';
import { Badge } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import { ExamQuestionAvailablePoints } from '../../../components/ExamQuestionAvailablePoints.js';
import { ExamQuestionStatus } from '../../../components/ExamQuestionStatus.js';
import { QuestionVariantHistory } from '../../../components/QuestionVariantHistory.js';
import { formatPoints } from '../../../lib/format.js';

import { LockpointRow } from './LockpointRow.js';
import { RowLabel } from './RowLabel.js';
import type { GradingConfig, StudentQuestionRow } from './types.js';

export function QuestionTableBody({
  questionRows,
  assessmentType,
  gradingConfig,
  assessmentInstanceOpen,
  displayTimezone,
  isGroupAssessment,
  zoneTitleColspan,
  courseInstanceId,
  userGroupRoles,
  isLockpointCrossable,
  hasUnmetAdvanceScorePercBeforeLockpoint,
  onCrossLockpoint,
}: {
  questionRows: StudentQuestionRow[];
  assessmentType: string;
  gradingConfig: GradingConfig;
  assessmentInstanceOpen: boolean;
  displayTimezone: string;
  isGroupAssessment: boolean;
  zoneTitleColspan: number;
  courseInstanceId: string;
  userGroupRoles: string | null;
  isLockpointCrossable: (row: StudentQuestionRow) => boolean;
  hasUnmetAdvanceScorePercBeforeLockpoint: (zoneNumber: number) => boolean;
  onCrossLockpoint: (zoneId: string) => void;
}) {
  const { someQuestionsAllowRealTimeGrading, someQuestionsForbidRealTimeGrading } = gradingConfig;
  const hasStatusColumn = assessmentType === 'Exam';
  const realTimeGradingPartiallyDisabled =
    someQuestionsAllowRealTimeGrading && someQuestionsForbidRealTimeGrading;

  const showZoneInfoByIndex = run(() => {
    const result: boolean[] = [];
    let previousZoneHadInfo = false;
    for (const row of questionRows) {
      const zoneHasInfo =
        row.zone.title != null || row.zone.max_points != null || row.zone.best_questions != null;
      result.push(row.start_new_zone && (zoneHasInfo || previousZoneHadInfo));
      if (row.start_new_zone) {
        previousZoneHadInfo = zoneHasInfo;
      }
    }
    return result;
  });

  return (
    <>
      {questionRows.map((row, index) => {
        const zoneHasInfo =
          row.zone.title != null || row.zone.max_points != null || row.zone.best_questions != null;
        const showZoneInfo = showZoneInfoByIndex[index];

        const isBlocked =
          row.question_access_mode === 'blocked_sequence' ||
          row.question_access_mode === 'blocked_lockpoint';

        const rowLabelText =
          assessmentType === 'Exam'
            ? `Question ${row.question_number}`
            : row.question.title?.trim()
              ? `${row.question_number}. ${row.question.title}`
              : row.question_number;

        return (
          <Fragment key={row.instance_question.id}>
            {row.start_new_zone && row.zone.lockpoint && (
              <LockpointRow
                row={row}
                colspan={zoneTitleColspan}
                crossable={isLockpointCrossable(row)}
                blockedByAdvanceScorePerc={hasUnmetAdvanceScorePercBeforeLockpoint(row.zone.number)}
                isGroupAssessment={isGroupAssessment}
                displayTimezone={displayTimezone}
                onCrossLockpoint={onCrossLockpoint}
              />
            )}
            {showZoneInfo && (
              <tr>
                <th colSpan={zoneTitleColspan}>
                  {zoneHasInfo ? (
                    <div className="d-flex align-items-center gap-2">
                      {row.zone.title && <span>{row.zone.title}</span>}
                      {row.zone.max_points != null && (
                        <ZoneInfoPopover
                          label={
                            row.zone.title
                              ? `maximum ${row.zone.max_points} ${row.zone.max_points === 1 ? 'point' : 'points'}`
                              : `Maximum ${row.zone.max_points} ${row.zone.max_points === 1 ? 'point' : 'points'}`
                          }
                          content={`Of the points that you are awarded for answering ${row.zone_question_count === 1 ? 'this question' : `these ${row.zone_question_count} questions`}, at most ${row.zone.max_points} will count toward your total points.`}
                        />
                      )}
                      {row.zone.best_questions != null && (
                        <ZoneInfoPopover
                          label={
                            row.zone.title || row.zone.max_points != null
                              ? `best ${row.zone.best_questions} of ${row.zone_question_count} ${row.zone_question_count === 1 ? 'question' : 'questions'}`
                              : `Best ${row.zone.best_questions} of ${row.zone_question_count} ${row.zone_question_count === 1 ? 'question' : 'questions'}`
                          }
                          content={`Of ${row.zone_question_count === 1 ? 'this question' : `these ${row.zone_question_count} questions`}, only the ${row.zone.best_questions} with the highest number of awarded points will count toward your total points.`}
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
                    courseInstanceId={courseInstanceId}
                    hasStatusColumn={hasStatusColumn}
                    rowLabelText={rowLabelText}
                  />
                </div>
              </td>
              {assessmentType === 'Exam' ? (
                <ExamQuestionCells
                  row={row}
                  gradingConfig={gradingConfig}
                  realTimeGradingPartiallyDisabled={realTimeGradingPartiallyDisabled}
                  assessmentInstanceOpen={assessmentInstanceOpen}
                />
              ) : (
                <HomeworkQuestionCells
                  row={row}
                  gradingConfig={gradingConfig}
                  courseInstanceId={courseInstanceId}
                />
              )}
            </tr>
          </Fragment>
        );
      })}
    </>
  );
}

function ExamQuestionCells({
  row,
  gradingConfig: {
    hasAutoGradingQuestion,
    hasManualGradingQuestion,
    someQuestionsAllowRealTimeGrading,
  },
  realTimeGradingPartiallyDisabled,
  assessmentInstanceOpen,
}: {
  row: StudentQuestionRow;
  gradingConfig: GradingConfig;
  realTimeGradingPartiallyDisabled: boolean;
  assessmentInstanceOpen: boolean;
}) {
  return (
    <>
      <td className="align-middle lh-1">
        <ExamQuestionStatus
          instanceQuestion={row.instance_question}
          assessmentQuestion={row.assessment_question}
          allowGradeLeftMs={row.allow_grade_left_ms}
          questionAccessMode={row.question_access_mode}
          realTimeGradingPartiallyDisabled={realTimeGradingPartiallyDisabled}
        />
      </td>
      {hasAutoGradingQuestion && someQuestionsAllowRealTimeGrading && (
        <td className="text-center">
          <ExamQuestionAvailablePoints
            open={row.instance_question.open}
            pointsList={row.instance_question.points_list?.map(
              (p) => p - (row.assessment_question.max_manual_points ?? 0),
            )}
            currentWeight={
              (row.instance_question.points_list_original?.[
                row.instance_question.number_attempts
              ] ?? 0) - (row.assessment_question.max_manual_points ?? 0)
            }
            highestSubmissionScore={row.instance_question.highest_submission_score}
          />
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
              <td className="text-center">
                {formatPoints(row.assessment_question.max_auto_points)}
              </td>
              <td className="text-center">
                {formatPoints(row.assessment_question.max_manual_points)}
              </td>
            </>
          )}
          <td className="text-center">{formatPoints(row.assessment_question.max_points)}</td>
        </>
      )}
    </>
  );
}

function HomeworkQuestionCells({
  row,
  gradingConfig: { hasAutoGradingQuestion, hasManualGradingQuestion },
  courseInstanceId,
}: {
  row: StudentQuestionRow;
  gradingConfig: GradingConfig;
  courseInstanceId: string;
}) {
  return (
    <>
      {hasAutoGradingQuestion && (
        <>
          <td className="text-center">
            {!row.assessment_question.max_auto_points ? (
              <>&mdash;</>
            ) : (
              formatPoints(
                (row.instance_question.current_value ?? 0) -
                  (row.assessment_question.max_manual_points ?? 0),
              )
            )}
          </td>
          <td className="text-center">
            <QuestionVariantHistory
              instanceQuestionId={row.instance_question.id}
              previousVariants={row.previous_variants}
              courseInstanceId={courseInstanceId}
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
  row: StudentQuestionRow;
  component: 'manual' | 'auto' | 'total';
}) {
  const points =
    component === 'auto'
      ? row.instance_question.auto_points
      : component === 'manual'
        ? row.instance_question.manual_points
        : row.instance_question.points;
  const maxPoints =
    component === 'auto'
      ? row.assessment_question.max_auto_points
      : component === 'manual'
        ? row.assessment_question.max_manual_points
        : row.assessment_question.max_points;
  const pointsPending =
    (['saved', 'grading'].includes(row.instance_question.status ?? '') && component !== 'manual') ||
    (row.instance_question.requires_manual_grading && component !== 'auto');

  // Special case: if this is a manually-graded question in the saved state, don't show
  // a "pending" badge for auto points, since there aren't any pending auto points.
  if (
    row.instance_question.status === 'saved' &&
    component === 'auto' &&
    !row.assessment_question.max_auto_points &&
    row.assessment_question.max_manual_points
  ) {
    return <span className="text-nowrap">&mdash;</span>;
  }

  const pointsContent =
    // If the question is unanswered show a dash instead of 0 points, unless
    // the question was manually graded or a regrading process forced the
    // points to be increased.
    row.instance_question.status === 'unanswered' &&
    !row.instance_question.has_last_grader &&
    row.instance_question.points === 0 ? (
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
        <i className="bi bi-question-circle" aria-hidden="true" />
      </button>
    </OverlayTrigger>
  );
}
