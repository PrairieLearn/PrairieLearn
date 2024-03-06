import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export function InstructorCourseAdminSettings({
  resLocals,
  coursePathExists,
  courseInfoExists,
}: {
  resLocals: Record<string, any>;
  coursePathExists: boolean;
  courseInfoExists: boolean;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", { ...resLocals })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", { ...resLocals })}
        <main id="content" class="container">
          ${renderEjs(__filename, "<%- include('../partials/courseSyncErrorsAndWarnings'); %>", {
            ...resLocals,
          })}
          <div class="card  mb-4">
            <div class="card-header bg-primary text-white d-flex">Course Settings</div>
            <div class="card-body">
              ${!courseInfoExists || !coursePathExists
                ? CourseDirectoryMissingAlert({ resLocals, coursePathExists, courseInfoExists })
                : ''}
              <form>
                <div class="form-group">
                  <label for="short_name">Short Name</label>
                  <input
                    type="text"
                    class="form-control"
                    id="short_name"
                    name="short_name"
                    value="${resLocals.course.short_name}"
                    disabled
                  />
                  <small class="form-text text-muted">
                    The short name of the course. Often this is the course rubric and number (e.g.,
                    "MATH 101" or "PHYS 440").
                  </small>
                </div>
                <div class="form-group">
                  <label for="title">Title</label>
                  <input
                    type="text"
                    class="form-control"
                    id="title"
                    name="title"
                    value="${resLocals.course.title}"
                    disabled
                  />
                  <small class="form-text text-muted">
                    This is the official title of the course, as given in the course catalog.
                  </small>
                </div>
                <div class="form-group">
                  <label for="institution">Institution</label>
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
                <div class="form-group">
                  <label for="display_timezone">Timezone</label>
                  <input
                    type="text"
                    class="form-control"
                    id="display_timezone"
                    name="display_timezone"
                    value="${resLocals.course.display_timezone}"
                    disabled
                  />
                  <small class="form-text text-muted">
                    The allowable timezones are from the tz database. It's best to use a city-based
                    timezone that has the same times as you.
                  </small>
                </div>
                <div class="form-group">
                  <label for="path">Path</label>
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
                <div class="form-group">
                  <label for="repository">Repository</label>
                  <input
                    type="text"
                    class="form-control"
                    id="repository"
                    name="repository"
                    value="${resLocals.course.repository}"
                    disabled
                  />
                  <small class="form-text text-muted">
                    The Github repository that can be used to sync course files.
                  </small>
                </div>
                <p class="mb-0">
                  ${coursePathExists && courseInfoExists
                    ? resLocals.authz_data.has_course_permission_view
                      ? resLocals.authz_data.has_course_permission_edit &&
                        !resLocals.course.example_course
                        ? html`
                            <a
                              data-testid="edit-course-configuration-link"
                              href="${resLocals.urlPrefix}/${resLocals.navPage}/file_edit/infoCourse.json"
                            >
                              Edit course configuration
                            </a>
                            in <code>infoCourse.json</code>
                          `
                        : html`
                            <a
                              href="${resLocals.urlPrefix}/${resLocals.navPage}/file_view/infoCourse.json"
                            >
                              View course configuration
                            </a>
                            in <code>infoCourse.json</code>
                          `
                      : ''
                    : ''}
                </p>
              </form>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
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
        <a href="${resLocals.urlPrefix}/${resLocals.navPage}/syncs"> sync your course </a>
        .
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
