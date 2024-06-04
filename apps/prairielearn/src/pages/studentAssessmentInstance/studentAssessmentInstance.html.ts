import { EncodedData } from '@prairielearn/browser-utils';
import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { compiledScriptTag } from '../../lib/assets.js';
import { formatPoints } from '../../lib/format.js';

export function StudentAssessmentInstance({ resLocals }: { resLocals: Record<string, any> }) {
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
                serverUpdateURL:
                  resLocals.urlPrefix +
                  '/assessment_instance/' +
                  resLocals.assessment_instance.id +
                  '/time_remaining',
                canTriggerFinish: resLocals.authz_result.authorized_edit,
                csrfToken: resLocals.__csrf_token,
              },
              'time-limit-data',
            )}`
          : ''}
      </head>
      <body>
        <script>
          $(function () {
              $('[data-toggle="popover"]').popover({sanitize: false, container: 'body'});
          });

          // make the file inputs display the file name
          $(document).on('change', '.custom-file-input', function () {
              let filename = $(this).val().replace(/\\/g, '/').replace(/.*//, '');
              $(this).parent('.custom-file').find('.custom-file-label').text(filename);
          });
        </script>

        ${resLocals.assessment.type === 'Exam' && resLocals.authz_result.authorized_edit
          ? html`
              <div id="confirmFinishModal" class="modal fade">
                <div class="modal-dialog">
                  <div class="modal-content">
                    <div class="modal-header">
                      <h4 class="modal-title">All done?</h4>
                      <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                        <span aria-hidden="true">&times;</span>
                      </button>
                    </div>
                    <div class="modal-body">
                      ${resLocals.assessment_instance.all_questions_answered
                        ? html`
                            <div class="alert alert-warning">
                              There are still unanswered questions.
                            </div>
                          `
                        : ''}
                      <p class="text-danger">
                        <strong>Warning</strong>: You will not be able to answer any more questions
                        after finishing the assessment.
                      </p>
                      <p>
                        Are you sure you want to finish, complete, and close out the assessment?
                      </p>
                    </div>
                    <div class="modal-footer">
                      <form name="finish-form" method="POST">
                        <input type="hidden" name="__action" value="finish" />
                        <input
                          type="hidden"
                          name="__csrf_token"
                          value="${resLocals.__csrf_token}"
                        />
                        <button type="submit" class="btn btn-danger">Finish assessment</button>
                        <button type="button" data-dismiss="modal" class="btn btn-secondary">
                          Cancel
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            `
          : ''}
        ${resLocals.showTimeLimitExpiredModal
          ? html`
              <div id="timeLimitExpiredModal" class="modal fade">
                <div class="modal-dialog">
                  <div class="modal-content">
                    <div class="modal-header">
                      <h4 class="modal-title">Time limit expired</h4>
                      <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                        <span aria-hidden="true">&times;</span>
                      </button>
                    </div>
                    <div class="modal-body">
                      <p>Your time limit expired and your assessment is now finished.</p>
                    </div>
                    <div class="modal-footer">
                      <button type="button" class="btn btn-primary" data-dismiss="modal">OK</button>
                    </div>
                  </div>
                </div>
              </div>
              <script>
                $(function () {
                  $('#timeLimitExpiredModal').modal({});
                });
              </script>
            `
          : ''}
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
              ${resLocals.assessment.allow_real_time_grading && resLocals.assessment_instance.open
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
                        ${resLocals.assessment_instance.open && resLocals.authz_result.active
                          ? html`
                              Assessment is <strong>open</strong> and you can answer questions.
                              <br />
                              Available credit: ${resLocals.authz_result.credit_date_string}
                              ${renderEjs(
                                import.meta.url,
                                "<%- include('../partials/studentAccessRulesPopover'); %>",
                                {
                                  accessRules: resLocals.authz_result.access_rules,
                                  assessmentSetName: resLocals.assessment_set.name,
                                  assessmentNumber: resLocals.assessment.number,
                                },
                              )}
                            `
                          : html`Assessment is <strong>closed</strong> and you cannot answer
                              questions.`}
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
                        ${resLocals.assessment_instance.open && resLocals.authz_result.active
                          ? html`
                              Assessment is
                              <strong>open</strong> and you can answer questions.
                              <br />
                              Available credit: ${resLocals.authz_result.credit_date_string}
                              ${renderEjs(
                                import.meta.url,
                                "<%- include('../partials/studentAccessRulesPopover'); %>",
                                {
                                  accessRules: resLocals.authz_result.access_rules,
                                  assessmentSetName: resLocals.assessment_set.name,
                                  assessmentNumber: resLocals.assessment.number,
                                },
                              )}
                            `
                          : html`Assessment is <strong>closed</strong> and you cannot answer
                              questions.`}
                      </div>
                    `}
                ${resLocals.assessment.group_work
                  ? html`
                      <div class="col-lg-12">
                        ${renderEjs(
                          import.meta.url,
                          "<%- include('../partials/groupWorkInfoContainer.ejs'); %>",
                          resLocals,
                        )}
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
                    <div class="card-body"><${unsafeHtml(resLocals.assessment_text_templated)}</div>
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
                              <span class="mr-1"> ${instance_question.zone_title} </span>
                              <!-- TODO: do we need to pass additional context to these partials? -->
                              ${instance_question.zone_has_max_points
                                ? renderEjs(
                                    import.meta.url,
                                    "<%- include('../partials/zoneInfoBadge'); %>",
                                    {
                                      zoneInfo: {
                                        popoverContent: `Of the points that you are awarded for answering these questions, at most ${instance_question.zone_max_points} will count toward your total points.`,
                                        mainContent: `Maximum ${instance_question.zone_max_points} points`,
                                      },
                                    },
                                  )
                                : ''}
                              ${instance_question.zone_has_best_questions
                                ? renderEjs(
                                    import.meta.url,
                                    "<%- include('../partials/zoneInfoBadge'); %>",
                                    {
                                      zoneInfo: {
                                        popoverContent: `Of these questions, only the ${instance_question.zone_best_questions} with the highest number of awarded points will count toward your total points.`,
                                        mainContent: `Best ${instance_question.zone_best_questions} questions`,
                                      },
                                    },
                                  )
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
                        ${renderEjs(
                          import.meta.url,
                          // TODO: this is only used on this page; turn it into a TypeScript component.
                          "<%- include('../partials/studentAssessmentInstanceRowLabel.ejs'); %>",
                          {
                            ...instance_question,
                            urlPrefix: resLocals.urlPrefix,
                            rowLabelText:
                              resLocals.assessment.type === 'Exam'
                                ? `Question ${instance_question.question_number}`
                                : `${instance_question.question_number}. ${instance_question.question_title}`,
                          },
                        )}
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
                                    ${renderEjs(
                                      import.meta.url,
                                      "<%- include('../partials/questionValue'); %>",
                                      { value: instance_question.current_value },
                                    )}
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
              ${resLocals.authz_result.authorized_edit
                ? html`
                    <div class="alert alert-warning mt-4" role="alert">
                      You are viewing the assessment of a different user and so are not authorized
                      to submit questions for grading or to mark the assessment as complete.
                    </div>
                  `
                : ''}
            </div>
          </div>

          <!-- TODO: be selective about what we pass to these partials -->
          ${renderEjs(import.meta.url, "<%- include('../partials/attachFilePanel') %>", resLocals)}
          ${renderEjs(
            import.meta.url,
            "<%- include('../partials/instructorInfoPanel') %>",
            resLocals,
          )}
        </main>
      </body>
    </html>
  `.toString();
}

function InstanceQuestionTableHeader({ resLocals }: { resLocals: Record<string, any> }) {
  const trailingColumns =
    resLocals.assessment.type === 'Exam'
      ? html`
          ${resLocals.has_auto_grading_question && resLocals.assessment.allow_real_time_grading
            ? html`
                <th class="text-center">
                  Best submission
                  ${renderEjs(
                    import.meta.url,
                    "<%- include('../partials/examQuestionHelpBestSubmission'); %>",
                  )}
                </th>
                <th class="text-center">
                  Available points
                  ${renderEjs(
                    import.meta.url,
                    "<%- include('../partials/examQuestionHelpAvailablePoints'); %>",
                  )}
                </th>
                <th class="text-center">
                  Awarded points
                  ${renderEjs(
                    import.meta.url,
                    "<%- include('../partials/examQuestionHelpAwardedPoints'); %>",
                  )}
                  %>
                </th>
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
