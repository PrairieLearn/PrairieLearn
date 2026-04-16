import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { ExamQuestionAvailablePoints } from '../../../components/ExamQuestionAvailablePoints.js';
import { ExamQuestionStatus } from '../../../components/ExamQuestionStatus.js';
import { InstanceQuestionPoints } from '../../../components/QuestionScore.js';
import { QuestionVariantHistory } from '../../../components/QuestionVariantHistory.js';
import type { EnumAssessmentType } from '../../../lib/db-types.js';
import { formatPoints } from '../../../lib/format.js';
import type { InstanceQuestionRow } from '../studentAssessmentInstance.types.js';

import { LockpointRow } from './LockpointRow.js';
import { RowLabel } from './RowLabel.js';

export function QuestionTableBody({
  instance_question_rows,
  courseInstanceId,
  displayTimezone,
  assessmentType,
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
  instance_question_rows: InstanceQuestionRow[];
  courseInstanceId: string;
  displayTimezone: string;
  assessmentType: EnumAssessmentType;
  someQuestionsAllowRealTimeGrading: boolean;
  someQuestionsForbidRealTimeGrading: boolean;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
  assessmentInstanceOpen: boolean;
  isGroupAssessment: boolean;
  zoneTitleColspan: number;
  userGroupRoles: string | null;
  isLockpointCrossable: (instance_question_row: InstanceQuestionRow) => boolean;
  hasUnmetAdvanceScorePercBeforeLockpoint: (zone_number: number) => boolean;
}) {
  let previousZoneHadInfo = false;

  return instance_question_rows.map((instance_question_row) => {
    const zoneHasInfo =
      instance_question_row.zone_title != null ||
      instance_question_row.zone_has_max_points ||
      instance_question_row.zone_has_best_questions;

    // Show zone info if this zone has info, or if the previous zone
    // had info (blank zone info to visually separate).
    const showZoneInfo =
      instance_question_row.start_new_zone && (zoneHasInfo || previousZoneHadInfo);

    if (instance_question_row.start_new_zone) {
      previousZoneHadInfo = zoneHasInfo;
    }

    return html`
      ${instance_question_row.start_new_zone && instance_question_row.lockpoint
        ? LockpointRow({
            row: instance_question_row,
            colspan: zoneTitleColspan,
            crossable: !!isLockpointCrossable(instance_question_row),
            blockedByAdvanceScorePerc: hasUnmetAdvanceScorePercBeforeLockpoint(
              instance_question_row.zone_number,
            ),
            isGroupAssessment,
            displayTimezone,
          })
        : ''}
      ${showZoneInfo
        ? html`
            <tr>
              <th colspan="${zoneTitleColspan}">
                ${zoneHasInfo
                  ? html`
                      <div class="d-flex align-items-center gap-2">
                        ${instance_question_row.zone_title
                          ? html`<span>${instance_question_row.zone_title}</span>`
                          : ''}
                        ${instance_question_row.zone_has_max_points
                          ? ZoneInfoPopover({
                              label: instance_question_row.zone_title
                                ? `maximum ${instance_question_row.zone_max_points} points`
                                : `Maximum ${instance_question_row.zone_max_points} points`,
                              content: `Of the points that you are awarded for answering these ${instance_question_row.zone_question_count} questions, at most ${instance_question_row.zone_max_points} will count toward your total points.`,
                            })
                          : ''}
                        ${instance_question_row.zone_has_best_questions
                          ? ZoneInfoPopover({
                              label:
                                instance_question_row.zone_title ||
                                instance_question_row.zone_has_max_points
                                  ? `best ${instance_question_row.zone_best_questions} of ${instance_question_row.zone_question_count} questions`
                                  : `Best ${instance_question_row.zone_best_questions} of ${instance_question_row.zone_question_count} questions`,
                              content: `Of these ${instance_question_row.zone_question_count} questions, only the ${instance_question_row.zone_best_questions} with the highest number of awarded points will count toward your total points.`,
                            })
                          : ''}
                      </div>
                    `
                  : html`&nbsp;`}
              </th>
            </tr>
          `
        : ''}
      <tr
        class="${instance_question_row.question_access_mode === 'blocked_sequence' ||
        instance_question_row.question_access_mode === 'blocked_lockpoint'
          ? 'bg-light pl-sequence-locked'
          : ''}"
      >
        <td>
          <div class="d-flex align-items-center">
            ${RowLabel({
              courseInstanceId,
              instance_question_row,
              userGroupRoles,
              hasStatusColumn: assessmentType === 'Exam',
              rowLabelText:
                assessmentType === 'Exam'
                  ? `Question ${instance_question_row.question_number}`
                  : instance_question_row.question_title?.trim()
                    ? `${instance_question_row.question_number}. ${instance_question_row.question_title}`
                    : instance_question_row.question_number,
            })}
          </div>
        </td>
        ${assessmentType === 'Exam'
          ? ExamQuestionCells({
              instance_question_row,
              someQuestionsAllowRealTimeGrading,
              someQuestionsForbidRealTimeGrading,
              hasAutoGradingQuestion,
              hasManualGradingQuestion,
              assessmentInstanceOpen,
            })
          : HomeworkQuestionCells({
              instance_question_row,
              courseInstanceId,
              hasAutoGradingQuestion,
              hasManualGradingQuestion,
            })}
      </tr>
    `;
  });
}

