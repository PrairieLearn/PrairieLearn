import { html } from '@prairielearn/html';

interface SubmissionOrGradingJob {
  feedback: Record<string, any> | null;
}

export function GradingPanel({
  resLocals,
  context,
  rubric_settings_visible,
  graders,
  disable,
  hide_back_to_question,
  skip_text,
  custom_points,
  custom_auto_points,
  custom_manual_points,
  grading_job,
}: {
  resLocals: Record<string, any>;
  context: 'main' | 'existing' | 'conflicting';
  rubric_settings_visible?: boolean;
  graders?: Record<string, any> | null;
  disable?: boolean;
  hide_back_to_question?: boolean;
  skip_text?: string;
  custom_points?: number;
  custom_auto_points?: number;
  custom_manual_points?: number;
  grading_job?: SubmissionOrGradingJob;
}) {
  const auto_points = custom_auto_points ?? resLocals.instance_question.auto_points ?? 0;
  const manual_points = custom_manual_points ?? resLocals.instance_question.manual_points ?? 0;
  const points = custom_points ?? resLocals.instance_question.points ?? 0;
  const submission = grading_job ?? resLocals.submission;
  disable = disable || !resLocals.authz_data.has_course_instance_permission_edit;
  skip_text = skip_text || (disable ? 'Next' : 'Skip');

  return html`
    <form
      name="manual-grading-form"
      method="POST"
      data-max-auto-points="${resLocals.assessment_question.max_auto_points}"
      data-max-manual-points="${resLocals.assessment_question.max_manual_points}"
      data-max-points="${resLocals.assessment_question.max_points}"
      data-rubric-active="${!!resLocals.rubric_data}"
      data-rubric-replace-auto-points="${resLocals.rubric_data?.replace_auto_points}"
      data-rubric-starting-points="${resLocals.rubric_data?.starting_points}"
      data-rubric-max-extra-points="${resLocals.rubric_data?.max_extra_points}"
      data-rubric-min-points="${resLocals.rubric_data?.min_points}"
    >
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input type="hidden" name="modified_at" value="${resLocals.instance_question.modified_at}" />
      <input type="hidden" name="submission_id" value="${resLocals.submission.id}" />
      <ul class="list-group list-group-flush">
        ${resLocals.assessment_question.max_points
          ? // Percentage-based grading is only suitable if the question has points
            html`
    <li class="list-group-item">
      <div class="form-group row justify-content-center">
        <label class="custom-control-inline col-auto mx-0">
          <span class="">Points</span>
          <div class="custom-control custom-switch mx-2">
            <input class="custom-control-input js-manual-grading-pts-perc-select"
                   name="use_score_perc" type="checkbox">
            <span class="custom-control-label">Percentage</span>
          </div>
        </label>
      </div>
    </li>
 : '' }
    ${
      !resLocals.assessment_question.max_auto_points && !auto_points
        ? html`
            <li class="list-group-item">
              ${ManualPointsSection({
                context,
                disable,
                manual_points,
                rubric_settings_visible,
                resLocals,
              })}
              <%- include('rubricInputSection'); %>
            </li>
          `
        : html`
            <li class="list-group-item">
              ${ManualPointsSection({
                context,
                disable,
                manual_points,
                rubric_settings_visible,
                resLocals,
              })}
              ${!resLocals.rubric_data?.replace_auto_points
                ? html`<%- include('rubricInputSection'); %>`
                : ''}
            </li>
            <li class="list-group-item">
              ${AutoPointsSection({ context, disable, auto_points, resLocals })}
            </li>
            <li class="list-group-item">
              ${context === 'main' &&
              rubric_settings_visible &&
              resLocals.rubric_data?.replace_auto_points &&
              !disable
                ? html`
                    <span class="float-right btn-group btn-group-sm ml-1" role="group">
                      <button
                        type="button"
                        class="btn btn-outline-secondary js-show-rubric-settings-button"
                      >
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
                      <span class="float-right">
                        <span class="js-value-total-percentage"></span>%
                      </span>
                    </div>
                  `
                : ''}
            </li>
          `
    }
      ${
        resLocals.rubric_data?.replace_auto_points
          ? html`<%- include('rubricInputSection'); %>`
          : ''
      }
    </li>
    `
          : ''}
        <li class="form-group list-group-item">
          <label
            >Feedback:
            <textarea
              name="submission_note"
              class="form-control js-submission-feedback"
              style="min-height: 1em;"
              ${disable ? 'readonly' : ''}
              aria-describedby="submission-feedback-help-${context}"
            >
${submission.feedback?.manual}</textarea
            >
            <small id="submission-feedback-help-${context}" class="form-text text-muted">
              Markdown formatting, such as *emphasis* or &#96;code&#96;, is permitted and will be
              used to format the feedback when presented to the student.
            </small>
          </label>
        </li>
        <li class="list-group-item d-flex align-items-center">
          ${!hide_back_to_question
            ? html`
                <a
                  role="button"
                  class="btn btn-primary"
                  href="${resLocals.urlPrefix}/assessment/${resLocals.assessment_instance
                    .assessment_id}/manual_grading/assessment_question/${resLocals.instance_question
                    .assessment_question_id}"
                >
                  <i class="fas fa-arrow-left"></i>
                  Back to Question
                </a>
              `
            : ''}
          <span class="ml-auto">
            ${!disable
              ? html`
                  <button
                    type="submit"
                    class="btn btn-primary"
                    name="__action"
                    value="add_manual_grade"
                  >
                    Submit
                  </button>
                `
              : ''}
            <div class="btn-group">
              <a
                role="button"
                class="btn btn-secondary"
                href="${resLocals.urlPrefix}/assessment/${resLocals.assessment_instance
                  .assessment_id}/manual_grading/assessment_question/${resLocals.instance_question
                  .assessment_question_id}/next_ungraded?prior_instance_question_id=${resLocals
                  .instance_question.id}"
              >
                ${skip_text}
              </a>
              ${!disable
                ? html`
                    <button
                      type="button"
                      class="btn btn-secondary dropdown-toggle dropdown-toggle-split"
                      data-toggle="dropdown"
                      aria-haspopup="true"
                      aria-expanded="false"
                    >
                      <span class="sr-only">Change assigned grader</span>
                    </button>
                    <div class="dropdown-menu dropdown-menu-right">
                      ${(graders || []).forEach((grader) => {
                        html`
                          <button
                            type="submit"
                            class="dropdown-item"
                            name="__action"
                            value="reassign_${grader.user_id}"
                          >
                            Assign to: ${grader.name} (${grader.uid})
                          </button>
                        `;
                      })}
                      <button
                        type="submit"
                        class="dropdown-item"
                        name="__action"
                        value="reassign_nobody"
                      >
                        Tag for grading without assigned grader
                      </button>
                      <button
                        type="submit"
                        class="dropdown-item"
                        name="__action"
                        value="reassign_graded"
                      >
                        Tag as graded (keep current grade)
                      </button>
                    </div>
                  `
                : ''}
            </div>
          </span>
        </li>
      </ul>
    </form>
  `;
}

export function ManualPointsSection({
  context,
  disable,
  manual_points,
  rubric_settings_visible,
  resLocals,
}: {
  context: 'main' | 'existing' | 'conflicting';
  disable: boolean;
  manual_points: number;
  rubric_settings_visible?: boolean;
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
      rubric_settings_visible &&
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
                    <span class="js-value-<%= type %>-points"
                      >${Math.round(points * 100) / 100}</span
                    >
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
