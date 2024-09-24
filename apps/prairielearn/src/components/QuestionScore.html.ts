import { escapeHtml, html } from '@prairielearn/html';

import type {
  Assessment,
  AssessmentInstance,
  AssessmentQuestion,
  InstanceQuestion,
  Question,
  Variant,
} from '../lib/db-types.js';
import { formatPoints, formatPointsOrList } from '../lib/format.js';
import { idsEqual } from '../lib/id.js';
import type { VariantWithScore } from '../models/variant.js';

export function QuestionScorePanel({
  instance_question,
  assessment,
  assessment_question,
  question,
  assessment_instance,
  instance_question_info,
  variant,
  authz_result,
  csrfToken,
  urlPrefix,
}: {
  instance_question: InstanceQuestion & {
    allow_grade_left_ms?: number;
    allow_grade_interval?: string;
  };
  assessment: Assessment;
  assessment_question: AssessmentQuestion;
  question: Question;
  assessment_instance: AssessmentInstance;
  variant?: Variant;
  instance_question_info: {
    question_number: string | null;
    previous_variants: VariantWithScore[] | null;
  };
  authz_result?: { authorized_edit: boolean | null };
  csrfToken: string;
  urlPrefix: string;
}) {
  const hasAutoAndManualPoints =
    assessment_question.max_auto_points &&
    (assessment_question.max_manual_points ||
      instance_question.manual_points ||
      instance_question.requires_manual_grading);

  return html`
    <div class="card mb-4" id="question-score-panel">
      <div class="card-header bg-secondary text-white">
        <h2>Question ${instance_question_info.question_number}</h2>
      </div>
      <table class="table table-sm two-column-description-no-header" aria-label="Question score">
        <tbody>
          ${assessment.type === 'Exam'
            ? html`
                <tr>
                  <td>Submission status:</td>
                  <td>${ExamQuestionStatus({ instance_question })}</td>
                </tr>
              `
            : ''}
          ${assessment.type === 'Homework'
            ? // Only show previous variants if the question allows multiple variants, or there are multiple variants (i.e., they were allowed at some point)
              !question.single_variant ||
              (instance_question_info.previous_variants?.length ?? 0) > 1
              ? html`
                  <tr>
                    <td colspan="2" class="text-wrap">
                      All variants:
                      ${QuestionAwardedPoints({
                        instanceQuestionId: instance_question.id,
                        previousVariants: instance_question_info.previous_variants,
                        currentVariantId: variant?.id,
                        urlPrefix,
                      })}
                    </td>
                  </tr>
                `
              : ''
            : assessment_question.max_auto_points
              ? html`
                  <tr>
                    <td>Available points:</td>
                    <td>
                      ${ExamQuestionAvailablePoints({
                        open: !!assessment_instance.open && instance_question.open,
                        currentWeight:
                          (instance_question.points_list_original?.[
                            instance_question.number_attempts
                          ] ?? 0) - (assessment_question.max_manual_points ?? 0),
                        pointsList: instance_question.points_list?.map(
                          (p) => p - (assessment_question.max_manual_points ?? 0),
                        ),
                        highestSubmissionScore: instance_question.highest_submission_score,
                      })}
                    </td>
                  </tr>
                `
              : ''}
          ${hasAutoAndManualPoints
            ? html`
                <tr>
                  <td>Auto-grading:</td>
                  <td>
                    ${InstanceQuestionPoints({
                      instance_question,
                      assessment_question,
                      component: 'auto',
                    })}
                  </td>
                </tr>
                <tr>
                  <td>Manual grading:</td>
                  <td>
                    ${InstanceQuestionPoints({
                      instance_question,
                      assessment_question,
                      component: 'manual',
                    })}
                  </td>
                </tr>
              `
            : ''}
          <tr>
            <td>Total points:</td>
            <td>
              ${InstanceQuestionPoints({
                instance_question,
                assessment_question,
                component: 'total',
              })}
            </td>
          </tr>
          ${!hasAutoAndManualPoints && assessment_question.max_points
            ? html`
                <tr>
                  <td colspan="2" class="text-right">
                    <small>
                      ${!assessment_question.max_auto_points
                        ? 'Manually-graded question'
                        : 'Auto-graded question'}
                    </small>
                  </td>
                </tr>
              `
            : ''}
        </tbody>
      </table>

      ${variant != null && assessment.allow_issue_reporting
        ? html`
            <div class="card-footer">
              ${authz_result?.authorized_edit === false
                ? html`
                    <div class="alert alert-warning mt-2" role="alert">
                      You are viewing the question instance of a different user and so are not
                      authorized to report an error.
                    </div>
                  `
                : IssueReportingPanel({ variant, csrfToken })}
            </div>
          `
        : ''}
    </div>
  `;
}
function IssueReportingPanel({ variant, csrfToken }: { variant: Variant; csrfToken: string }) {
  return html`
    <button
      class="btn btn-xs btn-secondary"
      type="button"
      data-toggle="collapse"
      data-target="#issueCollapse"
      aria-expanded="false"
      aria-controls="issueCollapse"
    >
      Report an error in this question <i class="far fa-caret-square-down"></i>
    </button>
    <div class="collapse" id="issueCollapse">
      <form method="POST">
        <p class="small mt-3">
          This form is only for reporting errors in the question itself. Do not use this form if you
          just don't know how to answer the question.
        </p>
        <div class="form-group">
          <textarea
            class="form-control"
            rows="5"
            name="description"
            placeholder="Describe the error in this question"
            required
          ></textarea>
        </div>
        <input type="hidden" name="__variant_id" value="${variant.id}" />
        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
        <div class="form-group text-right">
          <button class="btn btn-small btn-warning" name="__action" value="report_issue">
            Report error
          </button>
        </div>
      </form>
    </div>
  `;
}

