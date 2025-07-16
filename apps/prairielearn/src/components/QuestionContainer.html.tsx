import { EncodedData } from '@prairielearn/browser-utils';
import { escapeHtml, html, unsafeHtml } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { config } from '../lib/config.js';
import { type CopyTarget } from '../lib/copy-content.js';
import type {
  AssessmentQuestion,
  CourseInstance,
  GroupConfig,
  InstanceQuestion,
  Issue,
  Question,
  User,
  Variant,
} from '../lib/db-types.js';
import { type GroupInfo, getRoleNamesForUser } from '../lib/groups.js';
import { idsEqual } from '../lib/id.js';

import { AiGradingHtmlPreview } from './AiGradingHtmlPreview.html.js';
import { Modal } from './Modal.html.js';
import type { QuestionContext, QuestionRenderContext } from './QuestionContainer.types.js';
import { type SubmissionForRender, SubmissionPanel } from './SubmissionPanel.html.js';

// Only shows this many recent submissions by default
const MAX_TOP_RECENTS = 3;

export function QuestionContainer({
  resLocals,
  questionContext,
  questionRenderContext,
  showFooter = true,
  manualGradingPreviewUrl,
  aiGradingPreviewUrl,
  renderSubmissionSearchParams,
  questionCopyTargets = null,
}: {
  resLocals: Record<string, any>;
  questionContext: QuestionContext;
  questionRenderContext?: QuestionRenderContext;
  showFooter?: boolean;
  manualGradingPreviewUrl?: string;
  aiGradingPreviewUrl?: string;
  renderSubmissionSearchParams?: URLSearchParams;
  questionCopyTargets?: CopyTarget[] | null;
}) {
  const {
    question,
    issues,
    variant,
    variantToken,
    questionJsonBase64,
    course_instance,
    authz_data,
    is_administrator,
    showTrueAnswer,
    submissions,
    submissionHtmls,
    answerHtml,
  } = resLocals;

  return html`
    <div
      class="question-container mb-4"
      data-grading-method="${question.grading_method}"
      data-variant-id="${variant.id}"
      data-variant-token="${variantToken}"
    >
      ${question.type !== 'Freeform'
        ? html`<div hidden class="question-data">${questionJsonBase64}</div>`
        : ''}
      ${issues.map((issue) => IssuePanel({ issue, course_instance, authz_data, is_administrator }))}
      ${question.type === 'Freeform'
        ? html`
            <form class="question-form" name="question-form" method="POST" autocomplete="off">
              ${QuestionPanel({
                resLocals,
                questionContext,
                questionRenderContext,
                showFooter,
                manualGradingPreviewUrl,
                aiGradingPreviewUrl,
                questionCopyTargets,
              })}
            </form>
          `
        : QuestionPanel({ resLocals, showFooter, questionContext })}
      ${
        // The correct answer isn't used when performing AI grading, so we hide
        // it here to avoid confusion.
        questionRenderContext !== 'ai_grading'
          ? html`
              <div class="card mb-3 grading-block${showTrueAnswer ? '' : ' d-none'}">
                <div class="card-header bg-secondary text-white">
                  <h2>Correct answer</h2>
                </div>
                <div class="card-body overflow-x-auto answer-body">
                  ${showTrueAnswer ? unsafeHtml(answerHtml) : ''}
                </div>
              </div>
            `
          : ''
      }
      ${submissions.length > 0
        ? html`
            ${SubmissionList({
              resLocals,
              questionContext,
              questionRenderContext,
              submissions: submissions.slice(0, MAX_TOP_RECENTS),
              submissionHtmls,
              submissionCount: submissions.length,
              renderSubmissionSearchParams,
            })}
            ${submissions.length > MAX_TOP_RECENTS
              ? html`
                  <div class="mb-3 d-flex justify-content-center">
                    <button
                      class="btn btn-outline-secondary btn-sm show-hide-btn collapsed"
                      type="button"
                      data-bs-toggle="collapse"
                      data-bs-target="#more-submissions-collapser"
                      aria-expanded="false"
                      aria-controls="more-submissions-collapser"
                    >
                      Show/hide older submissions
                      <i class="fa fa-angle-up fa-fw ms-1 expand-icon"></i>
                    </button>
                  </div>

                  <div id="more-submissions-collapser" class="collapse">
                    ${SubmissionList({
                      resLocals,
                      questionContext,
                      questionRenderContext,
                      submissions: submissions.slice(MAX_TOP_RECENTS),
                      submissionHtmls: submissionHtmls.slice(MAX_TOP_RECENTS),
                      submissionCount: submissions.length,
                      renderSubmissionSearchParams,
                    })}
                  </div>
                `
              : ''}
          `
        : ''}
    </div>
    ${CopyQuestionModal({ resLocals, questionCopyTargets })}
  `;
}

