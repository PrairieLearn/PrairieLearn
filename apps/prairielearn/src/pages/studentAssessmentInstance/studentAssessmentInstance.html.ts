import { EncodedData } from '@prairielearn/browser-utils';
import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { GroupWorkInfoContainer } from '../../components/GroupWorkInfoContainer.html.js';
import { Modal } from '../../components/Modal.html.js';
import { StudentAccessRulesPopover } from '../../components/StudentAccessRulesPopover.html.js';
import { TimeLimitExpiredModal } from '../../components/TimeLimitExpiredModal.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import {
  Assessment,
  AssessmentInstance,
  AssessmentSet,
  GroupConfig,
  InstanceQuestion,
} from '../../lib/db-types.js';
import { formatPoints } from '../../lib/format.js';
import { GroupInfo } from '../../lib/groups.js';

export function StudentAssessmentInstance({
  showTimeLimitExpiredModal,
  groupConfig,
  groupInfo,
  userCanAssignRoles,
  resLocals,
}: {
  showTimeLimitExpiredModal: boolean;
  resLocals: Record<string, any>;
} & (
  | {
      groupConfig: GroupConfig;
      groupInfo: GroupInfo;
      userCanAssignRoles: boolean;
    }
  | { groupConfig?: undefined; groupInfo?: undefined; userCanAssignRoles?: undefined }
)) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
        ${resLocals.assessment.type === 'Exam'
          ? html`${compiledScriptTag('examTimeLimitCountdown.ts')}
            ${EncodedData(
              {
                serverRemainingMS: resLocals.assessment_instance_remaining_ms,
                serverTimeLimitMS: resLocals.assessment_instance_time_limit_ms,
                serverUpdateURL: `${resLocals.urlPrefix}/assessment_instance/${resLocals.assessment_instance.id}/time_remaining`,
                canTriggerFinish: resLocals.authz_result.authorized_edit,
                csrfToken: resLocals.__csrf_token,
              },
              'time-limit-data',
            )}`
          : ''}
        ${compiledScriptTag('studentAssessmentInstanceClient.ts')}
      </head>
      <body>
        ${resLocals.assessment.type === 'Exam' && resLocals.authz_result.authorized_edit
          ? ConfirmFinishModal({
              instance_questions: resLocals.instance_questions,
              csrfToken: resLocals.__csrf_token,
            })
          : ''}
        ${showTimeLimitExpiredModal ? TimeLimitExpiredModal({ showAutomatically: true }) : ''}
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'assessment_instance',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${resLocals.assessment_set.abbreviation}${resLocals.assessment.number}:
              ${resLocals.assessment.title}
              ${resLocals.assessment.group_work ? html`<i class="fas fa-users"></i>` : ''}
            </div>

            <div class="card-body">
              ${!resLocals.assessment.allow_real_time_grading && resLocals.assessment_instance.open
                ? html`
                    <div class="alert alert-warning">
                      This assessment will only be graded after it is finished. You should save
                      answers for all questions and your exam will be graded later. You can use the
                      <span class="badge badge-outline badge-light">Finish assessment</span> button
                      below to finish and calculate your final grade.
                    </div>
                  `
                : ''}
              <div class="row align-items-center">
                ${!resLocals.assessment.allow_real_time_grading &&
                resLocals.assessment_instance.open
                  ? html`
                      <div class="col-md-3 col-sm-12">
                        Total points: ${formatPoints(resLocals.assessment_instance.max_points)}
                        ${resLocals.assessment_instance.max_bonus_points
                          ? html`
                              <br />
                              (${resLocals.assessment_instance.max_bonus_points} bonus
                              ${resLocals.assessment_instance.max_bonus_points > 1
                                ? 'points'
                                : 'point'}
                              possible)
                            `
                          : ''}
                      </div>
                      <div class="col-md-9 col-sm-12">
                        ${AssessmentStatus({
                          assessment: resLocals.assessment,
                          assessment_set: resLocals.assessment_set,
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
                              ${resLocals.assessment_instance.max_bonus_points > 1
                                ? 'points'
                                : 'point'}
                              possible)
                            `
                          : ''}
                      </div>
                      <div class="col-md-3 col-sm-6">
                        ${renderEjs(import.meta.url, "<%- include('../partials/scorebar'); %>", {
                          score: resLocals.assessment_instance.score_perc,
                        })}
                      </div>
                      <div class="col-md-6 col-sm-12">
                        ${AssessmentStatus({
                          assessment: resLocals.assessment,
                          assessment_set: resLocals.assessment_set,
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
                      <div class="card-body">
                        ${unsafeHtml(resLocals.assessment_text_templated)}
                      </div>
                    </div>
                  `
                : ''}
            </div>

            <table class="table table-sm table-hover" data-testid="assessment-questions">
              <thead>
                ${InstanceQuestionTableHeader({ resLocals })}
              </thead>
              <tbody>
                ${resLocals.instance_questions.map(
                  (instance_question) => html`
                    ${instance_question.start_new_zone && instance_question.zone_title
                      ? html`
                          <tr>
                            <th
                              colspan="${(resLocals.has_auto_grading_question
                                ? (resLocals.has_manual_grading_question ? 2 : 0) +
                                  (resLocals.assessment.allow_real_time_grading ? 4 : 2)
                                : 2) + (resLocals.assessment.type === 'Exam' ? 1 : 0)}"
                            >
                              <span class="mr-1">${instance_question.zone_title}</span>
                              ${instance_question.zone_has_max_points
                                ? ZoneInfoBadge({
                                    popoverContent: `Of the points that you are awarded for answering these questions, at most ${instance_question.zone_max_points} will count toward your total points.`,
                                    mainContent: `Maximum ${instance_question.zone_max_points} points`,
                                  })
                                : ''}
                              ${instance_question.zone_has_best_questions
                                ? ZoneInfoBadge({
                                    popoverContent: `Of these questions, only the ${instance_question.zone_best_questions} with the highest number of awarded points will count toward your total points.`,
                                    mainContent: `Best ${instance_question.zone_best_questions} questions`,
                                  })
                                : ''}
                            </th>
                          </tr>
                        `
                      : ''}
                    <tr
                      class="${instance_question.sequence_locked
                        ? 'bg-light pl-sequence-locked'
                        : ''}"
                    >
                      <td>
                        ${RowLabel({
                          instance_question,
                          user_group_roles: resLocals.user_group_roles,
                          urlPrefix: resLocals.urlPrefix,
                          rowLabelText:
                            resLocals.assessment.type === 'Exam'
                              ? `Question ${instance_question.question_number}`
                              : `${instance_question.question_number}. ${instance_question.question_title}`,
                        })}
                      </td>
                      ${resLocals.assessment.type === 'Exam'
                        ? html`
                            <td class="text-center">
                              ${renderEjs(
                                import.meta.url,
                                "<%- include('../partials/examQuestionStatus'); %>",
                                { instance_question },
                              )}
                            </td>
                            ${resLocals.has_auto_grading_question &&
                            resLocals.assessment.allow_real_time_grading
                              ? html`
                                  <td class="text-center">
                                    ${renderEjs(
                                      import.meta.url,
                                      "<%- include('../partials/examQuestionScore'); %>",
                                      { instance_question },
                                    )}
                                  </td>
                                  <td class="text-center">
                                    ${renderEjs(
                                      import.meta.url,
                                      "<%- include('../partials/examQuestionAvailablePoints'); %>",
                                      {
                                        open:
                                          resLocals.assessment_instance.open &&
                                          instance_question.open,
                                        currentWeight:
                                          instance_question.points_list_original[
                                            instance_question.number_attempts
                                          ] - instance_question.max_manual_points,
                                        points_list: instance_question.points_list.map(
                                          (p) => p - instance_question.max_manual_points,
                                        ),
                                        highest_submission_score:
                                          instance_question.highest_submission_score,
                                      },
                                    )}
                                  </td>
                                `
                              : ''}
                            ${resLocals.assessment.allow_real_time_grading ||
                            !resLocals.assessment_instance.open
                              ? html`
                                  ${resLocals.has_auto_grading_question &&
                                  resLocals.has_manual_grading_question
                                    ? html`
                                        <td class="text-center">
                                          ${renderEjs(
                                            import.meta.url,
                                            "<%- include('../partials/instanceQuestionPoints'); %>",
                                            { instance_question, component: 'auto' },
                                          )}
                                        </td>
                                        <td class="text-center">
                                          ${renderEjs(
                                            import.meta.url,
                                            "<%- include('../partials/instanceQuestionPoints'); %>",
                                            { instance_question, component: 'manual' },
                                          )}
                                        </td>
                                      `
                                    : ''}
                                  <td class="text-center">
                                    ${renderEjs(
                                      import.meta.url,
                                      "<%- include('../partials/instanceQuestionPoints'); %>",
                                      { instance_question, component: 'total' },
                                    )}
                                  </td>
                                `
                              : html`
                                  ${resLocals.has_auto_grading_question &&
                                  resLocals.has_manual_grading_question
                                    ? html`
                                        <td class="text-center">
                                          ${formatPoints(instance_question.max_auto_points)}
                                        </td>
                                        <td class="text-center">
                                          ${formatPoints(instance_question.max_manual_points)}
                                        </td>
                                      `
                                    : ''}
                                  <td class="text-center">
                                    ${formatPoints(instance_question.max_points)}
                                  </td>
                                `}
                          `
                        : html`
                            ${resLocals.has_auto_grading_question
                              ? html`
                                  <td class="text-center">
                                    <span class="badge badge-primary">
                                      ${formatPoints(instance_question.current_value)}
                                    </span>
                                  </td>
                                  <td class="text-center">
                                    ${renderEjs(
                                      import.meta.url,
                                      "<%- include('../partials/questionAwardedPoints'); %>",
                                      {
                                        urlPrefix: resLocals.urlPrefix,
                                        instance_question_id: instance_question.id,
                                        previous_variants: instance_question.previous_variants,
                                        current_variant_id: null,
                                      },
                                    )}
                                  </td>
                                `
                              : ''}
                            ${resLocals.has_auto_grading_question &&
                            resLocals.has_manual_grading_question
                              ? html`
                                  <td class="text-center">
                                    ${renderEjs(
                                      import.meta.url,
                                      "<%- include('../partials/instanceQuestionPoints'); %>",
                                      { instance_question, component: 'auto' },
                                    )}
                                  </td>
                                  <td class="text-center">
                                    ${renderEjs(
                                      import.meta.url,
                                      "<%- include('../partials/instanceQuestionPoints'); %>",
                                      { instance_question, component: 'manual' },
                                    )}
                                  </td>
                                `
                              : ''}
                            <td class="text-center">
                              ${renderEjs(
                                import.meta.url,
                                "<%- include('../partials/instanceQuestionPoints'); %>",
                                { instance_question, component: 'total' },
                              )}
                            </td>
                          `}
                    </tr>
                  `,
                )}
              </tbody>
            </table>

            <div class="card-footer">
              ${resLocals.assessment.type === 'Exam' &&
              resLocals.assessment_instance.open &&
              resLocals.authz_result.active
                ? html`
                    ${resLocals.assessment.allow_real_time_grading
                      ? html`
                          <form name="grade-form" method="POST" class="form-inline">
                            <input type="hidden" name="__action" value="grade" />
                            <input
                              type="hidden"
                              name="__csrf_token"
                              value="${resLocals.__csrf_token}"
                            />
                            ${resLocals.savedAnswers > 0
                              ? html`
                                  <button
                                    type="submit"
                                    class="btn btn-info my-2"
                                    ${!resLocals.authz_result.authorized_edit ? 'disabled' : ''}
                                  >
                                    Grade ${resLocals.savedAnswers} saved
                                    ${resLocals.savedAnswers !== 1 ? 'answers' : 'answer'}
                                  </button>
                                `
                              : html`
                                  <button type="submit" class="btn btn-info my-2" disabled>
                                    No saved answers to grade
                                  </button>
                                `}
                          </form>
                          <ul class="my-1">
                            ${resLocals.suspendedSavedAnswers > 1
                              ? html`
                                  <li>
                                    There are ${resLocals.suspendedSavedAnswers} saved answers that
                                    cannot be graded yet because their grade rate has not been
                                    reached. They are marked with the
                                    <i class="fa fa-hourglass-half"></i> icon above. Reload this
                                    page to update this information.
                                  </li>
                                `
                              : resLocals.suspendedSavedAnswers === 1
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
                              <strong>Save & Grade</strong> or <strong>Save only</strong> buttons on
                              the question page.
                            </li>
                            <li>
                              Look at <strong>Best submission</strong> to confirm that each question
                              has been graded. Questions with <strong>Available points</strong> can
                              be attempted again for more points. Attempting questions again will
                              never reduce the points you already have.
                            </li>
                            ${resLocals.authz_result.password != null ||
                            !resLocals.authz_result.show_closed_assessment
                              ? html`
                                  <li>
                                    After you have answered all the questions completely, click
                                    here:
                                    <button
                                      class="btn btn-danger"
                                      data-toggle="modal"
                                      data-target="#confirmFinishModal"
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
                          <ul class="my-1">
                            <li>
                              Submit your answer to each question with the
                              <strong>Save</strong> button on the question page.
                            </li>
                            <li>
                              After you have answered all the questions completely, click here:
                              <button
                                class="btn btn-danger"
                                data-toggle="modal"
                                data-target="#confirmFinishModal"
                                ${!resLocals.authz_result.authorized_edit ? 'disabled' : ''}
                              >
                                Finish assessment
                              </button>
                            </li>
                          </ul>
                        `}
                  `
                : ''}
              ${!resLocals.authz_result.authorized_edit
                ? html`
                    <div class="alert alert-warning mt-4" role="alert">
                      You are viewing the assessment of a different user and so are not authorized
                      to submit questions for grading or to mark the assessment as complete.
                    </div>
                  `
                : ''}
            </div>
          </div>

          ${renderEjs(
            import.meta.url,
            // TODO: convert to TypeScript component
            "<%- include('../partials/attachFilePanel') %>",
            resLocals,
          )}
          ${renderEjs(
            import.meta.url,
            // TODO: convert to TypeScript component
            "<%- include('../partials/instructorInfoPanel') %>",
            resLocals,
          )}
        </main>
      </body>
    </html>
  `.toString();
}

function AssessmentStatus({
  assessment,
  assessment_set,
  assessment_instance,
  authz_result,
}: {
  assessment: Assessment;
  assessment_set: AssessmentSet;
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
        assessmentSetName: assessment_set.name,
        assessmentNumber: assessment.number,
      })}
    `;
  }

  return html`Assessment is <strong>closed</strong> and you cannot answer questions.`;
}

