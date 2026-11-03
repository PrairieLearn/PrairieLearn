import * as url from 'node:url';

import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { type HtmlValue, html, unsafeHtml } from '@prairielearn/html';

import {
  type AssessmentQuestion,
  type Course,
  type CourseInstance,
  GradingJobSchema,
  type InstanceQuestion,
  type Question,
  type RubricGradingItem,
  SubmissionSchema,
} from '../lib/db-types.js';
import type {
  RenderedRubricItem,
  RubricData,
  RubricGradingData,
} from '../lib/manualGrading.types.js';
import { getSubmissionInfo } from '../lib/submission-info.js';
import { gradingJobStatus } from '../models/grading-job.js';

import { AiGradingHtmlPreview } from './AiGradingHtmlPreview.js';
import type { QuestionContext, QuestionRenderContext } from './QuestionContainer.types.js';
import { SubmissionInfoModal } from './SubmissionInfoModal.js';

const detailedSubmissionColumns = {
  feedback: true,
  format_errors: true,
  params: true,
  partial_scores: true,
  raw_submitted_answer: true,
  submitted_answer: true,
  true_answer: true,
} as const;

export const SubmissionBasicSchema = SubmissionSchema.omit(detailedSubmissionColumns).extend({
  grading_job: GradingJobSchema.nullable(),
  user_uid: z.string().nullable(),
});

export const SubmissionDetailedSchema = SubmissionSchema.pick(detailedSubmissionColumns);

export type SubmissionForRender = z.infer<typeof SubmissionBasicSchema> &
  Partial<z.infer<typeof SubmissionDetailedSchema>> & {
    feedback_manual_html?: string;
    submission_number: number;
    rubric_grading?: RubricGradingData | null;
  };

export function getSubmissionRenderUrl({
  questionContext,
  urlPrefix,
  question,
  assessment_question,
  instance_question,
  variant_id,
  submissionId,
  renderSubmissionSearchParams,
}: {
  questionContext: QuestionContext;
  urlPrefix: string;
  question: Question;
  assessment_question?: AssessmentQuestion | null;
  instance_question?: InstanceQuestion | null;
  variant_id: string;
  submissionId: string;
  renderSubmissionSearchParams?: URLSearchParams;
}): string {
  const renderUrlPrefix =
    questionContext === 'instructor' || questionContext === 'public'
      ? `${urlPrefix}/question/${question.id}/preview`
      : questionContext === 'manual_grading'
        ? `${urlPrefix}/assessment/${assessment_question?.assessment_id}/manual_grading/instance_question/${instance_question?.id}`
        : `${urlPrefix}/instance_question/${instance_question?.id}`;
  return url.format({
    pathname: `${renderUrlPrefix}/variant/${variant_id}/submission/${submissionId}`,
    search: renderSubmissionSearchParams?.toString(),
  });
}

