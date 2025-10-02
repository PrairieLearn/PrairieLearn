import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { GitHubButtonHtml } from '../../components/GitHubButton.js';
import { PublicLinkSharingHtml, StudentLinkSharingHtml } from '../../components/LinkSharing.js';
import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { QRCodeModalHtml } from '../../components/QRCodeModal.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { type AssessmentModule, type AssessmentSet } from '../../lib/db-types.js';

export function InstructorAssessmentSettings({
  resLocals,
  origHash,
  assessmentGHLink,
  tids,
  studentLink,
  publicLink,
  infoAssessmentPath,
  assessmentSets,
  assessmentModules,
  canEdit,
}: {
  resLocals: Record<string, any>;
  origHash: string;
  assessmentGHLink: string | null;
  tids: string[];
  studentLink: string;
  publicLink: string;
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
      ${renderHtml(
        <AssessmentSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          assessment={resLocals.assessment}
          courseInstance={resLocals.course_instance}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      ${QRCodeModalHtml({
        id: 'studentLinkModal',
        title: 'Student Link QR Code',
        content: studentLink,
      })}
      ${QRCodeModalHtml({
        id: 'publicLinkModal',
        title: 'Public Link QR Code',
        content: publicLink,
      })}
      <div class="card mb-4">
        <div
          class="card-header bg-primary text-white d-flex align-items-center justify-content-between"
        >
          <h1>${resLocals.assessment_set.name} ${resLocals.assessment.number}: Settings</h1>
          ${GitHubButtonHtml(assessmentGHLink)}
        </div>
        <div class="card-body">
          <form name="edit-assessment-settings-form" method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="orig_hash" value="${origHash}" />
            <div class="mb-3">
              <label class="form-label" for="aid">AID</label>
              <input
                type="text"
                class="form-control font-monospace"
                id="aid"
                name="aid"
                value="${resLocals.assessment.tid}"
                pattern="[\\-A-Za-z0-9_\\/]+"
                data-other-values="${tids.join(',')}"
                ${canEdit ? '' : 'disabled'}
              />
              <small class="form-text text-muted">
                The unique identifier for this assessment. This may contain only letters, numbers,
                dashes, and underscores, with no spaces. You may use forward slashes to separate
                directories.
              </small>
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
            <div class="mb-3">
              <label class="form-label" for="type">Type</label>
              <input
                type="text"
                class="form-control"
                id="type"
                name="type"
                value="${resLocals.assessment.type}"
                disabled
              />
              <small class="form-text text-muted">
                The type of the assessment. This can be either Homework or Exam.
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label" for="set">Set</label>
              <select class="form-select" id="set" name="set" ${canEdit ? '' : 'disabled'}>
                ${assessmentSets.map(
                  (set) => html`
                    <option
                      value="${set.name}"
                      ${resLocals.assessment_set.name === set.name ? 'selected' : ''}
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
            <div class="mb-3">
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
            <div class="mb-3">
              <label class="form-label" for="module">Module</label>
              <select class="form-select" id="module" name="module" ${canEdit ? '' : 'disabled'}>
                ${assessmentModules.map(
                  (module) => html`
                    <option
                      value="${module.name}"
                      ${resLocals.assessment_module.name === module.name ? 'selected' : ''}
                    >
                      ${module.name}
                    </option>
                  `,
                )}
              </select>
              <small class="form-text text-muted">
                The <a href="${resLocals.urlPrefix}/course_admin/modules">module</a> this assessment
                belongs to.
              </small>
            </div>
            <div class="mb-3">
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
            <div class="mb-3">
              <div class="mb-3 form-check">
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
                  Whether to allow students to report issues for assessment questions.
                </div>
              </div>
            </div>
            ${resLocals.assessment.type === 'Exam'
              ? html`
                  <div class="mb-3 form-check">
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
                      Whether to allow students to create additional instances of the assessment.
                    </div>
                  </div>
                `
              : ''}
            <div class="mb-3 form-check">
              <input
                class="form-check-input"
                type="checkbox"
                id="allow_personal_notes"
                name="allow_personal_notes"
                ${canEdit ? '' : 'disabled'}
                ${resLocals.assessment.allow_personal_notes ? 'checked' : ''}
              />
              <label class="form-check-label" for="allow_personal_notes"
                >Allow personal notes</label
              >
              <div class="small text-muted">
                Whether students are allowed to upload personal notes for this assessment.
              </div>
            </div>
            ${resLocals.assessment.type === 'Exam'
              ? html`
                  <div class="mb-3 form-check">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="auto_close"
                      name="auto_close"
                      ${canEdit ? '' : 'disabled'}
                      ${resLocals.assessment.auto_close ? 'checked' : ''}
                    />
                    <label class="form-check-label" for="auto_close">Auto close</label>
                    <div class="small text-muted">
                      Whether to automatically close the assessment after 6 hours of inactivity.
                    </div>
                  </div>
                `
              : ''}
            ${resLocals.assessment.type === 'Exam'
              ? html`
                  <div class="mb-3 form-check">
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
                      Requires the student to accept an honor code before starting exam assessments.
                    </div>
                  </div>
                `
              : ''}
            ${resLocals.assessment.type === 'Exam'
              ? html`
                  <div
                    class="mb-3"
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
                      Custom honor code text that will be shown to students before starting the
                      exam. While this field cannot accept HTML, you can use Markdown formatting.
                      The user's name can be included with Mustache templating:
                      <code>{{user_name}}</code>. To use the default honor code, leave this blank.
                    </small>
                  </div>
                `
              : ''}
            ${StudentLinkSharingHtml({
              studentLink,
              studentLinkMessage: 'The link that students will use to access this assessment.',
            })}
            <h2 class="h4">Sharing</h2>
            ${resLocals.assessment.share_source_publicly
              ? PublicLinkSharingHtml({
                  publicLink,
                  sharingMessage: "This assessment's source is publicly shared.",
                  publicLinkMessage:
                    'The link that other instructors can use to view this assessment.',
                })
              : html`<p>This assessment is not being shared.</p>`}
            ${resLocals.authz_data.has_course_permission_view
              ? canEdit
                ? html`
                    <div>
                      <button
                        id="save-button"
                        type="submit"
                        class="btn btn-primary mb-2"
                        name="__action"
                        value="update_assessment"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        class="btn btn-secondary mb-2"
                        onclick="window.location.reload()"
                      >
                        Cancel
                      </button>
                    </div>
                    <a
                      data-testid="edit-assessment-configuration-link"
                      href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                        .id}/file_edit/${infoAssessmentPath}"
                      >Edit assessment configuration</a
                    >
                    in <code>infoAssessment.json</code>
                  `
                : html`
                    <a
                      href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                        .id}/file_view/${infoAssessmentPath}"
                    >
                      View assessment configuration
                    </a>
                    in <code>infoAssessment.json</code>
                  `
              : ''}
          </form>
        </div>
        ${canEdit
          ? html`
              <div class="card-footer d-flex flex-wrap align-items-center">
                <form name="copy-assessment-form" class="me-2" method="POST">
                  <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                  <button
                    type="submit"
                    name="__action"
                    value="copy_assessment"
                    class="btn btn-sm btn-primary"
                  >
                    <i class="fa fa-clone"></i> Make a copy of this assessment
                  </button>
                </form>
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  href="#"
                  data-bs-toggle="modal"
                  data-bs-target="#deleteAssessmentModal"
                >
                  <i class="fa fa-times" aria-hidden="true"></i> Delete this assessment
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
              </div>
            `
          : ''}
      </div>
    `,
  });
}
