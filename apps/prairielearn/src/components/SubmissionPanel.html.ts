import { HtmlValue, html, unsafeHtml } from '@prairielearn/html';

import type {
  AssessmentQuestion,
  GradingJobStatus,
  InstanceQuestion,
  Question,
  Submission,
  User,
} from '../lib/db-types.js';
import type { RubricData, RubricGradingData } from '../lib/manualGrading.js';

import { Modal } from './Modal.html.js';
import type { QuestionContext } from './QuestionContainer.html.js';

export interface GradingJobStats {
  phases: number[];
  submitDuration: string;
  queueDuration: string;
  prepareDuration: string;
  runDuration: string;
  reportDuration: string;
  totalDuration: string;
}

export function SubmissionPanel({
  questionContext,
  question,
  assessment_question,
  instance_question,
  variant_id,
  course_instance_id,
  submission,
  submissionHtml,
  submissionCount,
  rubric_data,
  urlPrefix,
  plainUrlPrefix,
  expanded,
}: {
  resLocals: Record<string, any>;
  questionContext: QuestionContext;
  question: Question;
  assessment_question?: AssessmentQuestion;
  instance_question?: InstanceQuestion;
  variant_id: string;
  course_instance_id?: string | null;
  submission: Submission & {
    grading_job_id: string;
    grading_job_stats: GradingJobStats | null;
    grading_job_status: GradingJobStatus;
    rubric_grading?: RubricGradingData | null;
    feedback_manual_html: string;
    submission_number: number;
    formatted_date: string;
    user_uid?: User['uid'] | null;
  };
  submissionHtml?: string | null;
  submissionCount: number;
  rubric_data?: RubricData | null;
  urlPrefix: string;
  plainUrlPrefix: string;
  expanded?: boolean;
}) {
  const isLatestSubmission = submission.submission_number === submissionCount;
  expanded = expanded || isLatestSubmission;
  const renderUrlPrefix =
    questionContext === 'instructor' || questionContext === 'public'
      ? `${urlPrefix}/question/${question.id}/preview`
      : questionContext === 'manual_grading'
        ? `${urlPrefix}/assessment/${assessment_question?.assessment_id}/manual_grading/instance_question/${instance_question?.id}`
        : `${urlPrefix}/instance_question/${instance_question?.id}`;
  return html`
    <div
      data-testid="submission-with-feedback"
      data-grading-job-status="${submission.grading_job_status}"
      data-grading-job-id="${submission.grading_job_id}"
      id="submission-${submission.id}"
    >
      ${submission.feedback?.manual || submission.rubric_grading
        ? html`
            <div class="card mb-4 grading-block border-info">
              <div
                class="card-header bg-info text-white d-flex submission-header ${!expanded
                  ? ' collapsed'
                  : ''}"
                data-toggle="collapse"
                data-target="#submission-feedback-${submission.id}-body"
              >
                <div class="mr-auto">
                  Feedback from the Course Staff
                  ${submissionCount > 1
                    ? `(for submitted answer ${submission.submission_number})`
                    : ''}
                </div>
                <button type="button" class="expand-icon-container btn btn-outline-light btn-sm">
                  <i class="fa fa-angle-up fa-fw ml-1 expand-icon"></i>
                </button>
              </div>
              <div
                class="collapse ${expanded ? 'show' : ''}"
                id="submission-feedback-${submission.id}-body"
              >
                <div class="card-body">
                  ${submission.rubric_grading
                    ? html`
                        ${(rubric_data?.rubric_items || [])
                          .filter(
                            (item) =>
                              item.always_show_to_students ||
                              submission.rubric_grading?.rubric_items?.[item.id]?.score,
                          )
                          .map(
                            (item) => html`
                              <div>
                                <label class="w-100" data-testid="rubric-item-container-${item.id}">
                                  <input
                                    type="checkbox"
                                    disabled
                                    ${submission.rubric_grading?.rubric_items?.[item.id]?.score
                                      ? 'checked'
                                      : ''}
                                  />
                                  <span class="text-${item.points >= 0 ? 'success' : 'danger'}">
                                    <strong data-testid="rubric-item-points">
                                      [${(item.points >= 0 ? '+' : '') + item.points}]
                                    </strong>
                                  </span>
                                  <span
                                    class="d-inline-block"
                                    data-testid="rubric-item-description"
                                  >
                                    ${unsafeHtml(item.description_rendered ?? '')}
                                  </span>
                                  ${item.explanation
                                    ? html`
                                        <button
                                          type="button"
                                          class="btn btn-xs text-info"
                                          data-toggle="popover"
                                          data-content="${item.explanation_rendered}"
                                          data-html="true"
                                          data-testid="rubric-item-explanation"
                                        >
                                          <i class="fas fa-circle-info"></i>
                                          <span class="sr-only">Details</span>
                                        </button>
                                      `
                                    : ''}
                                </label>
                              </div>
                            `,
                          )}
                        ${submission.rubric_grading?.adjust_points
                          ? html`
                              <div class="mb-2">
                                <span class="text-muted"> Manual grading adjustment: </span>
                                <span
                                  class="text-${submission.rubric_grading?.adjust_points >= 0
                                    ? 'success'
                                    : 'danger'}"
                                >
                                  <strong data-testid="rubric-adjust-points">
                                    [${(submission.rubric_grading?.adjust_points >= 0 ? '+' : '') +
                                    submission.rubric_grading?.adjust_points}]
                                  </strong>
                                </span>
                              </div>
                            `
                          : ''}
                      `
                    : ''}
                  ${submission.feedback?.manual
                    ? html`
                        <div data-testid="feedback-body">
                          ${unsafeHtml(submission.feedback_manual_html)}
                        </div>
                      `
                    : ''}
                </div>
              </div>
            </div>
          `
        : ''}

      <div class="card mb-4" data-testid="submission-block">
        <div
          class="card-header bg-light text-dark d-flex align-items-center submission-header ${!expanded
            ? ' collapsed'
            : ''}"
          data-toggle="collapse"
          data-target="#submission-${submission.id}-body"
        >
          <div class="mr-2">
            <div>
              <span class="mr-2">
                Submitted answer ${submissionCount > 1 ? submission.submission_number : ''}
              </span>
            </div>
            <span class="small">
              ${!submission.user_uid
                ? `Submitted at ${submission.formatted_date} `
                : `${submission.user_uid} submitted at ${submission.formatted_date}`}
            </span>
          </div>
          <div class="mr-auto" data-testid="submission-status">
            ${SubmissionStatusBadge({
              submission,
              question,
              isLatestSubmission,
              assessment_question,
              instance_question,
            })}
          </div>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm mr-2"
            data-submission-id="${submission.id}"
          >
            <i class="fa fa-info-circle fa-fw"></i>
          </button>
          <button type="button" class="expand-icon-container btn btn-outline-secondary btn-sm">
            <i class="fa fa-angle-up fa-fw ml-1 expand-icon"></i>
          </button>
        </div>

        <div
          class="collapse js-submission-body ${expanded ? 'show' : ''} ${submissionHtml == null &&
          question.type === 'Freeform'
            ? 'render-pending'
            : ''}"
          data-submission-id="${submission.id}"
          id="submission-${submission.id}-body"
          ${submissionHtml === undefined && question.type === 'Freeform'
            ? html`
                data-dynamic-render-url="${renderUrlPrefix}/variant/${variant_id}/submission/${submission.id}"
              `
            : ''}
        >
          <div class="card-body submission-body">
            ${submissionHtml == null
              ? html`
                  <div class="spinner-border" role="status">
                    <span class="sr-only">Loading...</span>
                  </div>
                `
              : unsafeHtml(submissionHtml)}
          </div>
        </div>

        ${SubmissionInfoModal({
          urlPrefix,
          plainUrlPrefix,
          submission,
          question,
          course_instance_id,
        })}
      </div>

      <script>
        $(function () {
          $('button[data-submission-id="${submission.id}"]').on('click', function (e) {
            // Prevent this click from also expanding the submission
            $('#submissionInfoModal-${submission.id}').modal('show');
            e.stopPropagation();
          });
        });
      </script>
    </div>
  `;
}