export function ExamQuestionStatus({
  instance_question,
}: {
  instance_question: InstanceQuestion & {
    allow_grade_left_ms?: number;
    allow_grade_interval?: string;
  };
}) {
  const badge_color = {
    unanswered: 'warning',
    invalid: 'danger',
    grading: 'default',
    saved: 'info',
    complete: 'success',
    correct: 'success',
    incorrect: 'danger',
  };

  return html`
    <span class="align-middle">
      <span class="badge badge-${badge_color[instance_question.status ?? 'grading'] ?? 'default'}">
        ${instance_question.status}
      </span>

      ${(instance_question.allow_grade_left_ms ?? 0) > 0
        ? html`
            <button
              type="button"
              class="grade-rate-limit-popover btn btn-xs"
              data-toggle="popover"
              data-container="body"
              data-html="true"
              data-content="This question limits the rate of submissions. Further grade allowed ${instance_question.allow_grade_interval} (as of the loading of this page)."
              data-placement="auto"
            >
              <i class="fa fa-hourglass-half" aria-hidden="true"></i>
            </button>
          `
        : ''}
    </span>
  `;
}

export function QuestionAwardedPoints({
  instanceQuestionId,
  previousVariants,
  currentVariantId,
  urlPrefix,
}: {
  instanceQuestionId: string;
  previousVariants?: VariantWithScore[] | null;
  currentVariantId?: string;
  urlPrefix: string;
}) {
  if (!previousVariants) return '';
  const MAX_DISPLAYED_VARIANTS = 10;
  const collapseClass = `variants-points-collapse-${instanceQuestionId}`;
  const collapseButtonId = `variants-points-collapse-button-${instanceQuestionId}`;

  return html`
    ${previousVariants.length > MAX_DISPLAYED_VARIANTS
      ? html`
          <button
            id="${collapseButtonId}"
            class="bg-white text-body p-0 m-0 border-0 rounded-0"
            aria-label="Show older variants"
            onclick="
                // show all the hidden variant score buttons
                document.querySelectorAll('.${collapseClass}').forEach(e => e.style.display = '');
                // hide the ... button that triggered the expansion
                document.querySelectorAll('#${collapseButtonId}').forEach(e => e.style.display = 'none');
            "
          >
            &ctdot;
          </button>
        `
      : ''}
    ${previousVariants.map(
      (variant, index) => html`
        <a
          class="badge ${currentVariantId != null && idsEqual(variant.id, currentVariantId)
            ? 'badge-info'
            : 'badge-secondary'} ${collapseClass}"
          ${index < previousVariants.length - MAX_DISPLAYED_VARIANTS ? 'style="display: none"' : ''}
          href="${urlPrefix}/instance_question/${instanceQuestionId}/?variant_id=${variant.id}"
        >
          ${variant.open ? 'Open' : `${Math.floor(variant.max_submission_score * 100)}%`}
          ${currentVariantId != null && idsEqual(variant.id, currentVariantId)
            ? html`<span class="sr-only">(current)</span>`
            : ''}
        </a>
      `,
    )}
  `;
}

