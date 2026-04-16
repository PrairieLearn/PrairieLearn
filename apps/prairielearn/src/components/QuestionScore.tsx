import { type HtmlValue, escapeHtml, html, joinHtml } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import type {
  Assessment,
  AssessmentInstance,
  AssessmentQuestion,
  InstanceQuestion,
  Question,
  Variant,
} from '../lib/db-types.js';
import { formatPoints } from '../lib/format.js';
import type { SimpleVariantWithScore } from '../models/variant.js';

import { ExamQuestionAvailablePoints } from './ExamQuestionAvailablePoints.js';
import { ExamQuestionStatus } from './ExamQuestionStatus.js';
import { QuestionVariantHistory } from './QuestionVariantHistory.js';

interface QuestionScorePanelContentProps {
  instance_question: InstanceQuestion;
  assessment: Assessment;
  assessment_question: AssessmentQuestion;
  question: Question;
  assessment_instance: AssessmentInstance;
  variant?: Variant;
  instance_question_info: {
    question_number: string | null;
    previous_variants: SimpleVariantWithScore[] | null;
  };
  allowGradeLeftMs: number;
  urlPrefix: string;
}

export function QuestionScorePanel(
  props: QuestionScorePanelContentProps & {
    authz_result?: { authorized_edit: boolean | null };
    csrfToken: string;
  },
) {
  const { instance_question_info, variant, assessment, authz_result, csrfToken } = props;

  return html`
    <div class="card mb-4" id="question-score-panel">
      <div class="card-header bg-secondary text-white">
        <h2>Question ${instance_question_info.question_number}</h2>
      </div>
      ${QuestionScorePanelContent(props)}
      ${variant != null && assessment.allow_issue_reporting
        ? html`
            <div class="card-footer">
              ${authz_result?.authorized_edit === false
                ? html`
                    <div class="alert alert-warning mb-0" role="alert">
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

export function QuestionScorePanelContent({
  instance_question,
  assessment,
  assessment_question,
  question,
  assessment_instance,
  instance_question_info,
  variant,
  urlPrefix,
  allowGradeLeftMs,
}: QuestionScorePanelContentProps) {
  const hasAutoAndManualPoints =
    assessment_question.max_auto_points &&
    (assessment_question.max_manual_points ||
      instance_question.manual_points ||
      instance_question.requires_manual_grading);

  return html`
    <table
      class="table table-sm two-column-description-no-header"
      aria-label="Question score"
      id="question-score-panel-content"
    >
      <tbody>
        ${assessment.type === 'Exam'
          ? html`
              <tr>
                <td>Status:</td>
                <td>
                  ${ExamQuestionStatus({
                    instance_question,
                    assessment_question,
                    allowGradeLeftMs,
                  })}
                </td>
              </tr>
            `
          : ''}
        ${assessment.type === 'Homework'
          ? html`
              ${
                // This condition covers two cases:
                // - A purely manually-graded question
                // - A question with no points at all
                // In both cases, we opt not to display the value, since it
                // would not be possible to immediately earn any points with
                // the next submission.
                assessment_question.max_auto_points
                  ? html`
                      <tr>
                        <td>Value:</td>
                        <td>${QuestionValue({ instance_question, assessment_question })}</td>
                      </tr>
                    `
                  : ''
              }
              ${
                // Only show previous variants if the question allows multiple variants,
                // or there are multiple variants (i.e., they were allowed at some point)
                !question.single_variant ||
                (instance_question_info.previous_variants?.length ?? 0) > 1
                  ? html`
                      <tr>
                        <td colspan="2" class="text-wrap">
                          All variants:
                          ${QuestionVariantHistory({
                            instanceQuestionId: instance_question.id,
                            previousVariants: instance_question_info.previous_variants,
                            currentVariantId: variant?.id,
                            urlPrefix,
                          })}
                        </td>
                      </tr>
                    `
                  : ''
              }
            `
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
                <td colspan="2" class="text-end">
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
  `;
}

function IssueReportingPanel({ variant, csrfToken }: { variant: Variant; csrfToken: string }) {
  return html`
    <button
      class="btn btn-xs btn-secondary"
      type="button"
      data-bs-toggle="collapse"
      data-bs-target="#issueCollapse"
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
        <div class="mb-3">
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
        <div class="mb-3 text-end">
          <button type="submit" class="btn btn-sm btn-warning" name="__action" value="report_issue">
            Report error
          </button>
        </div>
      </form>
    </div>
  `;
}

export function InstanceQuestionPoints({
  instance_question,
  assessment_question,
  component,
}: {
  instance_question: Pick<
    InstanceQuestion,
    | 'auto_points'
    | 'manual_points'
    | 'points'
    | 'status'
    | 'requires_manual_grading'
    | 'last_grader'
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

  // Special case: if this is a manually-graded question in the saved state, don't show
  // a "pending" badge for auto points, since there aren't any pending auto points.
  if (
    instance_question.status === 'saved' &&
    component === 'auto' &&
    !assessment_question.max_auto_points &&
    assessment_question.max_manual_points
  ) {
    return html`&mdash;`;
  }

  return html`
    <span class="text-nowrap">
      ${
        // If the question is unanswered show a dash instead of 0 points, unless
        // the question was manually graded or a regrading process forced the
        // points to be increased.
        instance_question.status === 'unanswered' &&
        instance_question.last_grader == null &&
        instance_question.points === 0
          ? html`&mdash;`
          : pointsPending
            ? html`<span class="badge text-bg-info">pending</span>`
            : !points && !maxPoints
              ? html`&mdash;`
              : html`<span data-testid="awarded-points">${formatPoints(points)}</span>`
      }
      ${maxPoints ? html`<small>/<span class="text-muted">${maxPoints}</span></small>` : ''}
    </span>
  `;
}

function QuestionValue({
  instance_question,
  assessment_question,
}: {
  instance_question: InstanceQuestion;
  assessment_question: AssessmentQuestion;
}) {
  const initAutoPoints =
    (assessment_question.init_points ?? 0) - (assessment_question.max_manual_points ?? 0);

  const currentAutoValue =
    (instance_question.current_value ?? 0) - (assessment_question.max_manual_points ?? 0);

  const bestCurrentScore = run(() => {
    const variantPoints = instance_question.variants_points_list.at(-1);
    if (variantPoints == null) return 0;
    if (variantPoints < initAutoPoints) return (variantPoints / initAutoPoints) * 100;
    return 0;
  });

  const popoverContent = run(() => {
    const parts: HtmlValue[] = [
      html`
        <p>
          This question awards partial credit if you continue getting closer to the correct answer.
        </p>
      `,
    ];

    if (bestCurrentScore === 0) {
      const pluralizedPoints = currentAutoValue === 1 ? 'point' : 'points';
      parts.push(html`
        <p>
          If you score 100% on your next submission, you will be awarded an additional
          ${formatPoints(currentAutoValue)} ${pluralizedPoints}.
        </p>
        <p class="mb-0">
          If you score less than 100% on your next submission, you will be awarded an additional
          <code>${formatPoints(initAutoPoints)} * score / 100</code> points.
        </p>
      `);
    } else {
      if (instance_question.some_perfect_submission) {
        parts.push(html`
          <p>
            Your highest submission score since your last 100% submission is
            ${formatPoints(bestCurrentScore)}%.
          </p>
        `);
      } else {
        parts.push(
          html`<p>Your highest submission score so far is ${formatPoints(bestCurrentScore)}%.</p>`,
        );
      }

      const perfectAdditionalPoints = (currentAutoValue * (100 - bestCurrentScore)) / 100;
      const pluralizedPoints = perfectAdditionalPoints === 1 ? 'point' : 'points';
      parts.push(html`
        <p>
          If you score 100% on your next submission, you will be awarded an additional
          ${formatPoints(perfectAdditionalPoints)} ${pluralizedPoints}.
        </p>
        <p>
          If you score between ${formatPoints(bestCurrentScore)}% and 100% on your next submission,
          you will be awarded an additional
          <code>
            ${formatPoints(currentAutoValue)} * (score - ${formatPoints(bestCurrentScore)}) / 100
          </code>
          points.
        </p>
        <p class="mb-0">
          If you score less than ${formatPoints(bestCurrentScore)}% on your next submission, you
          will not be awarded any additional points for that submission.
        </p>
      `);
    }

    return joinHtml(parts);
  });

  return html`
    ${currentAutoValue}
    <button
      type="button"
      class="btn btn-xs js-value-popover"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="Explanation of question value"
      data-bs-content="${escapeHtml(popoverContent)}"
      data-bs-placement="auto"
    >
      <i class="fa fa-question-circle" aria-hidden="true"></i>
    </button>
  `;
}
