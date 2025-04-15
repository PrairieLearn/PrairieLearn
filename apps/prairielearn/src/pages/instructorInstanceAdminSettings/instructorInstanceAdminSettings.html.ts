import { html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { QRCodeModal } from '../../components/QRCodeModal.html.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { type Timezone, formatTimezone } from '../../lib/timezones.js';
import { encodePath } from '../../lib/uri-util.js';

export function InstructorInstanceAdminSettings({
  resLocals,
  shortNames,
  studentLink,
  infoCourseInstancePath,
  availableTimezones,
  origHash,
  canEdit,
}: {
  resLocals: Record<string, any>;
  shortNames: string[];
  studentLink: string;
  infoCourseInstancePath: string;
  availableTimezones: Timezone[];
  origHash: string;
  canEdit: boolean;
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
      ${QRCodeModal({
        id: 'studentLinkModal',
        title: 'Student Link QR Code',
        content: studentLink,
      })}
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex">
          <h1>
            ${resLocals.has_enhanced_navigation
              ? 'General course instance settings'
              : 'Course instance settings'}
          </h1>
        </div>
        <div class="card-body">
          <form name="edit-course-instance-settings-form" method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="orig_hash" value="${origHash}" />
            <div class="mb-3">
              <label class="form-label" for="ciid">CIID</label>
              <input
                type="text"
                class="form-control font-monospace"
                id="ciid"
                name="ciid"
                value="${resLocals.course_instance.short_name}"
                pattern="[\\-A-Za-z0-9_\\/]+"
                required
                data-other-values="${shortNames.join(',')}"
                ${canEdit ? '' : 'disabled'}
              />
              <small class="form-text text-muted">
                Use only letters, numbers, dashes, and underscores, with no spaces. You may use
                forward slashes to separate directories. The recommended format is
                <code>Fa19</code> or <code>Fall2019</code>. Add suffixes if there are multiple
                versions, like <code>Fa19honors</code>.
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label" for="long_name">Long Name</label>
              <input
                type="text"
                class="form-control"
                id="long_name"
                name="long_name"
                value="${resLocals.course_instance.long_name}"
                required
                ${canEdit ? '' : 'disabled'}
              />
              <small class="form-text text-muted">
                The long name of this course instance (e.g., 'Spring 2015').
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label" for="display_timezone">Timezone</label>
              <select
                class="form-select"
                id="display_timezone"
                name="display_timezone"
                ${canEdit ? '' : 'disabled'}
              >
                ${availableTimezones.map(
                  (tz) => html`
                    <option
                      value="${tz.name}"
                      ${tz.name === resLocals.course_instance.display_timezone ? 'selected' : ''}
                    >
                      ${formatTimezone(tz)}
                    </option>
                  `,
                )}
              </select>
              <small class="form-text text-muted">
                The allowable timezones are from the
                <a
                  href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones"
                  target="_blank"
                  >tz database</a
                >. It's best to use a city-based timezone that has the same times as you.
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label" for="group_assessments_by">Group assessments by</label>
              <select
                class="form-select"
                id="group_assessments_by"
                name="group_assessments_by"
                ${canEdit ? '' : 'disabled'}
              >
                <option
                  value="Set"
                  ${resLocals.course_instance.assessments_group_by === 'Set' ? 'selected' : ''}
                >
                  Set
                </option>
                <option
                  value="Module"
                  ${resLocals.course_instance.assessments_group_by === 'Module' ? 'selected' : ''}
                >
                  Module
                </option>
              </select>
              <small class="form-text text-muted">
                Determines how assessments will be grouped on the student assessments page.
              </small>
            </div>
            <div class="mb-3 form-check">
              <input
                class="form-check-input"
                type="checkbox"
                id="hide_in_enroll_page"
                name="hide_in_enroll_page"
                ${canEdit ? '' : 'disabled'}
                ${resLocals.course_instance.hide_in_enroll_page ? 'checked' : ''}
              />
              <label class="form-check-label" for="hide_in_enroll_page">
                Hide in enrollment page
              </label>
              <div class="small text-muted">
                If enabled, hides the course instance in the enrollment page, so that only direct
                links to the course can be used for enrollment.
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label" for="student_link">Student Link</label>
              <span class="input-group">
                <input
                  type="text"
                  class="form-control"
                  id="student_link"
                  name="student_link"
                  value="${studentLink}"
                  disabled
                />
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
                  class="btn btn-sm btn-outline-secondary"
                  aria-label="Student Link QR Code"
                  data-bs-toggle="modal"
                  data-bs-target="#studentLinkModal"
                >
                  <i class="fas fa-qrcode"></i>
                </button>
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
      <form name="copy-course-instance-form" class="me-2" method="POST">
        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
        <button
          type="submit"
          name="__action"
          value="copy_course_instance"
          class="btn btn-sm btn-primary"
        >
          <i class="fa fa-clone"></i> Make a copy of this course instance
        </button>
      </form>
      <button
        type="button"
        class="btn btn-sm btn-primary"
        data-bs-toggle="modal"
        data-bs-target="#deleteCourseInstanceModal"
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
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-danger">Delete</button>
        `,
      })}
    </div>
  `;
}
