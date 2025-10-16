import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { GitHubButtonHtml } from '../../components/GitHubButton.js';
import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { type Timezone, formatTimezone } from '../../lib/timezone.shared.js';

export function InstructorCourseAdminSettings({
  resLocals,
  aiQuestionGenerationEnabled,
  aiQuestionGenerationCourseToggleEnabled,
  coursePathExists,
  courseInfoExists,
  availableTimezones,
  origHash,
  courseGHLink,
}: {
  resLocals: Record<string, any>;
  aiQuestionGenerationEnabled: boolean;
  aiQuestionGenerationCourseToggleEnabled: boolean;
  coursePathExists: boolean;
  courseInfoExists: boolean;
  availableTimezones: Timezone[];
  origHash: string;
  courseGHLink: string | null;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Course Settings',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'settings',
    },
    headContent: compiledScriptTag('instructorCourseAdminSettingsClient.ts'),
    content: html`
      ${renderHtml(
        <CourseSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}

      <div class="card  mb-4">
        <div
          class="card-header bg-primary text-white d-flex align-items-center justify-content-between"
        >
          <h1>
            ${resLocals.has_enhanced_navigation ? 'General course settings' : 'Course Settings'}
          </h1>
          ${GitHubButtonHtml(courseGHLink)}
        </div>
        <div class="card-body">
          ${!courseInfoExists || !coursePathExists
            ? CourseDirectoryMissingAlert({
                resLocals,
                coursePathExists,
                courseInfoExists,
              })
            : ''}
          <form name="edit-course-settings-form" method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="orig_hash" value="${origHash}" />
            <div class="mb-3">
              <label class="form-label" for="short_name">Short Name</label>
              <input
                type="text"
                class="form-control"
                id="short_name"
                name="short_name"
                value="${resLocals.course.short_name}"
                required
                ${courseInfoExists &&
                resLocals.authz_data.has_course_permission_edit &&
                !resLocals.course.example_course
                  ? ''
                  : 'disabled'}
              />
              <small class="form-text text-muted">
                The short name of the course. Often this is the course rubric and number (e.g.,
                "MATH 101" or "PHYS 440").
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label" for="title">Title</label>
              <input
                type="text"
                class="form-control"
                id="title"
                name="title"
                value="${resLocals.course.title}"
                required
                ${courseInfoExists &&
                resLocals.authz_data.has_course_permission_edit &&
                !resLocals.course.example_course
                  ? ''
                  : 'disabled'}
              />
              <small class="form-text text-muted">
                This is the official title of the course, as given in the course catalog.
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label" for="display_timezone">Timezone</label>
              <select
                class="form-select"
                id="display_timezone"
                name="display_timezone"
                ${courseInfoExists &&
                resLocals.authz_data.has_course_permission_edit &&
                !resLocals.course.example_course
                  ? ''
                  : 'disabled'}
              >
                ${availableTimezones.map(
                  (tz) => html`
                    <option
                      value="${tz.name}"
                      ${tz.name === resLocals.course.display_timezone ? 'selected' : ''}
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
              <label class="form-label" for="institution">Institution</label>
              <input
                type="text"
                class="form-control"
                id="institution"
                name="institution"
                value="${resLocals.institution.short_name} (${resLocals.institution.long_name})"
                disabled
              />
              <small class="form-text text-muted">
                This is your academic institution (e.g., "University of Illinois").
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label" for="path">Path</label>
              <input
                type="text"
                class="form-control"
                id="path"
                name="path"
                value="${resLocals.course.path}"
                disabled
              />
              <small class="form-text text-muted">
                The path where course files can be found.
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label" for="repository">Repository</label>
              <span class="input-group">
                <input
                  type="text"
                  class="form-control"
                  id="repository"
                  name="repository"
                  value="${resLocals.course.repository}"
                  disabled
                />
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary btn-copy"
                  data-clipboard-text="${resLocals.course.repository}"
                  aria-label="Copy repository"
                  ${resLocals.course.repository ? '' : 'disabled'}
                >
                  <i class="far fa-clipboard"></i>
                </button>
              </span>
              <small class="form-text text-muted">
                The Github repository that can be used to sync course files.
              </small>
            </div>
            <div class="form-check mb-3">
              <input
                type="checkbox"
                class="form-check-input"
                id="show_getting_started"
                name="show_getting_started"
                ${resLocals.course.show_getting_started ? 'checked' : ''}
              />
              <label class="form-check-label" for="show_getting_started">
                Show the getting started checklist
              </label>
            </div>
            ${aiQuestionGenerationCourseToggleEnabled
              ? html`
                  <div class="form-check mb-3">
                    <input
                      type="checkbox"
                      class="form-check-input"
                      name="ai_question_generation"
                      value="1"
                      id="ai_question_generation_toggle"
                      ${aiQuestionGenerationEnabled ? 'checked' : ''}
                    />
                    <label
                      class="form-check-label d-flex align-items-center"
                      for="ai_question_generation_toggle"
                    >
                      Enable AI question generation
                      <span class="badge rounded-pill text-bg-success ms-2">Alpha preview</span>
                    </label>
                    <div class="small text-muted">
                      Generate questions with natural language using AI.
                    </div>
                  </div>
                `
              : ''}
            ${EditActions({
              coursePathExists,
              courseInfoExists,
              hasCoursePermissionView: resLocals.authz_data.has_course_permission_view,
              hasCoursePermissionEdit: resLocals.authz_data.has_course_permission_edit,
              exampleCourse: resLocals.course.example_course,
              urlPrefix: resLocals.urlPrefix,
              navPage: 'course_admin',
            })}
          </form>
        </div>
      </div>
    `,
  });
}

function CourseDirectoryMissingAlert({
  resLocals,
  coursePathExists,
  courseInfoExists,
}: {
  resLocals: Record<string, any>;
  coursePathExists: boolean;
  courseInfoExists: boolean;
}) {
  if (!resLocals.authz_data.has_course_permission_edit || resLocals.course.example_course) {
    return;
  }
  if (!coursePathExists) {
    return html`
      <div class="alert alert-danger">
        Course directory not found. You must
        <a href="${resLocals.urlPrefix}/course_admin/syncs">sync your course</a>.
      </div>
    `;
  } else if (!courseInfoExists) {
    return html`
      <form name="add-configuration-form" method="POST" class="alert alert-danger">
        <code>infoCourse.json</code> is missing. You must
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        <button
          name="__action"
          value="add_configuration"
          class="btn btn-link btn-link-inline mt-n1 p-0 border-0 "
        >
          create this file
        </button>
        to edit your course settings.
      </form>
    `;
  }
}

function EditActions({
  coursePathExists,
  courseInfoExists,
  hasCoursePermissionView,
  hasCoursePermissionEdit,
  exampleCourse,
  urlPrefix,
  navPage,
}: {
  coursePathExists: boolean;
  courseInfoExists: boolean;
  hasCoursePermissionView: boolean;
  hasCoursePermissionEdit: boolean;
  exampleCourse: boolean;
  urlPrefix: string;
  navPage: string;
}) {
  if (!coursePathExists || !courseInfoExists || !hasCoursePermissionView) {
    return '';
  }

  if (!hasCoursePermissionEdit || exampleCourse) {
    return html`
      <p class="mb-0">
        <a href="${urlPrefix}/${navPage}/file_view/infoCourse.json"> View course configuration </a>
        in <code>infoCourse.json</code>
      </p>
    `;
  }

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
        data-testid="edit-course-configuration-link"
        href="${urlPrefix}/${navPage}/file_edit/infoCourse.json"
      >
        Edit course configuration
      </a>
      in <code>infoCourse.json</code>
    </p>
  `;
}
