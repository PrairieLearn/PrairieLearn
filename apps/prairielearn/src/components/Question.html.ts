import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { CourseInstance, Issue, Submission, User } from '../lib/db-types.js';
import { idsEqual } from '../lib/id.js';

import { Modal } from './Modal.html.js';

// Only shows this many recent submissions by default
const MAX_TOP_RECENTS = 3;

type QuestionContext =
  | 'student_exam'
  | 'student_homework'
  | 'instructor'
  | 'public'
  | 'manual_grading';

export function QuestionComponent({
  resLocals,
  question_context,
}: {
  resLocals: Record<string, any>;
  question_context: QuestionContext;
}) {
  const {
    question,
    issues,
    variant,
    instance_question,
    variantToken,
    __csrf_token,
    questionJsonBase64,
    urlPrefix,
    course_instance,
    authz_data,
    authz_result,
    devMode,
    is_administrator,
    question_copy_targets,
    showTrueAnswer,
    showSubmissions,
    submissions,
    submissionHtmls,
    answerHtml,
    questionHtml,
    course,
  } = resLocals;

  // Show even when question_copy_targets is empty.
  // We'll show a CTA to request a course if the user isn't an editor of any course.
  const showCopyQuestionButton =
    question_copy_targets != null &&
    (course.template_course ||
      (question.shared_publicly_with_source && question_context === 'public')) &&
    question_context !== 'manual_grading';

  return html`
    <div
      id="question-0"
      class="question-container"
      data-grading-method="${question.grading_method}"
      data-variant-id="${variant.id}"
      data-question-id="${question.id}"
      data-instance-question-id="${instance_question?.id ?? ''}"
      data-variant-token="${variantToken}"
      data-url-prefix="${urlPrefix}"
      data-question-context="${question_context}"
      data-csrf-token="${__csrf_token}"
      data-authorized-edit="${authz_result?.authorized_edit !== false}"
    >
      ${question.type !== 'Freeform'
        ? html`<div hidden="true" class="question-data">${questionJsonBase64}</div>`
        : ''}
      ${issues.map((issue) =>
        IssueComponent({ issue, course_instance, authz_data, devMode, is_administrator }),
      )}
      ${question.type === 'Freeform'
        ? html`
            <form class="question-form" name="question-form" method="POST" autocomplete="off">
              <div class="card mb-4 question-block">
                <div class="card-header bg-primary text-white d-flex align-items-center">
                  ${renderEjs(
                    import.meta.url,
                    "<%- include('../pages/partials/questionTitle'); %>",
                    { ...resLocals, question_context },
                  )}
                  ${showCopyQuestionButton
                    ? html`
                        <button
                          class="btn btn-light btn-sm ml-auto"
                          type="button"
                          data-toggle="modal"
                          data-target="#copyQuestionModal"
                        >
                          <i class="fa fa-clone"></i>
                          Copy question
                        </button>
                      `
                    : ''}
                </div>
                <div class="card-body question-body">${unsafeHtml(questionHtml)}</div>
                ${renderEjs(
                  import.meta.url,
                  "<%- include('../pages/partials/questionFooter'); %>",
                  { ...resLocals, question_context },
                )}
              </div>
            </form>
          `
        : html`
            <div class="card mb-4">
              <div class="card-header bg-primary text-white">
                ${renderEjs(import.meta.url, "<%- include('../pages/partials/questionTitle'); %>", {
                  ...resLocals,
                  question_context,
                })}
              </div>
              <div class="card-body question-body">${unsafeHtml(questionHtml)}</div>
              ${renderEjs(import.meta.url, "<%- include('../pages/partials/questionFooter'); %>", {
                ...resLocals,
                question_context,
              })}
            </div>
          `}

      <div class="card mb-4 grading-block${showTrueAnswer ? '' : ' d-none'}">
        <div class="card-header bg-secondary text-white">Correct answer</div>
        <div class="card-body answer-body">${showTrueAnswer ? unsafeHtml(answerHtml) : ''}</div>
      </div>

      ${showSubmissions
        ? html`
            ${SubmissionList({
              resLocals,
              question_context,
              submissions: submissions.slice(0, MAX_TOP_RECENTS),
              submissionHtmls,
            })}
            ${submissions.length > MAX_TOP_RECENTS
              ? html`
                  <div class="mb-4 d-flex justify-content-center">
                    <button
                      class="show-hide-btn expand-icon-container btn btn-outline-secondary btn-sm collapsed"
                      type="button"
                      data-toggle="collapse"
                      data-target="#more-submissions-collapser"
                      aria-expanded="false"
                      aria-controls="more-submissions-collapser"
                    >
                      Show/hide older submissions
                      <i class="fa fa-angle-up fa-fw ml-1 expand-icon"></i>
                    </button>
                  </div>

                  <div id="more-submissions-collapser" class="collapse">
                    ${SubmissionList({
                      resLocals,
                      question_context,
                      submissions: submissions.slice(MAX_TOP_RECENTS),
                      submissionHtmls: submissionHtmls.slice(MAX_TOP_RECENTS),
                    })}
                  </div>
                `
              : ''}
          `
        : ''}
    </div>
    ${CopyQuestionModal({ resLocals })}
  `;
}

