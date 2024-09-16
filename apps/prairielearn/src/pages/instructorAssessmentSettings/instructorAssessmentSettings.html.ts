import { html } from '@prairielearn/html';

import { ChangeIdButton } from '../../components/ChangeIdButton.html.js';
import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { compiledScriptTag } from '../../lib/assets.js';

export function InstructorAssessmentSettings({
  resLocals,
  tids,
  studentLink,
  infoAssessmentPath,
}: {
  resLocals: Record<string, any>;
  tids: string[];
  studentLink: string;
  infoAssessmentPath: string;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })} ${compiledScriptTag('instructorAssessmentSettingsClient.ts')}
        <style>
          .popover {
            max-width: 50%;
          }
        </style>
      </head>

      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container">
          ${AssessmentSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            assessment: resLocals.assessment,
            courseInstance: resLocals.course_instance,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">
              <h1>${resLocals.assessment_set.name} ${resLocals.assessment.number}: Settings</h1>
            </div>
            <div class="card-body">
              <form>
                <div class="form-group">
                  <label for="title">Title</label>
                  <input
                    type="text"
                    class="form-control"
                    id="title"
                    name="title"
                    value="${resLocals.assessment.title}"
                    disabled
                  />
                  <small class="form-text text-muted"> The title of the assessment. </small>
                </div>
                <div class="form-group">
                  <label for="type">Type</label>
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
                <div class="form-group">
                  <label for="set">Set</label>
                  <input
                    type="text"
                    class="form-control"
                    id="set"
                    name="set"
                    value="${resLocals.assessment_set.name} (${resLocals.assessment_set
                      .abbreviation})"
                    disabled
                  />
                  <small class="form-text text-muted">
                    The
                    <a href="${resLocals.urlPrefix}/course_admin/sets">assessment set</a>
                    this assessment belongs to.
                  </small>
                </div>
                <div class="form-group">
                  <label for="number">Number</label>
                  <input
                    type="text"
                    class="form-control"
                    id="number"
                    name="number"
                    value="${resLocals.assessment.number}"
                    disabled
                  />
                  <small class="form-text text-muted">
                    The number of the assessment within the set.
                  </small>
                </div>
                <div class="form-group">
                  <label for="module">Module</label>
                  <input
                    type="text"
                    class="form-control"
                    id="module"
                    name="module"
                    value="${resLocals.assessment_module
                      ? resLocals.assessment_module.heading
                      : ''}"
                    disabled
                  />
                  <small class="form-text text-muted">
                    The <a href="${resLocals.urlPrefix}/course_admin/modules">module</a> this
                    assessment belongs to.
                  </small>
                </div>
                <div class="form-group">
                  <label for="aid">AID</label>
                  ${resLocals.authz_data.has_course_permission_edit &&
                  !resLocals.course.example_course
                    ? ChangeIdButton({
                        label: 'AID',
                        currentValue: resLocals.assessment.tid,
                        otherValues: tids,
                        csrfToken: resLocals.__csrf_token,
                      })
                    : ''}
                  <input
                    type="text"
                    class="form-control"
                    id="aid"
                    name="aid"
                    value="${resLocals.assessment.tid}"
                    disabled
                  />
                  <small class="form-text text-muted">
                    The unique identifier for this assessment. This may contain only letters,
                    numbers, dashes, and underscores, with no spaces. You may use forward slashes to
                    separate directories.
                  </small>
                </div>
                <div class="form-group">
                  <label for="studentLink">Student Link</label>
                  <span class="input-group">
                    <input
                      type="text"
                      class="form-control"
                      id="studentLink"
                      name="studentLink"
                      value="${studentLink}"
                      disabled
                    />
                    <div class="input-group-append">
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary btn-copy"
                        data-clipboard-text="${studentLink}"
                        aria-label="Copy student link"
                      >
                        <i class="far fa-clipboard"></i>
                      </button>
                      <button
                        type="button"
                        title="Student Link QR Code"
                        aria-label="Student Link QR Code"
                        class="btn btn-sm btn-outline-secondary js-qrcode-button"
                        data-qr-code-content="${studentLink}"
                      >
                        <i class="fas fa-qrcode"></i>
                      </button>
                    </div>
                  </span>
                  <small class="form-text text-muted">
                    The link that students will use to access this assessment.
                  </small>
                </div>
                ${resLocals.authz_data.has_course_permission_view
                  ? resLocals.authz_data.has_course_permission_edit &&
                    !resLocals.course.example_course
                    ? html`
                        <a
                          data-testid="edit-assessment-configuration-link"
                          href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                            .id}/file_edit/${infoAssessmentPath}"
                        >
                          Edit assessment configuration
                        </a>
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
            ${resLocals.authz_data.has_course_permission_edit && !resLocals.course.example_course
              ? html`
                  <div class="card-footer d-flex flex-wrap align-items-center">
                    <form name="copy-assessment-form" class="mr-2" method="POST">
                      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                      <button
                        name="__action"
                        value="copy_assessment"
                        class="btn btn-sm btn-primary"
                      >
                        <i class="fa fa-clone"></i> Make a copy of this assessment
                      </button>
                    </form>
                    <button
                      class="btn btn-sm btn-primary"
                      href="#"
                      data-toggle="modal"
                      data-target="#deleteAssessmentModal"
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
                        <input
                          type="hidden"
                          name="__csrf_token"
                          value="${resLocals.__csrf_token}"
                        />
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">
                          Cancel
                        </button>
                        <button type="submit" class="btn btn-danger">Delete</button>
                      `,
                    })}
                  </div>
                `
              : ''}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
