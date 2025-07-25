import { filesize } from 'filesize';

import { EncodedData } from '@prairielearn/browser-utils';
import { escapeHtml, html } from '@prairielearn/html';

import { config } from '../../../lib/config.js';
import { type RubricData } from '../../../lib/manualGrading.js';

// Popover for users to import rubric settings from a JSON file.
function ImportRubricSettingsPopover() {
  return html`
    <form
      id="import-rubric-settings-popover-form"
      class="needs-validation"
      name="rubric-upload-form"
      enctype="multipart/form-data"
      novalidate
    >
      <div class="mb-3">
        <label class="form-label" for="rubric-settings-file-input">Choose file</label>
        <input
          type="file"
          name="file"
          class="form-control"
          id="rubric-settings-file-input"
          accept="application/json,.json"
          required
        />
        <small class="form-text text-muted">
          Max file size: ${filesize(config.fileUploadMaxBytes, { base: 10, round: 0 })}
        </small>
        <div class="mb-3">
          <div class="text-right">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">
              Cancel
            </button>
            <button id="upload-rubric-file-button" type="submit" class="btn btn-primary">
              Upload file
            </button>
          </div>
        </div>
      </div>
    </form>
  `;
}

export function RubricSettingsModal({ resLocals }: { resLocals: Record<string, any> }) {
  const rubric_data = resLocals.rubric_data as RubricData | null | undefined;
  return html`
    <div class="modal js-rubric-settings-modal" tabindex="-1" role="dialog">
      <div class="modal-dialog border-info" style="max-width: 98vw" role="document">
        <form
          id="rubric-settings-form"
          name="rubric-settings"
          method="POST"
          class="needs-validation"
          data-max-points="${resLocals.assessment_question.max_points}"
        >
          <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
          <input type="hidden" name="__action" value="modify_rubric_settings" />
          <input
            type="hidden"
            name="modified_at"
            value="${rubric_data?.modified_at.toISOString()}"
          />
          <input type="hidden" name="use_rubric" value="true" />

          ${EncodedData<{
            course_short_name: string;
            course_instance_short_name: string;
            assessment_tid: string;
            question_qid: string;

            max_points: number | null;
            max_auto_points: number | null;
            max_manual_points: number | null;

            file_upload_max_bytes: number;
          }>(
            {
              course_short_name: resLocals.course.short_name,
              course_instance_short_name: resLocals.course_instance.short_name,
              assessment_tid: resLocals.assessment.tid,
              question_qid: resLocals.question.qid,

              max_points: resLocals.assessment_question.max_points,
              max_auto_points: resLocals.assessment_question.max_auto_points,
              max_manual_points: resLocals.assessment_question.max_manual_points,

              file_upload_max_bytes: config.fileUploadMaxBytes,
            },
            'rubric-settings-data',
          )}

          <div class="modal-content">
            <div class="modal-header bg-info">
              <h5 class="modal-title">Rubric settings</h5>
              <button
                type="button"
                class="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div class="modal-body">
              ${resLocals.assessment_question.max_auto_points
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
                              data-max-points="${resLocals.assessment_question.max_manual_points}"
                              ${(rubric_data?.replace_auto_points ??
                              !resLocals.assessment_question.max_manual_points)
                                ? ''
                                : 'checked'}
                            />
                            Apply rubric to manual points (out of
                            ${resLocals.assessment_question.max_manual_points}, keep auto points)
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
                              data-max-points="${resLocals.assessment_question.max_points}"
                              ${(rubric_data?.replace_auto_points ??
                              !resLocals.assessment_question.max_manual_points)
                                ? 'checked'
                                : ''}
                            />
                            Apply rubric to total points (out of
                            ${resLocals.assessment_question.max_points}, ignore auto points)
                          </label>
                          <button
                            type="button"
                            class="btn btn-sm btn-ghost"
                            data-bs-toggle="tooltip"
                            data-bs-placement="bottom"
                            data-bs-title="If the rubric is applied to total points, then a student's auto points will be ignored, and the rubric items will be based on the total points of the question (${resLocals
                              .assessment_question.max_points} points)."
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
                        value="${resLocals.assessment_question.max_manual_points}"
                        required
                        ${rubric_data?.starting_points ? 'checked' : ''}
                      />
                      Negative grading (start at <span class="js-rubric-max-points-info"></span>,
                      subtract penalties)
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
                      step="any"
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
                      step="any"
                      required
                      value="${rubric_data?.max_extra_points ?? 0}"
                    />
                  </label>
                </div>
              </div>
              <div>
                <div class="table-responsive">
                  <table
                    class="table table-sm table-striped js-rubric-items-table mt-2"
                    aria-label="Rubric items"
                  >
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
                      ${rubric_data?.rubric_items?.map((item, index) =>
                        RubricItemRow({ item, index }),
                      )}
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
                <button id="export-rubric-button" type="button" class="btn btn-sm btn-primary">
                  <i class="fas fa-download"></i>
                  Export rubric
                </button>
                <button
                  id="import-rubric-button"
                  type="button"
                  class="btn btn-sm btn-primary"
                  data-bs-title="Import rubric settings"
                  data-bs-toggle="popover"
                  data-bs-placement="auto"
                  data-bs-html="true"
                  data-bs-container="body"
                  data-bs-content="${escapeHtml(ImportRubricSettingsPopover())}"
                >
                  <i class="fas fa-upload"></i>
                  Import rubric
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-ghost"
                  data-bs-toggle="tooltip"
                  data-bs-placement="bottom"
                  data-bs-title="Imported rubric point values will be scaled to match the maximum points for this question."
                >
                  <i class="fas fa-circle-info"></i>
                </button>
                <template class="js-new-row-rubric-item">
                  ${RubricItemRow({ item: null, index: rubric_data?.rubric_items?.length ?? 0 })}
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
                  class="btn btn-sm btn-ghost"
                  data-bs-toggle="tooltip"
                  data-bs-placement="top"
                  data-bs-title="Changes in rubric item values update the points for all previously graded submissions. If this option is selected, these submissions will also be tagged for manual grading, requiring a review by a grader."
                >
                  <i class="fas fa-circle-info"></i>
                </button>
              </div>
            </div>
            <div class="js-settings-error-alert-placeholder"></div>
            <div class="modal-footer">
              ${resLocals.authz_data.has_course_instance_permission_edit
                ? html`
                    ${rubric_data
                      ? html`
                          <button
                            type="button"
                            class="btn btn-link btn-sm js-disable-rubric-button me-auto"
                          >
                            Disable rubric
                          </button>
                        `
                      : ''}
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                      Cancel
                    </button>
                    <button type="submit" class="btn btn-primary">Save rubric</button>
                  `
                : html`
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                      Close
                    </button>
                  `}
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}

function RubricItemRow({
  item,
  index,
}: {
  item: RubricData['rubric_items'][0] | null;
  index: number;
}) {
  const namePrefix = item ? `rubric_item[cur${item.id}]` : 'rubric_item[new]';
  return html`
    <tr>
      <td class="text-nowrap align-middle">
        ${item ? html`<input type="hidden" name="${namePrefix}[id]" value="${item.id}" />` : ''}
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
        <input
          type="number"
          class="form-control js-rubric-item-points"
          style="width: 5rem"
          step="any"
          required
          name="${namePrefix}[points]"
          value="${item?.points}"
          aria-label="Points"
        />
      </td>
      <td class="align-middle">
        <input
          type="text"
          class="form-control js-rubric-item-description"
          required
          maxlength="100"
          style="min-width: 15rem"
          name="${namePrefix}[description]"
          value="${item?.description}"
          aria-label="Description"
        />
      </td>
      <td class="align-middle">
        ${item?.explanation
          ? html` <label
              for="rubric-item-explanation-button-${item.id}"
              style="white-space: pre-wrap;"
              >${item?.explanation}</label
            >`
          : ''}
        <button
          ${item ? html`id="rubric-item-explanation-button-${item.id}"` : ''}
          type="button"
          class="btn btn-sm btn-ghost js-rubric-item-long-text-field js-rubric-item-explanation"
          data-input-name="${namePrefix}[explanation]"
          data-current-value="${item?.explanation}"
        >
          <i class="fas fa-pencil"></i>
        </button>
      </td>
      <td class="align-middle">
        ${item?.grader_note
          ? html`<label
              for="rubric-item-grader-note-button-${item.id}"
              style="white-space: pre-wrap;"
              >${item?.grader_note}</label
            > `
          : ''}
        <button
          ${item ? html`id="rubric-item-grader-note-button-${item.id}"` : ''}
          type="button"
          class="btn btn-sm btn-ghost js-rubric-item-long-text-field js-rubric-item-grader-note"
          data-input-name="${namePrefix}[grader_note]"
          data-current-value="${item?.grader_note}"
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
      <td class="text-nowrap align-middle">
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