export function SubmissionPanel({
  questionHostingUpdate = false,
  questionContext,
  questionRenderContext,
  question,
  assessment_question,
  instance_question,
  variant_id,
  course,
  course_instance,
  submission,
  submissionHtml,
  submissionCount,
  rubric_data,
  urlPrefix,
  expanded,
  renderSubmissionSearchParams,
}: {
  questionHostingUpdate?: boolean;
  questionContext: QuestionContext;
  questionRenderContext?: QuestionRenderContext;
  question: Question;
  assessment_question?: AssessmentQuestion | null;
  instance_question?: InstanceQuestion | null;
  variant_id: string;
  course_instance?: CourseInstance | null;
  course: Course;
  submission: SubmissionForRender;
  submissionHtml?: string | null;
  submissionCount: number;
  rubric_data?: RubricData | null;
  urlPrefix: string;
  expanded?: boolean;
  renderSubmissionSearchParams?: URLSearchParams;
}) {
  const formattedDate = formatDate(
    submission.date!,
    course_instance?.display_timezone || course.display_timezone,
  );
  const isLatestSubmission = submission.submission_number === submissionCount;
  expanded = expanded || isLatestSubmission;

  const renderUrl = getSubmissionRenderUrl({
    questionContext,
    urlPrefix,
    question,
    assessment_question,
    instance_question,
    variant_id,
    submissionId: submission.id,
    renderSubmissionSearchParams,
  });

  return html`
    <div
      data-testid="submission-with-feedback"
      data-grading-job-status="${gradingJobStatus(submission.grading_job)}"
      data-grading-job-id="${submission.grading_job?.id}"
      id="submission-${submission.id}"
    >
      ${
        submission.feedback?.manual || submission.rubric_grading
          ? html`
              <div class="card mb-4 grading-block border-info">
                <div
                  class="card-header bg-info d-flex align-items-center collapsible-card-header ${
                    !expanded ? ' collapsed' : ''
                  }"
                >
                  <div class="me-auto">
                    Feedback from the Course Staff
                    ${
                      submissionCount > 1
                        ? `(for submitted answer ${submission.submission_number})`
                        : ''
                    }
                  </div>
                  <button
                    type="button"
                    class="expand-icon-container btn btn-outline-dark btn-sm ${
                      !expanded ? 'collapsed' : ''
                    }"
                    data-bs-toggle="collapse"
                    data-bs-target="#submission-feedback-${submission.id}-body"
                    aria-expanded="${expanded ? 'true' : 'false'}"
                    aria-controls="submission-feedback-${submission.id}-body"
                    aria-label="Toggle feedback details"
                  >
                    <i class="fa fa-angle-up ms-1 expand-icon" aria-hidden="true"></i>
                  </button>
                </div>
                <div
                  class="collapse ${expanded ? 'show' : ''}"
                  id="submission-feedback-${submission.id}-body"
                >
                  <div class="card-body">
                    ${
                      submission.rubric_grading
                        ? html`
                            ${(rubric_data?.rubric_items || [])
                              .filter(
                                (item) =>
                                  item.rubric_item.always_show_to_students ||
                                  submission.rubric_grading?.rubric_items?.[item.rubric_item.id]
                                    ?.score,
                              )
                              .map((item) =>
                                RubricItem({
                                  item,
                                  item_grading:
                                    submission.rubric_grading?.rubric_items?.[
                                      item.rubric_item.id
                                    ] ?? null,
                                }),
                              )}
                            ${
                              submission.rubric_grading.adjust_points
                                ? html`
                                    <div class="mb-2">
                                      <span class="text-muted"> Manual grading adjustment: </span>
                                      <span
                                        class="text-${
                                          submission.rubric_grading.adjust_points >= 0
                                            ? 'success'
                                            : 'danger'
                                        }"
                                      >
                                        <strong data-testid="rubric-adjust-points">
                                          [${
                                            (submission.rubric_grading.adjust_points >= 0
                                              ? '+'
                                              : '') + submission.rubric_grading.adjust_points
                                          }]
                                        </strong>
                                      </span>
                                    </div>
                                  `
                                : ''
                            }
                          `
                        : ''
                    }
                    ${
                      submission.feedback?.manual
                        ? html`
                            <div data-testid="feedback-body">
                              ${unsafeHtml(submission.feedback_manual_html ?? '')}
                            </div>
                          `
                        : ''
                    }
                  </div>
                </div>
              </div>
            `
          : ''
      }

      <div class="card mb-4" data-testid="submission-block">
        <div
          class="card-header bg-light text-dark d-flex flex-wrap align-items-center collapsible-card-header"
        >
          <div class="me-2">
            <div>
              <span class="me-2 d-flex align-items-center">
                <h2 class="h6 fw-normal mb-0">
                  Submitted answer ${submissionCount > 1 ? submission.submission_number : ''}
                </h2>
              </span>
            </div>
            <span class="small">
              ${
                !submission.user_uid || questionContext === 'manual_grading'
                  ? `Submitted at ${formattedDate} `
                  : `${submission.user_uid} submitted at ${formattedDate}`
              }
            </span>
          </div>
          <div class="me-auto align-self-end" data-testid="submission-status">
            ${SubmissionStatusBadge({
              submission,
              question,
              isLatestSubmission,
              assessment_question,
              instance_question,
            })}
          </div>
          <div class="btn-group">
            <button
              type="button"
              class="btn btn-outline-dark btn-sm ms-2"
              data-submission-id="${submission.id}"
              ${
                questionHostingUpdate
                  ? html`data-question-dialog="submission-info"`
                  : html`data-bs-toggle="modal"
                    data-bs-target="#submissionInfoModal-${submission.id}"`
              }
              aria-label="Submission info"
            >
              <i class="fa fa-info-circle"></i>
            </button>
            <button
              type="button"
              class="expand-icon-container btn btn-outline-dark btn-sm text-nowrap ${
                !expanded ? 'collapsed' : ''
              }"
              data-bs-toggle="collapse"
              data-bs-target="#submission-${submission.id}-body"
              aria-expanded="${expanded ? 'true' : 'false'}"
              aria-controls="submission-${submission.id}-body"
              aria-label="Toggle submission details"
            >
              <i class="fa fa-angle-up ms-1 expand-icon" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        <div
          class="collapse js-submission-body js-collapsible-card-body ${
            expanded ? 'show' : ''
          } ${submissionHtml == null && question.type === 'Freeform' ? 'render-pending' : ''}"
          data-submission-id="${submission.id}"
          id="submission-${submission.id}-body"
          ${question.type === 'Freeform' ? html`data-dynamic-render-url="${renderUrl}" ` : ''}
        >
          <div class="card-body overflow-x-auto submission-body">
            ${
              submissionHtml == null
                ? html`
                    <div class="spinner-border" role="status">
                      <span class="visually-hidden">Loading...</span>
                    </div>
                  `
                : questionRenderContext === 'ai_grading'
                  ? AiGradingHtmlPreview(submissionHtml)
                  : unsafeHtml(submissionHtml)
            }
          </div>
        </div>

        ${
          questionHostingUpdate
            ? ''
            : SubmissionInfoModal(
                getSubmissionInfo({
                  submission,
                  courseId: question.course_id,
                  courseInstanceId: course_instance?.id,
                  timezone: course_instance?.display_timezone || course.display_timezone,
                }),
              )
        }
      </div>
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
  submission: SubmissionForRender;
  question: Question;
  isLatestSubmission: boolean;
  assessment_question?: AssessmentQuestion | null;
  instance_question?: InstanceQuestion | null;
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
            <span class="badge text-bg-danger">invalid, not gradable</span><br />
          `;
        } else {
          manualGradingBadge = html`
            <span class="badge text-bg-secondary">manual grading: waiting for grading</span><br />
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
            ? 'text-bg-danger'
            : manualPoints >= (assessment_question?.max_manual_points ?? 0)
              ? 'text-bg-success'
              : 'text-bg-warning';
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
            <span class="badge text-bg-info">${autoStatusPrefix} saved, not graded</span>
          `;
        } else {
          autoGradingBadge = html`
            <span class="badge text-bg-danger">${autoStatusPrefix} invalid, not gradable</span>
          `;
        }
      } else if (question.grading_method === 'External') {
        if (submission.gradable) {
          // The external grading status ("Grading requested", "in progress",
          // "Graded!") is updated live over the socket; announce it.
          autoGradingBadge = html`
            <span class="badge text-bg-secondary" role="status">
              ${autoStatusPrefix}
              <span id="grading-status-${submission.id}"></span>
            </span>
          `;
        } else {
          autoGradingBadge = html`
            <span class="badge text-bg-danger">${autoStatusPrefix} invalid, not gradable</span>
          `;
        }
      } else {
        autoGradingBadge = html`
          <span class="badge text-bg-secondary">${autoStatusPrefix} waiting for grading</span>
        `;
      }
    } else if (!submission.gradable) {
      // If an error ocurred during grading, there will be a `graded_at` timestamp but the submission will be marked ungradable.
      autoGradingBadge = html`
        <span class="badge text-bg-danger">${autoStatusPrefix} invalid, not gradable</span>
      `;
    } else if (submission.score === 1) {
      if (submission.v2_score != null && submission.v2_score < 1) {
        autoGradingBadge = html`
          <span class="badge text-bg-success">
            ${autoStatusPrefix} 100% (rounded up from ${Math.floor(submission.v2_score * 100)}%)
          </span>
        `;
      } else {
        autoGradingBadge = html`
          <span class="badge text-bg-success">${autoStatusPrefix} 100%</span>
        `;
      }
    } else if (submission.score != null && submission.score > 0) {
      autoGradingBadge = html`
        <span class="badge text-bg-warning">
          ${autoStatusPrefix} ${Math.floor(submission.score * 100)}%
        </span>
      `;
    } else if (submission.v2_score != null && submission.v2_score >= 0.01) {
      autoGradingBadge = html`
        <span class="badge text-bg-danger">
          ${autoStatusPrefix} 0% (rounded down from ${Math.floor(submission.v2_score * 100)}%)
        </span>
      `;
    } else {
      autoGradingBadge = html`<span class="badge text-bg-danger">${autoStatusPrefix} 0%</span>`;
    }
  }

  return html`${manualGradingBadge} ${autoGradingBadge}`;
}

function RubricItem({
  item,
  item_grading,
}: {
  item: RenderedRubricItem;
  item_grading: RubricGradingItem | undefined | null;
}) {
  return html`
    <div>
      <label class="w-100" data-testid="rubric-item-container-${item.rubric_item.id}">
        <input type="checkbox" disabled ${item_grading?.score ? 'checked' : ''} />
        <span class="text-${item.rubric_item.points >= 0 ? 'success' : 'danger'}">
          <strong data-testid="rubric-item-points">
            [${(item.rubric_item.points >= 0 ? '+' : '') + item.rubric_item.points}]
          </strong>
        </span>
        <span class="d-inline-block" data-testid="rubric-item-description">
          ${unsafeHtml(item.description_rendered ?? '')}
        </span>
        ${
          item.explanation_rendered
            ? html`
                <button
                  type="button"
                  class="btn btn-xs btn-ghost"
                  data-bs-toggle="popover"
                  data-bs-content="${item.explanation_rendered}"
                  data-bs-html="true"
                  data-testid="rubric-item-explanation"
                  aria-label="Details"
                >
                  <i class="fas fa-circle-info"></i>
                </button>
              `
            : ''
        }
      </label>
    </div>
  `;
}
