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
        <main id="content" class="container-fluid">
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
            <table
              class="table table-sm table-hover two-column-description"
              aria-label="Assessment settings"
            >
              <tbody>
                <tr>
                  <th scope="row">Title</th>
                  <td>${resLocals.assessment.title}</td>
                </tr>
                <tr>
                  <th scope="row">Type</th>
                  <td>${resLocals.assessment.type}</td>
                </tr>
                <tr>
                  <th scope="row">Set</th>
                  <td>
                    ${resLocals.assessment_set.name}
                    <span class="text-muted">(${resLocals.assessment_set.abbreviation})</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Number</th>
                  <td>${resLocals.assessment.number}</td>
                </tr>
                <tr>
                  <th scope="row">Module</th>
                  <td>
                    ${resLocals.assessment_module
                      ? html`
                          ${resLocals.assessment_module.heading}
                          <span class="text-muted"> (${resLocals.assessment_module.name}) </span>
                        `
                      : html` &mdash; `}
                  </td>
                </tr>
                <tr>
                  <th scope="row">AID</th>
                  <td>
                    <span class="pr-2">${resLocals.assessment.tid}</span>
                    ${resLocals.authz_data.has_course_permission_edit &&
                    !resLocals.course.example_course
                      ? ChangeIdButton({
                          label: 'AID',
                          currentValue: resLocals.assessment.tid,
                          otherValues: tids,
                          csrfToken: resLocals.__csrf_token,
                        })
                      : ''}
                  </td>
                </tr>
                <tr>
                  <th>Configuration</th>
                  <td>
                    ${resLocals.authz_data.has_course_permission_view
                      ? html`
                          <a
                            href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                              .id}/file_view/${infoAssessmentPath}"
                          >
                            infoAssessment.json
                          </a>
                          ${resLocals.authz_data.has_course_permission_edit &&
                          !resLocals.course.example_course
                            ? html`
                                <a
                                  class="btn btn-xs btn-secondary mx-2"
                                  href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                                    .id}/file_edit/${infoAssessmentPath}"
                                >
                                  <i class="fa fa-edit"></i>
                                  <span>Edit</span>
                                </a>
                              `
                            : ''}
                        `
                      : 'infoAssessment.json'}
                  </td>
                </tr>
                <tr>
                  <th class="align-middle">Student Link</th>
                  <td class="form-inline align-middle">
                    <span class="input-group">
                      <span readonly class="form-control form-control-sm">${studentLink}</span>
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
                  </td>
                </tr>
              </tbody>
            </table>
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
