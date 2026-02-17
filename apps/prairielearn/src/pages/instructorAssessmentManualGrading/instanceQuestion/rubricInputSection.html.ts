import { html, unsafeHtml } from '@prairielearn/html';

import type { InstanceQuestionAIGradingInfo } from '../../../ee/lib/ai-grading/types.js';
import type { AssessmentQuestion, RubricGradingItem, RubricItem } from '../../../lib/db-types.js';
import {
  type RenderedRubricItem,
  type RubricData,
  type RubricGradingData,
} from '../../../lib/manualGrading.types.js';
import type { UntypedResLocals } from '../../../lib/res-locals.types.js';

export function RubricInputSection({
  resLocals,
  disable,
  aiGradingInfo,
}: {
  resLocals: UntypedResLocals;
  disable: boolean;
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
}) {
  if (!resLocals.rubric_data) return '';
  const rubric_data: RubricData = resLocals.rubric_data;
  const rubric_grading: RubricGradingData | null = resLocals.submission.rubric_grading;

  return html`
    <style>
      .js-selectable-rubric-item-label {
        border-color: rgba(0, 0, 0, 0);
        border-width: 1px;
        border-style: solid;
      }
      .js-selectable-rubric-item-label:has(input:checked) {
        border-color: rgba(0, 0, 0, 0.125);
        background-color: var(--light);
      }
      .js-selectable-rubric-item-label p {
        margin-bottom: 0;
      }
    </style>
    ${RubricItems({
      rubric_items: rubric_data.rubric_items,
      rubric_grading_items: rubric_grading?.rubric_items,
      assessment_question: resLocals.assessment_question,
      disable,
      aiGradingInfo,
    })}
    <div class="js-adjust-points d-flex justify-content-end">
      <button
        type="button"
        class="js-adjust-points-enable btn btn-sm btn-link ${rubric_grading?.adjust_points ||
        disable
          ? 'd-none'
          : ''}"
      >
        Apply adjustment
      </button>
      <div
        class="js-adjust-points-input-container w-25 ${rubric_grading?.adjust_points
          ? ''
          : 'd-none'}"
      >
        <label>
          <span class="small">Adjustment:</span>
          <div class="js-manual-grading-points">
            <div class="input-group input-group-sm">
              <input
                type="number"
                step="any"
                class="form-control js-adjust-points-points"
                name="score_manual_adjust_points"
                data-max-points="${resLocals.assessment_question.max_manual_points ||
                resLocals.assessment_question.max_points}"
                value="${Math.round((rubric_grading?.adjust_points ?? 0) * 100) / 100 || ''}"
                ${disable ? 'disabled' : ''}
              />
            </div>
          </div>
          ${resLocals.assessment_question.max_points
            ? html`
                <div class="js-manual-grading-percentage">
                  <div class="input-group input-group-sm">
                    <input
                      type="number"
                      step="any"
                      class="form-control js-adjust-points-percentage"
                      name="score_manual_adjust_percent"
                      data-max-points="${resLocals.assessment_question.max_manual_points ||
                      resLocals.assessment_question.max_points}"
                      value="${Math.round(
                        ((rubric_grading?.adjust_points || 0) * 10000) /
                          (resLocals.assessment_question.max_manual_points ||
                            resLocals.assessment_question.max_points),
                      ) / 100 || ''}"
                      ${disable ? 'disabled' : ''}
                    />
                    <span class="input-group-text">%</span>
                  </div>
                </div>
              `
            : ''}
        </label>
      </div>
    </div>
  `;
}

function RubricItems({
  rubric_items,
  rubric_grading_items,
  assessment_question,
  disable,
  aiGradingInfo,
}: {
  rubric_items: RubricData['rubric_items'][0][] | null | undefined;
  rubric_grading_items: Record<string, RubricGradingItem> | null | undefined;
  assessment_question: AssessmentQuestion;
  disable: boolean;
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
}) {
  const ai_selected_rubric_item_ids_set = aiGradingInfo?.submissionManuallyGraded
    ? new Set(aiGradingInfo.selectedRubricItemIds)
    : null;

  return html`
    ${aiGradingInfo?.submissionManuallyGraded
      ? html`
          <div
            class="d-flex align-items-center gap-2 text-secondary mb-1"
            style="padding-left: 3px;"
          >
            <div data-bs-toggle="tooltip" data-bs-title="AI grading">
              <i class="bi bi-stars"></i>
            </div>
            <div data-bs-toggle="tooltip" data-bs-title="Manual grading">
              <i class="bi bi-person-fill"></i>
            </div>
          </div>
        `
      : ''}
    ${rubric_items
      ? rubric_items.map((item) =>
          RubricItem({
            item,
            item_grading: rubric_grading_items?.[item.rubric_item.id],
            assessment_question,
            disable,
            ai_checked: ai_selected_rubric_item_ids_set
              ? ai_selected_rubric_item_ids_set.has(item.rubric_item.id)
              : undefined,
          }),
        )
      : ''}
  `;
}

function RubricItem({
  item,
  item_grading,
  assessment_question,
  disable,
  ai_checked,
}: {
  item: RenderedRubricItem;
  item_grading: RubricGradingItem | undefined | null;
  assessment_question: AssessmentQuestion;
  disable: boolean;
  ai_checked?: boolean;
}) {
  return html`
    <div>
      <label class="js-selectable-rubric-item-label w-100">
        ${ai_checked !== undefined
          ? html`
              <input
                type="checkbox"
                style="margin-left: 3px; margin-right: 8px;"
                name="rubric_item_selected_ai"
                value="${item.rubric_item.id}"
                ${ai_checked ? 'checked' : ''}
                disabled
                data-bs-toggle="tooltip"
                data-bs-placement="top"
                title="${ai_checked ? 'Selected by AI' : 'Not selected by AI'}"
              />
            `
          : ''}
        <input
          type="checkbox"
          name="rubric_item_selected_manual"
          class="js-selectable-rubric-item me-2"
          value="${item.rubric_item.id}"
          ${item_grading?.score ? 'checked' : ''}
          ${disable ? 'disabled' : ''}
          data-rubric-item-points="${item.rubric_item.points}"
          data-key-binding="${item.rubric_item.key_binding}"
        />
        <span class="badge text-bg-info">${item.rubric_item.key_binding}</span>
        <span class="float-end text-${item.rubric_item.points >= 0 ? 'success' : 'danger'}">
          <strong>
            <span class="js-manual-grading-points" data-testid="rubric-item-points">
              [${(item.rubric_item.points >= 0 ? '+' : '') +
              Math.round(item.rubric_item.points * 100) / 100}]
            </span>
            ${assessment_question.max_points
              ? html`
                  <span class="js-manual-grading-percentage">
                    [${(item.rubric_item.points >= 0 ? '+' : '') +
                    Math.round(
                      (item.rubric_item.points * 10000) /
                        (assessment_question.max_manual_points || assessment_question.max_points),
                    ) /
                      100}%]
                  </span>
                `
              : ''}
          </strong>
        </span>
        <span>
          <div class="d-inline-block" data-testid="rubric-item-description">
            ${unsafeHtml(item.description_rendered ?? '')}
          </div>
          <div class="small text-muted" data-testid="rubric-item-explanation">
            ${unsafeHtml(item.explanation_rendered ?? '')}
          </div>
          <div class="small text-muted" data-testid="rubric-item-grader-note">
            ${unsafeHtml(item.grader_note_rendered ?? '')}
          </div>
        </span>
      </label>
    </div>
  `;
}
