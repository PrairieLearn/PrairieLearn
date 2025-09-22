import { formatDistance } from 'date-fns';
import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { AssessmentBadgeHtml } from '../../components/AssessmentBadge.js';
import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { Pager } from '../../components/Pager.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { compiledStylesheetTag } from '../../lib/assets.js';
import { config } from '../../lib/config.js';
import {
  AssessmentSetSchema,
  CourseInstanceSchema,
  IdSchema,
  type Issue,
  IssueSchema,
  QuestionSchema,
  UserSchema,
  VariantSchema,
} from '../../lib/db-types.js';

export const PAGE_SIZE = 100;

export const IssueRowSchema = IssueSchema.extend({
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
  issues,
  filterQuery,
  openFilteredIssuesCount,
  openCount,
  closedCount,
  chosenPage,
}: {
  resLocals: Record<string, any>;
  issues: IssueComputedRow[];
  filterQuery: string;
  openFilteredIssuesCount: number;
  openCount: number;
  closedCount: number;
  chosenPage: number;
}) {
  const { authz_data, __csrf_token, urlPrefix, course } = resLocals;
  const issueCount = issues[0]?.issue_count ?? 0;

  return PageLayout({
    resLocals,
    pageTitle: 'Issues',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'issues',
    },
    options: {
      fullWidth: true,
    },
    headContent: compiledStylesheetTag('instructorIssues.css'),
    content: html`
      ${renderHtml(
        <CourseSyncErrorsAndWarnings
          authzData={authz_data}
          course={course}
          urlPrefix={urlPrefix}
        />,
      )}
      ${authz_data.has_course_permission_edit
        ? CloseMatchingIssuesModal({
            openFilteredIssuesCount,
            issues,
            csrfToken: __csrf_token,
          })
        : ''}
      ${FilterHelpModal()}

      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <div class="d-flex flex-row align-items-center mb-2">
            <div class="d-flex flex-column">
              <h1 class="h6 fw-normal mb-0">Issues</h1>
              <small>
                <a href="${formattedCommonQueries.allOpenQuery}" class="me-3 text-white">
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
                    class="btn btn-sm btn-danger ms-auto"
                    data-bs-toggle="modal"
                    data-bs-target="#closeMatchingIssuesModal"
                  >
                    <i class="fa fa-times" aria-hidden="true"></i> Close matching issues
                  </button>
                `
              : ''}
          </div>
          <form method="GET">
            <div class="input-group">
              <button
                class="btn btn-med-light dropdown-toggle"
                type="button"
                data-bs-toggle="dropdown"
                aria-haspopup="true"
                aria-expanded="false"
              >
                Filters
              </button>
              <div class="dropdown-menu">
                <a class="dropdown-item" href="${formattedCommonQueries.allOpenQuery}">
                  Open issues
                </a>
                <a class="dropdown-item" href="${formattedCommonQueries.allClosedQuery}">
                  Closed issues
                </a>
                <a class="dropdown-item" href="${formattedCommonQueries.allManuallyReportedQuery}">
                  Manually-reported issues
                </a>
                <a
                  class="dropdown-item"
                  href="${formattedCommonQueries.allAutomaticallyReportedQuery}"
                >
                  Automatically-reported issues
                </a>
              </div>
              <input
                type="text"
                class="form-control"
                name="q"
                value="${filterQuery}"
                aria-label="Search all issues"
              />
              <button
                class="btn btn-med-light"
                type="submit"
                data-bs-toggle="tooltip"
                data-bs-title="Search"
              >
                <i class="fa fa-search" aria-hidden="true"></i>
              </button>
              <a
                class="btn btn-med-light"
                href="${urlPrefix}/course_admin/issues?q="
                data-bs-toggle="tooltip"
                data-bs-title="Clear filters"
              >
                <i class="fa fa-times" aria-hidden="true"></i>
              </a>
              <button
                class="btn btn-med-light"
                type="button"
                data-bs-toggle="modal tooltip"
                data-bs-target="#filterHelpModal"
                data-bs-title="Filter help"
              >
                <i class="fa fa-question-circle" aria-hidden="true"></i>
              </button>
            </div>
          </form>
        </div>

        ${issues.length === 0
          ? html`
              <div class="card-body">
                <div class="text-center text-muted">No matching issues found</div>
              </div>
            `
          : html`
              <div class="list-group list-group-flush">
                ${issues.map((row) =>
                  IssueRow({ issue: row, urlPrefix, authz_data, csrfToken: __csrf_token }),
                )}
              </div>
            `}
        ${issueCount > PAGE_SIZE
          ? html`
              <div class="card-body">
                ${Pager({
                  extraQueryParams: `q=${encodeURIComponent(filterQuery)}`,
                  chosenPage,
                  count: issueCount,
                  pageSize: PAGE_SIZE,
                })}
              </div>
            `
          : ''}
      </div>
    `,
  });
}

function IssueRow({
  issue,
  urlPrefix,
  authz_data,
  csrfToken,
}: {
  issue: IssueComputedRow;
  urlPrefix: string;
  authz_data: Record<string, any>;
  csrfToken: string;
}) {
  const plainUrlPrefix = config.urlPrefix;
  const mailtoLink = `mailto:${
    issue.user_email || issue.user_uid || '-'
  }?subject=Reported%20PrairieLearn%20Issue&body=${encodeURIComponent(
    `Hello ${issue.user_name},\n\nRegarding the issue of:\n\n"${issue.student_message || '-'}"\n\nWe've...`,
  )}`;
  const questionPreviewUrl = `${urlPrefix}/question/${issue.question_id}/`;
  const studentViewUrl = `${plainUrlPrefix}/course_instance/${issue.course_instance_id}/instance_question/${issue.instance_question_id}/?variant_id=${issue.variant_id}`;
  const manualGradingUrl = `${plainUrlPrefix}/course_instance/${issue.course_instance_id}/instructor/assessment/${issue.assessment_id}/manual_grading/instance_question/${issue.instance_question_id}`;
  const assessmentInstanceUrl = `${plainUrlPrefix}/course_instance/${issue.course_instance_id}/instructor/assessment_instance/${issue.assessment_instance_id}`;

  return html`
    <div class="list-group-item issue-list-item d-flex flex-row align-items-center">
      <div style="min-width: 0;">
        ${issue.open
          ? html`<i class="fa fa-exclamation-circle text-danger issue-status-icon"></i>`
          : html`<i class="fa fa-check-circle text-success issue-status-icon"></i>`}
        <div class="d-block">
          <strong>${issue.question_qid}</strong>
          ${!issue.instance_question_id // Issue not associated to an instance question (originates from question preview)
            ? html`
                (<a href="${questionPreviewUrl}?variant_id=${issue.variant_id}">instructor view</a>)
              `
            : issue.showUser
              ? html`
                  (<a href="${questionPreviewUrl}?variant_id=${issue.variant_id}">instructor view</a
                  >, <a href="${studentViewUrl}">student view</a>,
                  <a href="${manualGradingUrl}">manual grading</a>,
                  <a href="${assessmentInstanceUrl}"> assessment details</a>)
                `
              : html`
                  (<a href="${questionPreviewUrl}?variant_seed=${issue.variant_seed}"
                    >instructor view</a
                  >)
                  <button
                    type="button"
                    class="badge text-bg-warning badge-sm"
                    data-bs-toggle="tooltip"
                    data-bs-html="true"
                    title="This issue was raised in course instance <strong>${issue.course_instance_short_name}</strong>. You do not have student data access for ${issue.course_instance_short_name}, so you can't view some of the issue details. Student data access can be granted by a course owner on the Staff page."
                  >
                    No student data access
                  </button>
                `}
        </div>
        <p class="mb-0" style="white-space: pre-wrap;">${getFormattedMessage(issue)}</p>
        <small class="text-muted me-2">
          #${issue.id} reported
          ${issue.date
            ? html`
                <span title="${formatDate(issue.date, issue.display_timezone)}">
                  ${formatDistance(issue.date, Date.now(), { addSuffix: true })}
                </span>
              `
            : ''}
          ${issue.showUser
            ? html`
                ${issue.manually_reported ? 'by' : 'for'} ${issue.user_name || '-'} (<a
                  href="${mailtoLink}"
                  >${issue.user_uid || '-'}</a
                >)
              `
            : ''}
        </small>
        ${issue.manually_reported
          ? html`<span class="badge text-bg-info">Manually reported</span>`
          : html`<span class="badge text-bg-warning">Automatically reported</span>`}
        ${issue.assessment && issue.course_instance_id
          ? AssessmentBadgeHtml({
              plainUrlPrefix,
              courseInstanceId: issue.course_instance_id,
              hideLink: issue.hideAssessmentLink,
              assessment: issue.assessment,
            })
          : ''}
        ${issue.course_instance_short_name
          ? html`<span class="badge text-bg-dark">${issue.course_instance_short_name}</span>`
          : ''}
      </div>
      ${authz_data.has_course_permission_edit
        ? html`<div class="ms-auto ps-4">${IssueActionButton({ issue, csrfToken })}</div>`
        : ''}
    </div>
  `;
}

function getFormattedMessage(issue: Issue) {
  if (!issue.student_message) return html`&mdash;`;
  if (issue.manually_reported) return `"${issue.student_message}"`;
  return issue.student_message;
}

function CloseMatchingIssuesModal({
  openFilteredIssuesCount,
  issues,
  csrfToken,
}: {
  openFilteredIssuesCount: number;
  issues: IssueRow[];
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
      <input type="hidden" name="__action" value="close_matching" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input
        type="hidden"
        name="unsafe_issue_ids"
        value="${issues.map((issue) => issue.id).join(',')}"
      />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-danger">Close issues</button>
    `,
  });
}