function SubmissionStatusBadge({
  submission,
  question,
  isLatestSubmission,
  assessment_question,
  instance_question,
}: {
  submission: Submission;
  question: Question;
  isLatestSubmission: boolean;
  assessment_question?: AssessmentQuestion;
  instance_question?: InstanceQuestion;
}) {
  let manualGradingBadge: HtmlValue = null;
  let autoGradingBadge: HtmlValue = null;

  if (
    assessment_question && instance_question
      ? assessment_question.max_manual_points ||
        instance_question.manual_points ||
        instance_question.requires_manual_grading
      : question.grading_method === 'Manual'
  ) {
    // The manual grading status only applies to the latest submission
    if (isLatestSubmission) {
      if (!instance_question || instance_question.requires_manual_grading) {
        if (!submission.gradable && !assessment_question?.max_auto_points) {
          manualGradingBadge = html`
            <span class="badge badge-danger">invalid, not gradable</span><br />
          `;
        } else {
          manualGradingBadge = html`
            <span class="badge badge-secondary">manual grading: waiting for grading</span><br />
          `;
        }
      } else {
        const manualPoints = instance_question.manual_points ?? 0;
        const manual_percentage = assessment_question?.max_points
          ? Math.floor(
              (manualPoints * 100) /
                (assessment_question.max_manual_points || assessment_question.max_points),
            ) + '%'
          : (manualPoints > 0 ? '+' : '') +
            manualPoints +
            (Math.abs(manualPoints) > 1 ? ' pts' : ' pt');
        const badgeType =
          manualPoints <= 0
            ? 'badge-danger'
            : manualPoints >= (assessment_question?.max_manual_points ?? 0)
              ? 'badge-success'
              : 'badge-warning';
        manualGradingBadge = html`
          <span class="badge ${badgeType}">manual grading: ${manual_percentage}</span><br />
        `;
      }
    }
  }

  const autoStatusPrefix = manualGradingBadge ? 'auto-grading: ' : '';

  if (
    assessment_question
      ? assessment_question.max_auto_points || !assessment_question.max_manual_points
      : question.grading_method !== 'Manual'
  ) {
    if (submission.graded_at == null) {
      if (submission.grading_requested_at == null) {
        if (submission.gradable) {
          autoGradingBadge = html`
            <span class="badge badge-info">${autoStatusPrefix} saved, not graded</span>
          `;
        } else {
          autoGradingBadge = html`
            <span class="badge badge-danger">${autoStatusPrefix} invalid, not gradable</span>
          `;
        }
      } else if (question.grading_method === 'External') {
        if (submission.gradable) {
          autoGradingBadge = html`
            <span class="badge badge-secondary">
              ${autoStatusPrefix}
              <span id="grading-status-${submission.id}"></span>
            </span>
          `;
        } else {
          autoGradingBadge = html`
            <span class="badge badge-danger">${autoStatusPrefix} invalid, not gradable</span>
          `;
        }
      } else {
        autoGradingBadge = html`
          <span class="badge badge-secondary">${autoStatusPrefix} waiting for grading</span>
        `;
      }
    } else if (!submission.gradable) {
      // If an error ocurred during grading, there will be a `graded_at` timestamp but the submission will be marked ungradable.
      autoGradingBadge = html`
        <span class="badge badge-danger">${autoStatusPrefix} invalid, not gradable</span>
      `;
    } else if (submission.score === 1) {
      if (submission.v2_score != null && submission.v2_score < 1) {
        autoGradingBadge = html`
          <span class="badge badge-success">
            ${autoStatusPrefix} 100% (rounded up from ${Math.floor(submission.v2_score * 100)}%)
          </span>
        `;
      } else {
        autoGradingBadge = html`
          <span class="badge badge-success">${autoStatusPrefix} 100%</span>
        `;
      }
    } else if (submission.score != null && submission.score > 0) {
      autoGradingBadge = html`
        <span class="badge badge-warning">
          ${autoStatusPrefix} ${Math.floor(submission.score * 100)}%
        </span>
      `;
    } else if (submission.v2_score != null && submission.v2_score >= 0.01) {
      autoGradingBadge = html`
        <span class="badge badge-danger">
          ${autoStatusPrefix} 0% (rounded down from ${Math.floor(submission.v2_score * 100)}%)
        </span>
      `;
    } else {
      autoGradingBadge = html`<span class="badge badge-danger">${autoStatusPrefix} 0%</span>`;
    }
  }

  return html`${manualGradingBadge} ${autoGradingBadge}`;
}

