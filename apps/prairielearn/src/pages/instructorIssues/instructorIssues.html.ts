import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { html, joinHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { Modal } from '../../components/Modal.html.js';
import { compiledStylesheetTag } from '../../lib/assets.js';
import { config } from '../../lib/config.js';
import {
  AssessmentSetSchema,
  CourseInstanceSchema,
  DateFromISOString,
  IdSchema,
  IssueSchema,
  QuestionSchema,
  UserSchema,
  VariantSchema,
} from '../../lib/db-types.js';

export const IssueRowSchema = IssueSchema.extend({
  now: DateFromISOString,
  course_instance_short_name: CourseInstanceSchema.shape.short_name.nullable(),
  course_instance_id: IdSchema.nullable(),
  display_timezone: CourseInstanceSchema.shape.display_timezone,
  assessment_id: IdSchema.nullable(),
  assessment: z
    .object({ label: z.string(), assessment_id: IdSchema, color: AssessmentSetSchema.shape.color })
    .nullable(),
  assessment_instance_id: IdSchema.nullable(),
  question_qid: QuestionSchema.shape.qid.nullable(),
  user_name: UserSchema.shape.name.nullable(),
  user_email: UserSchema.shape.email.nullable(),
  user_uid: UserSchema.shape.uid.nullable(),
  variant_seed: VariantSchema.shape.variant_seed.nullable(),
  issue_count: z.number(),
});
export type IssueRow = z.infer<typeof IssueRowSchema>;
type IssueComputedRow = IssueRow & {
  relativeDate: string;
  showUser: boolean;
  hideAssessmentLink: boolean;
};

const commonQueries = {
  allOpenQuery: 'is:open',
  allClosedQuery: 'is:closed',
  allManuallyReportedQuery: 'is:manually-reported',
  allAutomaticallyReportedQuery: 'is:automatically-reported',
};

const formattedCommonQueries = Object.fromEntries(
  Object.entries(commonQueries).map(([key, value]) => [key, `?q=${encodeURIComponent(value)}`]),
);

export function InstructorIssues({
  resLocals,
  rows,
  filterQuery,
  openFilteredIssuesCount,
  openCount,
  closedCount,
  shouldPaginate,
}: {
  resLocals: Record<string, any>;
  rows: IssueComputedRow[];
  filterQuery: string;
  openFilteredIssuesCount: number;
  openCount: number;
  closedCount: number;
  shouldPaginate: boolean;
}) {
  const { authz_data, __csrf_token, urlPrefix } = resLocals;
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
        ${compiledStylesheetTag('instructorIssues.css')}
        <script>
          $(() => {
            $('[data-toggle=tooltip]').tooltip();
          });
        </script>
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            import.meta.url,
            "<%- include('../partials/courseSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
          ${authz_data.has_course_permission_edit
            ? CloseMatchingIssuesModal({ openFilteredIssuesCount, rows, csrfToken: __csrf_token })
            : ''}
          ${FilterHelpModal()}

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <div class="d-flex flex-row align-items-center mb-2">
                <div class="d-flex flex-column">
                  Issues
                  <small>
                    <a href="${formattedCommonQueries.allOpenQuery}" class="mr-3 text-white">
                      <i class="fa fa-exclamation-circle"></i> ${openCount} open
                    </a>
                    <a href="${formattedCommonQueries.allClosedQuery}" class="text-white">
                      <i class="fa fa-check-circle"></i> ${closedCount} closed
                    </a>
                  </small>
                </div>
                ${authz_data.has_course_permission_edit && openFilteredIssuesCount > 0
                  ? html`
                      <button
                        class="btn btn-sm btn-danger ml-auto"
                        data-toggle="modal"
                        data-target="#closeMatchingIssuesModal"
                      >
                        <i class="fa fa-times" aria-hidden="true"></i> Close matching issues
                      </button>
                    `
                  : ''}
              </div>
              <form name="query-form" method="GET">
                <div class="input-group">
                  <div class="input-group-prepend">
                    <button
                      class="btn btn-med-light dropdown-toggle"
                      type="button"
                      data-toggle="dropdown"
                      aria-haspopup="true"
                      aria-expanded="false"
                    >
                      Filters
                    </button>
                    <div class="dropdown-menu">
                      <a class="dropdown-item" href="${formattedCommonQueries.allOpenQuery}"
                        >Open issues</a
                      >
                      <a class="dropdown-item" href="${formattedCommonQueries.allClosedQuery}"
                        >Closed issues</a
                      >
                      <a
                        class="dropdown-item"
                        href="${formattedCommonQueries.allManuallyReportedQuery}"
                        >Manually-reported issues</a
                      >
                      <a
                        class="dropdown-item"
                        href="${formattedCommonQueries.allAutomaticallyReportedQuery}"
                        >Automatically-reported issues</a
                      >
                    </div>
                  </div>
                  <input
                    type="text"
                    class="form-control"
                    name="q"
                    value="${filterQuery}"
                    aria-label="Search all issues"
                  />
                  <div class="input-group-append">
                    <a
                      class="btn btn-med-light"
                      href="${urlPrefix}/course_admin/issues?q="
                      title="Clear filters"
                    >
                      <i class="fa fa-times" aria-hidden="true"></i>
                    </a>
                    <button
                      class="btn btn-med-light"
                      type="button"
                      title="Show filter help"
                      data-toggle="modal"
                      data-target="#filterHelpModal"
                    >
                      <i class="fa fa-question-circle" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
              </form>
            </div>

            ${rows.length === 0
              ? html`
                  <div class="card-body">
                    <div class="text-center text-muted">No matching issues found</div>
                  </div>
                `
              : html`
                  <div class="list-group list-group-flush">
                    ${rows.map((row) => IssueRow({ row, urlPrefix, authz_data, resLocals }))}
                  </div>
                `}
            ${shouldPaginate
              ? html`
                  <div class="card-body">
                    ${renderEjs(import.meta.url, "<%- include('../partials/pager') %>", {
                      ...resLocals,
                      params: `q=${encodeURIComponent(filterQuery)}`,
                    })}
                  </div>
                `
              : ''}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function IssueRow({
  row,
  urlPrefix,
  authz_data,
  resLocals,
}: {
  row: IssueComputedRow;
  urlPrefix: string;
  authz_data: Record<string, any>;
  resLocals: Record<string, any>;
}) {
  const plainUrlPrefix = config.urlPrefix;
  const mailtoLink = `mailto:${
    row.user_email || row.user_uid || '-'
  }?subject=Reported%20PrairieLearn%20Issue&body=${encodeURIComponent(
    `Hello ${row.user_name},\n\nRegarding the issue of:\n\n"${row.student_message || '-'}"\n\nWe've...`,
  )}`;
  const questionPreviewUrl = `${urlPrefix}/question/${row.question_id}/`;
  const studentViewUrl = `${plainUrlPrefix}/course_instance/${row.course_instance_id}/instance_question/${row.instance_question_id}/?variant_id=${row.variant_id}`;
  const manualGradingUrl = `${plainUrlPrefix}/course_instance/${row.course_instance_id}/instructor/assessment/${row.assessment_id}/manual_grading/instance_question/${row.instance_question_id}`;
  const assessmentInstanceUrl = `${plainUrlPrefix}/course_instance/${row.course_instance_id}/instructor/assessment_instance/${row.assessment_instance_id}`;

  return html`
    <div class="list-group-item issue-list-item d-flex flex-row align-items-center">
      <div style="min-width: 0;">
        ${row.open
          ? html`<i class="fa fa-exclamation-circle text-danger issue-status-icon"></i>`
          : html`<i class="fa fa-check-circle text-success issue-status-icon"></i>`}
        <div class="d-block">
          <strong>${row.question_qid}</strong>
          ${!row.instance_question_id // Issue not associated to an instance question (originates from question preview)
            ? html`
                (<a href="${questionPreviewUrl}?variant_id=${row.variant_id}">instructor view</a>)
              `
            : row.showUser
              ? html`
                  (<a href="${questionPreviewUrl}?variant_id=${row.variant_id}">instructor view</a>,
                  <a href="${studentViewUrl}">student view</a>,
                  <a href="${manualGradingUrl}">manual grading</a>,
                  <a href="${assessmentInstanceUrl}"> assessment details</a>)
                `
              : html`
                  (<a href="${questionPreviewUrl}?variant_seed=${row.variant_seed}"
                    >instructor view</a
                  >)
                  <a
                    tabindex="0"
                    class="badge badge-warning badge-sm"
                    data-toggle="tooltip"
                    data-html="true"
                    title="This issue was raised in course instance <strong>${row.course_instance_short_name}</strong>. You do not have student data access for ${row.course_instance_short_name}, so you can't view some of the issue details. Student data access can be granted by a course owner on the Staff page."
                  >
                    No student data access
                  </a>
                `}
        </div>
        <p class="mb-0">${getFormattedMessage(row)}</p>
        <small class="text-muted mr-2">
          #${row.id} reported
          ${row.date
            ? html`
                <span title="${formatDate(row.date, row.display_timezone)}"
                  >${row.relativeDate}</span
                >
              `
            : ''}
          ${row.showUser
            ? html`
                ${row.manually_reported ? 'by' : 'for'} ${row.user_name || '-'} (<a
                  href="${mailtoLink}"
                  >${row.user_uid || '-'}</a
                >)
              `
            : ''}
        </small>
        ${row.manually_reported
          ? html`<span class="badge badge-info">Manually reported</span>`
          : html`<span class="badge badge-warning">Automatically reported</span>`}
        ${row.assessment
          ? html`
              ${renderEjs(import.meta.url, "<%- include('../partials/assessment') %>", {
                ...resLocals,
                assessment: {
                  ...row.assessment,
                  hide_link: row.hideAssessmentLink,
                  // Construct the URL prefix with the appropriate course instance
                  urlPrefix: `${plainUrlPrefix}/course_instance/${row.course_instance_id}/instructor`,
                },
              })}
            `
          : ''}
        ${row.course_instance_short_name
          ? html`<span class="badge badge-dark">${row.course_instance_short_name || '—'}</span>`
          : ''}
      </div>
      ${authz_data.has_course_permission_edit
        ? html`
            <div class="ml-auto pl-4">
              ${renderEjs(import.meta.url, "<%- include('../partials/issueActionButtons') %>", {
                ...resLocals,
                issue: row,
              })}
            </div>
          `
        : ''}
    </div>
  `;
}

function getFormattedMessage(row) {
  if (!row.student_message) return html`&mdash;`;

  const message = joinHtml(row.student_message.split(/\r?\n|\r/), html`<br />`);
  return row.manually_reported ? html`"${message}"` : message;
}

function CloseMatchingIssuesModal({
  openFilteredIssuesCount,
  rows,
  csrfToken,
}: {
  openFilteredIssuesCount: number;
  rows: IssueRow[];
  csrfToken: string;
}) {
  return Modal({
    id: 'closeMatchingIssuesModal',
    title: 'Close matching issues',
    body: html`
      <p>
        Are you sure you want to close the
        <strong>${openFilteredIssuesCount}</strong> open
        ${openFilteredIssuesCount === 1 ? 'issue' : 'issues'} visible on the current page?
      </p>
    `,
    footer: html`
      <div class="modal-footer">
        <input type="hidden" name="__action" value="close_matching" />
        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
        <input
          type="hidden"
          name="unsafe_issue_ids"
          value="${rows.map((row) => row.id).join(',')}"
        />
        <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
        <button type="submit" class="btn btn-danger">Close issues</button>
      </div>
    `,
  });
}

function FilterHelpModal() {
  return Modal({
    id: 'filterHelpModal',
    title: 'Filter help',
    body: html`
      <p>
        Issues can be filtered and searched in a variety of ways. Filtering is done with the
        following set of qualifiers.
      </p>
      <table class="table table-bordered">
        <thead>
          <th>Qualifier</th>
          <th>Explanation</th>
        </thead>
        <tbody>
          <tr>
            <td><code>is:open</code></td>
            <td>Shows all issues that are open</td>
          </tr>
          <tr>
            <td><code>is:closed</code></td>
            <td>Shows all issues that are closed</td>
          </tr>
          <tr>
            <td><code>is:manually-reported</code></td>
            <td>Shows all issues that were manually reported by a student</td>
          </tr>
          <tr>
            <td><code>is:automatically-reported</code></td>
            <td>Shows all issues that were automatically reported by PrairieLearn</td>
          </tr>
          <tr>
            <td>
              <code>qid:<em>QID</em></code>
            </td>
            <td>
              Shows all issues with a question ID like <code>QID</code>.
              <br />
              <strong>Example:</strong> <code>qid:graph</code> shows all issues associated with
              questions such as <code>graphConnectivity</code> and <code>speedTimeGraph</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>user:<em>USER</em></code>
            </td>
            <td>
              Shows all issues that were reported by a user ID like <code>USER</code>.
              <br />
              <strong>Example:</strong> <code>user:student@example.com</code> shows all issues that
              were reported by <code>student@example.com</code>.
            </td>
          </tr>
        </tbody>
      </table>
      <h4>Full-text search</h4>
      <p>
        You can also search the issue message by simply entering text. For example,
        <code>no picture</code> would return any issues that contain text like "no picture".
      </p>

      <h4>Qualifier negation</h4>
      <p>
        Any qualifier can be negated with the a hyphen (<code>-</code>). For example,
        <code>-is:manually-reported</code> would return all issues that were
        <strong>not</strong> manually reported.
      </p>

      <h4>Combining qualifiers</h4>
      <p>These can be combined to form complex searches. An example:</p>
      <code><pre>is:open qid:vector answer is wrong</pre></code>
      <p>
        This would return any open issues with a QID like <code>vector</code> whose message contains
        text like "answer is wrong".
      </p>
    `,
    footer: html`<button type="button" class="btn btn-primary" data-dismiss="modal">Close</button>`,
  });
}
