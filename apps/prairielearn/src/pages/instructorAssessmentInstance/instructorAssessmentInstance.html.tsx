import { UAParser } from 'ua-parser-js';
import { z } from 'zod';

import { escapeHtml, html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { EditQuestionPointsScoreButton } from '../../components/EditQuestionPointsScore.html.js';
import { Modal } from '../../components/Modal.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { InstanceQuestionPoints } from '../../components/QuestionScore.html.js';
import { Scorebar } from '../../components/Scorebar.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { type InstanceLogEntry } from '../../lib/assessment.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import {
  AssessmentQuestionSchema,
  type ClientFingerprint,
  IdSchema,
  InstanceQuestionSchema,
} from '../../lib/db-types.js';
import { formatFloat, formatPoints } from '../../lib/format.js';
import { renderHtml } from '../../lib/preact-html.js';

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
  assessment_question: AssessmentQuestionSchema,
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
  return PageLayout({
    resLocals,
    pageTitle: resLocals.instance_group?.name || resLocals.instance_user?.uid,
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'assessment_instance',
    },
    options: {
      fullWidth: true,
    },
    headContent: html`
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
    `,
    content: html`
      <h1 class="visually-hidden">
        ${resLocals.assessment_instance_label} instance for
        ${resLocals.instance_group
          ? html`${resLocals.instance_group.name}`
          : html`${resLocals.instance_user.name}`}
      </h1>
      ${ResetQuestionVariantsModal({
        csrfToken: resLocals.__csrf_token,
        groupWork: resLocals.assessment.group_work,
      })}
      ${renderHtml(
        <AssessmentSyncErrorsAndWarnings
          authz_data={resLocals.authz_data}
          assessment={resLocals.assessment}
          courseInstance={resLocals.course_instance}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h2>
            ${resLocals.assessment_instance_label} Summary:
            ${resLocals.instance_group
              ? html`${resLocals.instance_group.name} <i class="fas fa-users"></i>`
              : html`${resLocals.instance_user.name} (${resLocals.instance_user.uid})`}
          </h2>
        </div>
        <div class="table-responsive">
          <table
            class="table table-sm table-hover two-column-description"
            aria-label="Assessment instance summary"
          >
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
                        <button
                          type="button"
                          class="btn btn-xs btn-ghost"
                          id="fingerprintDescriptionPopover"
                          data-bs-toggle="popover"
                          data-bs-container="body"
                          data-bs-html="false"
                          data-bs-title="Client fingerprint changes"
                          data-bs-content="Client fingerprints are a record of a user's IP address, user agent and session. These attributes are tracked while a user is accessing an assessment. This value indicates the amount of times that those attributes changed as the student accessed the assessment, while the assessment was active. Some changes may naturally occur during an assessment, such as if a student changes network connections or browsers. However, a high number of changes in an exam-like environment could be an indication of multiple people accessing the same assessment simultaneously, which may suggest an academic integrity issue. Accesses taking place after the assessment has been closed are not counted, as they typically indicate scenarios where a student is reviewing their results, which may happen outside of a controlled environment."
                        >
                          <i class="fa fa-question-circle"></i>
                        </button>
                      </td>
                    </tr>
                  `
                : ''}

              <tr>
                <th>Points</th>
                <td colspan="2">
                  <span id="total-points">
                    ${formatPoints(resLocals.assessment_instance.points)}
                  </span>
                  <small>
                    /<span id="total-max-points" class="text-muted"
                      >${formatPoints(resLocals.assessment_instance.max_points)}
                    </span>
                  </small>
                  ${resLocals.authz_data.has_course_instance_permission_edit
                    ? html`
                        <button
                          type="button"
                          class="btn btn-xs btn-secondary"
                          id="editTotalPointsButton"
                          data-bs-toggle="popover"
                          data-bs-container="body"
                          data-bs-html="true"
                          data-bs-placement="auto"
                          data-bs-title="Change total points"
                          data-bs-content="${escapeHtml(
                            EditTotalPointsForm({
                              resLocals,
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
                  ${Scorebar(resLocals.assessment_instance.score_perc)}
                </td>
                <td class="align-middle" style="width: 100%;">
                  ${resLocals.authz_data.has_course_instance_permission_edit
                    ? html`
                        <button
                          type="button"
                          class="btn btn-xs btn-secondary"
                          id="editTotalScorePercButton"
                          data-bs-toggle="popover"
                          data-bs-container="body"
                          data-bs-html="true"
                          data-bs-placement="auto"
                          data-bs-title="Change total percentage score"
                          data-bs-content="${escapeHtml(
                            EditTotalScorePercForm({
                              resLocals,
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
                        <button
                          type="button"
                          class="btn btn-xs btn-ghost"
                          data-bs-toggle="popover"
                          data-bs-container="body"
                          data-bs-html="true"
                          data-bs-title="Included in statistics"
                          data-bs-content="This assessment is included in the calculation of assessment and question statistics"
                        >
                          <i class="fa fa-question-circle"></i>
                        </button>
                      `
                    : html`
                        Not included
                        <button
                          type="button"
                          class="btn btn-xs btn-ghost"
                          data-bs-toggle="popover"
                          data-bs-container="body"
                          data-bs-html="true"
                          data-bs-title="Not included in statistics"
                          data-bs-content="This assessment is not included in the calculation of assessment and question statistics because it was created by a course staff member"
                        >
                          <i class="fa fa-question-circle"></i>
                        </button>
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
      </div>

      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h2>
            ${resLocals.assessment_instance_label} Questions:
            ${resLocals.instance_group
              ? html`${resLocals.instance_group.name} <i class="fas fa-users"></i>`
              : html`${resLocals.instance_user.name} (${resLocals.instance_user.uid})`}
          </h2>
        </div>

        <div class="table-responsive">
          <table
            id="instanceQuestionList"
            class="table table-sm table-hover"
            aria-label="Assessment instance questions"
          >
            <thead>
              <tr>
                <th>Student question</th>
                <th>Instructor question</th>
                <th class="text-center">Auto-grading points</th>
                <th class="text-center">Manual grading points</th>
                <th class="text-center">Awarded points</th>
                <th class="text-center" colspan="2">Percentage score</th>
                <th><!--Manual grading column --></th>
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${instance_questions.map((instance_question) => {
                return html`
                  ${instance_question.start_new_zone && instance_question.zone_title
                    ? html`
                        <tr>
                          <th colspan="9">
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
                      ${resLocals.authz_data.has_course_permission_preview
                        ? html`
                            (<a
                              href="${resLocals.urlPrefix}/question/${instance_question.question_id}/"
                              >instructor view</a
                            >)
                          `
                        : ''}
                    </td>
                    <td class="text-center">
                      ${InstanceQuestionPoints({
                        instance_question,
                        assessment_question: instance_question.assessment_question,
                        component: 'auto',
                      })}
                      ${resLocals.authz_data.has_course_instance_permission_edit
                        ? EditQuestionPointsScoreButton({
                            field: 'auto_points',
                            instance_question,
                            assessment_question: instance_question.assessment_question,
                            urlPrefix: resLocals.urlPrefix,
                            csrfToken: resLocals.__csrf_token,
                          })
                        : ''}
                    </td>
                    <td class="text-center">
                      ${InstanceQuestionPoints({
                        instance_question,
                        assessment_question: instance_question.assessment_question,
                        component: 'manual',
                      })}
                      ${resLocals.authz_data.has_course_instance_permission_edit
                        ? EditQuestionPointsScoreButton({
                            field: 'manual_points',
                            instance_question,
                            assessment_question: instance_question.assessment_question,
                            urlPrefix: resLocals.urlPrefix,
                            csrfToken: resLocals.__csrf_token,
                          })
                        : ''}
                    </td>
                    <td class="text-center">
                      ${InstanceQuestionPoints({
                        instance_question,
                        assessment_question: instance_question.assessment_question,
                        component: 'total',
                      })}
                      ${resLocals.authz_data.has_course_instance_permission_edit
                        ? EditQuestionPointsScoreButton({
                            field: 'points',
                            instance_question,
                            assessment_question: instance_question.assessment_question,
                            urlPrefix: resLocals.urlPrefix,
                            csrfToken: resLocals.__csrf_token,
                          })
                        : ''}
                    </td>
                    <td class="text-center text-nowrap" style="padding-top: 0.65rem;">
                      ${Scorebar(instance_question.score_perc)}
                    </td>
                    <td style="width: 1em;">
                      ${resLocals.authz_data.has_course_instance_permission_edit
                        ? EditQuestionPointsScoreButton({
                            field: 'score_perc',
                            instance_question,
                            assessment_question: instance_question.assessment_question,
                            urlPrefix: resLocals.urlPrefix,
                            csrfToken: resLocals.__csrf_token,
                          })
                        : ''}
                    </td>
                    <td class="text-nowrap" style="width: 1em;">
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
                    <td class="text-end">
                      <div class="dropdown js-question-actions">
                        <button
                          type="button"
                          class="btn btn-secondary btn-xs dropdown-toggle"
                          data-bs-toggle="dropdown"
                          aria-haspopup="true"
                          aria-expanded="false"
                        >
                          Action <span class="caret"></span>
                        </button>
                        <div class="dropdown-menu dropdown-menu-end">
                          ${resLocals.authz_data.has_course_instance_permission_edit
                            ? html`
                                <button
                                  class="dropdown-item"
                                  data-bs-toggle="modal"
                                  data-bs-target="#resetQuestionVariantsModal"
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
      </div>

      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h2>
            ${resLocals.assessment_instance_label} Statistics:
            ${resLocals.instance_group
              ? html`${resLocals.instance_group.name} <i class="fas fa-users"></i>`
              : html`${resLocals.instance_user.name} (${resLocals.instance_user.uid})`}
          </h2>
        </div>
        <div class="table-responsive">
          <table
            id="instanceQuestionStatsTable"
            class="table table-sm table-hover tablesorter"
            aria-label="Assessment instance statistics"
          >
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
                      ${resLocals.authz_data.has_course_permission_preview
                        ? html`
                            <a href="${resLocals.urlPrefix}/question/${row.question_id}/"
                              >${row.qid}</a
                            >
                          `
                        : row.qid}
                    </td>
                    <td>${row.some_submission}</td>
                    <td>${row.some_perfect_submission}</td>
                    <td>${row.some_nonzero_submission}</td>
                    <td>${formatFloat(row.first_submission_score, 2)}</td>
                    <td>${formatFloat(row.last_submission_score, 2)}</td>
                    <td>${formatFloat(row.max_submission_score, 2)}</td>
                    <td>${formatFloat(row.average_submission_score, 2)}</td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
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
          <h2>
            ${resLocals.assessment_instance_label} Log:
            ${resLocals.instance_group
              ? html`${resLocals.instance_group.name} <i class="fas fa-users"></i>`
              : html`${resLocals.instance_user.name} (${resLocals.instance_user.uid})`}
          </h2>
        </div>
        <div class="card-body">
          <small>
            Click on a column header to sort. Shift-click on a second header to sub-sort. Download
            <a
              href="${resLocals.urlPrefix}/assessment_instance/${resLocals.assessment_instance
                .id}/${logCsvFilename}"
              >${logCsvFilename}</a
            >. Uploaded student files are not shown above or in the CSV file. Student files can be
            downloaded on the
            <a href="${resLocals.urlPrefix}/assessment/${resLocals.assessment.id}/downloads"
              >Downloads</a
            >
            tab.
          </small>
        </div>

        <div class="table-responsive">
          <table
            id="logTable"
            class="table table-sm table-hover tablesorter"
            aria-label="Assessment instance log"
          >
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
                    <td>${row.auth_user_uid ?? html`&mdash;`}</td>
                    ${resLocals.instance_user
                      ? row.client_fingerprint && row.client_fingerprint_number !== null
                        ? html`
                            <td>
                              <button
                                type="button"
                                class="btn btn-xs color-${FINGERPRINT_COLORS[
                                  row.client_fingerprint_number % 6
                                ]}"
                                id="fingerprintPopover${row.client_fingerprint?.id}-${index}"
                                data-bs-toggle="popover"
                                data-bs-container="body"
                                data-bs-html="true"
                                data-bs-placement="auto"
                                data-bs-title="Fingerprint ${row.client_fingerprint_number}"
                                data-bs-custom-class="popover-wide"
                                data-bs-content="${escapeHtml(
                                  FingerprintContent({ fingerprint: row.client_fingerprint }),
                                )}"
                              >
                                ${row.client_fingerprint_number}
                              </button>
                            </td>
                          `
                        : html`<td>&mdash;</td>`
                      : ''}
                    <td><span class="badge color-${row.event_color}">${row.event_name}</span></td>
                    <td>
                      ${run(() => {
                        if (!row.qid) return '';
                        const text = `I-${row.instructor_question_number}. ${row.qid}`;
                        if (!resLocals.authz_data.has_course_permission_preview) return text;
                        return html`
                          <a href="${resLocals.urlPrefix}/question/${row.question_id}/">${text}</a>
                        `;
                      })}
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
                          : html`S-${row.student_question_number}`
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
        </div>
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
            >. Uploaded student files are not shown above or in the CSV file. Student files can be
            downloaded on the
            <a href="${resLocals.urlPrefix}/assessment/${resLocals.assessment.id}/downloads"
              >Downloads</a
            >
            tab.
          </small>
        </div>
      </div>
    `,
  });
}

function FingerprintContent({ fingerprint }: { fingerprint: ClientFingerprint }) {
  const { browser, device, os } = UAParser(fingerprint.user_agent);
  return html`
    <div>
      IP Address:
      <a href="https://client.rdap.org/?type=ip&object=${fingerprint.ip_address}" target="_blank">
        ${fingerprint.ip_address}
      </a>
    </div>
    <div>Session ID: ${fingerprint.user_session_id}</div>
    <div>User Agent:</div>
    <ul>
      ${browser?.name ? html`<li>Browser: ${browser.name} ${browser.version ?? ''}</li>` : ''}
      ${device?.type ? html`<li>Device Type: ${device.type}</li>` : ''}
      ${device?.vendor ? html`<li>Device: ${device.vendor} ${device.model ?? ''}</li>` : ''}
      ${os?.name ? html`<li>OS: ${os.name} ${os.version ?? ''}</li>` : ''}
      <li>Raw: <code>${fingerprint.user_agent}</code></li>
    </ul>
  `;
}

function EditTotalPointsForm({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <form name="edit-total-points-form" method="POST">
      <input type="hidden" name="__action" value="edit_total_points" />
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input
        type="hidden"
        name="assessment_instance_id"
        value="${resLocals.assessment_instance.id}"
      />
      <div class="mb-3">
        <div class="input-group">
          <input
            type="text"
            class="form-control"
            name="points"
            value="${resLocals.assessment_instance.points}"
            aria-label="Total points"
          />
          <span class="input-group-addon">/${resLocals.assessment_instance.max_points}</span>
        </div>
      </div>
      <p>
        <small>
          This change will be overwritten if further questions are answered by the student.
        </small>
      </p>
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Change</button>
      </div>
    </form>
  `;
}

function EditTotalScorePercForm({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <form name="edit-total-score-perc-form" method="POST">
      <input type="hidden" name="__action" value="edit_total_score_perc" />
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input
        type="hidden"
        name="assessment_instance_id"
        value="${resLocals.assessment_instance.id}"
      />
      <div class="mb-3">
        <div class="input-group">
          <input
            type="text"
            class="form-control"
            name="score_perc"
            value="${resLocals.assessment_instance.score_perc}"
            aria-label="Total score percentage"
          />
          <span class="input-group-addon">%</span>
        </div>
      </div>
      <p>
        <small>
          This change will be overwritten if further questions are answered by the student.
        </small>
      </p>
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
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
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-danger">Reset question variants</button>
    `,
  });
}
