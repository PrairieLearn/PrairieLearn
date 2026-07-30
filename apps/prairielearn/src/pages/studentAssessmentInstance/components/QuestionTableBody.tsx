import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { ExamQuestionAvailablePoints } from '../../../components/ExamQuestionAvailablePoints.js';
import { ExamQuestionStatus } from '../../../components/ExamQuestionStatus.js';
import { InstanceQuestionPoints } from '../../../components/QuestionScore.js';
import { QuestionVariantHistory } from '../../../components/QuestionVariantHistory.js';
import { formatStudentQuestionTitle } from '../../../lib/assessment.shared.js';
import type { EnumAssessmentType } from '../../../lib/db-types.js';
import { formatPoints } from '../../../lib/format.js';
import type { InstanceQuestionRow } from '../studentAssessmentInstance.types.js';

import { LockpointRow } from './LockpointRow.js';
import { RowLabel } from './RowLabel.js';

export function QuestionTableBody({
  rows,
  courseInstanceId,
  displayTimezone,
  assessmentType,
  showQuestionTitles,
  someQuestionsAllowRealTimeGrading,
  someQuestionsForbidRealTimeGrading,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
  assessmentInstanceOpen,
  isGroupAssessment,
  zoneTitleColspan,
  userGroupRoles,
  isLockpointCrossable,
  hasUnmetAdvanceScorePercBeforeLockpoint,
}: {
  rows: InstanceQuestionRow[];
  courseInstanceId: string;
  displayTimezone: string;
  assessmentType: EnumAssessmentType;
  showQuestionTitles: boolean;
  someQuestionsAllowRealTimeGrading: boolean;
  someQuestionsForbidRealTimeGrading: boolean;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  assessmentInstanceOpen: boolean;
  isGroupAssessment: boolean;
  zoneTitleColspan: number;
  userGroupRoles: string | null;
  isLockpointCrossable: (row: InstanceQuestionRow) => boolean;
  hasUnmetAdvanceScorePercBeforeLockpoint: (zone_number: number) => boolean;
}) {
  const zoneGroups: InstanceQuestionRow[][] = [];
  rows.forEach((row) => {
    if (row.start_new_zone || zoneGroups.length === 0) {
      zoneGroups.push([row]);
    } else {
      zoneGroups[zoneGroups.length - 1].push(row);
    }
  });

  let previousZoneHadInfo = false;

  return zoneGroups.map((zoneRows) => {
    const firstRow = zoneRows[0];
    const showBestQuestions =
      firstRow.zone.best_questions != null &&
      firstRow.zone.best_questions < firstRow.zone_question_count;
    const zoneHasInfo =
      firstRow.zone.title != null || firstRow.zone.max_points != null || showBestQuestions;

    // Show zone info if this zone has info, or if the previous zone
    // had info (blank zone info to visually separate).
    const showZoneInfo = zoneHasInfo || previousZoneHadInfo;

    previousZoneHadInfo = zoneHasInfo;

    return html`
      <tbody>
        ${firstRow.zone.lockpoint
          ? LockpointRow({
              row: firstRow,
              colspan: zoneTitleColspan,
              crossable: !!isLockpointCrossable(firstRow),
              blockedByAdvanceScorePerc: hasUnmetAdvanceScorePercBeforeLockpoint(
                firstRow.zone.number,
              ),
              isGroupAssessment,
              displayTimezone,
            })
          : ''}
        ${showZoneInfo
          ? html`
              <tr>
                <th colspan="${zoneTitleColspan}" scope="rowgroup">
                  ${zoneHasInfo
                    ? html`
                        <div class="d-flex align-items-center gap-2">
                          ${firstRow.zone.title ? html`<span>${firstRow.zone.title}</span>` : ''}
                          ${firstRow.zone.max_points != null
                            ? ZoneInfoPopover({
                                label: firstRow.zone.title
                                  ? `maximum ${firstRow.zone.max_points} points`
                                  : `Maximum ${firstRow.zone.max_points} points`,
                                content: `Of the points that you are awarded for answering these ${firstRow.zone_question_count} questions, at most ${firstRow.zone.max_points} will count toward your total points.`,
                              })
                            : ''}
                          ${showBestQuestions
                            ? ZoneInfoPopover({
                                label:
                                  firstRow.zone.title || firstRow.zone.max_points != null
                                    ? `best ${firstRow.zone.best_questions} of ${firstRow.zone_question_count} questions`
                                    : `Best ${firstRow.zone.best_questions} of ${firstRow.zone_question_count} questions`,
                                content: `Of these ${firstRow.zone_question_count} questions, only the ${firstRow.zone.best_questions} with the highest number of awarded points will count toward your total points.`,
                              })
                            : ''}
                        </div>
                      `
                    : html`&nbsp;`}
                </th>
              </tr>
            `
          : ''}
        ${zoneRows.map(
          (row) => html`
            <tr
              class="${row.question_access_mode === 'blocked_sequence' ||
              row.question_access_mode === 'blocked_lockpoint'
                ? 'bg-light pl-sequence-locked'
                : ''}"
            >
              <td>
                <div class="d-flex align-items-center">
                  ${RowLabel({
                    courseInstanceId,
                    row,
                    userGroupRoles,
                    hasStatusColumn: assessmentType === 'Exam',
                    rowLabelText: formatStudentQuestionTitle({
                      assessmentType,
                      questionNumber: row.question_number,
                      questionTitle: row.question.title,
                      showQuestionTitles,
                    }),
                  })}
                </div>
              </td>
              ${assessmentType === 'Exam'
                ? ExamQuestionCells({
                    row,
                    someQuestionsAllowRealTimeGrading,
                    someQuestionsForbidRealTimeGrading,
                    hasAutoGradingQuestion,
                    hasManualGradingQuestion,
                    assessmentInstanceOpen,
                  })
                : HomeworkQuestionCells({
                    row,
                    courseInstanceId,
                    hasAutoGradingQuestion,
                    hasManualGradingQuestion,
                  })}
            </tr>
          `,
        )}
      </tbody>
    `;
  });
}

