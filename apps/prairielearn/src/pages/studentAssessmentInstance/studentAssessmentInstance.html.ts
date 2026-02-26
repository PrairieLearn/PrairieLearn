import { z } from 'zod';

import { EncodedData } from '@prairielearn/browser-utils';
import { formatDate } from '@prairielearn/formatter';
import { html, unsafeHtml } from '@prairielearn/html';
import { run } from '@prairielearn/run';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import {
  RegenerateInstanceAlert,
  RegenerateInstanceModal,
} from '../../components/AssessmentRegenerate.js';
import { GroupWorkInfoContainer } from '../../components/GroupWorkInfoContainer.js';
import { InstructorInfoPanel } from '../../components/InstructorInfoPanel.js';
import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { PersonalNotesPanel } from '../../components/PersonalNotesPanel.js';
import {
  ExamQuestionAvailablePoints,
  ExamQuestionStatus,
  InstanceQuestionPoints,
  QuestionVariantHistory,
} from '../../components/QuestionScore.js';
import { ScorebarHtml } from '../../components/Scorebar.js';
import { StudentAccessRulesPopover } from '../../components/StudentAccessRulesPopover.js';
import { TimeLimitExpiredModal } from '../../components/TimeLimitExpiredModal.js';
import { compiledScriptTag } from '../../lib/assets.js';
import {
  type AssessmentInstance,
  AssessmentQuestionSchema,
  EnumQuestionAccessModeSchema,
  type GroupConfig,
  InstanceQuestionSchema,
} from '../../lib/db-types.js';
import { formatPoints } from '../../lib/format.js';
import { type GroupInfo, getRoleNamesForUser } from '../../lib/groups.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { SimpleVariantWithScoreSchema } from '../../models/variant.js';

export const InstanceQuestionRowSchema = InstanceQuestionSchema.extend({
  start_new_zone: z.boolean(),
  zone_id: IdSchema,
  zone_number: z.number(),
  zone_title: z.string().nullable(),
  lockpoint: z.boolean(),
  lockpoint_crossed: z.boolean(),
  lockpoint_crossed_at: DateFromISOString.nullable(),
  lockpoint_crossed_authn_user_uid: z.string().nullable(),
  question_title: z.string(),
  max_points: z.number().nullable(),
  max_manual_points: z.number().nullable(),
  max_auto_points: z.number().nullable(),
  init_points: z.number().nullable(),
  grade_rate_minutes: AssessmentQuestionSchema.shape.grade_rate_minutes,
  allow_real_time_grading: AssessmentQuestionSchema.shape.allow_real_time_grading,
  row_order: z.number(),
  question_number: z.string(),
  zone_max_points: z.number().nullable(),
  zone_has_max_points: z.boolean(),
  zone_best_questions: z.number().nullable(),
  zone_has_best_questions: z.boolean(),
  zone_question_count: z.number(),
  file_count: z.number(),
  question_access_mode: EnumQuestionAccessModeSchema,
  prev_advance_score_perc: z.number().nullable(),
  prev_title: z.string().nullable(),
  prev_question_access_mode: EnumQuestionAccessModeSchema.nullable(),
  allowGradeLeftMs: z.number().default(0), // Computed after the query if needed, defaults to zero if grade_rate_minutes is null
  previous_variants: z.array(SimpleVariantWithScoreSchema).optional(),
  group_role_permissions: z
    .object({
      can_view: z.boolean(),
      can_submit: z.boolean(),
    })
    .optional(),
});
type InstanceQuestionRow = z.infer<typeof InstanceQuestionRowSchema>;