function FilterHelpModal() {
  return Modal({
    id: 'filterHelpModal',
    title: 'Filter help',
    form: false,
    body: html`
      <p>
        Issues can be filtered and searched in a variety of ways. Filtering is done with the
        following set of qualifiers.
      </p>
      <div class="table-responsive">
        <table class="table table-bordered" aria-label="Filtering qualifiers">
          <thead>
            <tr>
              <th>Qualifier</th>
              <th>Explanation</th>
            </tr>
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
                <code>assessment:<em>AID</em></code>
              </td>
              <td>
                Shows all issues with an assessment ID like <code>AID</code>; supports
                <code>*</code> as a wildcard. For example,
                <code>assessment:exam/instantFeedback</code> shows all issues associated with the
                assessment <code>exam/instantFeedback</code>, and
                <code>assessment:exam/*</code> shows all issues associated with any assessment that
                starts with <code>exam/</code>, such as <code>exam/instantFeedback</code> and
                <code>exam/manualGrading</code>.
              </td>
            </tr>
            <tr>
              <td>
                <code>qid:<em>QID</em></code>
              </td>
              <td>
                Shows all issues with a question ID like <code>QID</code>; supports
                <code>*</code> as a wildcard. For example, <code>qid:graphConnectivity</code> shows
                all issues associated with the question <code>graphConnectivity</code>, and
                <code>qid:graph*</code> shows all issues associated with any question that starts
                with <code>graph</code>, such as <code>graphConnectivity</code> and
                <code>graphTheory</code>.
              </td>
            </tr>
            <tr>
              <td>
                <code>user:<em>UID</em></code>
              </td>
              <td>
                Shows all issues that were reported by a user with a UID like <code>UID</code>. For
                example, <code>user:student@example.com</code> shows all issues that were reported
                by <code>student@example.com</code>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3 class="h4">Full-text search</h3>
      <p>
        You can also search the issue message by simply entering text. For example,
        <code>no picture</code> would return any issues that contain text like "no picture".
      </p>

      <h3 class="h4">Qualifier negation</h3>
      <p>
        Any qualifier can be negated with the a hyphen (<code>-</code>). For example,
        <code>-is:manually-reported</code> would return all issues that were
        <strong>not</strong> manually reported.
      </p>

      <h3 class="h4">Combining qualifiers</h3>
      <p>These can be combined to form complex searches. An example:</p>
      <pre><code>is:open qid:vector answer is wrong</code></pre>
      <p>
        This would return any open issues with a QID like <code>vector</code> whose message contains
        text like "answer is wrong".
      </p>
    `,
    footer: html`<button type="button" class="btn btn-primary" data-bs-dismiss="modal">
      Close
    </button>`,
  });
}

function IssueActionButton({ issue, csrfToken }: { issue: Issue; csrfToken: string }) {
  return html`
    <form method="POST" style="white-space: nowrap;">
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="issue_id" value="${issue.id}" />
      <div class="btn-group btn-group-sm">
        ${issue.open
          ? html`
              <button
                class="btn btn-outline-secondary"
                name="__action"
                value="close"
                aria-label="Close issue"
                data-bs-toggle="tooltip"
                data-bs-placement="top"
                data-bs-title="Close issue"
              >
                <i class="fa fa-times" aria-hidden="true"></i>
              </button>
            `
          : html`
              <button
                class="btn btn-outline-secondary"
                name="__action"
                value="open"
                aria-label="Reopen issue"
                data-bs-toggle="tooltip"
                data-bs-placement="top"
                data-bs-title="Reopen issue"
              >
                <i class="fa fa-rotate-right" aria-hidden="true"></i>
              </button>
            `}
      </div>
    </form>
  `;
}
