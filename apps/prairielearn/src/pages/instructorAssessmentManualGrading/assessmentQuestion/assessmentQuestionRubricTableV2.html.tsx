import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import { compiledScriptTag } from '../../../lib/assets.js';

export function AssessmentQuestionRubricTable(aiGradingStats: AiGradingGeneralStats) {
  return html`
    ${compiledScriptTag('instructorAssessmentManualGradingRubricEditingV2.js')}
    <form method="POST">
      <div class="card overflow-hidden p-2 mb-3">
        <div class="table-responsive">
          <table
            class="table table-sm border-bottom mb-3 js-rubric-items-table"
            aria-label="Rubric items"
          >
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
        <div class="js-add-rubric-item-button-container">
          <button
            type="button"
            class="btn btn-sm btn-secondary js-add-rubric-item-button js-rubric-item-disable"
            disabled
          >
            Add item
          </button>
        </div>

        <template class="js-new-row-rubric-item">
          ${RubricItemRow({
            item: null,
            index: aiGradingStats.rubric_stats?.length ?? 0,
            submission_rubric_count: aiGradingStats.submission_rubric_count,
          })}
        </template>
        <div class="text-end">
          <button type="button" class="btn btn-secondary js-rubric-edit">Edit rubric</button>
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
          class="btn btn-sm btn-ghost js-rubric-item-move-button js-rubric-item-disable"
          disabled
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
          class="btn btn-sm btn-ghost js-rubric-item-delete js-rubric-item-disable text-danger"
          disabled
          aria-label="Delete"
        >
          <i class="fas fa-trash text-danger"></i>
        </button>
      </td>
      <td class="align-middle">
        <input
          type="number"
          class="form-control js-rubric-item-points js-rubric-item-disable"
          style="width: 4rem"
          step="any"
          required
          disabled
          name="${namePrefix}[points]"
          value="${item?.rubric_item.points}"
          aria-label="Points"
        />
      </td>
      <td class="align-middle">
        <input
          type="text"
          class="form-control js-rubric-item-description js-rubric-item-disable"
          required
          disabled
          maxlength="100"
          style="min-width: 15rem"
          name="${namePrefix}[description]"
          value="${item?.rubric_item.description}"
          aria-label="Description"
        />
      </td>
      <td class="align-middle">
        <textarea
          class="form-control js-rubric-item-explanation js-rubric-item-disable"
          disabled
          maxlength="10000"
          style="min-width: 15rem"
          name="${namePrefix}[explanation]"
          aria-label="Explanation"
        >
${item?.rubric_item.explanation}</textarea
        >
      </td>
      <td class="align-middle">
        <textarea
          class="form-control js-rubric-item-grader-note js-rubric-item-disable"
          disabled
          maxlength="10000"
          style="min-width: 15rem"
          name="${namePrefix}[grader_note]"
          aria-label="Grader note"
        >
${item?.rubric_item.grader_note}</textarea
        >
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
