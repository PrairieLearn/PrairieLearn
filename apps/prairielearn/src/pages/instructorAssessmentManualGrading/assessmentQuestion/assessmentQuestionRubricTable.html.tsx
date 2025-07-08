import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import { compiledScriptTag } from '../../../lib/assets.js';

export function AssessmentQuestionRubricTable(aiGradingStats: AiGradingGeneralStats) {
  return html`
  ${compiledScriptTag('instructorAssessmentManualGradingRubricEditing.js')}
    <form method="POST">
      <div class="card overflow-hidden mb-3">
        <div class="table-responsive">
          <table class="table table-sm js-rubric-items-table" aria-label="Rubric items">
            <thead>
              <tr class="table-light fw-bold">
                <td style="width: 1px"><!-- Order --></td>
                <td>Points</td>
                <td>Description</td>
                <td>Detailed explanation</td>
                <td>Grader note</td>
                <td>Show to students</td>
                <td>AI agreement</td>
              </tr>
            </thead>
            <tbody>
              ${aiGradingStats.rubric_stats.map((item, index) =>
                RubricItemRow({
                  item,
                  index,
                  submission_rubric_count: aiGradingStats.submission_rubric_count,
                }),
              )}
            </tbody>
          </table>
        </div>
        <div class="js-settings-points-warning-placeholder"></div>
        <button type="button" class="btn btn-sm btn-secondary js-add-rubric-item-button" style="width: 5rem;">
          Add item
        </button>
        <template class="js-new-row-rubric-item">
          ${RubricItemRow({
            item: null,
            index: aiGradingStats.rubric_stats?.length ?? 0,
            submission_rubric_count: aiGradingStats.submission_rubric_count,
          })}
        </template>
        <div class="text-end">
          <button type="submit" class="btn btn-sm btn-primary" style="width: 10rem;">Save rubric</button>
        </div>
      </div>
    </form>
  `;
}

function RubricItemRow({
  item,
  index,
  submission_rubric_count,
}: {
  item: AiGradingGeneralStats['rubric_stats'][0] | null;
  index: number;
  submission_rubric_count: number;
}) {
  const namePrefix = item ? `rubric_item[cur${item.rubric_item.id}]` : 'rubric_item[new]';
  return html`
    <tr>
      <td class="text-nowrap align-middle">
        ${item
          ? html`<input type="hidden" name="${namePrefix}[id]" value="${item.rubric_item.id}" />`
          : ''}
        <input
          type="hidden"
          class="js-rubric-item-row-order"
          name="${namePrefix}[order]"
          value="${index}"
        />
        <button
          type="button"
          class="btn btn-sm btn-ghost js-rubric-item-move-button"
          draggable="true"
        >
          <i class="fas fa-arrows-up-down"></i>
        </button>
        <button type="button" class="visually-hidden js-rubric-item-move-down-button">
          Move down
        </button>
        <button type="button" class="visually-hidden js-rubric-item-move-up-button">Move up</button>
        <button
          type="button"
          class="btn btn-sm btn-ghost js-rubric-item-delete text-danger"
          aria-label="Delete"
        >
          <i class="fas fa-trash text-danger"></i>
        </button>
      </td>
      <td class="align-middle">
        ${item?.rubric_item.points
          ? html` <label
              for="rubric-item-points-button-${item.rubric_item.id}"
              style="white-space: pre-wrap;"
              >${item?.rubric_item.points}</label
            >`
          : ''}
        <button
          ${item ? html`id="rubric-item-points-button-${item.rubric_item.id}"` : ''}
          type="button"
          class="btn btn-sm btn-ghost js-rubric-item-number-field js-rubric-item-points"
          data-input-name="${namePrefix}[points]"
          data-current-value="${item?.rubric_item.points}"
        >
          <i class="fas fa-pencil"></i>
        </button>
      </td>
      <td class="align-middle">
        ${item?.rubric_item.description
          ? html` <label
              for="rubric-item-description-button-${item.rubric_item.id}"
              style="white-space: pre-wrap;"
              >${item?.rubric_item.description}</label
            >`
          : ''}
        <button
          ${item ? html`id="rubric-item-description-button-${item.rubric_item.id}"` : ''}
          type="button"
          class="btn btn-sm btn-ghost js-rubric-item-text-field js-rubric-item-description"
          data-input-name="${namePrefix}[description]"
          data-current-value="${item?.rubric_item.description}"
        >
          <i class="fas fa-pencil"></i>
        </button>
      </td>
      <td class="align-middle">
        ${item?.rubric_item.explanation
          ? html` <label
              for="rubric-item-explanation-button-${item.rubric_item.id}"
              style="white-space: pre-wrap;"
              >${item?.rubric_item.explanation}</label
            >`
          : ''}
        <button
          ${item ? html`id="rubric-item-explanation-button-${item.rubric_item.id}"` : ''}
          type="button"
          class="btn btn-sm btn-ghost js-rubric-item-long-text-field js-rubric-item-explanation"
          data-input-name="${namePrefix}[explanation]"
          data-current-value="${item?.rubric_item.explanation}"
        >
          <i class="fas fa-pencil"></i>
        </button>
      </td>
      <td class="align-middle">
        ${item?.rubric_item.grader_note
          ? html`<label
              for="rubric-item-grader-note-button-${item.rubric_item.id}"
              style="white-space: pre-wrap;"
              >${item?.rubric_item.grader_note}</label
            > `
          : ''}
        <button
          ${item ? html`id="rubric-item-grader-note-button-${item.rubric_item.id}"` : ''}
          type="button"
          class="btn btn-sm btn-ghost js-rubric-item-long-text-field js-rubric-item-grader-note"
          data-input-name="${namePrefix}[grader_note]"
          data-current-value="${item?.rubric_item.grader_note}"
        >
          <i class="fas fa-pencil"></i>
        </button>
      </td>
      <td class="align-middle">
        <div class="form-check form-check-inline">
          <label class="form-check-label text-nowrap">
            <input
              type="radio"
              class="form-check-input js-rubric-item-always-show"
              required
              name="${namePrefix}[always_show_to_students]"
              value="true"
              ${!item || item.rubric_item.always_show_to_students ? 'checked' : ''}
            />Always
          </label>
        </div>
        <div class="form-check form-check-inline">
          <label class="form-check-label text-nowrap">
            <input
              type="radio"
              class="form-check-input js-rubric-item-always-show"
              required
              name="${namePrefix}[always_show_to_students]"
              value="false"
              ${!item || item.rubric_item.always_show_to_students ? '' : 'checked'}
            />If selected
          </label>
        </div>
      </td>
      <td class="align-middle">
        ${run(() => {
          if (item?.disagreement_count) {
            return html`
              <i class="bi bi-x-square-fill text-danger"></i>
              <span class="text-muted">
                (${item.disagreement_count}/${submission_rubric_count} disagree)
              </span>
            `;
          }

          if (submission_rubric_count === 0) {
            return html`&mdash;`;
          }

          return html`<i class="bi bi-check-square-fill text-success"></i>`;
        })}
      </td>
    </tr>
  `;
}