export function IssueComponent({
  issue,
  course_instance,
  authz_data,
  devMode,
  is_administrator,
}: {
  issue: Issue & {
    user_name: User['name'];
    user_email: User['email'];
    user_uid: User['uid'];
    formatted_date: string;
  };
  course_instance: CourseInstance;
  authz_data: Record<string, any>;
  devMode: boolean;
  is_administrator: boolean;
}) {
  // There are three situations in which the issue need not be anonymized:
  //
  //  1) The issue is not associated with a course instance. The only way
  //     for a user to generate an issue that is not associated with a course
  //     instance is if they are an instructor, so there are no student data
  //     to be protected in this case.
  //
  //  2) We are accessing this page through a course instance, the issue is
  //     associated with the same course instance, and the user has student
  //     data view access.
  //
  // Otherwise, all issues must be anonymized.
  const showUserName =
    !issue.course_instance_id ||
    (course_instance &&
      idsEqual(course_instance.id, issue.course_instance_id) &&
      authz_data.has_course_instance_permission_view);

  const msgBody = `Hello ${issue.user_name}\n\nRegarding the issue of:\n\n"${issue.student_message || '-'}"\n\nWe've...`;
  const mailtoLink = `mailto:${
    issue.user_email || issue.user_uid || '-'
  }?subject=Reported%20PrairieLearn%20Issue&body=${encodeURIComponent(msgBody)}`;

  return html`
    <div class="card mb-4">
      <div class="card-header bg-danger text-white">
        ${issue.manually_reported ? 'Manually reported issue' : 'Issue'}
      </div>

      <table class="table table-sm table-hover two-column-description">
        <tbody>
          ${showUserName
            ? html`
                <tr>
                  <th>User:</th>
                  <td>
                    ${issue.user_name || '-'} (<a href="${mailtoLink}">${issue.user_uid || '-'}</a>)
                  </td>
                </tr>
                <tr>
                  <th>Student message:</th>
                  <td>${issue.student_message}</td>
                </tr>
                <tr>
                  <th>Instructor message:</th>
                  <td>${issue.instructor_message}</td>
                </tr>
              `
            : authz_data.has_course_permission_preview
              ? html`
                  <tr>
                    <th>Student message:</th>
                    <td>${issue.student_message}</td>
                  </tr>
                  <tr>
                    <th>Instructor message:</th>
                    <td>${issue.instructor_message}</td>
                  </tr>
                `
              : html`
                  <tr>
                    <th>Message:</th>
                    <td>${issue.student_message}</td>
                  </tr>
                `}
          <tr>
            <th>ID:</th>
            <td>${issue.id}</td>
          </tr>
          <tr>
            <th>Date:</th>
            <td>${issue.formatted_date}</td>
          </tr>
        </tbody>
      </table>

      ${devMode || authz_data.has_course_permission_view
        ? html`
            <div class="card-body border border-bottom-0 border-left-0 border-right-0">
              ${issue.system_data?.courseErrData
                ? html`
                    <p><strong>Console log:</strong></p>
                    <pre class="bg-dark text-white rounded p-3">
${issue.system_data.courseErrData.outputBoth}</pre
                    >
                  `
                : ''}
              <p>
                <strong>Associated data:</strong>
                <button
                  type="button"
                  class="btn btn-xs btn-secondary"
                  data-toggle="collapse"
                  href="#issue-course-data-${issue.id}"
                  aria-expanded="false"
                  aria-controls="#issue-course-data-${issue.id}"
                >
                  Show/hide
                </button>
              </p>
              <div class="collapse" id="issue-course-data-${issue.id}">
                <pre class="bg-dark text-white rounded p-3">
${JSON.stringify(issue.course_data, null, '    ')}</pre
                >
              </div>
              ${is_administrator
                ? html`
                    <p>
                      <strong>System data:</strong>
                      <button
                        type="button"
                        class="btn btn-xs btn-secondary"
                        data-toggle="collapse"
                        href="#issue-system-data-${issue.id}"
                        aria-expanded="false"
                        aria-controls="#issue-system-data-${issue.id}"
                      >
                        Show/hide
                      </button>
                    </p>
                    <div class="collapse" id="issue-system-data-${issue.id}">
                      <pre class="bg-dark text-white rounded p-3">
${JSON.stringify(issue.system_data, null, '    ')}</pre
                      >
                    </div>
                  `
                : ''}
            </div>
          `
        : ''}
    </div>
  `;
}