export function StudentAssessmentInstance({
  instance_question_rows,
  showTimeLimitExpiredModal,
  groupConfig,
  groupInfo,
  userCanAssignRoles,
  userCanDeleteAssessmentInstance,
  resLocals,
}: {
  instance_question_rows: InstanceQuestionRow[];
  showTimeLimitExpiredModal: boolean;
  userCanDeleteAssessmentInstance: boolean;
  resLocals: ResLocalsForPage<'assessment-instance'> & {
    has_manual_grading_question: boolean;
    has_auto_grading_question: boolean;
    assessment_text_templated: string | null;
  };
} & (
  | {
      groupConfig: GroupConfig;
      groupInfo: GroupInfo;
      userCanAssignRoles: boolean;
    }
  | {
      groupConfig?: undefined;
      groupInfo?: undefined;
      userCanAssignRoles?: undefined;
    }
)) {
  let savedAnswers = 0;
  let suspendedSavedAnswers = 0;

  // Check for mixed real-time grading scenarios
  const someQuestionsAllowRealTimeGrading = instance_question_rows.some(
    (q) => q.allow_real_time_grading,
  );
  const someQuestionsForbidRealTimeGrading = instance_question_rows.some(
    // Note that this currently picks up `null`. In the future,
    // `assessment_questions.allow_real_time_grading` will have a `NOT NULL`
    // constraint. Once that happens, this will be totally safe.
    (q) => !q.allow_real_time_grading,
  );

  instance_question_rows.forEach((question) => {
    if (question.status === 'saved') {
      if (question.allowGradeLeftMs > 0) {
        suspendedSavedAnswers++;
      } else if (
        (question.max_auto_points || !question.max_manual_points) &&
        question.allow_real_time_grading
      ) {
        // Note that we exclude questions that are not auto-graded from the count.
        // This count is used to determine whether the "Grade N saved answers"
        // button should be enabled, and clicking that button won't do any good for
        // manually-graded questions. We also exclude questions that don't allow
        // real-time grading.
        savedAnswers++;
      }
    }
  });

  // Keep this in sync with the `InstanceQuestionTableHeader` function below.
  const zoneTitleColspan = run(() => {
    const trailingColumnsCount =
      resLocals.assessment.type === 'Exam'
        ? resLocals.has_auto_grading_question && someQuestionsAllowRealTimeGrading
          ? 2
          : resLocals.has_auto_grading_question && resLocals.has_manual_grading_question
            ? 3
            : 1
        : (resLocals.has_auto_grading_question ? 2 : 0) + 1;

    return resLocals.assessment.type === 'Exam'
      ? resLocals.has_auto_grading_question &&
        resLocals.has_manual_grading_question &&
        someQuestionsAllowRealTimeGrading
        ? 6
        : 2 + trailingColumnsCount
      : resLocals.has_auto_grading_question && resLocals.has_manual_grading_question
        ? 6
        : 1 + trailingColumnsCount;
  });

  const userGroupRoles = groupInfo
    ? getRoleNamesForUser(groupInfo, resLocals.authz_data.user).join(', ')
    : null;
  const showExamFooterContent =
    resLocals.assessment.type === 'Exam' &&
    resLocals.assessment_instance.open &&
    resLocals.authz_result.active;
  const showUnauthorizedEditWarning = !resLocals.authz_result.authorized_edit;
  const showCardFooter = showExamFooterContent || showUnauthorizedEditWarning;

  const firstUncrossedLockpointZoneNumber = instance_question_rows
    .filter((row) => row.start_new_zone && row.lockpoint && !row.lockpoint_crossed)
    .map((row) => row.zone_number)
    .sort((a, b) => a - b)[0];

  // Check whether an unmet advanceScorePerc in a prior zone should block
  // crossing this lockpoint. We check for blocked_sequence in prior zones,
  // but also the first question of the lockpoint zone itself: when
  // advanceScorePerc is on the last question of the preceding zone, the
  // blocked_sequence state propagates into the lockpoint zone's first
  // question via the question_order window function.
  const hasUnmetAdvanceScorePercBeforeLockpoint = (zoneNumber: number) =>
    instance_question_rows.some(
      (row) =>
        row.question_access_mode === 'blocked_sequence' &&
        (row.zone_number < zoneNumber || (row.zone_number === zoneNumber && row.start_new_zone)),
    );

  function isLockpointCrossable(row: InstanceQuestionRow) {
    return (
      resLocals.assessment_instance.open &&
      resLocals.authz_result.active &&
      resLocals.authz_result.authorized_edit &&
      row.lockpoint &&
      !row.lockpoint_crossed &&
      row.zone_number === firstUncrossedLockpointZoneNumber &&
      !hasUnmetAdvanceScorePercBeforeLockpoint(row.zone_number)
    );
  }

  const crossableLockpointRows = instance_question_rows.filter(
    (row) =>
      row.start_new_zone && row.lockpoint && !row.lockpoint_crossed && isLockpointCrossable(row),
  );

  return PageLayout({
    resLocals,
    pageTitle: '', // Calculated automatically
    navContext: {
      type: 'student',
      page: 'assessment_instance',
    },
    headContent: html`
      ${resLocals.assessment.type === 'Exam'
        ? html`${compiledScriptTag('examTimeLimitCountdown.ts')}
          ${EncodedData(
            {
              serverRemainingMS: resLocals.assessment_instance_remaining_ms,
              serverTimeLimitMS: resLocals.assessment_instance_time_limit_ms,
              serverUpdateURL: `${resLocals.urlPrefix}/assessment_instance/${resLocals.assessment_instance.id}/time_remaining`,
              canTriggerFinish: resLocals.authz_result.authorized_edit,
              showsTimeoutWarning: true,
              reloadOnFail: true,
              csrfToken: resLocals.__csrf_token,
            },
            'time-limit-data',
          )}`
        : ''}
    `,
    preContent: html`
      ${resLocals.assessment.type === 'Exam' && resLocals.authz_result.authorized_edit
        ? ConfirmFinishModal({
            instance_question_rows,
            csrfToken: resLocals.__csrf_token,
          })
        : ''}
      ${crossableLockpointRows.map((row) =>
        Modal({
          id: `crossLockpointModal-${row.zone_id}`,
          title: 'Proceed to next questions?',
          body: html`
            <p>
              After proceeding, you will not be able to submit answers to previous questions. You
              can still review your previous submissions.
            </p>
            ${groupConfig != null
              ? html`
                  <p class="fw-bold">
                    This will affect all group members. No one in your group will be able to submit
                    answers to previous questions.
                  </p>
                `
              : ''}
            <div class="form-check">
              <input
                class="form-check-input"
                type="checkbox"
                id="lockpoint-confirm-${row.zone_id}"
                onchange="document.getElementById('lockpoint-submit-${row.zone_id}').disabled = !this.checked"
              />
              <label class="form-check-label" for="lockpoint-confirm-${row.zone_id}">
                I understand that I will not be able to submit answers to previous questions
              </label>
            </div>
          `,
          footer: html`
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="zone_id" value="${row.zone_id}" />
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button
              id="lockpoint-submit-${row.zone_id}"
              type="submit"
              name="__action"
              value="cross_lockpoint"
              class="btn btn-warning"
              disabled
            >
              Confirm
            </button>
          `,
        }),
      )}
      ${showTimeLimitExpiredModal ? TimeLimitExpiredModal({ showAutomatically: true }) : ''}
      ${userCanDeleteAssessmentInstance
        ? RegenerateInstanceModal({ csrfToken: resLocals.__csrf_token })
        : ''}
    `,
    content: html`
      ${userCanDeleteAssessmentInstance ? RegenerateInstanceAlert() : ''}
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>
            ${resLocals.assessment_set.abbreviation}${resLocals.assessment.number}:
            ${resLocals.assessment.title}
          </h1>
          ${resLocals.assessment.team_work ? html`&nbsp;<i class="fas fa-users"></i>` : ''}
        </div>

        <div class="card-body">
          ${RealTimeGradingInformationAlert({
            instance_question_rows,
            assessment_instance: resLocals.assessment_instance,
          })}
          <div class="row align-items-center">
            ${run(() => {
              const allQuestionsDisabled = instance_question_rows.every(
                (q) => !q.allow_real_time_grading,
              );
              return allQuestionsDisabled && resLocals.assessment_instance.open;
            })
              ? html`
                  <div class="col-md-3 col-sm-12">
                    Total points: ${formatPoints(resLocals.assessment_instance.max_points)}
                    ${resLocals.assessment_instance.max_bonus_points
                      ? html`
                          <br />
                          (${resLocals.assessment_instance.max_bonus_points} bonus
                          ${resLocals.assessment_instance.max_bonus_points > 1 ? 'points' : 'point'}
                          possible)
                        `
                      : ''}
                  </div>
                  <div class="col-md-9 col-sm-12">
                    ${AssessmentStatus({
                      assessment_instance: resLocals.assessment_instance,
                      authz_result: resLocals.authz_result,
                    })}
                  </div>
                `
              : html`
                  <div class="col-md-3 col-sm-6">
                    Total points:
                    ${formatPoints(resLocals.assessment_instance.points)}/${formatPoints(
                      resLocals.assessment_instance.max_points,
                    )}
                    ${resLocals.assessment_instance.max_bonus_points
                      ? html`
                          <br />
                          (${resLocals.assessment_instance.max_bonus_points} bonus
                          ${resLocals.assessment_instance.max_bonus_points > 1 ? 'points' : 'point'}
                          possible)
                        `
                      : ''}
                  </div>
                  <div class="col-md-3 col-sm-6">
                    ${ScorebarHtml(resLocals.assessment_instance.score_perc)}
                  </div>
                  <div class="col-md-6 col-sm-12">
                    ${AssessmentStatus({
                      assessment_instance: resLocals.assessment_instance,
                      authz_result: resLocals.authz_result,
                    })}
                  </div>
                `}
            ${groupConfig != null
              ? html`
                  <div class="col-lg-12">
                    ${GroupWorkInfoContainer({
                      groupConfig,
                      groupInfo,
                      userCanAssignRoles,
                      csrfToken: resLocals.__csrf_token,
                    })}
                  </div>
                `
              : ''}
          </div>

          ${resLocals.assessment_instance.open && resLocals.assessment_instance_remaining_ms
            ? html`
                <div class="alert alert-secondary mt-4" role="alert">
                  <div class="row">
                    <div class="col-md-2 col-sm-12 col-xs-12">
                      <div id="countdownProgress"></div>
                    </div>
                    <div class="col-md-10 col-sm-12 col-xs-12">
                      Time remaining: <span id="countdownDisplay"></span>
                    </div>
                  </div>
                </div>
              `
            : ''}
          ${resLocals.assessment_text_templated
            ? html`
                <div class="card bg-light mb-0 mt-4">
                  <div class="card-body">${unsafeHtml(resLocals.assessment_text_templated)}</div>
                </div>
              `
            : ''}
        </div>

        <div class="table-responsive">
          <table
            class="table table-sm table-hover"
            aria-label="Questions"
            data-testid="assessment-questions"
          >
            <thead>
              ${InstanceQuestionTableHeader({
                resLocals,
                someQuestionsAllowRealTimeGrading,
              })}
            </thead>
            <tbody>
              ${run(() => {
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
                          isGroupAssessment: groupConfig != null,
                          displayTimezone: resLocals.course_instance.display_timezone,
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
                            instance_question_row,
                            userGroupRoles,
                            urlPrefix: resLocals.urlPrefix,
                            hasStatusColumn: resLocals.assessment.type === 'Exam',
                            rowLabelText:
                              resLocals.assessment.type === 'Exam'
                                ? `Question ${instance_question_row.question_number}`
                                : `${instance_question_row.question_number}. ${instance_question_row.question_title}`,
                          })}
                        </div>
                      </td>
                      ${resLocals.assessment.type === 'Exam'
                        ? html`
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
                                        someQuestionsAllowRealTimeGrading &&
                                        someQuestionsForbidRealTimeGrading,
                                      allowGradeLeftMs: instance_question_row.allowGradeLeftMs,
                                    })
                              }
                            </td>
                            ${resLocals.has_auto_grading_question &&
                            someQuestionsAllowRealTimeGrading
                              ? html`
                                  <td class="text-center">
                                    ${instance_question_row.max_auto_points
                                      ? ExamQuestionAvailablePoints({
                                          open:
                                            (resLocals.assessment_instance.open &&
                                              instance_question_row.open) ??
                                            false,
                                          currentWeight:
                                            (instance_question_row.points_list_original?.[
                                              instance_question_row.number_attempts
                                            ] ?? 0) -
                                            (instance_question_row.max_manual_points ?? 0),
                                          pointsList: instance_question_row.points_list?.map(
                                            (p) =>
                                              p - (instance_question_row.max_manual_points ?? 0),
                                          ),
                                          highestSubmissionScore:
                                            instance_question_row.highest_submission_score,
                                        })
                                      : html`&mdash;`}
                                  </td>
                                `
                              : ''}
                            ${someQuestionsAllowRealTimeGrading ||
                            !resLocals.assessment_instance.open
                              ? html`
                                  ${resLocals.has_auto_grading_question &&
                                  resLocals.has_manual_grading_question
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
                                  ${resLocals.has_auto_grading_question &&
                                  resLocals.has_manual_grading_question
                                    ? html`
                                        <td class="text-center">
                                          ${formatPoints(instance_question_row.max_auto_points)}
                                        </td>
                                        <td class="text-center">
                                          ${formatPoints(instance_question_row.max_manual_points)}
                                        </td>
                                      `
                                    : ''}
                                  <td class="text-center">
                                    ${formatPoints(instance_question_row.max_points)}
                                  </td>
                                `}
                          `
                        : html`
                            ${resLocals.has_auto_grading_question
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
                                      urlPrefix: resLocals.urlPrefix,
                                      instanceQuestionId: instance_question_row.id,
                                      previousVariants: instance_question_row.previous_variants,
                                    })}
                                  </td>
                                `
                              : ''}
                            ${resLocals.has_auto_grading_question &&
                            resLocals.has_manual_grading_question
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
                          `}
                    </tr>
                  `;
                });
              })}
            </tbody>
          </table>
        </div>

        ${showCardFooter
          ? html`
              <div class="card-footer d-flex flex-column gap-3">
                ${showExamFooterContent
                  ? html`
                      ${someQuestionsAllowRealTimeGrading
                        ? html`
                            <form name="grade-form" method="POST">
                              <input type="hidden" name="__action" value="grade" />
                              <input
                                type="hidden"
                                name="__csrf_token"
                                value="${resLocals.__csrf_token}"
                              />
                              ${savedAnswers > 0
                                ? html`
                                    <button
                                      type="submit"
                                      class="btn btn-info"
                                      ${!resLocals.authz_result.authorized_edit ? 'disabled' : ''}
                                    >
                                      Grade ${savedAnswers} saved
                                      ${savedAnswers !== 1 ? 'answers' : 'answer'}
                                    </button>
                                  `
                                : html`
                                    <button type="submit" class="btn btn-info" disabled>
                                      No saved answers to grade
                                    </button>
                                  `}
                            </form>
                            <ul class="mb-0">
                              ${suspendedSavedAnswers > 1
                                ? html`
                                    <li>
                                      There are ${suspendedSavedAnswers} saved answers that cannot
                                      be graded yet because their grade rate has not been reached.
                                      They are marked with the
                                      <i class="fa fa-hourglass-half"></i> icon above. Reload this
                                      page to update this information.
                                    </li>
                                  `
                                : suspendedSavedAnswers === 1
                                  ? html`
                                      <li>
                                        There is one saved answer that cannot be graded yet because
                                        its grade rate has not been reached. It is marked with the
                                        <i class="fa fa-hourglass-half"></i> icon above. Reload this
                                        page to update this information.
                                      </li>
                                    `
                                  : ''}
                              <li>
                                Submit your answer to each question with the
                                <strong>Save & Grade</strong> or <strong>Save only</strong> buttons
                                on the question page.
                              </li>
                              <li>
                                Look at <strong>Status</strong> to confirm that each question has
                                been
                                ${someQuestionsForbidRealTimeGrading
                                  ? 'either saved or graded'
                                  : 'graded'}.
                                Questions with <strong>Available points</strong> can be attempted
                                again for more points. Attempting questions again will never reduce
                                the points you already have.
                              </li>
                              ${resLocals.authz_result.password != null ||
                              !resLocals.authz_result.show_closed_assessment ||
                              // If this is true, this assessment has a mix of real-time-graded and
                              // non-real-time-graded questions. We need to show the "Finish assessment"
                              // button.
                              someQuestionsForbidRealTimeGrading
                                ? html`
                                    <li>
                                      After you have answered all the questions completely, click
                                      here:
                                      <button
                                        class="btn btn-danger"
                                        data-bs-toggle="modal"
                                        data-bs-target="#confirmFinishModal"
                                        ${!resLocals.authz_result.authorized_edit ? 'disabled' : ''}
                                      >
                                        Finish assessment
                                      </button>
                                    </li>
                                  `
                                : html`
                                    <li>
                                      When you are done, please logout and close your browser; there
                                      is no need to do anything else. If you have any saved answers
                                      when you leave, they will be automatically graded before your
                                      final score is computed.
                                    </li>
                                  `}
                            </ul>
                          `
                        : html`
                            <ul class="mb-0">
                              <li>
                                Submit your answer to each question with the
                                <strong>Save</strong> button on the question page.
                              </li>
                              <li>
                                After you have answered all the questions completely, click here:
                                <button
                                  class="btn btn-danger"
                                  data-bs-toggle="modal"
                                  data-bs-target="#confirmFinishModal"
                                  ${!resLocals.authz_result.authorized_edit ? 'disabled' : ''}
                                >
                                  Finish assessment
                                </button>
                              </li>
                            </ul>
                          `}
                    `
                  : ''}
                ${showUnauthorizedEditWarning
                  ? html`
                      <div class="alert alert-warning mb-0" role="alert">
                        You are viewing the assessment of a different user and so are not authorized
                        to submit questions for grading or to mark the assessment as complete.
                      </div>
                    `
                  : ''}
              </div>
            `
          : ''}
      </div>

      ${resLocals.assessment.allow_personal_notes
        ? PersonalNotesPanel({
            fileList: resLocals.file_list,
            context: 'assessment',
            courseInstanceId: resLocals.course_instance.id,
            assessment_instance: resLocals.assessment_instance,
            csrfToken: resLocals.__csrf_token,
            authz_result: resLocals.authz_result,
          })
        : ''}
      ${InstructorInfoPanel({
        course: resLocals.course,
        course_instance: resLocals.course_instance,
        assessment: resLocals.assessment,
        assessment_instance: resLocals.assessment_instance,
        instance_group: resLocals.instance_group,
        instance_group_uid_list: resLocals.instance_group_uid_list,
        instance_user: resLocals.instance_user,
        authz_data: resLocals.authz_data,
        questionContext: resLocals.assessment.type === 'Exam' ? 'student_exam' : 'student_homework',
        csrfToken: resLocals.__csrf_token,
      })}
    `,
  });
}

