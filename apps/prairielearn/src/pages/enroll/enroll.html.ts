import { z } from 'zod';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export const CourseInstanceRowSchema = z.object({
  label: z.string(),
  short_label: z.string(),
  course_instance_id: z.string(),
  enrolled: z.boolean(),
  instructor_access: z.boolean(),
});
type CourseInstance = z.infer<typeof CourseInstanceRowSchema>;

export function Enroll({
  courseInstances,
  resLocals,
}: {
  courseInstances: CourseInstance[];
  resLocals: Record<string, any>;
}) {
  // Temporary for testing.
  courseInstances.forEach((ci) => {
    ci.instructor_access = false;
  });

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head') %>", {
          ...resLocals,
          navPage: 'enroll',
          pageTitle: 'Courses',
        })}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'enroll',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Courses</div>
            <table class="table table-sm table-hover table-striped">
              <tbody>
                ${courseInstances.map((course_instance, idx) => {
                  return html`
                    <tr>
                      <td class="align-middle">${course_instance.label}</td>
                      ${course_instance.instructor_access
                        ? html`
                            <td class="align-middle text-center" colspan="2">
                              <span class="badge badge-info">instructor access</span>
                            </td>
                          `
                        : html`
                            <td>
                              ${!course_instance.enrolled
                                ? html`
                                    <button
                                      type="button"
                                      class="btn btn-sm btn-info"
                                      data-toggle="modal"
                                      data-target="#addModal${idx}"
                                    >
                                      Add course
                                    </button>
                                    <div
                                      class="modal fade"
                                      id="addModal${idx}"
                                      tabindex="-1"
                                      role="dialog"
                                      aria-labelledby="addModal${idx}Title"
                                      aria-hidden="true"
                                    >
                                      <div
                                        class="modal-dialog modal-dialog-centered"
                                        role="document"
                                      >
                                        <div class="modal-content">
                                          <div class="modal-header">
                                            <h5 class="modal-title" id="addModal${idx}Title">
                                              Confirm add course
                                            </h5>
                                            <button
                                              type="button"
                                              class="close"
                                              data-dismiss="modal"
                                              aria-label="Close"
                                            >
                                              <span aria-hidden="true">&times;</span>
                                            </button>
                                          </div>
                                          <div class="modal-body">
                                            <p>
                                              Are you sure you want to add this course content to
                                              your PrairieLearn account?
                                            </p>
                                            <p>
                                              Adding or removing courses here only affects what is
                                              visible to you on PrairieLearn. This does not change
                                              your university course registration.
                                            </p>
                                          </div>
                                          <div class="modal-footer">
                                            <form name="enroll-form" method="POST">
                                              <input type="hidden" name="__action" value="enroll" />
                                              <input
                                                type="hidden"
                                                name="__csrf_token"
                                                value="${resLocals.__csrf_token}"
                                              />
                                              <input
                                                type="hidden"
                                                name="course_instance_id"
                                                value="${course_instance.course_instance_id}"
                                              />
                                              <button
                                                type="button"
                                                class="btn btn-secondary"
                                                data-dismiss="modal"
                                              >
                                                Cancel
                                              </button>
                                              <button type="submit" class="btn btn-info">
                                                Add ${course_instance.short_label}
                                              </button>
                                            </form>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  `
                                : null}
                            </td>
                            <td>
                              ${course_instance.enrolled
                                ? html`
                                    <button
                                      type="button"
                                      class="btn btn-sm btn-danger"
                                      data-toggle="modal"
                                      data-target="#removeModal${idx}"
                                    >
                                      Remove course
                                    </button>
                                    <div
                                      class="modal fade"
                                      id="removeModal${idx}"
                                      tabindex="-1"
                                      role="dialog"
                                      aria-labelledby="removeModal${idx}Title"
                                      aria-hidden="true"
                                    >
                                      <div
                                        class="modal-dialog modal-dialog-centered"
                                        role="document"
                                      >
                                        <div class="modal-content">
                                          <div class="modal-header">
                                            <h5 class="modal-title" id="removeModal${idx}Title">
                                              Confirm remove course
                                            </h5>
                                            <button
                                              type="button"
                                              class="close"
                                              data-dismiss="modal"
                                              aria-label="Close"
                                            >
                                              <span aria-hidden="true">&times;</span>
                                            </button>
                                          </div>
                                          <div class="modal-body">
                                            <p>
                                              Are you sure you want to remove this course content
                                              from your PrairieLearn account?
                                            </p>
                                            <p>
                                              Adding or removing courses here only affects what is
                                              visible to you on PrairieLearn. This does not change
                                              your university course registration.
                                            </p>
                                          </div>
                                          <div class="modal-footer">
                                            <form name="unenroll-form" method="POST">
                                              <input
                                                type="hidden"
                                                name="__action"
                                                value="unenroll"
                                              />
                                              <input
                                                type="hidden"
                                                name="__csrf_token"
                                                value="${resLocals.__csrf_token}"
                                              />
                                              <input
                                                type="hidden"
                                                name="course_instance_id"
                                                value="${course_instance.course_instance_id}"
                                              />
                                              <button
                                                type="button"
                                                class="btn btn-secondary"
                                                data-dismiss="modal"
                                              >
                                                Cancel
                                              </button>
                                              <button type="submit" class="btn btn-danger">
                                                Remove ${course_instance.short_label}
                                              </button>
                                            </form>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  `
                                : null}
                            </td>
                          `}
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

export function EnrollLtiMessage({
  ltiInfo,
  resLocals,
}: {
  ltiInfo: any;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", {
          ...resLocals,
          navPage: 'enroll',
          pageTitle: 'Courses',
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'enroll',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              Logout and log back in to see more courses
            </div>
            <div class="card-body">
              <p>
                Your PrairieLearn login is currently tied to
                <strong>${ltiInfo.plc_short_name} ${ltiInfo.ci_long_name}</strong> and cannot be
                used to enroll in other courses.
              </p>
              <p>To see more courses:</p>
              <ol>
                <li>
                  Log out by selecting your name in the top right menu and selecting "Log out".
                </li>
                <li>Sign-in again with your normal login.</li>
                <li>Return to this enroll page to see the list of courses.</li>
              </ol>
              <p>
                Note: When you revisit the main ${ltiInfo.plc_short_name} course site and come back
                to PrairieLearn from it, it will take over your login again. You might consider
                using different web browsers for that course from your other PrairieLearn courses.
              </p>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

export function EnrollmentLimitExceededMessage({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", {
          ...resLocals,
          navPage: 'enroll',
          pageTitle: 'Courses',
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'enroll',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-danger text-white">Enrollment limit exceeded</div>
            <div class="card-body">
              This course has reached its enrollment limit. Please contact the course staff for more
              information.
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