function SubmissionList({
  resLocals,
  question_context,
  submissions,
  submissionHtmls,
}: {
  resLocals: Record<string, any>;
  question_context: QuestionContext;
  submissions: Submission[];
  submissionHtmls: string[];
}) {
  return submissions.map((submission, idx) =>
    renderEjs(import.meta.url, "<%- include('../pages/partials/submission'); %>", {
      ...resLocals,
      question_context,
      submission,
      submissionCount: submissions.length,
      submissionHtml: submissionHtmls[idx],
    }),
  );
}

function CopyQuestionModal({ resLocals }: { resLocals: Record<string, any> }) {
  const { question_copy_targets, question, course } = resLocals;
  if (question_copy_targets == null) return '';
  return Modal({
    id: 'copyQuestionModal',
    title: 'Copy question',
    formAction: question_copy_targets[0]?.copy_url ?? '',
    body:
      question_copy_targets.length === 0
        ? html`
            <p>
              You can't copy this question because you don't have editor permissions in any courses.
              <a href="/pl/request_course">Request a course</a> if you don't have one already.
              Otherwise, contact the owner of the course you expected to have access to.
            </p>
          `
        : html`
            <p>
              This question can be copied to any course for which you have editor permissions.
              Select one of your courses to copy this question.
            </p>
            <select class="form-control" name="to_course_id" required>
              ${question_copy_targets.map(
                (course, index) => html`
                  <option
                    value="${course.id}"
                    data-csrf-token="${course.__csrf_token}"
                    data-copy-url="${course.copy_url}"
                    ${index === 0 ? 'selected' : ''}
                  >
                    ${course.short_name}
                  </option>
                `,
              )}
            </select>
          `,
    footer: html`
      <input
        type="hidden"
        name="__csrf_token"
        value="${question_copy_targets[0]?.__csrf_token ?? ''}"
      />
      <input type="hidden" name="question_id" value="${question.id}" />
      <input type="hidden" name="course_id" value="${course.id}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      ${question_copy_targets?.length > 0
        ? html`
            <button type="submit" name="__action" value="copy_question" class="btn btn-primary">
              Copy question
            </button>
          `
        : ''}
    `,
  });
}
