import { html, joinHtml, unsafeHtml } from '@prairielearn/html';

import { type AssessmentQuestion, type RubricGradingItem } from '../../../lib/db-types.js';
import { type RubricData, type RubricGradingData } from '../../../lib/manualGrading.js';

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

function RubricItemsWithIndent(
  rubric_items: RubricData['rubric_items'][0][] | null | undefined,
  rubric_items_grading: Record<string, RubricGradingItem> | null | undefined,
  assessment_question: AssessmentQuestion,
  disable: boolean,
) {
  if (!rubric_items) return '';

  // First group rubric items by parent
  const itemsByParent = {};
  rubric_items.forEach((item) => {
    const parent = item.parent_id ?? '';
    if (!itemsByParent[parent]) {
      itemsByParent[parent] = [];
    }
    itemsByParent[parent].push(item);
  });

  // Then print item tree recursively, starting with root node
  const itemTree = RubricItemsWithIndentRecursive(
    '',
    itemsByParent,
    rubric_items_grading,
    assessment_question,
    disable,
  );
  return html`<div role="tree">${joinHtml(itemTree)}</div>`;
}

function RubricItemsWithIndentRecursive(
  current_parent: string,
  rubric_items_by_parent: Record<string, RubricData['rubric_items'][0][]>,
  rubric_items_grading: Record<string, RubricGradingItem> | null | undefined,
  assessment_question: AssessmentQuestion,
  disable: boolean,
) {
  return rubric_items_by_parent[current_parent].map((item) => {
    const isLeafNode = !(item.id in rubric_items_by_parent);
    const itemRendered = RubricItem(
      item,
      isLeafNode,
      rubric_items_grading?.[item.id],
      assessment_question,
      disable,
    );
    const childrenRendered = isLeafNode
      ? ''
      : RubricItemsWithIndentRecursive(
          item.id,
          rubric_items_by_parent,
          rubric_items_grading,
          assessment_question,
          disable,
        );
    return html`<div role="treeitem">
      ${itemRendered}
      ${isLeafNode ? '' : html`<div role="group" class="ms-4">${childrenRendered}</div>`}
    </div>`;
  });
}

function RubricItem(
  item: RubricData['rubric_items'][0],
  is_leaf_node: boolean,
  item_grading: RubricGradingItem | undefined | null,
  assessment_question: AssessmentQuestion,
  disable: boolean,
) {
  return html`
    <label class="js-selectable-rubric-item-label w-100">
      <input
        type="checkbox"
        name="rubric_item_selected_manual"
        class="js-selectable-rubric-item"
        value="${item.id}"
        ${item_grading?.score ? 'checked' : ''}
        ${disable ? 'disabled' : ''}
        data-parent-item="${item.parent_id}"
        data-rubric-item-points="${item.points}"
        data-key-binding="${item.key_binding}"
      />
      <span class="badge text-bg-info">${item.key_binding}</span>
      ${is_leaf_node
        ? html`<span class="float-end text-${item.points >= 0 ? 'success' : 'danger'}">
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
                          (assessment_question.max_manual_points || assessment_question.max_points),
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
  `;
}
