import { ExamQuestionCells } from './ExamQuestionCells.js';
import { HomeworkQuestionCells } from './HomeworkQuestionCells.js';
import { LockpointRow } from './LockpointRow.js';
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
  let previousZoneHadInfo = false;

  return (
    <>
      {questionRows.map((row) => {
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
            assessmentType={assessmentType}
            hasAutoGradingQuestion={hasAutoGradingQuestion}
            hasManualGradingQuestion={hasManualGradingQuestion}
            someQuestionsAllowRealTimeGrading={someQuestionsAllowRealTimeGrading}
            someQuestionsForbidRealTimeGrading={someQuestionsForbidRealTimeGrading}
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
            someQuestionsForbidRealTimeGrading={someQuestionsForbidRealTimeGrading}
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