function InstanceQuestionTableHeader({ resLocals }: { resLocals: Record<string, any> }) {
  const trailingColumns =
    resLocals.assessment.type === 'Exam'
      ? html`
          ${resLocals.has_auto_grading_question && resLocals.assessment.allow_real_time_grading
            ? html`
                <th class="text-center">Best submission ${ExamQuestionHelpBestSubmission()}</th>
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
          resLocals.assessment.allow_real_time_grading
            ? html`
                <tr>
                  <th rowspan="2">Question</th>
                  <th class="text-center" rowspan="2">Submission status</th>
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
                  <th class="text-center">Submission status</th>
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

function ZoneInfoBadge({
  popoverContent,
  mainContent,
}: {
  popoverContent: string;
  mainContent: string;
}) {
  return html`
    <a
      tabindex="0"
      class="btn btn-xs btn-secondary badge badge-secondary text-white font-weight-normal py-1"
      role="button"
      data-toggle="popover"
      data-trigger="focus"
      data-container="body"
      data-html="true"
      data-content="${popoverContent}"
    >
      ${mainContent}&nbsp;<i class="far fa-question-circle" aria-hidden="true"></i>
    </a>
  `;
}

function RowLabel({
  instance_question,
  user_group_roles,
  rowLabelText,
  urlPrefix,
}: {
  // TODO: better types?
  instance_question: any;
  user_group_roles: string;
  rowLabelText: string;
  urlPrefix: string;
}) {
  let lockedPopoverText: string | null = null;
  if (instance_question.sequence_locked) {
    lockedPopoverText = instance_question.prev_sequence_locked
      ? `A previous question must be completed before you can access this one.`
      : `You must score at least ${instance_question.prev_advance_score_perc}% on ${instance_question.prev_title} to unlock this question.`;
  } else if (!(instance_question.group_role_permissions?.can_view ?? true)) {
    lockedPopoverText = `Your current group role (${user_group_roles}) restricts access to this question.`;
  }

  return html`
    ${lockedPopoverText != null
      ? html`
          <span class="text-muted">${rowLabelText}</span>
          <a
            tabindex="0"
            class="btn btn-xs border text-secondary ml-1"
            role="button"
            data-toggle="popover"
            data-trigger="focus"
            data-container="body"
            data-html="true"
            data-content="${lockedPopoverText}"
            data-test-id="locked-instance-question-row"
            aria-label="Locked"
          >
            <i class="fas fa-lock" aria-hidden="true"></i>
          </a>
        `
      : html`
          <a href="${urlPrefix}/instance_question/${instance_question.id}/">${rowLabelText}</a>
        `}
    ${instance_question.file_count > 0
      ? html`
          <a
            tabindex="0"
            class="btn btn-xs border text-secondary ml-1"
            role="button"
            data-toggle="popover"
            data-trigger="focus"
            data-container="body"
            data-html="true"
            data-content="Personal notes: ${instance_question.file_count}"
            aria-label="Has personal note attachments"
          >
            <i class="fas fa-paperclip"></i>
          </a>
        `
      : ''}
  `;
}

function ExamQuestionHelpBestSubmission() {
  return html`
    <a
      tabindex="0"
      role="button"
      data-toggle="popover"
      data-trigger="focus"
      data-container="body"
      data-html="true"
      data-placement="auto"
      title="Best submission"
      data-content="The percentage score of the best submitted answer, or whether the question is <strong>unanswered</strong>, has a <strong>saved</strong> but ungraded answer, or is in <strong>grading</strong>."
    >
      <i class="far fa-question-circle" aria-hidden="true"></i>
    </a>
  `;
}

function ExamQuestionHelpAvailablePoints() {
  return html`
    <a
      tabindex="0"
      role="button"
      data-toggle="popover"
      data-trigger="focus"
      data-container="body"
      data-html="true"
      data-placement="auto"
      title="Available points"
      data-content="The number of points that would be earned for a 100% correct answer on the next attempt. If retries are available for the question then a list of further points is shown, where the <i>n</i>-th value is the number of points that would be earned for a 100% correct answer on the <i>n</i>-th attempt."
    >
      <i class="far fa-question-circle" aria-hidden="true"></i>
    </a>
  `;
}

function ExamQuestionHelpAwardedPoints() {
  return html`
    <a
      tabindex="0"
      role="button"
      data-toggle="popover"
      data-trigger="focus"
      data-container="body"
      data-html="true"
      data-placement="auto"
      title="Awarded points"
      data-content="The number of points already earned, as a fraction of the maximum possible points for the question."
    >
      <i class="far fa-question-circle" aria-hidden="true"></i>
    </a>
  `;
}

function ConfirmFinishModal({
  instance_questions,
  csrfToken,
}: {
  instance_questions: InstanceQuestion[];
  csrfToken: string;
}) {
  const all_questions_answered = instance_questions.every((iq) => iq.status !== 'unanswered');

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
      <input type="hidden" name="__action" value="finish" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="submit" class="btn btn-danger">Finish assessment</button>
      <button type="button" data-dismiss="modal" class="btn btn-secondary">Cancel</button>
    `,
  });
}
