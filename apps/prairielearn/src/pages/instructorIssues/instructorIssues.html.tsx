import { formatDistance } from 'date-fns';
import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { IdSchema } from '@prairielearn/zod';

import { AssessmentBadge } from '../../components/AssessmentBadge.js';
import { Pager } from '../../components/Pager.js';
import {
  AssessmentSetSchema,
  CourseInstanceSchema,
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
type IssueRow = z.infer<typeof IssueRowSchema>;
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
  issues,
  filterQuery,
  openFilteredIssuesCount,
  openCount,
  closedCount,
  chosenPage,
  urlPrefix,
  csrfToken,
  hasCoursePermissionEdit,
}: {
  issues: IssueComputedRow[];
  filterQuery: string;
  openFilteredIssuesCount: number;
  openCount: number;
  closedCount: number;
  chosenPage: number;
  urlPrefix: string;
  csrfToken: string;
  hasCoursePermissionEdit: boolean;
}) {
  const issueCount = issues[0]?.issue_count ?? 0;

  return (
    <>
      {hasCoursePermissionEdit && (
        <CloseMatchingIssuesModal
          openFilteredIssuesCount={openFilteredIssuesCount}
          issues={issues}
          csrfToken={csrfToken}
        />
      )}
      <FilterHelpModal />

      <div className="card mb-4">
        <div className="card-header bg-primary text-white">
          <div className="d-flex flex-row align-items-center mb-2">
            <div className="d-flex flex-column">
              <h1 className="h6 fw-normal mb-0">Issues</h1>
              <small>
                <a href={formattedCommonQueries.allOpenQuery} className="me-3 text-white">
                  <i className="fa fa-exclamation-circle" /> {openCount} open
                </a>
                <a href={formattedCommonQueries.allClosedQuery} className="text-white">
                  <i className="fa fa-check-circle" /> {closedCount} closed
                </a>
              </small>
            </div>
            {hasCoursePermissionEdit && openFilteredIssuesCount > 0 && (
              <button
                className="btn btn-sm btn-danger ms-auto"
                data-bs-toggle="modal"
                data-bs-target="#closeMatchingIssuesModal"
              >
                <i className="fa fa-times" aria-hidden="true" /> Close matching issues
              </button>
            )}
          </div>
          <form method="GET">
            <div className="input-group">
              <button
                className="btn btn-med-light dropdown-toggle"
                type="button"
                data-bs-toggle="dropdown"
                aria-haspopup="true"
                aria-expanded="false"
              >
                Filters
              </button>
              <div className="dropdown-menu">
                <a className="dropdown-item" href={formattedCommonQueries.allOpenQuery}>
                  Open issues
                </a>
                <a className="dropdown-item" href={formattedCommonQueries.allClosedQuery}>
                  Closed issues
                </a>
                <a className="dropdown-item" href={formattedCommonQueries.allManuallyReportedQuery}>
                  Manually-reported issues
                </a>
                <a
                  className="dropdown-item"
                  href={formattedCommonQueries.allAutomaticallyReportedQuery}
                >
                  Automatically-reported issues
                </a>
              </div>
              <input
                type="text"
                className="form-control"
                name="q"
                defaultValue={filterQuery}
                aria-label="Search all issues"
              />
              <button
                className="btn btn-med-light"
                type="submit"
                data-bs-toggle="tooltip"
                data-bs-title="Search"
              >
                <i className="fa fa-search" aria-hidden="true" />
              </button>
              <a
                className="btn btn-med-light"
                href={`${urlPrefix}/course_admin/issues?q=`}
                data-bs-toggle="tooltip"
                data-bs-title="Clear filters"
              >
                <i className="fa fa-times" aria-hidden="true" />
              </a>
              <button
                className="btn btn-med-light"
                type="button"
                aria-label="Filter help"
                data-bs-toggle="modal tooltip"
                data-bs-target="#filterHelpModal"
                data-bs-title="Filter help"
              >
                <i className="fa fa-question-circle" aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>

        {issues.length === 0 ? (
          <div className="card-body">
            <div className="text-center text-muted">No matching issues found</div>
          </div>
        ) : (
          <div className="list-group list-group-flush">
            {issues.map((row) => (
              <IssueRow
                key={row.id}
                issue={row}
                urlPrefix={urlPrefix}
                hasCoursePermissionEdit={hasCoursePermissionEdit}
                csrfToken={csrfToken}
              />
            ))}
          </div>
        )}
        {issueCount > PAGE_SIZE && (
          <div className="card-body">
            <Pager
              extraQueryParams={`q=${encodeURIComponent(filterQuery)}`}
              chosenPage={chosenPage}
              count={issueCount}
              pageSize={PAGE_SIZE}
            />
          </div>
        )}
      </div>
    </>
  );
}