function AssessmentStatus({
  assessment_instance,
  authz_result,
}: {
  assessment_instance: AssessmentInstance;
  authz_result: any;
}) {
  if (assessment_instance.open && authz_result.active) {
    return html`
      Assessment is <strong>open</strong> and you can answer questions.
      <br />
      Available credit: ${authz_result.credit_date_string}
      ${StudentAccessRulesPopover({
        accessRules: authz_result.access_rules,
      })}
    `;
  }

  return html`Assessment is <strong>closed</strong> and you cannot answer questions.`;
}

function RealTimeGradingInformationAlert({
  instance_question_rows,
  assessment_instance,
}: {
  instance_question_rows: InstanceQuestionRow[];
  assessment_instance: AssessmentInstance;
}) {
  const allQuestionsDisabled = instance_question_rows.every((q) => !q.allow_real_time_grading);
  const someQuestionsDisabled = instance_question_rows.some((q) => !q.allow_real_time_grading);

  if (allQuestionsDisabled && assessment_instance.open) {
    return html`
      <div class="alert alert-warning">
        This assessment will only be graded after it is finished. You should save answers for all
        questions and your exam will be graded later. You can use the
        <span class="badge badge-outline text-bg-light">Finish assessment</span>
        button below to finish and calculate your final grade.
      </div>
    `;
  } else if (someQuestionsDisabled && assessment_instance.open) {
    return html`
      <div class="alert alert-info">
        Some questions in this assessment allow real-time grading while others will only be graded
        after the assessment is finished. Check the individual question pages to see which grading
        mode applies to each question. You can use the
        <span class="badge badge-outline text-bg-light">Finish assessment</span>
        button below to finish and calculate your final grade.
      </div>
    `;
  }
}

