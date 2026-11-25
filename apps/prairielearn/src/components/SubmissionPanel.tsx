import * as url from 'node:url';

import { differenceInMilliseconds } from 'date-fns';
import { sum } from 'es-toolkit';
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
import { roundPoints } from '../lib/points.js';
import { type RubricTreeNode, buildRubricTree, leafItems } from '../lib/rubric-tree.js';
import { gradingJobStatus } from '../models/grading-job.js';

import { AiGradingHtmlPreview } from './AiGradingHtmlPreview.js';
import { Modal } from './Modal.js';
import type { QuestionContext, QuestionRenderContext } from './QuestionContainer.types.js';

const detailedSubmissionColumns = {
  feedback: true,
  format_errors: true,
  params: true,
  partial_scores: true,
  raw_submitted_answer: true,
  submitted_answer: true,
  true_answer: true,
} as const;

const SubmissionGradingJobSchema = GradingJobSchema.pick({
  id: true,
  grading_method: true,
  grading_requested_at: true,
  grading_submitted_at: true,
  grading_received_at: true,
  grading_started_at: true,
  grading_finished_at: true,
  graded_at: true,
  grading_request_canceled_at: true,
});
type SubmissionGradingJob = z.infer<typeof SubmissionGradingJobSchema>;

export const SubmissionBasicSchema = SubmissionSchema.omit(detailedSubmissionColumns).extend({
  grading_job: SubmissionGradingJobSchema.nullable(),
  user_uid: z.string().nullable(),
});

export const SubmissionDetailedSchema = SubmissionSchema.pick(detailedSubmissionColumns);

export type SubmissionForRender = z.infer<typeof SubmissionBasicSchema> &
  Partial<z.infer<typeof SubmissionDetailedSchema>> & {
    feedback_manual_html?: string;
    submission_number: number;
    rubric_grading?: RubricGradingData | null;
  };

