import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { Modal } from '../../components/Modal.html.js';
import { nodeModulesAssetPath } from '../../lib/assets.js';

export function InstructorAssessmentSettings({
  resLocals,
  tids,
  studentLink,
  studentLinkQRCode,
  infoAssessmentPath,
}: {
  resLocals: Record<string, any>;
  tids: string[];
  studentLink: string;
  studentLinkQRCode: string;
  infoAssessmentPath: string;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
        <script src="${nodeModulesAssetPath('clipboard/dist/clipboard.min.js')}"></script>
        <script>
          $(() => {
            let clipboard = new ClipboardJS('.btn-copy');
            clipboard.on('success', (e) => {
              $(e.trigger)
                .popover({
                  content: 'Copied!',
                  placement: 'bottom',
                })
                .popover('show');
              window.setTimeout(function () {
                $(e.trigger).popover('hide');
              }, 1000);
            });
            $('.js-student-link-qrcode-button').popover({
              content: $('#js-student-link-qrcode'),
              html: true,
              trigger: 'click',
              container: 'body',
            });
          });
        </script>
        <style>
          .popover {
            max-width: 50%;
          }
        </style>
      </head>

      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({
              sanitize: false,
            });
          });
        </script>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            import.meta.url,
            "<%- include('../partials/assessmentSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">
              ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Settings
            </div>
            <table class="table table-sm table-hover two-column-description">
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
                      ? html`
                          <button
                            id="changeAidButton"
                            class="btn btn-xs btn-secondary"
                            type="button"
                            data-toggle="popover"
                            data-container="body"
                            data-html="true"
                            data-placement="auto"
                            title="Change AID"
                            data-content="${renderEjs(
                              import.meta.url,
                              "<%= include('../partials/changeIdForm'), %>",
                              {
                                id_label: 'AID',
                                buttonID: 'changeAidButton',
                                id_old: resLocals.assessment.tid,
                                ids: tids,
                                ...resLocals,
                              },
                            )}"
                            data-trigger="manual"
                            onclick="$(this).popover('show')"
                          >
                            <i class="fa fa-i-cursor"></i>
                            <span>Change AID</span>
                          </button>
                        `
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
                          class="btn btn-sm btn-outline-secondary js-student-link-qrcode-button"
                        >
                          <i class="fas fa-qrcode"></i>
                        </button>
                        <div class="d-none">
                          <div id="js-student-link-qrcode">
                            <center>${unsafeHtml(studentLinkQRCode)}</center>
                          </div>
                        </div>
                      </div>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
            ${resLocals.authz_data.has_course_permission_edit && !resLocals.course.example_course
              ? html`
                  <div class="card-footer">
                    <div class="row">
                      <div class="col-auto">
                        <form name="copy-assessment-form" class="form-inline" method="POST">
                          <input
                            type="hidden"
                            name="__csrf_token"
                            value="${resLocals.__csrf_token}"
                          />
                          <button
                            name="__action"
                            value="copy_assessment"
                            class="btn btn-sm btn-primary"
                          >
                            <i class="fa fa-clone"></i> Make a copy of this assessment
                          </button>
                        </form>
                      </div>
                      <div class="col-auto">
                        <button
                          class="btn btn-sm btn-primary"
                          href="#"
                          data-toggle="modal"
                          data-target="#deleteAssessmentModal"
                        >
                          <i class="fa fa-times" aria-hidden="true"></i> Delete this assessment
                        </button>
                      </div>
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
                  </div>
                `
              : ''}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