export function IssuePanel({
  issue,
  course_instance,
  authz_data,
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
    <div class="card mb-3">
      <div class="card-header bg-danger text-white">
        ${issue.manually_reported ? 'Manually reported issue' : 'Issue'}
      </div>

      <table
        class="table table-sm table-hover two-column-description"
        aria-label="Issue information"
      >
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
                  <td style="white-space: pre-wrap;">${issue.student_message}</td>
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
                    <td style="white-space: pre-wrap;">${issue.student_message}</td>
                  </tr>
                  <tr>
                    <th>Instructor message:</th>
                    <td>${issue.instructor_message}</td>
                  </tr>
                `
              : html`
                  <tr>
                    <th>Message:</th>
                    <td style="white-space: pre-wrap;">${issue.student_message}</td>
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

      ${config.devMode || authz_data.has_course_permission_view
        ? html`
            <div class="card-body border border-bottom-0 border-start-0 border-end-0">
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
                  data-bs-toggle="collapse"
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
                        data-bs-toggle="collapse"
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

export function QuestionTitle({
  questionContext,
  question,
  questionNumber,
}: {
  questionContext: QuestionContext;
  question: Question;
  questionNumber: string;
}) {
  if (questionContext === 'student_homework') {
    return `${questionNumber}. ${question.title}`;
  } else if (questionContext === 'student_exam') {
    return `Question ${questionNumber}: ${question.title}`;
  } else {
    return question.title;
  }
}

interface QuestionFooterResLocals {
  showSaveButton: boolean;
  showGradeButton: boolean;
  disableSaveButton: boolean;
  disableGradeButton: boolean;
  showNewVariantButton: boolean;
  showTryAgainButton: boolean;
  hasAttemptsOtherVariants: boolean;
  variantAttemptsLeft: number;
  variantAttemptsTotal: number;
  newVariantUrl: string;
  tryAgainUrl: string;
  question: Question;
  variant: Variant;
  instance_question: (InstanceQuestion & { allow_grade_left_ms?: number }) | null;
  assessment_question: AssessmentQuestion | null;
  instance_question_info: Record<string, any>;
  authz_result: Record<string, any>;
  group_config: GroupConfig | null;
  group_info: GroupInfo | null;
  group_role_permissions: {
    can_view: boolean;
    can_submit: boolean;
  } | null;
  user: User;
  __csrf_token: string;
}

function QuestionFooter({
  resLocals,
  questionContext,
}: {
  resLocals: QuestionFooterResLocals;
  questionContext: QuestionContext;
}) {
  if (resLocals.question.type === 'Freeform') {
    return html`
      <div class="card-footer" id="question-panel-footer">
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        ${QuestionFooterContent({ resLocals, questionContext })}
      </div>
    `;
  } else {
    return html`
      <div class="card-footer" id="question-panel-footer">
        <form class="question-form" name="question-form" method="POST">
          <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
          ${QuestionFooterContent({ resLocals, questionContext })}
        </form>
      </div>
    `;
  }
}

export function QuestionFooterContent({
  resLocals,
  questionContext,
}: {
  resLocals: Omit<QuestionFooterResLocals, '__csrf_token'>;
  questionContext: QuestionContext;
}) {
  const {
    showSaveButton,
    showGradeButton,
    disableSaveButton,
    disableGradeButton,
    showNewVariantButton,
    showTryAgainButton,
    hasAttemptsOtherVariants,
    variantAttemptsLeft,
    variantAttemptsTotal,
    newVariantUrl,
    tryAgainUrl,
    question,
    variant,
    instance_question,
    assessment_question,
    instance_question_info,
    authz_result,
    group_config,
    group_info,
    group_role_permissions,
    user,
  } = resLocals;

  const contents = run(() => {
    if (questionContext === 'student_exam' && variantAttemptsLeft === 0) {
      return 'This question is complete and cannot be answered again.';
    }

    if (authz_result?.authorized_edit === false) {
      return html`<div class="alert alert-warning mt-2" role="alert">
        You are viewing the question instance of a different user and so are not authorized to save
        answers, to submit answers for grading, or to try a new variant of this same question.
      </div>`;
    }

    return html`
      <div class="row">
        <div class="col d-flex justify-content-between flex-wrap gap-2">
          <span class="d-flex align-items-center">
            ${showSaveButton
              ? html`
                  <button
                    type="submit"
                    class="btn btn-info question-save disable-on-submit order-2"
                    ${disableSaveButton ? 'disabled' : ''}
                    ${question.type === 'Freeform' ? html`name="__action" value="save"` : ''}
                  >
                    ${showGradeButton ? 'Save only' : 'Save'}
                  </button>
                `
              : ''}
            ${showGradeButton
              ? html`
                  <button
                    type="submit"
                    class="btn btn-primary question-grade disable-on-submit order-1 me-1"
                    ${disableGradeButton ? 'disabled' : ''}
                    ${question.type === 'Freeform' ? html`name="__action" value="grade"` : ''}
                  >
                    Save &amp; Grade
                    ${variantAttemptsTotal > 0
                      ? variantAttemptsLeft > 1
                        ? html`
                            <small class="fst-italic ms-2">
                              ${variantAttemptsLeft} attempts left
                            </small>
                          `
                        : variantAttemptsLeft === 1 && variantAttemptsTotal > 1
                          ? html`<small class="fst-italic ms-2">Last attempt</small>`
                          : variantAttemptsLeft === 1
                            ? html`<small class="fst-italic ms-2">Single attempt</small>`
                            : ''
                      : questionContext === 'student_homework'
                        ? html`<small class="fst-italic ms-2">Unlimited attempts</small>`
                        : ''}
                  </button>
                `
              : ''}
            ${group_config?.has_roles && !group_role_permissions?.can_submit && group_info
              ? html`
                  <button
                    type="button"
                    class="btn btn-xs btn-ghost me-1"
                    data-bs-toggle="popover"
                    data-bs-content="Your group role (${getRoleNamesForUser(group_info, user).join(
                      ', ',
                    )}) is not allowed to submit this question."
                    aria-label="Submission blocked"
                  >
                    <i class="fa fa-lock" aria-hidden="true"></i>
                  </button>
                `
              : ''}
          </span>
          <span class="d-flex">
            ${question.type === 'Freeform'
              ? html` <input type="hidden" name="__variant_id" value="${variant.id}" /> `
              : html`
                  <input type="hidden" name="postData" class="postData" />
                  <input type="hidden" name="__action" class="__action" />
                `}
            ${showNewVariantButton
              ? html`
                  <a href="${newVariantUrl}" class="btn btn-primary disable-on-click ms-1">
                    New variant
                  </a>
                `
              : showTryAgainButton
                ? html`
                    <a href="${tryAgainUrl}" class="btn btn-primary disable-on-click ms-1">
                      ${instance_question_info.previous_variants?.some((variant) => variant.open)
                        ? 'Go to latest variant'
                        : 'Try a new variant'}
                    </a>
                  `
                : hasAttemptsOtherVariants
                  ? html`
                      <small class="fst-italic align-self-center">
                        Additional attempts available with new variants
                      </small>
                      <button
                        type="button"
                        class="btn btn-xs btn-ghost align-self-center ms-1"
                        data-bs-toggle="popover"
                        data-bs-container="body"
                        data-bs-html="true"
                        data-bs-title="Explanation of new variants"
                        data-bs-content="${escapeHtml(
                          NewVariantInfo({ variantAttemptsLeft, variantAttemptsTotal }),
                        )}"
                        data-bs-placement="auto"
                      >
                        <i class="fa fa-question-circle" aria-hidden="true"></i>
                      </button>
                    `
                  : ''}
            ${AvailablePointsNotes({ questionContext, instance_question, assessment_question })}
          </span>
        </div>
      </div>
      ${SubmitRateFooter({
        questionContext,
        showGradeButton,
        disableGradeButton,
        assessment_question,
        allowGradeLeftMs: instance_question?.allow_grade_left_ms ?? 0,
      })}
    `;
  });

  return html`<div id="question-panel-footer-content">${contents}</div>`;
}

function SubmitRateFooter({
  questionContext,
  showGradeButton,
  disableGradeButton,
  assessment_question,
  allowGradeLeftMs,
}: {
  questionContext: QuestionContext;
  showGradeButton: boolean;
  disableGradeButton: boolean;
  assessment_question: AssessmentQuestion | null;
  allowGradeLeftMs: number;
}) {
  if (!showGradeButton || !assessment_question?.grade_rate_minutes) return '';
  const popoverContent = html`
    <p>
      Once you have clicked <strong>Save &amp; Grade</strong>, you will need to wait
      ${assessment_question.grade_rate_minutes}
      ${assessment_question.grade_rate_minutes > 1 ? 'minutes' : 'minute'} before you can grade
      again.
    </p>
    <p>
      You can still save your answer as frequently as you like.
      ${questionContext === 'student_exam'
        ? 'If your assessment ends before your last saved answer is graded, it will be automatically graded for you.'
        : ''}
    </p>
  `;
  return html`
    <div class="row">
      <div class="col d-flex justify-content-between">
        <span class="d-flex">
          ${disableGradeButton
            ? html`
                <small class="fst-italic ms-2 mt-1 submission-suspended-msg">
                  Grading possible in <span id="submission-suspended-display"></span>
                  <div id="submission-suspended-progress" class="border border-info"></div>
                </small>
                ${EncodedData(
                  {
                    serverTimeLimitMS: assessment_question.grade_rate_minutes * 60 * 1000,
                    serverRemainingMS: allowGradeLeftMs,
                  },
                  'submission-suspended-data',
                )}
              `
            : ''}
        </span>
        <span class="d-flex align-self-center">
          <small class="fst-italic">
            Can only be graded once every ${assessment_question.grade_rate_minutes}
            ${assessment_question.grade_rate_minutes > 1 ? 'minutes' : 'minute'}
          </small>
          <button
            type="button"
            class="btn btn-xs btn-ghost"
            data-bs-toggle="popover"
            data-bs-container="body"
            data-bs-html="true"
            data-bs-title="Explanation of grading rate limits"
            data-bs-content="${escapeHtml(popoverContent)}"
            data-bs-placement="auto"
          >
            <i class="fa fa-question-circle" aria-hidden="true"></i>
          </button>
        </span>
      </div>
    </div>
  `;
}

function NewVariantInfo({
  variantAttemptsLeft,
  variantAttemptsTotal,
}: {
  variantAttemptsLeft: number;
  variantAttemptsTotal: number;
}) {
  return html`
    <p>
      This question allows you to try multiple variants. Each of these variants is equivalent to the
      question you have been presented with, but may include changes in input values, parameters,
      and other settings. Although
      ${variantAttemptsLeft > 1
        ? `you have ${variantAttemptsLeft} attempts left`
        : variantAttemptsTotal > 1
          ? 'this is your last attempt'
          : 'you have a single attempt'}
      with the current variant, you are allowed to try an unlimited number of other variants.
    </p>
  `;
}

function AvailablePointsNotes({
  questionContext,
  instance_question,
  assessment_question,
}: {
  questionContext: QuestionContext;
  instance_question: InstanceQuestion | null;
  assessment_question: AssessmentQuestion | null;
}) {
  if (questionContext !== 'student_exam' || !instance_question?.points_list) return '';

  const roundedPoints = instance_question.points_list.map((p: number) => Math.round(p * 100) / 100);
  const maxManualPoints = assessment_question?.max_manual_points ?? 0;
  const additional = instance_question.points === 0 ? '' : 'additional';
  return html`
    <small class="fst-italic align-self-center text-end">
      ${roundedPoints[0] === 1
        ? `1 ${additional} point available for this attempt`
        : `${roundedPoints[0]} ${additional} points available for this attempt`}
      ${maxManualPoints > 0
        ? roundedPoints[0] > maxManualPoints
          ? html`&mdash; ${Math.round((roundedPoints[0] - maxManualPoints) * 100) / 100}
            auto-graded, ${maxManualPoints} manually graded`
          : html`&mdash; manually graded`
        : ''}
      ${roundedPoints.length === 2
        ? html`<br />(following attempt is worth: ${roundedPoints[1]})`
        : roundedPoints.length > 2
          ? html`<br />(following attempts are worth: ${roundedPoints.slice(1).join(', ')})`
          : ''}
    </small>
  `;
}

function QuestionPanel({
  resLocals,
  questionContext,
  questionRenderContext,
  showFooter,
  manualGradingPreviewUrl,
  aiGradingPreviewUrl,
  questionCopyTargets,
}: {
  resLocals: Record<string, any>;
  questionContext: QuestionContext;
  questionRenderContext?: QuestionRenderContext;
  showFooter: boolean;
  manualGradingPreviewUrl?: string;
  aiGradingPreviewUrl?: string;
  questionCopyTargets?: CopyTarget[] | null;
}) {
  const { question, questionHtml, course, instance_question_info } = resLocals;
  // Show even when questionCopyTargets is empty.
  // We'll show a CTA to request a course if the user isn't an editor of any course.

  const showCopyQuestionButton =
    question.type === 'Freeform' &&
    questionCopyTargets != null &&
    (course.template_course || (question.share_source_publicly && questionContext === 'public')) &&
    questionContext !== 'manual_grading';

  return html`
    <div class="card mb-3 question-block">
      <div class="card-header bg-primary text-white d-flex align-items-center">
        <h1>
          ${QuestionTitle({
            questionContext,
            question,
            questionNumber: instance_question_info?.question_number,
          })}
        </h1>
        <div class="ms-auto d-flex flex-row gap-1">
          <div class="btn-group">
            ${showCopyQuestionButton
              ? html`
                  <button
                    class="btn btn-sm btn-outline-light"
                    type="button"
                    aria-label="Copy question"
                    data-bs-toggle="modal"
                    data-bs-target="#copyQuestionModal"
                  >
                    <i class="fa fa-fw fa-clone"></i>
                    <span class="d-none d-sm-inline">Copy question</span>
                  </button>
                `
              : ''}
            ${manualGradingPreviewUrl || aiGradingPreviewUrl
              ? html`
                  <div class="btn-group">
                    <button
                      class="btn btn-sm btn-outline-light dropdown-toggle"
                      type="button"
                      aria-expanded="false"
                      data-bs-toggle="dropdown"
                    >
                      View&hellip;
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end">
                      ${manualGradingPreviewUrl
                        ? html`
                            <li>
                              <a class="dropdown-item" href="${manualGradingPreviewUrl}">
                                Manual grading view
                              </a>
                            </li>
                          `
                        : ''}
                      ${aiGradingPreviewUrl
                        ? html`
                            <li>
                              <a class="dropdown-item" href="${aiGradingPreviewUrl}">
                                AI grading view
                              </a>
                            </li>
                          `
                        : ''}
                    </ul>
                  </div>
                `
              : ''}
          </div>
        </div>
      </div>
      <div class="card-body overflow-x-auto question-body">
        ${questionRenderContext === 'ai_grading'
          ? AiGradingHtmlPreview(questionHtml)
          : unsafeHtml(questionHtml)}
      </div>
      ${showFooter
        ? QuestionFooter({
            // TODO: propagate more precise types upwards.
            resLocals: resLocals as any,
            questionContext,
          })
        : ''}
    </div>
  `;
}

function SubmissionList({
  resLocals,
  questionContext,
  questionRenderContext,
  submissions,
  submissionHtmls,
  submissionCount,
  renderSubmissionSearchParams,
}: {
  resLocals: Record<string, any>;
  questionContext: QuestionContext;
  questionRenderContext?: QuestionRenderContext;
  submissions: SubmissionForRender[];
  submissionHtmls: string[];
  submissionCount: number;
  renderSubmissionSearchParams?: URLSearchParams;
}) {
  return submissions.map((submission, idx) =>
    SubmissionPanel({
      questionContext,
      questionRenderContext,
      question: resLocals.question,
      assessment_question: resLocals.assessment_question,
      instance_question: resLocals.instance_question,
      variant_id: resLocals.variant.id,
      course_instance_id: resLocals.course_instance?.id,
      submission,
      submissionHtml: submissionHtmls[idx],
      submissionCount,
      rubric_data: resLocals.rubric_data,
      urlPrefix: resLocals.urlPrefix,
      renderSubmissionSearchParams,
    }),
  );
}

function CopyQuestionModal({
  questionCopyTargets,
  resLocals,
}: {
  questionCopyTargets: CopyTarget[] | null;
  resLocals: Record<string, any>;
}) {
  const { question, course } = resLocals;
  if (questionCopyTargets == null) return '';
  return Modal({
    id: 'copyQuestionModal',
    title: 'Copy question',
    formAction: questionCopyTargets[0]?.copy_url ?? '',
    formClass: 'js-copy-question-form',
    body:
      questionCopyTargets.length === 0
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
            <select class="form-select" name="to_course_id" required>
              ${questionCopyTargets.map(
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
        value="${questionCopyTargets[0]?.__csrf_token ?? ''}"
      />
      <input type="hidden" name="question_id" value="${question.id}" />
      <input type="hidden" name="course_id" value="${course.id}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      ${questionCopyTargets?.length > 0
        ? html`
            <button type="submit" name="__action" value="copy_question" class="btn btn-primary">
              Copy question
            </button>
          `
        : ''}
    `,
  });
}
