import { html, unsafeHtml, joinHtml } from '@prairielearn/html';

import { AssessmentQuestion, RubricGradingItem } from '../../../lib/db-types.js';
import { RubricData, RubricGradingData } from '../../../lib/manualGrading.js';

export function RubricInputSection({
  resLocals,
  disable,
}: {
  resLocals: Record<string, any>;
  disable: boolean;
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
    ${RubricItemsWithIndent(
      rubric_data.rubric_items,
      rubric_grading?.rubric_items,
      resLocals.assessment_question,
      disable,
    )}
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
                    <span class="input-group-append">
                      <span class="input-group-text">%</span>
                    </span>
                  </div>
                </div>
              `
            : ''}
        </label>
      </div>
    </div>
  `;
}

function RubricItemsWithIndent(
  rubric_items: RubricData['rubric_items'][0][] | null | undefined,
  rubric_items_grading: Record<string, RubricGradingItem> | null | undefined,
  assessment_question: AssessmentQuestion,
  disable: boolean,
) {
  if (!rubric_items) return '';
  const parentStack = [''];
  const itemRows = rubric_items.map((item) => {
    // Find parent in stack and remove any items with deeper nesting than parent
    const cutoffIdx = parentStack.indexOf(item.parent_id ?? '') + 1;
    parentStack.splice(cutoffIdx, parentStack.length - cutoffIdx);

    // Generate HTML for current item
    const result = RubricItem(
      item,
      rubric_items_grading?.[item.id],
      assessment_question,
      disable,
      parentStack.length - 1,
    );

    // Push this item as potential parent for next item
    parentStack.push(item.id);
    return result;
  });
  return html`<div aria-role="tree">${joinHtml(itemRows)}</div>`;
}

function RubricItem(
  item: RubricData['rubric_items'][0],
  item_grading: RubricGradingItem | undefined | null,
  assessment_question: AssessmentQuestion,
  disable: boolean,
  indentLevel: number,
) {
  return html`
    <div aria-role="treeitem">
      <label class="js-selectable-rubric-item-label w-100">
        <input
          type="checkbox"
          name="rubric_item_selected_manual"
          class="js-selectable-rubric-item"
          style="margin-left: ${indentLevel}rem"
          value="${item.id}"
          ${item_grading?.score ? 'checked' : ''}
          ${disable ? 'disabled' : ''}
          data-parent-item="${item.parent_id}"
          data-rubric-item-points="${item.points}"
          data-key-binding="${item.key_binding}"
        />
        <span class="badge badge-info">${item.key_binding}</span>
        ${item.points !== 0
          ? html`<span class="float-right text-${item.points >= 0 ? 'success' : 'danger'}">
              <strong>
                <span class="js-manual-grading-points" data-testid="rubric-item-points">
                  [${(item.points >= 0 ? '+' : '') + Math.round(item.points * 100) / 100}]
                </span>
                ${assessment_question.max_points
                  ? html`
                      <span class="js-manual-grading-percentage">
                        [${(item.points >= 0 ? '+' : '') +
                        Math.round(
                          (item.points * 10000) /
                            (assessment_question.max_manual_points ||
                              assessment_question.max_points),
                        ) /
                          100}%]
                      </span>
                    `
                  : ''}
              </strong>
            </span>`
          : ''}
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
