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
        <main id="content" class="container-fluid">
          ${renderEjs(__filename, "<%- include('../partials/courseSyncErrorsAndWarnings'); %>", {
            ...resLocals,
          })}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">Settings</div>
            <table class="table table-sm table-hover two-column-description">
              <tbody>
                <tr>
                  <th>Short Name</th>
                  <td>${resLocals.course.short_name}</td>
                </tr>
                <tr>
                  <th>Title</th>
                  <td>${resLocals.course.title}</td>
                </tr>
                <tr>
                  <th>Institution</th>
                  <td>${resLocals.institution.short_name} (${resLocals.institution.long_name})</td>
                </tr>
                <tr>
                  <th>Timezone</th>
                  <td>${resLocals.course.display_timezone}</td>
                </tr>
                <tr>
                  <th>Path</th>
                  <td>${resLocals.course.path}</td>
                </tr>
                <tr>
                  <th>Repository</th>
                  <td>${resLocals.course.repository}</td>
                </tr>
                <tr>
                  <th>Configuration</th>
                  <td>
                    ${!coursePathExists
                      ? resLocals.authz_data.has_course_permission_edit &&
                        !resLocals.course.example_course
                        ? html`
                            <span class="text-danger">
                              You must
                              <a href="<%= urlPrefix %>/<%= navPage %>/syncs">sync your course</a>
                              before viewing or editing its configuration
                            </span>
                          `
                        : html`
                            <span class="text-danger">
                              A course editor must sync this course before anyone can view or edit
                              its configuration
                            </span>
                          `
                      : ''}
                    ${coursePathExists && !courseInfoExists
                      ? html`<span class="text-danger">Missing configuration file</span>
                          ${resLocals.authz_data.has_course_permission_edit &&
                          !resLocals.course.example_course
                            ? html`
                                <form name="add-configuration-form" class="d-inline" method="POST">
                                  <input
                                    type="hidden"
                                    name="__csrf_token"
                                    value="${resLocals.__csrf_token}"
                                  />
                                  <button
                                    name="__action"
                                    value="add_configuration"
                                    class="btn btn-xs btn-secondary mx-2"
                                  >
                                    <i class="fa fa-edit"></i>
                                    <span class="d-none d-sm-inline">Create infoCourse.json</span>
                                  </button>
                                </form>
                              `
                            : ''} `
                      : ''}
                    ${coursePathExists && courseInfoExists
                      ? resLocals.authz_data.has_course_permission_view
                        ? html`
                            <a
                              href="${resLocals.urlPrefix}/${resLocals.navPage}/file_view/infoCourse.json"
                            >
                              infoCourse.json
                            </a>
                            ${resLocals.authz_data.has_course_permission_edit &&
                            !resLocals.course.example_course
                              ? html`
                                  <a
                                    class="btn btn-xs btn-secondary mx-2"
                                    href="${resLocals.urlPrefix}/${resLocals.navPage}/file_edit/infoCourse.json"
                                  >
                                    <i class="fa fa-edit"></i>
                                    <span>Edit</span>
                                  </a>
                                `
                              : ''}
                          `
                        : 'infoCourse.json'
                      : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
