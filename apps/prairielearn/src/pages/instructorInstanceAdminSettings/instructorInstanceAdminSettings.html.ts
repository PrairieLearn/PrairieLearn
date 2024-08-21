import { html } from '@prairielearn/html';

import { ChangeIdButton } from '../../components/ChangeIdButton.html.js';
import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { compiledScriptTag } from '../../lib/assets.js';

export function InstructorInstanceAdminSettings({
  resLocals,
  shortNames,
  studentLink,
  infoCourseInstancePath,
}: {
  resLocals: Record<string, any>;
  shortNames: string[];
  studentLink: string;
  infoCourseInstancePath: string;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
        ${compiledScriptTag('instructorInstanceAdminSettingsClient.ts')}
        <style>
          .popover {
            max-width: 50%;
          }
        </style>
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container">
          ${CourseInstanceSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            courseInstance: resLocals.course_instance,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">
              <h1>Course instance ${resLocals.course_instance.short_name}</h1>
            </div>
            <table
              class="table table-sm table-hover two-column-description"
              aria-label="Course instance settings"
            >
              <tbody>
                <tr>
                  <th>Long Name</th>
                  <td>${resLocals.course_instance.long_name}</td>
                </tr>
                <tr>
                  <th>CIID</th>
                  <td>
                    <span class="pr-2">${resLocals.course_instance.short_name}</span>
                    ${resLocals.authz_data.has_course_permission_edit &&
                    !resLocals.course.example_course
                      ? ChangeIdButton({
                          label: 'CIID',
                          currentValue: resLocals.course_instance.short_name,
                          otherValues: shortNames,
                          extraHelpText: html`The recommended format is <code>Fa19</code> or
                            <code>Fall2019</code>. Add suffixes if there are multiple versions, like
                            <code>Fa19honors</code>.`,
                          csrfToken: resLocals.__csrf_token,
                        })
                      : ''}
                  </td>
                </tr>
                <tr>
                  <th>Configuration</th>
                  <td>
                    ${EditConfiguration({
                      hasCoursePermissionView: resLocals.authz_data.has_course_permission_view,
                      hasCoursePermissionEdit: resLocals.authz_data.has_course_permission_edit,
                      exampleCourse: resLocals.course.example_course,
                      urlPrefix: resLocals.urlPrefix,
                      navPage: resLocals.navPage,
                      infoCourseInstancePath,
                    })}
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
              ? CopyCourseInstanceForm({
                  csrfToken: resLocals.__csrf_token,
                  shortName: resLocals.course_instance.short_name,
                })
              : ''}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function EditConfiguration({
  hasCoursePermissionView,
  hasCoursePermissionEdit,
  exampleCourse,
  urlPrefix,
  navPage,
  infoCourseInstancePath,
}: {
  hasCoursePermissionView: boolean;
  hasCoursePermissionEdit: boolean;
  exampleCourse: boolean;
  urlPrefix: string;
  navPage: string;
  infoCourseInstancePath: string;
}) {
  if (!hasCoursePermissionView && !hasCoursePermissionEdit) {
    return 'infoCourseInstance.json';
  }

  if (hasCoursePermissionEdit && !exampleCourse) {
    return html`
      <a href="${urlPrefix}/${navPage}/file_view/${infoCourseInstancePath}">
        infoCourseInstance.json
      </a>
      <a
        class="btn btn-xs btn-secondary mx-2"
        role="button"
        href="${urlPrefix}/${navPage}/file_edit/${infoCourseInstancePath}"
      >
        <i class="fa fa-edit"></i>
        <span>Edit</span>
      </a>
    `;
  } else {
    return html`
      <a href="${urlPrefix}/${navPage}/file_view/${infoCourseInstancePath}">
        infoCourseInstance.json
      </a>
    `;
  }
}

function CopyCourseInstanceForm({
  csrfToken,
  shortName,
}: {
  csrfToken: string;
  shortName: string;
}) {
  return html`
    <div class="card-footer d-flex flex-wrap align-items-center">
      <form name="copy-course-instance-form" class="form-inline mr-2" method="POST">
        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
        <button name="__action" value="copy_course_instance" class="btn btn-sm btn-primary">
          <i class="fa fa-clone"></i> Make a copy of this course instance
        </button>
      </form>
      <button
        class="btn btn-sm btn-primary"
        href="#"
        data-toggle="modal"
        data-target="#deleteCourseInstanceModal"
      >
        <i class="fa fa-times" aria-hidden="true"></i> Delete this course instance
      </button>
      ${Modal({
        id: 'deleteCourseInstanceModal',
        title: 'Delete course instance',
        body: html`
          <p>Are you sure you want to delete the course instance <strong>${shortName}</strong>?</p>
        `,
        footer: html`
          <input type="hidden" name="__action" value="delete_course_instance" />
          <input type="hidden" name="__csrf_token" value="${csrfToken}" />
          <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-danger">Delete</button>
        `,
      })}
    </div>
  `;
}