function IssueRow({
  issue,
  urlPrefix,
  hasCoursePermissionEdit,
  csrfToken,
}: {
  issue: IssueComputedRow;
  urlPrefix: string;
  hasCoursePermissionEdit: boolean;
  csrfToken: string;
}) {
  const mailtoLink = `mailto:${
    issue.user_email || issue.user_uid || '-'
  }?subject=Reported%20PrairieLearn%20Issue&body=${encodeURIComponent(
    `Hello ${issue.user_name},\n\nRegarding the issue of:\n\n"${issue.student_message || '-'}"\n\nWe've...`,
  )}`;
  const questionPreviewUrl = `${urlPrefix}/question/${issue.question_id}/`;
  const studentViewUrl = `/pl/course_instance/${issue.course_instance_id}/instance_question/${issue.instance_question_id}/?variant_id=${issue.variant_id}`;
  const manualGradingUrl = `/pl/course_instance/${issue.course_instance_id}/instructor/assessment/${issue.assessment_id}/manual_grading/instance_question/${issue.instance_question_id}`;
  const assessmentInstanceUrl = `/pl/course_instance/${issue.course_instance_id}/instructor/assessment_instance/${issue.assessment_instance_id}`;

  return (
    <div
      className="list-group-item issue-list-item d-flex flex-row align-items-center"
      data-testid="issue-list-item"
    >
      <div style={{ minWidth: 0 }}>
        {issue.open ? (
          <i
            className="fa fa-exclamation-circle text-danger issue-status-icon"
            data-testid="issue-status-open"
          />
        ) : (
          <i
            className="fa fa-check-circle text-success issue-status-icon"
            data-testid="issue-status-closed"
          />
        )}
        <div className="d-block">
          <strong>{issue.question_qid}</strong>
          {!issue.instance_question_id ? (
            // Issue not associated to an instance question (originates from question preview)
            <>
              {' '}
              (<a href={`${questionPreviewUrl}?variant_id=${issue.variant_id}`}>instructor view</a>)
            </>
          ) : issue.showUser ? (
            <>
              {' '}
              (<a href={`${questionPreviewUrl}?variant_id=${issue.variant_id}`}>
                instructor view
              </a>, <a href={studentViewUrl}>student view</a>,{' '}
              <a href={manualGradingUrl}>manual grading</a>,{' '}
              <a href={assessmentInstanceUrl}> assessment details</a>)
            </>
          ) : (
            <>
              {' '}
              (
              <a href={`${questionPreviewUrl}?variant_seed=${issue.variant_seed}`}>
                instructor view
              </a>
              ){' '}
              <button
                type="button"
                className="badge text-bg-warning badge-sm"
                data-bs-toggle="tooltip"
                data-bs-html="true"
                title={`This issue was raised in course instance <strong>${issue.course_instance_short_name}</strong>. You do not have student data access for ${issue.course_instance_short_name}, so you can't view some of the issue details. Student data access can be granted by a course owner on the Staff page.`}
              >
                No student data access
              </button>
            </>
          )}
        </div>
        <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
          {getFormattedMessage(issue)}
        </p>
        <small className="text-muted me-2">
          #{issue.id} reported{' '}
          {issue.date && (
            <span title={formatDate(issue.date, issue.display_timezone)}>
              {formatDistance(issue.date, Date.now(), { addSuffix: true })}
            </span>
          )}{' '}
          {issue.showUser && (
            <>
              {issue.manually_reported ? 'by' : 'for'} {issue.user_name || '-'} (
              <a href={mailtoLink}>{issue.user_uid || '-'}</a>)
            </>
          )}
        </small>
        {issue.manually_reported ? (
          <span className="badge text-bg-info">Manually reported</span>
        ) : (
          <span className="badge text-bg-warning">Automatically reported</span>
        )}
        {issue.assessment && issue.course_instance_id && (
          <AssessmentBadge
            courseInstanceId={issue.course_instance_id}
            hideLink={issue.hideAssessmentLink}
            assessment={issue.assessment}
          />
        )}
        {issue.course_instance_short_name && (
          <span className="badge text-bg-dark">{issue.course_instance_short_name}</span>
        )}
      </div>
      {hasCoursePermissionEdit && (
        <div className="ms-auto ps-4">
          <IssueActionButton issue={issue} csrfToken={csrfToken} />
        </div>
      )}
    </div>
  );
}

