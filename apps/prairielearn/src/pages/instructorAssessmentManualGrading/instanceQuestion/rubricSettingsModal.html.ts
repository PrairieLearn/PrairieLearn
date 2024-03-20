import { html } from '@prairielearn/html';
import { RubricData } from '../../../lib/manualGrading';

export function RubricSettingsModal({ resLocals }: { resLocals: Record<string, any> }) {
  const rubric_data = resLocals.rubric_data as RubricData | null | undefined;
  return html`
    <div class="modal js-rubric-settings-modal" tabindex="-1" role="dialog">
      <div class="modal-dialog border-info" style="max-width: 98vw" role="document">
        <form
          name="rubric-settings"
          method="POST"
          class="needs-validation"
          data-max-points="${resLocals.assessment_question.max_points}"
        >
          <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
          <input type="hidden" name="__action" value="modify_rubric_settings" />
          <input type="hidden" name="modified_at" value="${rubric_data?.modified_at.toString()}" />
          <input type="hidden" name="use_rubric" value="true" />

          <div class="modal-content">
            <div class="modal-header bg-info text-light">
              <h5 class="modal-title">Rubric settings</h5>
              <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div class="modal-body">
              ${resLocals.assessment_question.max_auto_points
                ? html`
                    <div class="form-row">
                      <div class="col-12 col-lg-6">
                        <div class="form-check">
                          <label class="form-check-label">
                            <input
                              class="form-check-input js-replace-auto-points-input"
                              name="replace_auto_points"
                              type="radio"
                              value="false"
                              required
                              data-max-points="${resLocals.assessment_question.max_manual_points}"
                              ${rubric_data?.replace_auto_points ??
                              !resLocals.assessment_question.max_manual_points
                                ? ''
                                : 'checked'}
                            />
                            Apply rubric to manual points (out of
                            ${resLocals.assessment_question.max_manual_points}, keep auto points)
                          </label>
                          <button
                            type="button"
                            class="btn btn-sm"
                            data-toggle="tooltip"
                            data-placement="bottom"
                            title="If the rubric is applied to manual points only, then a student's auto points are kept, and the rubric items will be added to (or subtracted from) the autograder results."
                          >
                            <i class="text-info fas fa-circle-info"></i>
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
                              data-max-points="${resLocals.assessment_question.max_points}"
                              ${rubric_data?.replace_auto_points ??
                              !resLocals.assessment_question.max_manual_points
                                ? 'checked'
                                : ''}
                            />
                            Apply rubric to total points (out of
                            ${resLocals.assessment_question.max_points}, ignore auto points)
                          </label>
                          <button
                            type="button"
                            class="btn btn-sm"
                            data-toggle="tooltip"
                            data-placement="bottom"
                            title="If the rubric is applied to total points, then a student's auto points will be ignored, and the rubric items will be based on the total points of the question (${resLocals
                              .assessment_question.max_points} points)."
                          >
                            <i class="text-info fas fa-circle-info"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                    <hr />
                  `
                : ''}
              <div class="form-row">
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
                        value="${resLocals.assessment_question.max_manual_points}"
                        required
                        ${rubric_data?.starting_points ? 'checked' : ''}
                      />
                      Negative grading (start at <span class="js-rubric-max-points-info"></span>,
                      subtract penalties)
                    </label>
                    <button
                      type="button"
                      class="btn btn-sm"
                      data-toggle="tooltip"
                      data-placement="bottom"
                      title="This setting only affects starting points. Rubric items may always be added with positive or negative points."
                    >
                      <i class="text-info fas fa-circle-info"></i>
                    </button>
                  </div>
                </div>
                <div class="form-group col-6 col-lg-3">
                  <label>
                    Minimum rubric score
                    <button
                      type="button"
                      class="btn btn-sm"
                      data-toggle="tooltip"
                      data-placement="bottom"
                      title="By default, penalties applied by rubric items cannot cause the rubric to have negative points. This value overrides this limit, e.g., for penalties that affect auto points or the assessment as a whole."
                    >
                      <i class="text-info fas fa-circle-info"></i>
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
                <div class="form-group col-6 col-lg-3">
                  <label>
                    Maximum extra credit
                    <button
                      type="button"
                      class="btn btn-sm"
                      data-toggle="tooltip"
                      data-placement="bottom"
                      title="By default, points are limited to the maximum points assigned to the question, and credit assigned by rubric items do not violate this limit. This value allows rubric points to extend beyond this limit, e.g., for bonus credit."
                    >
                      <i class="text-info fas fa-circle-info"></i>
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
              </div>
              <div>
                <div class="table-responsive">
                  <table class="table table-sm table-striped js-rubric-items-table mt-2">
                    <thead>
                      <tr class="text-nowrap">
                        <th style="width: 1px"><!-- Order --></th>
                        <th>Points</th>
                        <th>Description</th>
                        <th>Detailed explanation (optional)</th>
                        <th>Grader note (optional, not visible to students)</th>
                        <th>Show to students</th>
                        <th>In use</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rubric_data?.rubric_items?.map((item, index) => RubricItemRow(item, index))}
                      <tr
                        class="js-no-rubric-item-note ${rubric_data?.rubric_items?.length
                          ? 'd-none'
                          : ''}"
                      >
                        <td colspan="7">
                          <em>
                            This question does not have any rubric items. Click "Add item" below to
                            add
                            some${rubric_data
                              ? html`, or select <strong>Disable rubric</strong> below to switch
                                  back to manual grade input`
                              : ''}.
                          </em>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="js-settings-points-warning-placeholder"></div>
                <button type="button" class="btn btn-sm btn-secondary js-add-rubric-item-button">
                  Add item
                </button>
                <template class="js-new-row-rubric-item">
                  ${RubricItemRow(null, rubric_data?.rubric_items?.length ?? 0)}
                </template>
                ${MustachePatterns({ resLocals })}
              </div>
              <hr />
              <div class="form-check">
                <label class="form-check-label">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    value="true"
                    name="tag_for_manual_grading"
                  />
                  Require all graded submissions to be manually graded/reviewed
                </label>
                <button
                  type="button"
                  class="btn btn-sm"
                  data-toggle="tooltip"
                  data-placement="top"
                  title="Changes in rubric item values update the points for all previously graded submissions. If this option is selected, these submissions will also be tagged for manual grading, requiring a review by a grader."
                >
                  <i class="text-info fas fa-circle-info"></i>
                </button>
              </div>
            </div>
            <div class="js-settings-error-alert-placeholder"></div>
            <div class="modal-footer">
              ${resLocals.authz_data.has_course_instance_permission_edit
                ? [
                    rubric_data
                      ? html`
                          <button
                            type="button"
                            class="btn btn-link btn-sm js-disable-rubric-button mr-auto"
                          >
                            Disable rubric
                          </button>
                        `
                      : '',
                    html`<button type="submit" class="btn btn-primary">Save rubric</button>`,
                  ]
                : ''}
              <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}

function RubricItemRow(item: RubricData['rubric_items'][0] | null, index: number) {
  const namePrefix = item ? `rubric_item[cur${item.id}]` : `rubric_item[new]`;
  return html`
    <tr>
      <td class="text-nowrap">
        ${item ? html`<input type="hidden" name="${namePrefix}[id]" value="${item.id}" />` : ''}
        <input
          type="hidden"
          class="js-rubric-item-row-order"
          name="${namePrefix}[order]"
          value="${index}"
        />
        <button type="button" class="btn btn-sm js-rubric-item-move-button" draggable="true">
          <i class="fas fa-arrows-up-down"></i>
        </button>
        <button type="button" class="btn btn-sm sr-only js-rubric-item-move-down-button">
          Move down
        </button>
        <button type="button" class="btn btn-sm sr-only js-rubric-item-move-up-button">
          Move up
        </button>
        <button type="button" class="btn btn-sm js-rubric-item-delete text-danger">
          <i class="fas fa-trash"></i>
          <span class="sr-only">Delete</span>
        </button>
      </td>
      <td>
        <input
          type="number"
          class="form-control js-rubric-item-points"
          style="width: 4rem"
          step="any"
          required
          name="${namePrefix}[points]"
          value="${item?.points}"
        />
      </td>
      <td>
        <input
          type="text"
          class="form-control js-rubric-item-description"
          required
          maxlength="100"
          style="min-width: 15rem"
          name="${namePrefix}[description]"
          value="${item?.description}"
        />
      </td>
      <td>
        <label
          class="js-rubric-item-explanation"
          data-input-name="${namePrefix}[explanation]"
          data-current-value="${item?.explanation}"
        >
          ${item?.explanation}
          <button type="button" class="btn btn-sm js-rubric-item-long-text-field">
            <i class="fas fa-pencil"></i>
          </button>
        </label>
      </td>
      <td>
        <label
          class="js-rubric-item-grader-note"
          data-input-name="${namePrefix}[grader_note]"
          data-current-value="${item?.grader_note}"
        >
          ${item?.grader_note}
          <button type="button" class="btn btn-sm js-rubric-item-long-text-field">
            <i class="fas fa-pencil"></i>
          </button>
        </label>
      </td>
      <td>
        <div class="form-check form-check-inline">
          <label class="form-check-label text-nowrap">
            <input
              type="radio"
              class="form-check-input js-rubric-item-always-show"
              required
              name="${namePrefix}[always_show_to_students]"
              value="true"
              ${!item || item.always_show_to_students ? 'checked' : ''}
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
              ${!item || item.always_show_to_students ? '' : 'checked'}
            />If selected
          </label>
        </div>
      </td>
      <td class="text-nowrap">
        ${!item
          ? 'New'
          : !item.num_submissions
            ? 'No'
            : item.num_submissions === 1
              ? '1 submission'
              : `${item.num_submissions} submissions`}
      </td>
    </tr>
  `;
}

function MustachePatterns({ resLocals }: { resLocals: Record<string, any> }) {
  if (
    !resLocals.variant.params &&
    !resLocals.variant.true_answer &&
    !resLocals.submission?.submitted_answer
  ) {
    return '';
  }
  const groups = [
    [resLocals.variant.params, 'params'],
    [resLocals.variant.true_answer, 'correct_answers'],
    [resLocals.submission?.submitted_answer, 'submitted_answers'],
  ];
  return html`
    <div class="small form-text text-muted">
      Rubric items may use these entries, which are replaced with the corresponding values for the
      student variant (click to copy):
      <ul style="max-height: 7rem; overflow-y: auto;">
        ${groups.map(([group, groupName]) =>
          Object.keys(group || {}).map(
            (key) => html`
              <li>
                <code class="js-copy-on-click" data-clipboard-text="{{${groupName}.${key}}}"
                  >{{${groupName}.${key}}}</code
                >
              </li>
            `,
          ),
        )}
      </ul>
    </div>
  `;
}
