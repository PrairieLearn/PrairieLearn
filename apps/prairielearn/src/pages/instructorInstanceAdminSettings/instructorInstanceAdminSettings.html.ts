import { html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { encodePath } from '../../lib/uri-util.js';

export function InstructorInstanceAdminSettings({
  resLocals,
  shortNames,
  studentLink,
  infoCourseInstancePath,
  origHash,
}: {
  resLocals: Record<string, any>;
  shortNames: string[];
  studentLink: string;
  infoCourseInstancePath: string;
  origHash: string;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Settings',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'settings',
    },
    headContent: [compiledScriptTag('instructorInstanceAdminSettingsClient.ts')],
    content: html`
      ${CourseInstanceSyncErrorsAndWarnings({
        authz_data: resLocals.authz_data,
        courseInstance: resLocals.course_instance,
        course: resLocals.course,
        urlPrefix: resLocals.urlPrefix,
      })}
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex">
          <h1>Course instance settings</h1>
        </div>
        <div class="card-body">
          <form name="edit-course-instance-settings-form" method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="orig_hash" value="${origHash}" />
            <div class="form-group">
              <label for="long_name">Long Name</label>
              <input
                type="text"
                class="form-control"
                id="long_name"
                name="long_name"
                value="${resLocals.course_instance.long_name}"
                required
                ${resLocals.authz_data.has_course_permission_edit &&
                !resLocals.course.example_course
                  ? ''
                  : 'disabled'}
              />
              <small class="form-text text-muted">
                The long name of this course instance (e.g., 'Spring 2015').
              </small>
            </div>
            <div class="form-group">
              <label for="ciid">CIID</label>
              <input
                type="text"
                class="form-control"
                id="ciid"
                name="ciid"
                value="${resLocals.course_instance.short_name}"
                pattern="[\\-A-Za-z0-9_\\/]+"
                required
                data-other-values="${shortNames.join(',')}"
                ${resLocals.authz_data.has_course_permission_edit &&
                !resLocals.course.example_course
                  ? ''
                  : 'disabled'}
              />
              <small class="form-text text-muted">
                Use only letters, numbers, dashes, and underscores, with no spaces. You may use
                forward slashes to separate directories. The recommended format is
                <code>Fa19</code> or <code>Fall2019</code>. Add suffixes if there are multiple
                versions, like <code>Fa19honors</code>.
              </small>
            </div>
            <div class="form-group">
              <label for="student_link">Student Link</label>
              <span class="input-group">
                <input
                  type="text"
                  class="form-control"
                  id="student_link"
                  name="student_link"
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
                This is the link that students will use to access the course. You can copy this link
                to share with students.
              </small>
            </div>
            ${EditConfiguration({
              hasCoursePermissionView: resLocals.authz_data.has_course_permission_view,
              hasCoursePermissionEdit: resLocals.authz_data.has_course_permission_edit,
              exampleCourse: resLocals.course.example_course,
              urlPrefix: resLocals.urlPrefix,
              navPage: resLocals.navPage,
              infoCourseInstancePath,
            })}
          </form>
        </div>
        ${resLocals.authz_data.has_course_permission_edit && !resLocals.course.example_course
          ? CopyCourseInstanceForm({
              csrfToken: resLocals.__csrf_token,
              shortName: resLocals.course_instance.short_name,
            })
          : ''}
      </div>
    `,
  });
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
    return '';
  }

  if (!hasCoursePermissionEdit || exampleCourse) {
    return html`
      <p class="mb-0">
        <a href="${urlPrefix}/${navPage}/file_view/${infoCourseInstancePath}">
          View course instance configuration
        </a>
        in <code>infoCourseInstance.json</code>
      </p>
    `;
  } else {
    return html`
      <button
        id="save-button"
        type="submit"
        class="btn btn-primary mb-2"
        name="__action"
        value="update_configuration"
      >
        Save
      </button>
      <button
        id="cancel-button"
        type="button"
        class="btn btn-secondary mb-2"
        onclick="window.location.reload()"
      >
        Cancel
      </button>
      <p class="mb-0">
        <a
          data-testid="edit-course-instance-configuration-link"
          href="${encodePath(`${urlPrefix}/${navPage}/file_edit/${infoCourseInstancePath}`)}"
          >Edit course instance configuration</a
        >
        in <code>infoCourseInstance.json</code>
      </p>
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
      <form name="copy-course-instance-form" class="form-inline me-2" method="POST">
        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
        <button name="__action" value="copy_course_instance" class="btn btn-sm btn-primary">
          <i class="fa fa-clone"></i> Make a copy of this course instance
        </button>
      </form>
      <button
        class="btn btn-sm btn-primary"
        href="#"
        data-bs-toggle="modal"
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