function getFormattedMessage(issue: Issue) {
  if (!issue.student_message) return '—';
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
  return (
    <form method="POST" autoComplete="off">
      <div
        className="modal fade"
        tabIndex={-1}
        role="dialog"
        id="closeMatchingIssuesModal"
        aria-labelledby="closeMatchingIssuesModal-title"
      >
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h4" id="closeMatchingIssuesModal-title">
                Close matching issues
              </h2>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to close the <strong>{openFilteredIssuesCount}</strong> open{' '}
                {openFilteredIssuesCount === 1 ? 'issue' : 'issues'} visible on the current page?
              </p>
            </div>
            <div className="modal-footer">
              <input type="hidden" name="__action" value="close_matching" />
              <input type="hidden" name="__csrf_token" value={csrfToken} />
              <input
                type="hidden"
                name="unsafe_issue_ids"
                value={issues.map((issue) => issue.id).join(',')}
              />
              <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">
                Cancel
              </button>
              <button type="submit" className="btn btn-danger">
                Close issues
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function FilterHelpModal() {
  return (
    <div
      className="modal fade"
      tabIndex={-1}
      role="dialog"
      id="filterHelpModal"
      aria-labelledby="filterHelpModal-title"
    >
      <div className="modal-dialog modal-lg" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h2 className="modal-title h4" id="filterHelpModal-title">
              Filter help
            </h2>
          </div>
          <div className="modal-body">
            <p>
              Issues can be filtered and searched in a variety of ways. Filtering is done with the
              following set of qualifiers.
            </p>
            <div className="table-responsive">
              <table className="table table-bordered" aria-label="Filtering qualifiers">
                <thead>
                  <tr>
                    <th>Qualifier</th>
                    <th>Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>is:open</code>
                    </td>
                    <td>Shows all issues that are open</td>
                  </tr>
                  <tr>
                    <td>
                      <code>is:closed</code>
                    </td>
                    <td>Shows all issues that are closed</td>
                  </tr>
                  <tr>
                    <td>
                      <code>is:manually-reported</code>
                    </td>
                    <td>Shows all issues that were manually reported by a student</td>
                  </tr>
                  <tr>
                    <td>
                      <code>is:automatically-reported</code>
                    </td>
                    <td>Shows all issues that were automatically reported by PrairieLearn</td>
                  </tr>
                  <tr>
                    <td>
                      <code>
                        assessment:<em>short_name</em>
                      </code>
                    </td>
                    <td>
                      Shows all issues with an assessment short name like <code>short_name</code>;
                      supports <code>*</code> as a wildcard. For example,{' '}
                      <code>assessment:exam/instantFeedback</code> shows all issues associated with
                      the assessment <code>exam/instantFeedback</code>, and{' '}
                      <code>assessment:exam/*</code> shows all issues associated with any assessment
                      that starts with <code>exam/</code>, such as <code>exam/instantFeedback</code>{' '}
                      and <code>exam/manualGrading</code>.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>
                        qid:<em>QID</em>
                      </code>
                    </td>
                    <td>
                      Shows all issues with a question ID like <code>QID</code>; supports{' '}
                      <code>*</code> as a wildcard. For example, <code>qid:graphConnectivity</code>{' '}
                      shows all issues associated with the question <code>graphConnectivity</code>,
                      and <code>qid:graph*</code> shows all issues associated with any question that
                      starts with <code>graph</code>, such as <code>graphConnectivity</code> and{' '}
                      <code>graphTheory</code>.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>
                        user:<em>UID</em>
                      </code>
                    </td>
                    <td>
                      Shows all issues that were reported by a user with a UID like <code>UID</code>
                      . For example, <code>user:student@example.com</code> shows all issues that
                      were reported by <code>student@example.com</code>.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h3 className="h4">Full-text search</h3>
            <p>
              You can also search the issue message by simply entering text. For example,{' '}
              <code>no picture</code> would return any issues that contain text like "no picture".
            </p>

            <h3 className="h4">Qualifier negation</h3>
            <p>
              Any qualifier can be negated with a hyphen (<code>-</code>). For example,{' '}
              <code>-is:manually-reported</code> would return all issues that were{' '}
              <strong>not</strong> manually reported.
            </p>

            <h3 className="h4">Combining qualifiers</h3>
            <p>These can be combined to form complex searches. An example:</p>
            <pre>
              <code>is:open qid:vector answer is wrong</code>
            </pre>
            <p>
              This would return any open issues with a QID like <code>vector</code> whose message
              contains text like "answer is wrong".
            </p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-primary" data-bs-dismiss="modal">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IssueActionButton({ issue, csrfToken }: { issue: Issue; csrfToken: string }) {
  return (
    <form method="POST" style={{ whiteSpace: 'nowrap' }}>
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="issue_id" value={issue.id} />
      <div className="btn-group btn-group-sm">
        {issue.open ? (
          <button
            className="btn btn-outline-secondary"
            name="__action"
            value="close"
            aria-label="Close issue"
            data-bs-toggle="tooltip"
            data-bs-placement="top"
            data-bs-title="Close issue"
          >
            <i className="fa fa-times" aria-hidden="true" />
          </button>
        ) : (
          <button
            className="btn btn-outline-secondary"
            name="__action"
            value="open"
            aria-label="Reopen issue"
            data-bs-toggle="tooltip"
            data-bs-placement="top"
            data-bs-title="Reopen issue"
          >
            <i className="fa fa-rotate-right" aria-hidden="true" />
          </button>
        )}
      </div>
    </form>
  );
}