function InstanceQuestionTableHeader({
  resLocals,
  someQuestionsAllowRealTimeGrading,
}: {
  resLocals: ResLocalsForPage<'assessment-instance'> & {
    has_manual_grading_question: boolean;
    has_auto_grading_question: boolean;
    assessment_text_templated: string | null;
  };
  someQuestionsAllowRealTimeGrading: boolean;
}) {
  const trailingColumns =
    resLocals.assessment.type === 'Exam'
      ? html`
          ${resLocals.has_auto_grading_question && someQuestionsAllowRealTimeGrading
            ? html`
                <th class="text-center">Available points ${ExamQuestionHelpAvailablePoints()}</th>
                <th class="text-center">Awarded points ${ExamQuestionHelpAwardedPoints()}</th>
              `
            : resLocals.has_auto_grading_question && resLocals.has_manual_grading_question
              ? html`
                  <th class="text-center">Auto-grading points</th>
                  <th class="text-center">Manual grading points</th>
                  <th class="text-center">Total points</th>
                `
              : html`<th class="text-center">Points</th>`}
        `
      : html`
          ${resLocals.has_auto_grading_question
            ? html`
                <th class="text-center">Value</th>
                <th class="text-center">Variant history</th>
              `
            : ''}
          <th class="text-center">Awarded points</th>
        `;

  return html`
    ${resLocals.assessment.type === 'Exam'
      ? html`
          ${resLocals.has_auto_grading_question &&
          resLocals.has_manual_grading_question &&
          someQuestionsAllowRealTimeGrading
            ? html`
                <tr>
                  <th rowspan="2">Question</th>
                  <th rowspan="2">Status</th>
                  <th class="text-center" colspan="2">Auto-grading</th>
                  <th class="text-center" rowspan="2">Manual grading points</th>
                  <th class="text-center" rowspan="2">Total points</th>
                </tr>
                <tr>
                  ${trailingColumns}
                </tr>
              `
            : html`
                <tr>
                  <th>Question</th>
                  <th>Status</th>
                  ${trailingColumns}
                </tr>
              `}
        `
      : html`
          ${resLocals.has_auto_grading_question && resLocals.has_manual_grading_question
            ? html`
                <tr>
                  <th rowspan="2">Question</th>
                  <th class="text-center" colspan="3">Auto-grading</th>
                  <th class="text-center" rowspan="2">Manual grading points</th>
                  <th class="text-center" rowspan="2">Total points</th>
                </tr>
                <tr>
                  ${trailingColumns}
                </tr>
              `
            : html`
                <tr>
                  <th>Question</th>
                  ${trailingColumns}
                </tr>
              `}
        `}
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

function LockpointRow({
  row,
  colspan,
  crossable,
  blockedByAdvanceScorePerc,
  isGroupAssessment,
  displayTimezone,
}: {
  row: InstanceQuestionRow;
  colspan: number;
  crossable: boolean;
  blockedByAdvanceScorePerc: boolean;
  isGroupAssessment: boolean;
  displayTimezone: string;
}) {
  if (row.lockpoint_crossed) {
    return html`
      <tr class="table-light">
        <td colspan="${colspan}" class="py-2">
          <div class="d-flex">
            <i class="fas fa-check-circle text-success me-2 mt-1" aria-hidden="true"></i>
            <div>
              <span class="fw-bold">Lockpoint</span>
              <small class="text-muted d-block">
                Previous questions
                locked${isGroupAssessment && row.lockpoint_crossed_authn_user_uid
                  ? html` by ${row.lockpoint_crossed_authn_user_uid}`
                  : ''}${row.lockpoint_crossed_at
                  ? html` at ${formatDate(row.lockpoint_crossed_at, displayTimezone)}`
                  : ''}
              </small>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  if (crossable) {
    return html`
      <tr class="table-warning">
        <td colspan="${colspan}" class="py-2">
          <div
            class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2"
          >
            <div class="d-flex">
              <i class="fas fa-lock text-warning me-2 mt-1" aria-hidden="true"></i>
              <div>
                <span class="fw-bold">Lockpoint</span>
                <small class="text-muted d-block">
                  After proceeding, you will not be able to submit answers to previous questions.
                </small>
              </div>
            </div>
            <button
              type="button"
              class="btn btn-warning btn-sm text-nowrap"
              data-bs-toggle="modal"
              data-bs-target="#crossLockpointModal-${row.zone_id}"
            >
              Proceed to next questions
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  return html`
    <tr class="table-light">
      <td colspan="${colspan}" class="py-2">
        <div class="d-flex">
          <i class="fas fa-lock text-secondary me-2 mt-1" aria-hidden="true"></i>
          <div>
            <span class="fw-bold text-muted">Lockpoint</span>
            <small class="text-muted d-block">
              ${blockedByAdvanceScorePerc
                ? 'A previous question requires a higher score before you can proceed past this lockpoint.'
                : 'Complete previous questions to unlock.'}
            </small>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function RowLabel({
  instance_question_row,
  userGroupRoles,
  rowLabelText,
  urlPrefix,
  hasStatusColumn,
}: {
  instance_question_row: InstanceQuestionRow;
  userGroupRoles: string | null;
  rowLabelText: string;
  urlPrefix: string;
  hasStatusColumn: boolean;
}) {
  let lockMessage: string | null = null;
  let showLink = true;

  if (instance_question_row.question_access_mode === 'blocked_sequence') {
    showLink = false;
    lockMessage =
      instance_question_row.prev_question_access_mode === 'blocked_sequence'
        ? 'A previous question must be completed before you can access this one.'
        : `You must score at least ${instance_question_row.prev_advance_score_perc}% on ${instance_question_row.prev_title} to unlock this question.`;
  } else if (instance_question_row.question_access_mode === 'blocked_lockpoint') {
    showLink = false;
  } else if (!(instance_question_row.group_role_permissions?.can_view ?? true)) {
    showLink = false;
    lockMessage = `Your current group role (${userGroupRoles}) restricts access to this question.`;
  } else if (instance_question_row.question_access_mode === 'read_only_lockpoint') {
    lockMessage =
      'You can no longer submit answers to this question because you have advanced past a lockpoint.';
  }

  return html`
    ${showLink
      ? html`
          <a href="${urlPrefix}/instance_question/${instance_question_row.id}/">${rowLabelText}</a>
        `
      : html`<span class="text-muted">${rowLabelText}</span>`}
    ${
      // On exams, blocked_lockpoint questions show "Locked" in the Status column,
      // so we skip the inline badge to avoid duplication. On homeworks (no Status
      // column), we render the badge here instead.
      instance_question_row.question_access_mode === 'blocked_lockpoint' && !hasStatusColumn
        ? html`
            <span class="badge bg-secondary ms-1" data-test-id="locked-instance-question-row">
              Locked
            </span>
          `
        : lockMessage != null
          ? html`
              <button
                type="button"
                class="btn btn-xs border text-secondary ms-1"
                data-bs-toggle="popover"
                data-bs-container="body"
                data-bs-html="true"
                data-bs-content="${lockMessage}"
                data-test-id="locked-instance-question-row"
                aria-label="Locked"
              >
                <i class="fas fa-lock" aria-hidden="true"></i>
              </button>
            `
          : ''
    }
    ${instance_question_row.file_count > 0
      ? html`
          <button
            type="button"
            class="btn btn-xs border text-secondary ms-1"
            data-bs-toggle="popover"
            data-bs-container="body"
            data-bs-html="true"
            data-bs-content="Personal notes: ${instance_question_row.file_count}"
            aria-label="Has personal note attachments"
          >
            <i class="fas fa-paperclip"></i>
          </button>
        `
      : ''}
  `;
}

function ExamQuestionHelpAvailablePoints() {
  return html`
    <button
      type="button"
      class="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-placement="auto"
      data-bs-title="Available points"
      data-bs-content="The number of points that would be earned for a 100% correct answer on the next attempt. If retries are available for the question then a list of further points is shown, where the <i>n</i>-th value is the number of points that would be earned for a 100% correct answer on the <i>n</i>-th attempt."
    >
      <i class="fa fa-question-circle" aria-hidden="true"></i>
    </button>
  `;
}

function ExamQuestionHelpAwardedPoints() {
  return html`
    <button
      type="button"
      class="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-placement="auto"
      data-bs-title="Awarded points"
      data-bs-content="The number of points already earned, as a fraction of the maximum possible points for the question."
    >
      <i class="fa fa-question-circle" aria-hidden="true"></i>
    </button>
  `;
}

function ConfirmFinishModal({
  instance_question_rows,
  csrfToken,
}: {
  instance_question_rows: InstanceQuestionRow[];
  csrfToken: string;
}) {
  const all_questions_answered = instance_question_rows.every((iq) => iq.status !== 'unanswered');

  return Modal({
    id: 'confirmFinishModal',
    title: 'All done?',
    body: html`
      ${!all_questions_answered
        ? html`<div class="alert alert-warning">There are still unanswered questions.</div>`
        : ''}
      <p class="text-danger">
        <strong>Warning</strong>: You will not be able to answer any more questions after finishing
        the assessment.
      </p>
      <p>Are you sure you want to finish, complete, and close out the assessment?</p>
    `,
    footer: html`
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" data-bs-dismiss="modal" class="btn btn-secondary">Cancel</button>
      <button type="submit" class="btn btn-danger" name="__action" value="finish">
        Finish assessment
      </button>
    `,
  });
}