function SubmissionInfoModal({
  urlPrefix,
  plainUrlPrefix,
  submission,
  question,
  course_instance_id,
}: {
  urlPrefix: string;
  plainUrlPrefix: string;
  submission: Submission & {
    grading_job_id: string;
    grading_job_stats: GradingJobStats | null;
    formatted_date: string;
  };
  question: Question;
  course_instance_id?: string | null;
}) {
  return Modal({
    id: `submissionInfoModal-${submission.id}`,
    title: 'Submission info',
    body: !submission.grading_job_stats
      ? html`<p>This submission has not been graded.</p>`
      : html`
          <table class="table table-sm table-borderless two-column-description mb-0">
            <tbody>
              <tr>
                <th>Submission time</th>
                <td>${submission.formatted_date}</td>
              </tr>
              ${question.grading_method === 'External'
                ? html`
                    <tr>
                      <th><span class="text-dark mr-2">&bull;</span>Submit duration</th>
                      <td>${submission.grading_job_stats.submitDuration}</td>
                    </tr>
                    <tr>
                      <th><span class="text-warning mr-2">&bull;</span>Queue duration</th>
                      <td>${submission.grading_job_stats.queueDuration}</td>
                    </tr>
                    <tr>
                      <th><span class="text-primary mr-2">&bull;</span>Prepare duration</th>
                      <td>${submission.grading_job_stats.prepareDuration}</td>
                    </tr>
                    <tr>
                      <th><span class="text-success mr-2">&bull;</span>Run duration</th>
                      <td>${submission.grading_job_stats.runDuration}</td>
                    </tr>
                    <tr>
                      <th><span class="text-danger mr-2">&bull;</span>Report duration</th>
                      <td>${submission.grading_job_stats.reportDuration}</td>
                    </tr>
                    <tr>
                      <th>Total duration</th>
                      <td>${submission.grading_job_stats.totalDuration}</td>
                    </tr>
                  `
                : ''}
            </tbody>
          </table>
          ${question.grading_method === 'External'
            ? html`
                <div class="d-flex mt-2 mb-2">
                  <span
                    style="display: inline-block; width: ${submission.grading_job_stats
                      .phases[0]}%; height: 10px;"
                    class="bg-dark m-0"
                  ></span>
                  <span
                    style="display: inline-block; width: ${submission.grading_job_stats
                      .phases[1]}%; height: 10px;"
                    class="bg-warning m-0"
                  ></span>
                  <span
                    style="display: inline-block; width: ${submission.grading_job_stats
                      .phases[2]}%; height: 10px;"
                    class="bg-primary m-0"
                  ></span>
                  <span
                    style="display: inline-block; width: ${submission.grading_job_stats
                      .phases[3]}%; height: 10px;"
                    class="bg-success m-0"
                  ></span>
                  <span
                    style="display: inline-block; width: ${submission.grading_job_stats
                      .phases[4]}%; height: 10px;"
                    class="bg-danger m-0"
                  ></span>
                </div>
                ${course_instance_id != null
                  ? html`
                      <a
                        class="btn btn-primary mt-2"
                        href="${plainUrlPrefix}/course_instance/${course_instance_id}/instructor/grading_job/${submission.grading_job_id}"
                        >View grading job ${submission.grading_job_id}</a
                      >
                    `
                  : html`
                      <a
                        class="btn btn-primary mt-2"
                        href="${urlPrefix}/grading_job/${submission.grading_job_id}"
                        >View grading job ${submission.grading_job_id}</a
                      >
                    `}
              `
            : ''}
        `,
    footer: html`
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
    `,
  });
}