function ExamQuestionCells({
  instance_question_row,
  someQuestionsAllowRealTimeGrading,
  someQuestionsForbidRealTimeGrading,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
  assessmentInstanceOpen,
}: {
  instance_question_row: InstanceQuestionRow;
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
        instance_question_row.question_access_mode === 'blocked_lockpoint'
          ? html`<span class="badge text-bg-secondary">Locked</span>`
          : ExamQuestionStatus({
              instance_question: instance_question_row,
              assessment_question: instance_question_row, // Required fields are in instance_question
              realTimeGradingPartiallyDisabled:
                someQuestionsAllowRealTimeGrading && someQuestionsForbidRealTimeGrading,
              allowGradeLeftMs: instance_question_row.allowGradeLeftMs,
            })
      }
    </td>
    ${hasAutoGradingQuestion && someQuestionsAllowRealTimeGrading
      ? html`
          <td class="text-center">
            ${instance_question_row.max_auto_points
              ? ExamQuestionAvailablePoints({
                  open: assessmentInstanceOpen && instance_question_row.open,
                  currentWeight:
                    (instance_question_row.points_list_original?.[
                      instance_question_row.number_attempts
                    ] ?? 0) - (instance_question_row.max_manual_points ?? 0),
                  pointsList: instance_question_row.points_list?.map(
                    (p) => p - (instance_question_row.max_manual_points ?? 0),
                  ),
                  highestSubmissionScore: instance_question_row.highest_submission_score,
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
                    instance_question: instance_question_row,
                    assessment_question: instance_question_row, // Required fields are present in instance_question
                    component: 'auto',
                  })}
                </td>
                <td class="text-center">
                  ${InstanceQuestionPoints({
                    instance_question: instance_question_row,
                    assessment_question: instance_question_row, // Required fields are present in instance_question
                    component: 'manual',
                  })}
                </td>
              `
            : ''}
          <td class="text-center">
            ${InstanceQuestionPoints({
              instance_question: instance_question_row,
              assessment_question: instance_question_row, // Required fields are present in instance_question
              component: 'total',
            })}
          </td>
        `
      : html`
          ${hasAutoGradingQuestion && hasManualGradingQuestion
            ? html`
                <td class="text-center">${formatPoints(instance_question_row.max_auto_points)}</td>
                <td class="text-center">
                  ${formatPoints(instance_question_row.max_manual_points)}
                </td>
              `
            : ''}
          <td class="text-center">${formatPoints(instance_question_row.max_points)}</td>
        `}
  `;
}

function HomeworkQuestionCells({
  instance_question_row,
  courseInstanceId,
  hasAutoGradingQuestion,
  hasManualGradingQuestion,
}: {
  instance_question_row: InstanceQuestionRow;
  courseInstanceId: string;
  hasAutoGradingQuestion: boolean;
  hasManualGradingQuestion: boolean;
}) {
  return html`
    ${hasAutoGradingQuestion
      ? html`
          <td class="text-center">
            ${run(() => {
              if (!instance_question_row.max_auto_points) {
                return html`&mdash;`;
              }

              // Compute the current "auto" value by subtracting the manual points.
              // We use this because `current_value` doesn't account for manual points.
              // We don't want to mislead the student into thinking that they can earn
              // more points than they actually can.
              const currentAutoValue =
                (instance_question_row.current_value ?? 0) -
                (instance_question_row.max_manual_points ?? 0);

              return formatPoints(currentAutoValue);
            })}
          </td>
          <td class="text-center">
            ${QuestionVariantHistory({
              instanceQuestionId: instance_question_row.id,
              courseInstanceId,
              previousVariants: instance_question_row.previous_variants,
            })}
          </td>
        `
      : ''}
    ${hasAutoGradingQuestion && hasManualGradingQuestion
      ? html`
          <td class="text-center">
            ${InstanceQuestionPoints({
              instance_question: instance_question_row,
              assessment_question: instance_question_row, // Required fields are present in instance_question
              component: 'auto',
            })}
          </td>
          <td class="text-center">
            ${InstanceQuestionPoints({
              instance_question: instance_question_row,
              assessment_question: instance_question_row, // Required fields are present in instance_question
              component: 'manual',
            })}
          </td>
        `
      : ''}
    <td class="text-center">
      ${InstanceQuestionPoints({
        instance_question: instance_question_row,
        assessment_question: instance_question_row, // Required fields are present in instance_question
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
