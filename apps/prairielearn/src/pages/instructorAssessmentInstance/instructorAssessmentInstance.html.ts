import { escapeHtml, html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { z } from 'zod';

import { IdSchema, InstanceQuestionSchema } from '../../lib/db-types';
import { InstanceLogEntry } from '../../lib/assessment';
import { nodeModulesAssetPath, compiledScriptTag } from '../../lib/assets';
import { Modal } from '../../components/Modal.html';

export const AssessmentInstanceStatsSchema = z.object({
  assessment_instance_id: IdSchema,
  average_submission_score: z.number().nullable(),
  client_fingerprint_id_change_count: z.number(),
  first_submission_score: z.number().nullable(),
  incremental_submission_points_array: z.array(z.number().nullable()).nullable(),
  incremental_submission_score_array: z.array(z.number().nullable()).nullable(),
  instance_question_id: IdSchema,
  last_submission_score: z.number().nullable(),
  max_submission_score: z.number().nullable(),
  number: z.string().nullable(),
  qid: z.string(),
  question_id: IdSchema,
  some_nonzero_submission: z.boolean().nullable(),
  some_perfect_submission: z.boolean().nullable(),
  some_submission: z.boolean().nullable(),
  submission_score_array: z.array(z.number().nullable()).nullable(),
  title: z.string().nullable(),
});
type AssessmentInstanceStats = z.infer<typeof AssessmentInstanceStatsSchema>;

export const InstanceQuestionRowSchema = InstanceQuestionSchema.extend({
  instructor_question_number: z.string(),
  manual_rubric_id: IdSchema.nullable(),
  max_auto_points: z.number().nullable(),
  max_manual_points: z.number().nullable(),
  max_points: z.number().nullable(),
  modified_at: z.string(),
  qid: z.string().nullable(),
  question_id: IdSchema,
  question_number: z.string(),
  question_title: z.string().nullable(),
  row_order: z.number(),
  start_new_zone: z.boolean(),
  zone_best_questions: z.number().nullable(),
  zone_has_best_questions: z.boolean(),
  zone_has_max_points: z.boolean(),
  zone_id: IdSchema,
  zone_max_points: z.number().nullable(),
  zone_title: z.string().nullable(),
});
type InstanceQuestionRow = z.infer<typeof InstanceQuestionRowSchema>;

const FINGERPRINT_COLORS = ['red2', 'orange2', 'green2', 'blue2', 'turquoise2', 'purple2'];

export function InstructorAssessmentInstance({
  resLocals,
  logCsvFilename,
  assessment_instance_stats,
  assessment_instance_date_formatted,
  assessment_instance_duration,
  instance_questions,
  assessmentInstanceLog,
}: {
  resLocals: Record<string, any>;
  logCsvFilename: string;
  assessment_instance_stats: AssessmentInstanceStats[];
  assessment_instance_date_formatted: string;
  assessment_instance_duration: string;
  instance_questions: InstanceQuestionRow[];
  assessmentInstanceLog: InstanceLogEntry[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", { ...resLocals })}
        <link
          href="${nodeModulesAssetPath('tablesorter/dist/css/theme.bootstrap.min.css')}"
          rel="stylesheet"
        />
        ${compiledScriptTag('instructorAssessmentInstanceClient.ts')}
        <script src="${nodeModulesAssetPath(
            'tablesorter/dist/js/jquery.tablesorter.min.js',
          )}"></script>
        <script src="${nodeModulesAssetPath(
            'tablesorter/dist/js/jquery.tablesorter.widgets.min.js',
          )}"></script>
        ${compiledScriptTag('popover.ts')}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: '',
        })}
        <main id="content" class="container-fluid">
          ${ResetQuestionVariantsModal({
            csrfToken: resLocals.__csrf_token,
            groupWork: resLocals.assessment.group_work,
          })}
          ${renderEjs(
            __filename,
            "<%- include('../partials/assessmentSyncErrorsAndWarnings'); %>",
            { ...resLocals },
          )}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${resLocals.assessment_instance_label} Summary:
              ${resLocals.instance_group
                ? html`${resLocals.instance_group.name} <i class="fas fa-users"></i>`
                : html`${resLocals.instance_user.name} (${resLocals.instance_user.uid})`}
            </div>

            <table class="table table-sm table-hover two-column-description">
              <tbody>
                ${resLocals.instance_group
                  ? html`
                      <tr>
                        <th>Name</th>
                        <td colspan="2">${resLocals.instance_group.name}</td>
                      </tr>
                      <tr>
                        <th>Group Members</th>
                        <td colspan="2">${resLocals.instance_group_uid_list.join(', ')}</td>
                      </tr>
                    `
                  : html`
                      <tr>
                        <th>UID</th>
                        <td colspan="2">${resLocals.instance_user.uid}</td>
                      </tr>
                      <tr>
                        <th>Name</th>
                        <td colspan="2">${resLocals.instance_user.name}</td>
                      </tr>
                      <tr>
                        <th>Role</th>
                        <td colspan="2">${resLocals.instance_role}</td>
                      </tr>
                    `}
                <tr>
                  <th>Instance</th>
                  <td colspan="2">
                    ${resLocals.assessment_instance.number} (<a
                      href="${resLocals.plainUrlPrefix}/course_instance/${resLocals.course_instance
                        .id}/assessment_instance/${resLocals.assessment_instance.id}"
                      >student view</a
                    >)
                  </td>
                </tr>
                ${resLocals.instance_user
                  ? html`
                      <tr>
                        <th>Fingerprint Changes</th>
                        <td colspan="2">
                          ${resLocals.assessment_instance.client_fingerprint_id_change_count}
                          <a
                            tabindex="0"
                            class="btn btn-xs"
                            role="button"
                            id="fingerprintDescriptionPopover"
                            data-toggle="popover"
                            data-container="body"
                            data-html="false"
                            title="Client Fingerprint Changes"
                            data-content="Client fingerprints are a record of a user's IP address, user agent and sesssion. These attributes are tracked while a user is accessing an assessment. This value indicates the amount of times that those attributes changed as the student accessed the assessment, while the assessment was active. Some changes may naturally occur during an assessment, such as if a student changes network connections or browsers. However, a high number of changes in an exam-like environment could be an indication of multiple people accessing the same assessment simultaneously, which may suggest an academic integrity issue. Accesses taking place after the assessment has been closed are not counted, as they typically indicate scenarios where a student is reviewing their results, which may happen outside of a controlled environment."
                            ><i class="fa fa-question-circle"></i
                          ></a>
                        </td>
                      </tr>
                    `
                  : ''}

                <tr>
                  <th>Points</th>
                  <td colspan="2">
                    ${renderEjs(__filename, "<% include('../partials/pointsFormatter'); %>")}
                    <span id="total-points"
                      >${resLocals.assessment_instance.points.toString()}</span
                    >
                    <small
                      >/<span id="total-max-points" class="text-muted"
                        >${resLocals.assessment_instance.max_points.toString()}</span
                      ></small
                    >
                    ${resLocals.authz_data.has_course_instance_permission_edit
                      ? html`
                          <button
                            type="button"
                            class="btn btn-xs btn-secondary"
                            id="editTotalPointsButton"
                            data-toggle="popover"
                            data-html="true"
                            data-placement="auto"
                            data-container="body"
                            title="Change total points"
                            data-content="${escapeHtml(
                              EditTotalPointsForm({
                                resLocals,
                                id: 'editTotalPointsButton',
                              }),
                            )}"
                          >
                            <i class="fa fa-edit" aria-hidden="true"></i>
                          </button>
                        `
                      : ''}
                  </td>
                </tr>
                <tr>
                  <th>Score</th>
                  <td class="align-middle" style="width: 20%;">
                    ${renderEjs(__filename, "<%- include('../partials/scorebar'); %>", {
                      score: resLocals.assessment_instance.score_perc,
                    })}
                  </td>
                  <td class="align-middle" style="width: 100%;">
                    ${resLocals.authz_data.has_course_instance_permission_edit
                      ? html`
                          <button
                            type="button"
                            class="btn btn-xs btn-secondary"
                            id="editTotalScorePercButton"
                            data-toggle="popover"
                            data-container="body"
                            data-html="true"
                            data-placement="auto"
                            title="Change total percentage score"
                            data-content="${escapeHtml(
                              EditTotalScorePercForm({
                                resLocals,
                                id: 'editTotalScorePercButton',
                              }),
                            )}"
                          >
                            <i class="fa fa-edit" aria-hidden="true"></i>
                          </button>
                        `
                      : ''}
                  </td>
                </tr>
                <tr>
                  <th>Statistics</th>
                  <td colspan="2">
                    ${resLocals.assessment_instance.include_in_statistics
                      ? html`
                          Included
                          <a
                            tabindex="0"
                            class="btn btn-xs"
                            role="button"
                            data-toggle="popover"
                            data-container="body"
                            data-html="true"
                            title="Included in statistics"
                            data-content="This assessment is included in the calculation of assessment and question statistics"
                            ><i class="fa fa-question-circle"></i
                          ></a>
                        `
                      : html`
                          Not included
                          <a
                            tabindex="0"
                            class="btn btn-xs"
                            role="button"
                            data-toggle="popover"
                            data-container="body"
                            data-html="true"
                            title="Not included in statistics"
                            data-content="This assessment is not included in the calculation of assessment and question statistics because it was created by a course staff member"
                            ><i class="fa fa-question-circle"></i
                          ></a>
                        `}
                  </td>
                </tr>
                <tr>
                  <th>Date started</th>
                  <td colspan="2">${assessment_instance_date_formatted}</td>
                </tr>
                <tr>
                  <th>Duration</th>
                  <td colspan="2">${assessment_instance_duration}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${resLocals.assessment_instance_label} Questions:
              ${resLocals.instance_group
                ? html`${resLocals.instance_group.name} <i class="fas fa-users"></i>`
                : html`${resLocals.instance_user.name} (${resLocals.instance_user.uid})`}
            </div>

            <table id="instanceQuestionList" class="table table-sm table-hover">
              <thead>
                <tr>
                  <th>Student question</th>
                  <th>Instructor question</th>
                  <th class="text-center">Auto-grading points</th>
                  <th class="text-center">Manual grading points</th>
                  <th class="text-center">Awarded points</th>
                  <th class="text-center" colspan="2">Percentage score</th>
                  <th><!--Manual grading column --></th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${instance_questions.map((instance_question, i_instance_question) => {
                  return html`
                    ${instance_question.start_new_zone && instance_question.zone_title
                      ? html`
                          <tr>
                            <th colspan="6">
                              ${instance_question.zone_title}
                              ${instance_question.zone_has_max_points
                                ? html`(maximum ${instance_question.zone_max_points} points)}`
                                : ''}
                              ${instance_question.zone_has_best_questions
                                ? html`(best ${instance_question.zone_best_questions} questions)}`
                                : ''}
                            </th>
                          </tr>
                        `
                      : ''}
                    <tr>
                      <td>
                        S-${instance_question.question_number}. (<a
                          href="${resLocals.plainUrlPrefix}/course_instance/${resLocals
                            .course_instance.id}/instance_question/${instance_question.id}/"
                          >student view</a
                        >)
                      </td>
                      <td>
                        I-${instance_question.instructor_question_number}. ${instance_question.qid}
                        (<a href="${resLocals.urlPrefix}/question/${instance_question.question_id}/"
                          >instructor view</a
                        >)
                      </td>
                      <td class="text-center">
                        ${renderEjs(
                          __filename,
                          "<%- include('../partials/instanceQuestionPoints') %>",
                          { instance_question, component: 'auto' },
                        )}
                        ${resLocals.authz_data.has_course_instance_permission_edit
                          ? html`
                              <button
                                type="button"
                                class="btn btn-xs btn-secondary editQuestionAutoPointsButton"
                                id="editQuestionPointsAuto${i_instance_question}"
                                data-toggle="popover"
                                data-container="body"
                                data-html="true"
                                data-placement="auto"
                                title="Change question ${instance_question.question_number} points"
                                data-content="${renderEjs(
                                  __filename,
                                  "<%= include('../partials/editQuestionPointsForm'); %>",
                                  {
                                    ...resLocals,
                                    id: 'editQuestionPointsAuto' + i_instance_question,
                                    field: 'auto_points',
                                    instance_question: {
                                      ...instance_question,
                                      points: instance_question.auto_points,
                                      max_points: instance_question.max_auto_points,
                                    },
                                  },
                                )}"
                              >
                                <i class="fa fa-edit" aria-hidden="true"></i>
                              </button>
                            `
                          : ''}
                      </td>
                      <td class="text-center">
                        ${renderEjs(
                          __filename,
                          "<%- include('../partials/instanceQuestionPoints'); %>",
                          { instance_question, component: 'manual' },
                        )}
                        ${resLocals.authz_data.has_course_instance_permission_edit
                          ? html`
                              <button
                                type="button"
                                class="btn btn-xs btn-secondary editQuestionManualPointsButton"
                                id="editQuestionPointsManual${i_instance_question}"
                                data-toggle="popover"
                                data-container="body"
                                data-html="true"
                                data-placement="auto"
                                title="Change question ${instance_question.question_number} points"
                                data-content="${renderEjs(
                                  __filename,
                                  "<%= include('../partials/editQuestionPointsForm') %>",
                                  {
                                    ...resLocals,
                                    id: 'editQuestionPointsManual' + i_instance_question,
                                    field: 'manual_points',
                                    instance_question: {
                                      ...instance_question,
                                      points: instance_question.manual_points,
                                      max_points: instance_question.max_manual_points,
                                    },
                                  },
                                )}"
                              >
                                <i class="fa fa-edit" aria-hidden="true"></i>
                              </button>
                            `
                          : ''}
                      </td>
                      <td class="text-center">
                        ${renderEjs(
                          __filename,
                          "<%- include('../partials/instanceQuestionPoints'); %>",
                          { instance_question, component: 'total' },
                        )}
                        ${resLocals.authz_data.has_course_instance_permission_edit
                          ? html`
                              <button
                                type="button"
                                class="btn btn-xs btn-secondary editQuestionPointsButton"
                                id="editQuestionPoints${i_instance_question}"
                                data-toggle="popover"
                                data-container="body"
                                data-html="true"
                                data-placement="auto"
                                title="Change question ${instance_question.question_number} points"
                                data-content="${renderEjs(
                                  __filename,
                                  "<%= include('../partials/editQuestionPointsForm'); %>",
                                  {
                                    ...resLocals,
                                    id: 'editQuestionPoints' + i_instance_question,
                                    instance_question,
                                  },
                                )}"
                              >
                                <i class="fa fa-edit" aria-hidden="true"></i>
                              </button>
                            `
                          : ''}
                      </td>
                      <td class="align-middle text-center text-nowrap">
                        ${renderEjs(__filename, "<%- include('../partials/scorebar'); %>", {
                          score: instance_question.score_perc,
                        })}
                      </td>
                      <td class="align-middle" style="width: 1em;">
                        ${resLocals.authz_data.has_course_instance_permission_edit
                          ? html`
                              <button
                                type="button"
                                class="btn btn-xs btn-secondary editQuestionScorePercButton"
                                id="editQuestionScorePerc${i_instance_question}"
                                data-toggle="popover"
                                data-container="body"
                                data-html="true"
                                data-placement="auto"
                                title="Change question ${instance_question.question_number} percentage score"
                                data-content="${renderEjs(
                                  __filename,
                                  "<%= include('../partials/editQuestionScorePercForm');%>",
                                  {
                                    ...resLocals,
                                    id: 'editQuestionScorePerc' + i_instance_question,
                                    instance_question,
                                  },
                                )}"
                              >
                                <i class="fa fa-edit" aria-hidden="true"></i>
                              </button>
                            `
                          : ''}
                      </td>
                      <td class="align-middle text-nowrap" style="width: 1em;">
                        ${resLocals.authz_data.has_course_instance_permission_edit &&
                        instance_question.status !== 'unanswered'
                          ? html`
                              <a
                                class="btn btn-xs btn-secondary"
                                href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                                  .id}/manual_grading/instance_question/${instance_question.id}"
                                >Manual grading</a
                              >
                            `
                          : ''}
                      </td>
                      <td class="text-right">
                        <div class="dropdown js-question-actions">
                          <button
                            type="button"
                            class="btn btn-secondary btn-xs dropdown-toggle"
                            data-toggle="dropdown"
                            aria-haspopup="true"
                            aria-expanded="false"
                          >
                            Action <span class="caret"></span>
                          </button>
                          <div class="dropdown-menu dropdown-menu-right">
                            ${resLocals.authz_data.has_course_instance_permission_edit
                              ? html`
                                  <button
                                    class="dropdown-item"
                                    data-toggle="modal"
                                    data-target="#resetQuestionVariantsModal"
                                    data-instance-question-id="${instance_question.id}"
                                  >
                                    Reset question variants
                                  </button>
                                `
                              : html`
                                  <button class="dropdown-item disabled" disabled>
                                    Must have editor permission
                                  </button>
                                `}
                          </div>
                        </div>
                      </td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${resLocals.assessment_instance_label} Statistics:
              ${resLocals.instance_group
                ? html`${resLocals.instance_group.name} <i class="fas fa-users"></i>`
                : html`${resLocals.instance_user.name} (${resLocals.instance_user.uid})`}
            </div>
            <table id="instanceQuestionStatsTable" class="table table-sm table-hover tablesorter">
              <thead>
                <tr>
                  <th>Instructor question</th>
                  <th>Some submission</th>
                  <th>Some perfect submission</th>
                  <th>Some nonzero submission</th>
                  <th>First submission score</th>
                  <th>Last submission score</th>
                  <th>Max submission score</th>
                  <th>Average submission score</th>
                </tr>
              </thead>
              <tbody>
                ${assessment_instance_stats.map((row) => {
                  return html`
                    <tr>
                      <td>
                        I-${row.number}.
                        <a href="${resLocals.urlPrefix}/question/${row.question_id}/">${row.qid}</a>
                      </td>
                      <td>${row.some_submission}</td>
                      <td>${row.some_perfect_submission}</td>
                      <td>${row.some_nonzero_submission}</td>
                      <td>${resLocals.formatFloat(row.first_submission_score, 2)}</td>
                      <td>${resLocals.formatFloat(row.last_submission_score, 2)}</td>
                      <td>${resLocals.formatFloat(row.max_submission_score, 2)}</td>
                      <td>${resLocals.formatFloat(row.average_submission_score, 2)}</td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
            <script>
              $(function () {
                $('#loginstanceQuestionStatsTable').tablesorter({
                  theme: 'bootstrap',
                  widthFixed: true,
                  headerTemplate: '{content} {icon}',
                  widgets: ['uitheme'],
                });
              });
            </script>
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${resLocals.assessment_instance_label} Log:
              ${resLocals.instance_group
                ? html`${resLocals.instance_group.name} <i class="fas fa-users"></i>`
                : html`${resLocals.instance_user.name} (${resLocals.instance_user.uid})`}
            </div>
            <div class="card-body">
              <small>
                Click on a column header to sort. Shift-click on a second header to sub-sort.
                Download
                <a
                  href="${resLocals.urlPrefix}/assessment_instance/${resLocals.assessment_instance
                    .id}/${logCsvFilename}"
                  >${logCsvFilename}</a
                >. Uploaded student files are not shown above or in the CSV file. Student files can
                be downloaded on the
                <a href="${resLocals.urlPrefix}/assessment/${resLocals.assessment.id}/downloads"
                  >Downloads</a
                >
                tab.
              </small>
            </div>

            <table id="logTable" class="table table-sm table-hover tablesorter">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  ${resLocals.instance_user ? html`<th>Fingerprint</th>` : ''}
                  <th>Event</th>
                  <th>Instructor question</th>
                  <th>Student question</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                ${assessmentInstanceLog.map((row, index) => {
                  return html`
                    <tr>
                      <td class="text-nowrap">${row.formatted_date}</td>
                      <td>${row.auth_user_uid ?? html`$mdash;`}</td>
                      ${resLocals.instance_user
                        ? row.client_fingerprint && row.client_fingerprint_number !== null
                          ? html`
                              <td>
                                <a
                                  tabindex="0"
                                  class="badge color-${FINGERPRINT_COLORS[
                                    row.client_fingerprint_number % 6
                                  ]} color-hover"
                                  role="button"
                                  id="fingerprintPopover${row.client_fingerprint?.id}-${index}"
                                  data-toggle="popover"
                                  data-container="body"
                                  data-html="true"
                                  data-placement="auto"
                                  title="Fingerprint ${row.client_fingerprint_number}"
                                  data-content="${escapeHtml(html`
                                    <div>
                                      IP Address:
                                      <a
                                        href="https://client.rdap.org/?type=ip&object=${row
                                          .client_fingerprint.ip_address}"
                                        target="_blank"
                                      >
                                        ${row.client_fingerprint.ip_address}
                                      </a>
                                    </div>
                                    <div>Session ID: ${row.client_fingerprint.user_session_id}</div>
                                    <div>User Agent: ${row.client_fingerprint.user_agent}</div>
                                  `)}"
                                >
                                  ${row.client_fingerprint_number}
                                </a>
                              </td>
                            `
                          : html`<td>&mdash;</td>`
                        : ''}
                      <td><span class="badge color-${row.event_color}">${row.event_name}</span></td>
                      <td>
                        ${row.qid
                          ? html`
                              <a href="${resLocals.urlPrefix}/question/${row.question_id}/">
                                I-${row.instructor_question_number} (${row.qid})
                              </a>
                            `
                          : ''}
                      </td>
                      <td>
                        ${row.student_question_number
                          ? row.variant_id
                            ? html`
                                <a
                                  href="${resLocals.plainUrlPrefix}/course_instance/${resLocals
                                    .course_instance
                                    .id}/instance_question/${row.instance_question_id}/?variant_id=${row.variant_id}"
                                >
                                  S-${row.student_question_number}#${row.variant_number}
                                </a>
                              `
                            : html`S-${row.student_question_number}}`
                          : ''}
                      </td>
                      ${row.event_name !== 'External grading results'
                        ? html`<td style="word-break: break-all;">
                            ${row.data != null ? JSON.stringify(row.data) : ''}
                          </td>`
                        : html`
                            <td>
                              <a
                                class="btn btn-primary"
                                href="${resLocals.urlPrefix}/grading_job/${row.data?.id}"
                              >
                                View grading job ${row.data?.id}
                              </a>
                            </td>
                          `}
                    </tr>
                  `;
                })}
              </tbody>
            </table>
            <script>
              $(function () {
                $('#logTable').tablesorter({
                  theme: 'bootstrap',
                  widthFixed: true,
                  headerTemplate: '{content} {icon}',
                  widgets: ['uitheme'],
                });
              });
            </script>
            <div class="card-footer">
              <small>
                Download
                <a
                  href="${resLocals.urlPrefix}/assessment_instance/${resLocals.assessment_instance
                    .id}/${logCsvFilename}"
                  >${logCsvFilename}</a
                >. Uploaded student files are not shown above or in the CSV file. Student files can
                be downloaded on the
                <a href="${resLocals.urlPrefix}/assessment/${resLocals.assessment.id}/downloads"
                  >Downloads</a
                >
                tab.
              </small>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function EditTotalPointsForm({ resLocals, id }: { resLocals: Record<string, any>; id: string }) {
  return html`
    <form name="edit-total-points-form" method="POST">
      <input type="hidden" name="__action" value="edit_total_points" />
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input
        type="hidden"
        name="assessment_instance_id"
        value="${resLocals.assessment_instance.id}"
      />
      <div class="form-group">
        <div class="input-group">
          <input
            type="text"
            class="form-control"
            name="points"
            value="${resLocals.assessment_instance.points}"
          />
          <span class="input-group-addon">/${resLocals.assessment_instance.max_points}</span>
        </div>
      </div>
      <p>
        <small>
          This change will be overwritten if further questions are answered by the student.
        </small>
      </p>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" onclick="$('#${id}').popover('hide')">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary">Change</button>
      </div>
    </form>
  `;
}

function EditTotalScorePercForm({ resLocals, id }: { resLocals: Record<string, any>; id: string }) {
  return html`
    <form name="edit-total-score-perc-form" method="POST">
      <input type="hidden" name="__action" value="edit_total_score_perc" />
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input
        type="hidden"
        name="assessment_instance_id"
        value="${resLocals.assessment_instance.id}"
      />
      <div class="form-group">
        <div class="input-group">
          <input
            type="text"
            class="form-control"
            name="score_perc"
            value="${resLocals.assessment_instance.score_perc}"
          />
          <span class="input-group-addon">%</span>
        </div>
      </div>
      <p>
        <small>
          This change will be overwritten if further questions are answered by the student.
        </small>
      </p>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" onclick="$('#${id}').popover('hide')">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary">Change</button>
      </div>
    </form>
  `;
}

function ResetQuestionVariantsModal({
  csrfToken,
  groupWork,
}: {
  csrfToken: string;
  groupWork: boolean;
}) {
  return Modal({
    id: 'resetQuestionVariantsModal',
    title: 'Confirm reset question variants',
    body: html`
      <p>
        Are your sure you want to reset all current variants of this question for this
        ${groupWork ? 'group' : 'student'}?
        <strong>All ungraded attempts will be lost.</strong>
      </p>
      <p>
        This ${groupWork ? 'group' : 'student'} will receive a new variant the next time they view
        this question.
      </p>
    `,
    footer: html`
      <input type="hidden" name="__action" value="reset_question_variants" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="unsafe_instance_question_id" class="js-instance-question-id" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-danger">Reset question variants</button>
    `,
  });
}
