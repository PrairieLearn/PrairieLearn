import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import { compiledScriptTag } from '../../../lib/assets.js';
import type { AssessmentQuestion } from '../../../lib/db-types.js';
import type { RubricData } from '../../../lib/manualGrading.js';

export function AssessmentQuestionRubricTable(
  assessment_question: AssessmentQuestion,
  rubric_data: RubricData | undefined | null,
  __csrf_token: any,
  aiGradingEnabled: boolean,
  aiGradingMode: boolean,
  aiGradingStats: AiGradingGeneralStats,
) {
  // const showAiGradingStats = aiGradingEnabled && aiGradingMode;
  const showAiGradingStats = true;
  return html`
    ${compiledScriptTag('instructorAssessmentManualGradingRubricEditingV2.js')}

    <div class="card overflow-hidden p-2 mb-3 js-rubric-settings-card">
      <form
        name="rubric-settings"
        method="POST"
        data-max-points="${assessment_question.max_points}"
      >
        <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
        <input type="hidden" name="__action" value="modify_rubric_settings" />
        <input type="hidden" name="modified_at" value="${rubric_data?.modified_at.toString()}" />
        <input type="hidden" name="use_rubric" value="true" />

        <!-- Rubric general settings -->
        <div class="card mb-2 mt-1">
          <button
            type="button"
            class="card-header d-flex border-top-0 border-start-0 border-end-0 text-start"
            data-bs-toggle="collapse"
            data-bs-target="#rubric-setting"
          >
            <div class="card-title mb-0 me-auto d-flex align-items-center">Rubric settings</div>
          </button>
          <div id="rubric-setting" class="collapse p-2">
            ${RubricGeneralSettings(assessment_question, rubric_data)}
          </div>
        </div>

        <!-- Rubric table, avaialbe in both modes -->
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
                ${aiGradingEnabled && aiGradingMode ? html`<td>AI agreement</td>` : ''}
              </tr>
            </thead>
            <tbody>
              ${aiGradingStats.rubric_stats.map((item, index) =>
                RubricItemRow({
                  item,
                  index,
                  submission_rubric_count: aiGradingStats.submission_rubric_count,
                  showAiGradingStats,
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
            showAiGradingStats,
          })}
        </template>
        <div class="text-end">
          <button type="button" class="btn btn-secondary js-rubric-edit">Edit rubric</button>
        </div>
      </form>
    </div>
  `;
}

function RubricGeneralSettings(
  assessment_question: AssessmentQuestion,
  rubric_data: RubricData | undefined | null,
) {
  return html`${assessment_question.max_auto_points
      ? html`
          <div class="row">
            <div class="col-12 col-lg-6">
              <div class="form-check">
                <label class="form-check-label">
                  <input
                    class="form-check-input js-replace-auto-points-input"
                    name="replace_auto_points"
                    type="radio"
                    value="false"
                    required
                    data-max-points="${assessment_question.max_manual_points}"
                    ${(rubric_data?.replace_auto_points ?? !assessment_question.max_manual_points)
                      ? ''
                      : 'checked'}
                  />
                  Apply rubric to manual points (out of ${assessment_question.max_manual_points},
                  keep auto points)
                </label>
                <button
                  type="button"
                  class="btn btn-sm btn-ghost"
                  data-bs-toggle="tooltip"
                  data-bs-placement="bottom"
                  data-bs-title="If the rubric is applied to manual points only, then a student's auto points are kept, and the rubric items will be added to (or subtracted from) the autograder results."
                >
                  <i class="fas fa-circle-info"></i>
                </button>
              </div>
            </div>
            <div class="col-12 col-lg-6">
              <div class="form-check">
                <label class="form-check-label">
                  <input
                    class="form-check-input js-replace-auto-points-input"
                    name="replace_auto_points"
                    type="radio"
                    value="true"
                    required
                    data-max-points="${assessment_question.max_points}"
                    ${(rubric_data?.replace_auto_points ?? !assessment_question.max_manual_points)
                      ? 'checked'
                      : ''}
                  />
                  Apply rubric to total points (out of ${assessment_question.max_points}, ignore
                  auto points)
                </label>
                <button
                  type="button"
                  class="btn btn-sm btn-ghost"
                  data-bs-toggle="tooltip"
                  data-bs-placement="bottom"
                  data-bs-title="If the rubric is applied to total points, then a student's auto points will be ignored, and the rubric items will be based on the total points of the question (${assessment_question.max_points} points)."
                >
                  <i class="fas fa-circle-info"></i>
                </button>
              </div>
            </div>
          </div>
          <hr />
        `
      : ''}
    <div class="row">
      <div class="col-12 col-lg-6">
        <div class="form-check js-rubric-max-points-positive">
          <label class="form-check-label">
            <input
              class="form-check-input js-rubric-item-limits"
              name="starting_points"
              type="radio"
              value="0"
              required
              ${rubric_data?.starting_points ? '' : 'checked'}
            />
            Positive grading (start at zero, add points)
          </label>
        </div>
        <div class="form-check js-rubric-max-points-positive">
          <label class="form-check-label">
            <input
              class="form-check-input js-rubric-item-limits js-negative-grading"
              name="starting_points"
              type="radio"
              value="${assessment_question.max_manual_points}"
              required
              ${rubric_data?.starting_points ? 'checked' : ''}
            />
            Negative grading (start at <span class="js-rubric-max-points-info"></span>, subtract
            penalties)
          </label>
          <button
            type="button"
            class="btn btn-sm btn-ghost"
            data-bs-toggle="tooltip"
            data-bs-placement="bottom"
            data-bs-title="This setting only affects starting points. Rubric items may always be added with positive or negative points."
          >
            <i class="fas fa-circle-info"></i>
          </button>
        </div>
      </div>
      <div class="mb-3 col-6 col-lg-3">
        <label class="form-label">
          Minimum rubric score
          <button
            type="button"
            class="btn btn-sm btn-ghost"
            data-bs-toggle="tooltip"
            data-bs-placement="bottom"
            data-bs-title="By default, penalties applied by rubric items cannot cause the rubric to have negative points. This value overrides this limit, e.g., for penalties that affect auto points or the assessment as a whole."
          >
            <i class="fas fa-circle-info"></i>
          </button>
          <input
            class="form-control js-rubric-item-limits"
            name="min_points"
            type="number"
            required
            value="${rubric_data?.min_points ?? 0}"
          />
        </label>
      </div>
      <div class="mb-3 col-6 col-lg-3">
        <label class="form-label">
          Maximum extra credit
          <button
            type="button"
            class="btn btn-sm btn-ghost"
            data-bs-toggle="tooltip"
            data-bs-placement="bottom"
            data-bs-title="By default, points are limited to the maximum points assigned to the question, and credit assigned by rubric items do not violate this limit. This value allows rubric points to extend beyond this limit, e.g., for bonus credit."
          >
            <i class="fas fa-circle-info"></i>
          </button>
          <input
            class="form-control js-rubric-item-limits"
            name="max_extra_points"
            type="number"
            required
            value="${rubric_data?.max_extra_points ?? 0}"
          />
        </label>
      </div>
    </div>`;
}

function RubricItemRow({
  item,
  index,
  submission_rubric_count,
  showAiGradingStats,
}: {
  item: AiGradingGeneralStats['rubric_stats'][0] | null;
  index: number;
  submission_rubric_count: number;
  showAiGradingStats: boolean;
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
      ${showAiGradingStats
        ? html`<td class="align-middle">
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
          </td>`
        : ''}
    </tr>
  `;
}