export function SubmissionPanel({
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

  const renderUrlPrefix =
    questionContext === 'instructor' || questionContext === 'public'
      ? `${urlPrefix}/question/${question.id}/preview`
      : questionContext === 'manual_grading'
        ? `${urlPrefix}/assessment/${assessment_question?.assessment_id}/manual_grading/instance_question/${instance_question?.id}`
        : `${urlPrefix}/instance_question/${instance_question?.id}`;
  const renderUrl = url.format({
    pathname: `${renderUrlPrefix}/variant/${variant_id}/submission/${submission.id}`,
    search: renderSubmissionSearchParams?.toString(),
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
                            ${RubricItemList({
                              items: rubric_data?.rubric_items ?? [],
                              gradingItems: submission.rubric_grading.rubric_items ?? {},
                            })}
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
              data-bs-toggle="modal"
              data-bs-target="#submissionInfoModal-${submission.id}"
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

        ${SubmissionInfoModal({
          submission,
          question,
          assessment_question,
          formattedDate,
          course_id: question.course_id,
          course_instance_id: course_instance?.id,
        })}
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

  if (isAutograded({ question, assessment_question })) {
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

function isAutograded({
  question,
  assessment_question,
}: {
  question: Question;
  assessment_question?: AssessmentQuestion | null;
}) {
  return assessment_question
    ? !!assessment_question.max_auto_points || !assessment_question.max_manual_points
    : question.grading_method !== 'Manual';
}

function SubmissionInfoModal({
  submission,
  question,
  assessment_question,
  course_id,
  course_instance_id,
  formattedDate,
}: {
  submission: SubmissionForRender;
  question: Question;
  assessment_question?: AssessmentQuestion | null;
  course_id: string;
  course_instance_id?: string | null;
  formattedDate: string;
}) {
  const gradingJobStats = buildGradingJobStats(submission.grading_job);
  const gradingJobUrl =
    course_instance_id == null
      ? `/pl/course/${course_id}/grading_job/${submission.grading_job?.id}`
      : `/pl/course_instance/${course_instance_id}/instructor/grading_job/${
          submission.grading_job?.id
        }`;
  return Modal({
    id: `submissionInfoModal-${submission.id}`,
    title: 'Submission info',
    body: html`
      <table
        class="table table-sm table-borderless two-column-description mb-0"
        aria-label="Submission info"
      >
        <tbody>
          <tr>
            <th>Submission time</th>
            <td>${formattedDate}</td>
          </tr>
          ${
            submission.user_uid
              ? html`
                  <tr>
                    <th>Submitted by</th>
                    <td>${submission.user_uid}</td>
                  </tr>
                `
              : ''
          }
          ${
            gradingJobStats?.grading_method === 'External'
              ? html`
                  <tr>
                    <th><span class="text-dark me-2">&bull;</span>Submit duration</th>
                    <td>${gradingJobStats.submitDuration}</td>
                  </tr>
                  <tr>
                    <th><span class="text-warning me-2">&bull;</span>Queue duration</th>
                    <td>${gradingJobStats.queueDuration}</td>
                  </tr>
                  <tr>
                    <th><span class="text-primary me-2">&bull;</span>Prepare duration</th>
                    <td>${gradingJobStats.prepareDuration}</td>
                  </tr>
                  <tr>
                    <th><span class="text-success me-2">&bull;</span>Run duration</th>
                    <td>${gradingJobStats.runDuration}</td>
                  </tr>
                  <tr>
                    <th><span class="text-danger me-2">&bull;</span>Report duration</th>
                    <td>${gradingJobStats.reportDuration}</td>
                  </tr>
                  <tr>
                    <th>Total duration</th>
                    <td>${gradingJobStats.totalDuration}</td>
                  </tr>
                `
              : ''
          }
        </tbody>
      </table>
      ${
        gradingJobStats || !isAutograded({ question, assessment_question })
          ? ''
          : html`<p class="mt-2">This submission was not automatically graded.</p>`
      }
      ${
        gradingJobStats?.grading_method === 'External'
          ? html`
              <div class="d-flex mt-2 mb-2">
                <span
                  style="display: inline-block; width: ${gradingJobStats.phases[0]}%; height: 10px;"
                  class="bg-dark m-0"
                ></span>
                <span
                  style="display: inline-block; width: ${gradingJobStats.phases[1]}%; height: 10px;"
                  class="bg-warning m-0"
                ></span>
                <span
                  style="display: inline-block; width: ${gradingJobStats.phases[2]}%; height: 10px;"
                  class="bg-primary m-0"
                ></span>
                <span
                  style="display: inline-block; width: ${gradingJobStats.phases[3]}%; height: 10px;"
                  class="bg-success m-0"
                ></span>
                <span
                  style="display: inline-block; width: ${gradingJobStats.phases[4]}%; height: 10px;"
                  class="bg-danger m-0"
                ></span>
              </div>
              <a class="btn btn-primary mt-2" href="${gradingJobUrl}">
                View grading job ${submission.grading_job?.id}
              </a>
            `
          : ''
      }
    `,
    footer: html`
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
    `,
  });
}

/**
 * The rubric items shown with a submission's feedback. Students see items that
 * are always shown or that were selected for them. Groups are headings with
 * their items indented under them, and a group is shown only when something
 * inside it is.
 */
function RubricItemList({
  items,
  gradingItems,
}: {
  items: RenderedRubricItem[];
  gradingItems: Partial<Record<string, RubricGradingItem>>;
}): HtmlValue {
  const tree = buildRubricTree(items, {
    id: (item) => item.rubric_item.id,
    parentId: (item) => item.rubric_item.parent_id,
    isGroup: (item) => item.rubric_item.is_group,
  });
  const isShown = (item: RenderedRubricItem) =>
    item.rubric_item.always_show_to_students || !!gradingItems[item.rubric_item.id]?.score;

  const renderNode = (node: RubricTreeNode<RenderedRubricItem>): HtmlValue => {
    if (!node.isGroup) {
      return isShown(node.item)
        ? RubricItem({ item: node.item, item_grading: gradingItems[node.item.rubric_item.id] })
        : null;
    }
    const shownLeaves = leafItems(node).filter(isShown);
    if (shownLeaves.length === 0) return null;
    const selectedPoints = sum(
      shownLeaves.map(
        (leaf) => (gradingItems[leaf.rubric_item.id]?.score ?? 0) * leaf.rubric_item.points,
      ),
    );
    const anySelected = shownLeaves.some((leaf) => gradingItems[leaf.rubric_item.id]?.score);
    return html`
      <div class="mb-1" data-testid="rubric-group-${node.item.rubric_item.id}">
        <div class="fw-semibold">
          <span data-testid="rubric-group-description">
            ${unsafeHtml(node.item.description_rendered ?? '')}
          </span>
          ${
            anySelected
              ? html`
                  <span
                    class="text-${selectedPoints >= 0 ? 'success' : 'danger'}"
                    data-testid="rubric-group-points"
                  >
                    [${(selectedPoints >= 0 ? '+' : '') + roundPoints(selectedPoints)}]
                  </span>
                `
              : ''
          }
          ${RubricExplanationButton({ explanation: node.item.explanation_rendered })}
        </div>
        <div class="ms-2 ps-2 border-start">${node.children.map(renderNode)}</div>
      </div>
    `;
  };
  return tree.map(renderNode);
}

function RubricExplanationButton({ explanation }: { explanation: string | undefined }) {
  if (!explanation) return '';
  return html`
    <button
      type="button"
      class="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-content="${explanation}"
      data-bs-html="true"
      data-testid="rubric-item-explanation"
      aria-label="Details"
    >
      <i class="fas fa-circle-info"></i>
    </button>
  `;
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
        ${RubricExplanationButton({ explanation: item.explanation_rendered })}
      </label>
    </div>
  `;
}

function buildGradingJobStats(job: SubmissionGradingJob | null) {
  if (!job) return null;

  const durations: (number | null)[] = [];
  const formatDiff = (start: Date | null, end: Date | null, addToPhases = true) => {
    const duration = end == null || start == null ? null : differenceInMilliseconds(end, start);
    if (addToPhases) durations.push(duration);
    return duration == null ? '\u2212' : (duration / 1000).toFixed(3).replace(/\.?0+$/, '') + 's';
  };

  const stats = {
    submitDuration: formatDiff(job.grading_requested_at, job.grading_submitted_at),
    queueDuration: formatDiff(job.grading_submitted_at, job.grading_received_at),
    prepareDuration: formatDiff(job.grading_received_at, job.grading_started_at),
    runDuration: formatDiff(job.grading_started_at, job.grading_finished_at),
    reportDuration: formatDiff(job.grading_finished_at, job.graded_at),
    totalDuration: formatDiff(job.grading_requested_at, job.graded_at, false),
  };
  const totalDuration = durations.reduce((a, b) => (a ?? 0) + (b ?? 0), 0) || 1;

  return {
    ...stats,
    grading_method: job.grading_method,
    phases: durations.map(
      // Round down to avoid width being greater than 100% with floating point errors
      (duration) => Math.floor(((duration ?? 0) * 1000) / totalDuration) / 10,
    ),
  };
}