export function InstanceQuestionPoints({
  instance_question,
  assessment_question,
  component,
}: {
  instance_question: Pick<
    InstanceQuestion,
    'auto_points' | 'manual_points' | 'points' | 'status' | 'requires_manual_grading'
  >;
  assessment_question: Pick<
    AssessmentQuestion,
    'max_auto_points' | 'max_manual_points' | 'max_points'
  >;
  component: 'manual' | 'auto' | 'total';
}) {
  const points =
    component === 'auto'
      ? instance_question.auto_points
      : component === 'manual'
        ? instance_question.manual_points
        : instance_question.points;
  const maxPoints =
    component === 'auto'
      ? assessment_question.max_auto_points
      : component === 'manual'
        ? assessment_question.max_manual_points
        : assessment_question.max_points;
  const pointsPending =
    (['saved', 'grading'].includes(instance_question.status ?? '') && component !== 'manual') ||
    (instance_question.requires_manual_grading && component !== 'auto');

  return html`
    <span class="text-nowrap">
      ${instance_question.status === 'unanswered'
        ? html`&mdash;`
        : pointsPending
          ? html`<span class="badge badge-info">pending</span>`
          : !points && !maxPoints
            ? html`&mdash;`
            : html`<span data-testid="awarded-points">${formatPoints(points)}</span>`}
      ${maxPoints ? html`<small>/<span class="text-muted">${maxPoints}</span></small>` : ''}
    </span>
  `;
}

export function ExamQuestionAvailablePoints({
  open,
  pointsList,
  highestSubmissionScore,
  currentWeight,
}: {
  open: boolean;
  pointsList?: number[];
  highestSubmissionScore?: number | null;
  currentWeight: number;
}) {
  if (!open || pointsList == null || pointsList.length === 0) return html`&mdash;`;

  const bestScore = Math.floor((highestSubmissionScore ?? 0) * 100);
  const popoverContent = html`
    <p>
      You have ${pointsList.length} remaining attempt${pointsList.length !== 1 ? 's' : ''} for this
      question.
    </p>
    <hr />
    <p>
      If you score 100% on your next submission, then you will be awarded an additional
      ${formatPoints(pointsList[0])} points.
    </p>
    <hr />
    ${bestScore > 0
      ? html`
          <p>
            If you score less than ${bestScore}% on your next submission, then you will be awarded
            no additional points, but you will keep any awarded points that you already have.
          </p>
          <hr />
          <p>
            If you score between ${bestScore}% and 100% on your next submission, then you will be
            awarded an additional
            <code>(${formatPoints(currentWeight)} * (score - ${bestScore})/100)</code>
            points.
          </p>
        `
      : html`
          <p>
            If you score less than 100% on your next submission, then you will be awarded an
            additional
            <code>(${formatPoints(currentWeight)} * score / 100)</code>
            points.
          </p>
        `}
  `;

  return html`
    ${pointsList.length === 1
      ? formatPoints(pointsList[0])
      : html`${formatPoints(pointsList[0])},
          <span class="text-muted">${formatPointsOrList(pointsList.slice(1))}</span>`}
    <button
      type="button"
      class="btn btn-xs btn-ghost js-available-points-popover"
      data-toggle="popover"
      data-container="body"
      data-html="true"
      data-content="${escapeHtml(popoverContent)}"
      data-placement="auto"
    >
      <i class="fa fa-question-circle" aria-hidden="true"></i>
    </button>
  `;
}
