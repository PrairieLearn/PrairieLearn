import { type HtmlSafeString, html } from '@prairielearn/html';

import { DeleteCourseInstanceModal } from '../../components/DeleteCourseInstanceModal.js';
import { GitHubButtonHtml } from '../../components/GitHubButton.js';
import { PublicLinkSharing, StudentLinkSharing } from '../../components/LinkSharing.js';
import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { QRCodeModalHtml } from '../../components/QRCodeModal.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { renderHtml } from '../../lib/preact-html.js';
import { hydrateHtml } from '../../lib/preact.js';
import { type Timezone, formatTimezone } from '../../lib/timezones.js';
import { encodePath } from '../../lib/uri-util.js';

import SelfEnrollmentSettings from './components/SelfEnrollmentSettings.js';

export function InstructorInstanceAdminSettings({
  resLocals,
  shortNames,
  selfEnrollLink,
  studentLink,
  publicLink,
  infoCourseInstancePath,
  availableTimezones,
  origHash,
  instanceGHLink,
  canEdit,
  enrollmentCount,
  enrollmentManagementEnabled,
}: {
  resLocals: Record<string, any>;
  shortNames: string[];
  selfEnrollLink: string;
  studentLink: string;
  publicLink: string;
  infoCourseInstancePath: string;
  availableTimezones: Timezone[];
  origHash: string;
  instanceGHLink: string | null;
  canEdit: boolean;
  enrollmentCount: number;
  enrollmentManagementEnabled: boolean;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Settings',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'settings',
    },
    headContent: compiledScriptTag('instructorInstanceAdminSettingsClient.ts'),
    content: html`
      ${renderHtml(
        <CourseInstanceSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          courseInstance={resLocals.course_instance}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      ${GenerateSelfEnrollmentLinkModal({ csrfToken: resLocals.__csrf_token })}
      ${QRCodeModalHtml({
        id: 'selfEnrollmentLinkModal',
        title: 'Self-enrollment Link QR Code',
        content: selfEnrollLink,
      })}
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
          <h1>
            ${resLocals.has_enhanced_navigation
              ? 'General course instance settings'
              : 'Course instance settings'}
          </h1>
          ${GitHubButtonHtml(instanceGHLink)}
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
                  rel="noreferrer"
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
            ${StudentLinkSharing({
              studentLink,
              studentLinkMessage:
                'This is the link that students will use to access the course. You can copy this link to share with students.',
            })}
            ${enrollmentManagementEnabled
              ? renderHtml(<SelfEnrollmentSettings selfEnrollLink={selfEnrollLink} />)
              : ''}
            <h2 class="h4">Sharing</h2>
            ${resLocals.course_instance.share_source_publicly
              ? PublicLinkSharing({
                  publicLink,
                  sharingMessage: "This course instance's source is publicly shared.",
                  publicLinkMessage:
                    'The link that other instructors can use to view this course instance.',
                })
              : html`<p>This course instance is not being shared.</p>`}
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
          ? CourseInstanceActions({
              csrfToken: resLocals.__csrf_token,
              shortName: resLocals.course_instance.short_name,
              enrollmentCount,
            })
          : ''}
      </div>
    `,
  });
}

function GenerateSelfEnrollmentLinkModal({ csrfToken }: { csrfToken: string }): HtmlSafeString {
  return html`
    ${Modal({
      id: 'generateSelfEnrollmentLinkModal',
      title: 'Generate new self-enrollment link',
      body: html`
        <div>
          Are you sure you want to generate a new self-enrollment link?
          <strong>The current link will be deactivated.</strong> This action cannot be undone.
        </div>
      `,
      footer: html`
        <input type="hidden" name="__action" value="generate_enrollment_code" />
        <input type="hidden" name="__csrf_token" value="${csrfToken}" />
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
        <button type="submit" class="btn btn-danger">Generate new link</button>
      `,
    })}
  `;
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

function CourseInstanceActions({
  csrfToken,
  shortName,
  enrollmentCount,
}: {
  csrfToken: string;
  shortName: string;
  enrollmentCount: number;
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
      ${hydrateHtml(
        <DeleteCourseInstanceModal
          shortName={shortName}
          enrolledCount={enrollmentCount}
          csrfToken={csrfToken}
        />,
      )}
    </div>
  `;
}
