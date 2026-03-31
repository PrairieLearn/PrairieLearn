import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/react';

import { GitHubButtonHtml } from '../../components/GitHubButton.js';
import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { QRCodeModalHtml } from '../../components/QRCodeModal.js';
import { AssessmentShortNameDescription } from '../../components/ShortNameDescriptions.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { type AssessmentModule, type AssessmentSet } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { SHORT_NAME_PATTERN } from '../../lib/short-name.js';

export function InstructorAssessmentSettings({
  resLocals,
  origHash,
  assessmentGHLink,
  tids,
  studentLink,
  infoAssessmentPath,
  assessmentSets,
  assessmentModules,
  canEdit,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  origHash: string;
  assessmentGHLink: string | null;
  tids: string[];
  studentLink: string;
  infoAssessmentPath: string;
  assessmentSets: AssessmentSet[];
  assessmentModules: AssessmentModule[];
  canEdit: boolean;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Settings',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'settings',
    },
    headContent: html` ${compiledScriptTag('instructorAssessmentSettingsClient.ts')} `,
    content: html`
      ${QRCodeModalHtml({
        id: 'studentLinkModal',
        title: 'Student link QR code',
        content: studentLink,
      })}

      <!-- Actions bar -->
      <div class="card mb-4">
        <div class="card-body d-flex flex-wrap align-items-center gap-2">
          ${canEdit
            ? html`
                <form name="copy-assessment-form" method="POST" class="d-inline">
                  <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                  <button
                    type="submit"
                    name="__action"
                    value="copy_assessment"
                    class="btn btn-sm btn-outline-secondary"
                  >
                    <i class="bi bi-copy" aria-hidden="true"></i> Copy assessment
                  </button>
                </form>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-danger"
                  data-bs-toggle="modal"
                  data-bs-target="#deleteAssessmentModal"
                >
                  <i class="bi bi-trash" aria-hidden="true"></i> Delete assessment
                </button>
                ${Modal({
                  id: 'deleteAssessmentModal',
                  title: 'Delete assessment',
                  body: html`
                    <p>
                      Are you sure you want to delete the assessment
                      <strong>${resLocals.assessment.tid}</strong>?
                    </p>
                  `,
                  footer: html`
                    <input type="hidden" name="__action" value="delete_assessment" />
                    <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                      Cancel
                    </button>
                    <button type="submit" class="btn btn-danger">Delete</button>
                  `,
                })}
              `
            : ''}
          <div class="d-flex align-items-center gap-2 ms-auto">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              data-bs-toggle="modal"
              data-bs-target="#studentLinkModal"
            >
              <i class="bi bi-link-45deg" aria-hidden="true"></i> Student link
            </button>
            ${GitHubButtonHtml(assessmentGHLink)}
            ${resLocals.authz_data.has_course_permission_view
              ? canEdit
                ? html`
                    <a
                      data-testid="edit-assessment-configuration-link"
                      class="btn btn-sm btn-outline-secondary"
                      href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                        .id}/file_edit/${infoAssessmentPath}"
                    >
                      <i class="bi bi-code-slash" aria-hidden="true"></i> Edit JSON
                    </a>
                  `
                : html`
                    <a
                      class="btn btn-sm btn-outline-secondary"
                      href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                        .id}/file_view/${infoAssessmentPath}"
                    >
                      <i class="bi bi-code-slash" aria-hidden="true"></i> View JSON
                    </a>
                  `
              : ''}
          </div>
        </div>
      </div>

      <form name="edit-assessment-settings-form" method="POST">
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        <input type="hidden" name="orig_hash" value="${origHash}" />

        <!-- General -->
        <div class="card mb-4">
          <div class="card-body">
            <h2 class="h5 card-title">General</h2>
            <p class="text-muted small">Identity and classification for this assessment.</p>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label" for="aid">Short name</label>
                <input
                  type="text"
                  class="form-control font-monospace"
                  id="aid"
                  name="aid"
                  value="${resLocals.assessment.tid}"
                  pattern="${
                    // TODO: if/when this page is converted to React, use `validateShortName`
                    // from `../../lib/short-name.js` with react-hook-form to provide more specific
                    // validation feedback (e.g., "cannot start with a slash").
                    SHORT_NAME_PATTERN
                  }|${
                    // NOTE: this will not be compatible with browsers, as it was only
                    // just added to modern browsers as of January 2025. If/when this
                    // page is converted to React, we should use a custom validation
                    // function instead of the `pattern` attribute to enforce this.
                    // @ts-expect-error -- https://github.com/microsoft/TypeScript/issues/61321
                    RegExp.escape(resLocals.assessment.tid)
                  }"
                  data-other-values="${tids.join(',')}"
                  ${canEdit ? '' : 'disabled'}
                />
                <small class="form-text text-muted">
                  ${renderHtml(<AssessmentShortNameDescription />)}
                </small>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label" for="type">Type</label>
                <input
                  type="text"
                  class="form-control"
                  id="type"
                  name="type"
                  value="${resLocals.assessment.type}"
                  disabled
                />
                <small class="form-text text-muted"> Homework or Exam. </small>
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label" for="title">Title</label>
              <input
                type="text"
                class="form-control"
                id="title"
                name="title"
                value="${resLocals.assessment.title}"
                ${canEdit ? '' : 'disabled'}
              />
              <small class="form-text text-muted"> The title of the assessment. </small>
            </div>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label" for="set">Set</label>
                <select class="form-select" id="set" name="set" ${canEdit ? '' : 'disabled'}>
                  ${assessmentSets.map(
                    (set) => html`
                      <option
                        value="${set.name}"
                        ${resLocals.assessment_set.id === set.id ? 'selected' : ''}
                      >
                        ${set.name}
                      </option>
                    `,
                  )}
                </select>
                <small class="form-text text-muted">
                  The
                  <a href="${resLocals.urlPrefix}/course_admin/sets">assessment set</a>
                  this assessment belongs to.
                </small>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label" for="number">Number</label>
                <input
                  type="text"
                  class="form-control"
                  id="number"
                  name="number"
                  value="${resLocals.assessment.number}"
                  ${canEdit ? '' : 'disabled'}
                />
                <small class="form-text text-muted">
                  The number of the assessment within the set.
                </small>
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label" for="module">Module</label>
              <select class="form-select" id="module" name="module" ${canEdit ? '' : 'disabled'}>
                ${assessmentModules.map(
                  (module) => html`
                    <option
                      value="${module.name}"
                      ${resLocals.assessment_module?.id === module.id ? 'selected' : ''}
                    >
                      ${module.name}
                    </option>
                  `,
                )}
              </select>
              <small class="form-text text-muted">
                The
                <a href="${resLocals.urlPrefix}/course_admin/modules">module</a>
                this assessment belongs to.
              </small>
            </div>
            <div class="mb-0">
              <label class="form-label" for="text">Text</label>
              <textarea
                class="form-control js-textarea-autosize"
                id="text"
                name="text"
                ${canEdit ? '' : 'disabled'}
              >
                    ${resLocals.assessment.text}</textarea
              >
              <small class="form-text text-muted">
                HTML text shown on the assessment overview page.
              </small>
            </div>
          </div>
        </div>

        <!-- Scoring -->
        <div class="card mb-4">
          <div class="card-body">
            <h2 class="h5 card-title">Scoring</h2>
            <p class="text-muted small">Configure how points are calculated for this assessment.</p>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label" for="max_points">Maximum points</label>
                <input
                  type="number"
                  class="form-control"
                  id="max_points"
                  name="max_points"
                  value="${resLocals.assessment.max_points ?? ''}"
                  placeholder="Auto (sum of zones)"
                  min="0"
                  step="any"
                  ${canEdit ? '' : 'disabled'}
                />
                <small class="form-text text-muted"> Points needed for 100% score. </small>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label" for="max_bonus_points">Bonus points</label>
                <input
                  type="number"
                  class="form-control"
                  id="max_bonus_points"
                  name="max_bonus_points"
                  value="${resLocals.assessment.max_bonus_points ?? ''}"
                  placeholder="0"
                  min="0"
                  step="any"
                  ${canEdit ? '' : 'disabled'}
                />
                <small class="form-text text-muted">
                  Maximum additional points beyond the maximum.
                </small>
              </div>
            </div>
            ${resLocals.assessment.type === 'Homework'
              ? html`
                  <div class="form-check border-top pt-3">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="constant_question_value"
                      name="constant_question_value"
                      ${canEdit ? '' : 'disabled'}
                      ${resLocals.assessment.constant_question_value ? 'checked' : ''}
                    />
                    <label class="form-check-label" for="constant_question_value">
                      Constant question value
                    </label>
                    <div class="small text-muted">
                      Disable retry penalty &mdash; questions keep full value regardless of
                      attempts.
                    </div>
                  </div>
                `
              : ''}
          </div>
        </div>

        <!-- Question behaviour -->
        <div class="card mb-4">
          <div class="card-body">
            <h2 class="h5 card-title">Question behaviour</h2>
            <p class="text-muted small">Control how questions are presented and navigated.</p>
            <div class="form-check mb-3">
              <input
                class="form-check-input"
                type="checkbox"
                id="shuffle_questions"
                name="shuffle_questions"
                ${canEdit ? '' : 'disabled'}
                ${resLocals.assessment.shuffle_questions ? 'checked' : ''}
              />
              <label class="form-check-label" for="shuffle_questions"> Shuffle questions </label>
              <div class="small text-muted">
                Randomize question order within zones.
                ${resLocals.assessment.type === 'Exam'
                  ? 'Enabled by default for exams.'
                  : 'Disabled by default for homework.'}
              </div>
            </div>
            ${resLocals.assessment.type === 'Exam'
              ? html`
                  <div class="border-top pt-3">
                    <label class="form-label" for="advance_score_perc">
                      Advance score threshold
                    </label>
                    <div class="row">
                      <div class="col-md-4">
                        <div class="input-group">
                          <input
                            type="number"
                            class="form-control"
                            id="advance_score_perc"
                            name="advance_score_perc"
                            min="0"
                            max="100"
                            step="1"
                            value="${resLocals.assessment.advance_score_perc ?? 0}"
                            ${canEdit ? '' : 'disabled'}
                          />
                          <span class="input-group-text">%</span>
                        </div>
                      </div>
                    </div>
                    <small class="form-text text-muted">
                      Minimum score percentage to unlock the next question.
                    </small>
                  </div>
                `
              : ''}
          </div>
        </div>

        <!-- Grading -->
        <div class="card mb-4">
          <div class="card-body">
            <h2 class="h5 card-title">Grading</h2>
            <p class="text-muted small">Configure grading behaviour and submission rate limits.</p>
            ${resLocals.assessment.type === 'Exam'
              ? html`
                  <div class="form-check mb-3">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="allow_real_time_grading"
                      name="allow_real_time_grading"
                      ${canEdit ? '' : 'disabled'}
                      ${resLocals.assessment.json_allow_real_time_grading !== false
                        ? 'checked'
                        : ''}
                    />
                    <label class="form-check-label" for="allow_real_time_grading">
                      Allow real-time grading
                    </label>
                    <div class="small text-muted">
                      Allow students to grade submissions during the assessment. Enabled by default.
                    </div>
                  </div>
                `
              : ''}
            <div class="${resLocals.assessment.type === 'Exam' ? 'border-top pt-3' : ''}">
              <label class="form-label" for="grade_rate_minutes">Grade rate minutes</label>
              <div class="row">
                <div class="col-md-4">
                  <input
                    type="number"
                    class="form-control"
                    id="grade_rate_minutes"
                    name="grade_rate_minutes"
                    value="${resLocals.assessment.json_grade_rate_minutes ?? ''}"
                    placeholder="0"
                    min="0"
                    step="any"
                    ${canEdit ? '' : 'disabled'}
                  />
                </div>
              </div>
              <small class="form-text text-muted">
                Minimum time in minutes between graded submissions to the same question.
              </small>
            </div>
          </div>
        </div>

        <!-- Student options -->
        <div class="card mb-4">
          <div class="card-body">
            <h2 class="h5 card-title">Student options</h2>
            <p class="text-muted small">Control what students can do during the assessment.</p>
            <div class="form-check mb-3">
              <input
                class="form-check-input"
                type="checkbox"
                id="allow_issue_reporting"
                name="allow_issue_reporting"
                ${canEdit ? '' : 'disabled'}
                ${resLocals.assessment.allow_issue_reporting ? 'checked' : ''}
              />
              <label class="form-check-label" for="allow_issue_reporting">
                Allow issue reporting
              </label>
              <div class="small text-muted">
                Allow students to report issues for assessment questions.
              </div>
            </div>
            <div class="form-check mb-3">
              <input
                class="form-check-input"
                type="checkbox"
                id="allow_personal_notes"
                name="allow_personal_notes"
                ${canEdit ? '' : 'disabled'}
                ${resLocals.assessment.allow_personal_notes ? 'checked' : ''}
              />
              <label class="form-check-label" for="allow_personal_notes">
                Allow personal notes
              </label>
              <div class="small text-muted">
                Allow students to upload personal notes for this assessment.
              </div>
            </div>
            ${resLocals.assessment.type === 'Exam'
              ? html`
                  <div class="form-check mb-3">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="multiple_instance"
                      name="multiple_instance"
                      ${canEdit ? '' : 'disabled'}
                      ${resLocals.assessment.multiple_instance ? 'checked' : ''}
                    />
                    <label class="form-check-label" for="multiple_instance">
                      Multiple instances
                    </label>
                    <div class="small text-muted">
                      Allow students to create additional instances of the assessment.
                    </div>
                  </div>
                  <div class="form-check mb-3">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="auto_close"
                      name="auto_close"
                      ${canEdit ? '' : 'disabled'}
                      ${resLocals.assessment.auto_close ? 'checked' : ''}
                    />
                    <label class="form-check-label" for="auto_close"> Auto close </label>
                    <div class="small text-muted">
                      Automatically close the assessment after 6 hours of inactivity.
                    </div>
                  </div>
                  <div class="form-check mb-3">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="require_honor_code"
                      name="require_honor_code"
                      ${canEdit ? '' : 'disabled'}
                      ${resLocals.assessment.require_honor_code ? 'checked' : ''}
                    />
                    <label class="form-check-label" for="require_honor_code">
                      Require honor code
                    </label>
                    <div class="small text-muted">
                      Require students to accept an honor code before starting the exam.
                    </div>
                  </div>
                  <div
                    class="mb-0"
                    id="honor_code_group"
                    ${resLocals.assessment.require_honor_code ? '' : 'hidden'}
                  >
                    <label class="form-label" for="honor_code">Custom honor code</label>
                    <textarea
                      class="form-control js-textarea-autosize"
                      id="honor_code"
                      name="honor_code"
                      ${canEdit ? '' : 'disabled'}
                    >
${resLocals.assessment.honor_code}</textarea
                    >
                    <small class="form-text text-muted">
                      Custom honor code text shown to students before starting the exam. Supports
                      Markdown formatting. Use <code>{{user_name}}</code> to include the student's
                      name. Leave blank for the default honor code.
                    </small>
                  </div>
                `
              : ''}
          </div>
        </div>

        ${canEdit
          ? html`
              <!-- Sticky save bar -->
              <div style="position: sticky; bottom: 0; margin-bottom: -1rem;">
                <div
                  style="height: 2rem; background: linear-gradient(to bottom, rgba(255,255,255,0), white); pointer-events: none;"
                ></div>
                <div class="d-flex gap-2 pb-3" style="background-color: white;">
                  <button
                    id="save-button"
                    type="submit"
                    class="btn btn-primary"
                    name="__action"
                    value="update_assessment"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary"
                    onclick="window.location.reload()"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            `
          : ''}
      </form>
    `,
  });
}
