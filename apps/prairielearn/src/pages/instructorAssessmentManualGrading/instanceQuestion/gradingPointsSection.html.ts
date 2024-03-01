import { html } from '@prairielearn/html';

export function ManualPointsSection({
  context,
  disable,
  manual_points,
  resLocals,
}: {
  context: 'main' | 'existing' | 'conflicting';
  disable: boolean;
  manual_points: number;
  resLocals: Record<string, any>;
}) {
  return GradingPointsSection({
    context,
    disable,
    type: 'manual',
    type_label: 'Manual',
    points: manual_points,
    max_points: resLocals.assessment_question.max_manual_points ?? 0,
    show_percentage: !!resLocals.assessment_question.max_points,
    show_input: !resLocals.rubric_data,
    show_input_edit: false,
    show_rubric_button:
      context === 'main' &&
      !resLocals.rubric_data?.replace_auto_points &&
      resLocals.authz_data.has_course_instance_permission_edit,
  });
}

export function AutoPointsSection({
  context,
  disable,
  auto_points,
  resLocals,
}: {
  context: string;
  disable: boolean;
  auto_points: number;
  resLocals: Record<string, any>;
}) {
  return GradingPointsSection({
    context,
    disable,
    type: 'auto',
    type_label: 'Auto',
    points: auto_points,
    max_points: resLocals.assessment_question.max_auto_points ?? 0,
    show_percentage: !!resLocals.assessment_question.max_points,
    show_input: false,
    show_input_edit: !disable,
    show_rubric_button: false,
  });
}

export function TotalPointsSection({
  context,
  disable,
  points,
  resLocals,
}: {
  context: 'main' | 'existing' | 'conflicting';
  disable: boolean;
  points: number;
  resLocals: Record<string, any>;
}) {
  return html`
    ${context === 'main' && resLocals.rubric_data?.replace_auto_points && !disable
      ? html`
          <span class="float-right btn-group btn-group-sm ml-1" role="group">
            <button type="button" class="btn btn-outline-secondary js-show-rubric-settings-button">
              <i class="fas fa-list-check"></i> Rubric
            </button>
          </span>
        `
      : ''}
    <div class="form-group js-manual-grading-points w-100">
      Total Points:
      <span class="float-right">
        <span class="js-value-total-points">${Math.round(100 * points) / 100}</span>
        / ${resLocals.assessment_question.max_points}
      </span>
    </div>
    ${resLocals.assessment_question.max_points
      ? html`
          <div class="form-group js-manual-grading-percentage w-100">
            Total Score:
            <span class="float-right"> <span class="js-value-total-percentage"></span>% </span>
          </div>
        `
      : ''}
  `;
}

export function GradingPointsSection({
  type,
  type_label,
  context,
  show_input,
  points,
  max_points,
  show_percentage,
  disable,
  show_input_edit,
  show_rubric_button,
}: {
  type: string;
  type_label: string;
  context: string;
  show_input: boolean;
  points: number;
  max_points: number;
  show_percentage: boolean;
  disable: boolean;
  show_input_edit: boolean;
  show_rubric_button: boolean;
}) {
  return html`
    <div class="form-group">
      <span class="w-100">
        <label
          for="js-${type}-score-value-input-points-${context}"
          class="js-manual-grading-points"
        >
          ${type_label} Points:
        </label>
        ${show_percentage
          ? html`
              <label
                for="js-${type}-score-value-input-percentage-${context}"
                class="js-manual-grading-percentage"
              >
                ${type_label} Score:
              </label>
            `
          : ''}
        <span class="float-right">
          ${!show_input
            ? html`
                <span class="js-manual-grading-points">
                  <span class="js-${type}-score-value-info">
                    <span class="js-value-${type}-points">${Math.round(points * 100) / 100}</span>
                    / ${max_points}
                  </span>
                </span>
                ${show_percentage
                  ? html`
                      <span class="js-manual-grading-percentage">
                        <span class="js-${type}-score-value-info">
                          <span class="js-value-${type}-percentage"></span>%
                        </span>
                      </span>
                    `
                  : ''}
              `
            : ''}
          <div class="btn-group btn-group-sm" role="group">
            ${show_input_edit
              ? html`
                  <button
                    type="button"
                    class="btn btn-outline-secondary js-enable-${type}-score-edit js-${type}-score-value-info"
                  >
                    <i class="fas fa-pencil"></i>
                  </button>
                `
              : ''}
            ${show_rubric_button
              ? html`
                  <button
                    type="button"
                    class="btn btn-outline-secondary js-show-rubric-settings-button"
                  >
                    <i class="fas fa-list-check"></i> Rubric
                  </button>
                `
              : ''}
          </div>
        </span>
      </span>
      <div class="js-manual-grading-points">
        <div class="input-group js-${type}-score-value-input ${!show_input ? 'd-none' : ''}">
          <input
            type="number"
            step="any"
            required
            id="js-${type}-score-value-input-points-${context}"
            class="form-control js-grading-score-input js-${type}-score-value-input-points"
            data-max-points="${max_points}"
            name="score_${type}_points"
            value="${Math.round(points * 100) / 100}"
            ${disable ? 'disabled' : ''}
          />
          <span class="input-group-append">
            <span class="input-group-text">/ ${max_points}</span>
          </span>
        </div>
      </div>
      ${show_percentage
        ? html`
            <div class="js-manual-grading-percentage">
              <div class="input-group js-${type}-score-value-input ${!show_input ? 'd-none' : ''}">
                <input
                  type="number"
                  step="any"
                  required
                  id="js-${type}-score-value-input-percentage-${context}"
                  class="form-control js-grading-score-input js-${type}-score-value-input-percentage"
                  name="score_${type}_percent"
                  ${disable ? 'disabled' : ''}
                />
                <span class="input-group-append">
                  <span class="input-group-text">%</span>
                </span>
              </div>
            </div>
          `
        : ''}
    </div>
  `;
}
