import { EncodedData } from '@prairielearn/browser-utils';
import { html, unsafeHtml } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import {
  RegenerateInstanceAlert,
  RegenerateInstanceModal,
} from '../../components/AssessmentRegenerate.js';
import { GroupWorkInfoContainer } from '../../components/GroupWorkInfoContainer.js';
import { InstructorInfoPanel } from '../../components/InstructorInfoPanel.js';
import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { PersonalNotesPanel } from '../../components/PersonalNotesPanel.js';
import { ScorebarHtml } from '../../components/Scorebar.js';
import { StudentAccessRulesPopover } from '../../components/StudentAccessRulesPopover.js';
import { TimeLimitExpiredModal } from '../../components/TimeLimitExpiredModal.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { type AssessmentInstance, type GroupConfig } from '../../lib/db-types.js';
import { formatPoints } from '../../lib/format.js';
import { type GroupInfo, getRoleNamesForUser } from '../../lib/groups.shared.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

import { ExamFooterContent } from './components/ExamFooterContent.js';
import { QuestionTableBody } from './components/QuestionTableBody.js';
import type { InstanceQuestionRow } from './studentAssessmentInstance.types.js';

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
    (row) => row.assessment_question.allow_real_time_grading,
  );
  const someQuestionsForbidRealTimeGrading = instance_question_rows.some(
    // Note that this currently picks up `null`. In the future,
    // `assessment_questions.allow_real_time_grading` will have a `NOT NULL`
    // constraint. Once that happens, this will be totally safe.
    (row) => !row.assessment_question.allow_real_time_grading,
  );

  instance_question_rows.forEach((row) => {
    if (row.instance_question.status === 'saved') {
      if (row.allowGradeLeftMs > 0) {
        suspendedSavedAnswers++;
      } else if (
        (row.assessment_question.max_auto_points || !row.assessment_question.max_manual_points) &&
        row.assessment_question.allow_real_time_grading
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
    .filter((row) => row.start_new_zone && row.zone.lockpoint && !row.lockpoint_crossed)
    .map((row) => row.zone.number)
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
        (row.zone.number < zoneNumber || (row.zone.number === zoneNumber && row.start_new_zone)),
    );

  function isLockpointCrossable(row: InstanceQuestionRow): boolean {
    return (
      !!resLocals.assessment_instance.open &&
      resLocals.authz_result.active &&
      resLocals.authz_result.authorized_edit &&
      row.zone.lockpoint &&
      !row.lockpoint_crossed &&
      row.zone.number === firstUncrossedLockpointZoneNumber &&
      !hasUnmetAdvanceScorePercBeforeLockpoint(row.zone.number)
    );
  }

  const crossableLockpointRows = instance_question_rows.filter(
    (row) =>
      row.start_new_zone &&
      row.zone.lockpoint &&
      !row.lockpoint_crossed &&
      isLockpointCrossable(row),
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
          id: `crossLockpointModal-${row.zone.id}`,
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
                id="lockpoint-confirm-${row.zone.id}"
                onchange="document.getElementById('lockpoint-submit-${row.zone
                  .id}').disabled = !this.checked"
              />
              <label class="form-check-label" for="lockpoint-confirm-${row.zone.id}">
                I understand that I will not be able to submit answers to previous questions
              </label>
            </div>
          `,
          footer: html`
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="zone_id" value="${row.zone.id}" />
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button
              id="lockpoint-submit-${row.zone.id}"
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
                (row) => !row.assessment_question.allow_real_time_grading,
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
              ${QuestionTableBody({
                rows: instance_question_rows,
                courseInstanceId: resLocals.course_instance.id,
                displayTimezone: resLocals.course_instance.display_timezone,
                assessmentType: resLocals.assessment.type,
                someQuestionsAllowRealTimeGrading,
                someQuestionsForbidRealTimeGrading,
                hasAutoGradingQuestion: resLocals.has_auto_grading_question,
                hasManualGradingQuestion: resLocals.has_manual_grading_question,
                assessmentInstanceOpen: !!resLocals.assessment_instance.open,
                isGroupAssessment: !!groupConfig,
                zoneTitleColspan,
                userGroupRoles,
                isLockpointCrossable,
                hasUnmetAdvanceScorePercBeforeLockpoint,
              })}
            </tbody>
          </table>
        </div>

        ${showCardFooter
          ? html`
              <div class="card-footer d-flex flex-column gap-3">
                ${showExamFooterContent
                  ? ExamFooterContent({
                      someQuestionsAllowRealTimeGrading,
                      someQuestionsForbidRealTimeGrading,
                      savedAnswers,
                      suspendedSavedAnswers,
                      authorizedEdit: resLocals.authz_result.authorized_edit,
                      hasPassword: resLocals.authz_result.password != null,
                      showClosedAssessment: resLocals.authz_result.show_closed_assessment,
                      csrfToken: resLocals.__csrf_token,
                    })
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
  const allQuestionsDisabled = instance_question_rows.every(
    (row) => !row.assessment_question.allow_real_time_grading,
  );
  const someQuestionsDisabled = instance_question_rows.some(
    (row) => !row.assessment_question.allow_real_time_grading,
  );

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
  const all_questions_answered = instance_question_rows.every(
    (row) => row.instance_question.status !== 'unanswered',
  );

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