function ExamQuestionCells({
  row,
  someQuestionsAllowRealTimeGrading,
  someQuestionsForbidRealTimeGrading,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
  assessmentInstanceOpen,
}: {
  row: InstanceQuestionRow;
  someQuestionsAllowRealTimeGrading: boolean;
  someQuestionsForbidRealTimeGrading: boolean;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  assessmentInstanceOpen: boolean;
}) {
  return html`
    <td class="align-middle lh-1">
      ${
        // Override the status badge for questions blocked by a lockpoint:
        // show "Locked" instead of the misleading "unanswered".
        row.question_access_mode === 'blocked_lockpoint'
          ? html`<span class="badge text-bg-secondary">Locked</span>`
          : ExamQuestionStatus({
              instance_question: row.instance_question,
              assessment_question: row.assessment_question,
              realTimeGradingPartiallyDisabled:
                someQuestionsAllowRealTimeGrading && someQuestionsForbidRealTimeGrading,
              allowGradeLeftMs: row.allowGradeLeftMs,
            })
      }
    </td>
    ${hasAutoGradingQuestion && someQuestionsAllowRealTimeGrading
      ? html`
          <td class="text-center">
            ${row.assessment_question.max_auto_points
              ? ExamQuestionAvailablePoints({
                  open: assessmentInstanceOpen && row.instance_question.open,
                  currentWeight:
                    (row.instance_question.points_list_original?.[
                      row.instance_question.number_attempts
                    ] ?? 0) - (row.assessment_question.max_manual_points ?? 0),
                  pointsList: row.instance_question.points_list?.map(
                    (p) => p - (row.assessment_question.max_manual_points ?? 0),
                  ),
                  highestSubmissionScore: row.instance_question.highest_submission_score,
                })
              : html`&mdash;`}
          </td>
        `
      : ''}
    ${someQuestionsAllowRealTimeGrading || !assessmentInstanceOpen
      ? html`
          ${hasAutoGradingQuestion && hasManualGradingQuestion
            ? html`
                <td class="text-center">
                  ${InstanceQuestionPoints({
                    instance_question: row.instance_question,
                    assessment_question: row.assessment_question,
                    component: 'auto',
                  })}
                </td>
                <td class="text-center">
                  ${InstanceQuestionPoints({
                    instance_question: row.instance_question,
                    assessment_question: row.assessment_question,
                    component: 'manual',
                  })}
                </td>
              `
            : ''}
          <td class="text-center">
            ${InstanceQuestionPoints({
              instance_question: row.instance_question,
              assessment_question: row.assessment_question,
              component: 'total',
            })}
          </td>
        `
      : html`
          ${hasAutoGradingQuestion && hasManualGradingQuestion
            ? html`
                <td class="text-center">
                  ${formatPoints(row.assessment_question.max_auto_points)}
                </td>
                <td class="text-center">
                  ${formatPoints(row.assessment_question.max_manual_points)}
                </td>
              `
            : ''}
          <td class="text-center">${formatPoints(row.assessment_question.max_points)}</td>
        `}
  `;
}

function HomeworkQuestionCells({
  row,
  courseInstanceId,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
}: {
  row: InstanceQuestionRow;
  courseInstanceId: string;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
}) {
  return html`
    ${hasAutoGradingQuestion
      ? html`
          <td class="text-center">
            ${run(() => {
              if (!row.assessment_question.max_auto_points) {
                return html`&mdash;`;
              }

              // Compute the current "auto" value by subtracting the manual points.
              // We use this because `current_value` doesn't account for manual points.
              // We don't want to mislead the student into thinking that they can earn
              // more points than they actually can.
              const currentAutoValue =
                (row.instance_question.current_value ?? 0) -
                (row.assessment_question.max_manual_points ?? 0);

              return formatPoints(currentAutoValue);
            })}
          </td>
          <td class="text-center">
            ${QuestionVariantHistory({
              instanceQuestionId: row.instance_question.id,
              courseInstanceId,
              previousVariants: row.previous_variants,
            })}
          </td>
        `
      : ''}
    ${hasAutoGradingQuestion && hasManualGradingQuestion
      ? html`
          <td class="text-center">
            ${InstanceQuestionPoints({
              instance_question: row.instance_question,
              assessment_question: row.assessment_question,
              component: 'auto',
            })}
          </td>
          <td class="text-center">
            ${InstanceQuestionPoints({
              instance_question: row.instance_question,
              assessment_question: row.assessment_question,
              component: 'manual',
            })}
          </td>
        `
      : ''}
    <td class="text-center">
      ${InstanceQuestionPoints({
        instance_question: row.instance_question,
        assessment_question: row.assessment_question,
        component: 'total',
      })}
    </td>
  `;
}

function ZoneInfoPopover({ label, content }: { label: string; content: string }) {
  return html`
    <button
      type="button"
      class="btn btn-xs btn-secondary"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-content="${content}"
    >
      ${label}&nbsp;<i class="far fa-question-circle" aria-hidden="true"></i>
    </button>
  `;
}
