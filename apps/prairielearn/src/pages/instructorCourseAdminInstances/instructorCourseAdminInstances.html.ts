import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { CourseInstanceAuthz } from '../../models/course-instances.js';

export type CourseInstanceAuthzRow = CourseInstanceAuthz & { enrollment_count?: number };

export function InstructorCourseAdminInstances({
  resLocals,
  courseInstances,
}: {
  resLocals: Record<string, any>;
  courseInstances: CourseInstanceAuthzRow[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", {
          ...resLocals,
          pageTitle: 'Course Instances',
        })}
      </head>
      <body>
        <script>
          $(function () {
            $('#earliest-access-date [data-toggle="popover"]').popover({
              sanitize: false,
            });
            $('#latest-access-date [data-toggle="popover"]').popover({
              sanitize: false,
            });
          });
        </script>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            import.meta.url,
            "<%- include('../partials/courseSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
          <div class="card mb-4">
            <div class="card-header bg-primary">
              <div class="row align-items-center justify-content-between">
                <div class="col-auto">
                  <span class="text-white">Course instances</span>
                </div>
                ${resLocals.authz_data.has_course_permission_edit &&
                !resLocals.course.example_course &&
                !resLocals.needToSync
                  ? html`
                      <div class="col-auto">
                        <form name="add-course-instance-form" method="POST">
                          <input
                            type="hidden"
                            name="__csrf_token"
                            value="${resLocals.__csrf_token}"
                          />
                          <button
                            name="__action"
                            value="add_course_instance"
                            class="btn btn-sm btn-light"
                          >
                            <i class="fa fa-plus" aria-hidden="true"></i>
                            <span class="d-none d-sm-inline">Add course instance</span>
                          </button>
                        </form>
                      </div>
                    `
                  : ''}
              </div>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped">
                <thead>
                  <tr>
                    <th>Long Name</th>
                    <th>CIID</th>
                    <th id="earliest-access-date">
                      Earliest Access Date
                      <button
                        class="btn btn-xs btn-light"
                        data-placement="auto"
                        data-trigger="focus"
                        data-toggle="popover"
                        data-html="true"
                        title="Earliest Access Date"
                        data-content="${PopoverStartDate()}"
                        aria-label="Information about Earliest Access Date"
                      >
                        <i class="far fa-question-circle" aria-hidden="true"></i>
                      </button>
                    </th>
                    <th id="latest-access-date">
                      Latest Access Date
                      <button
                        class="btn btn-xs btn-light"
                        data-placement="auto"
                        data-trigger="focus"
                        data-toggle="popover"
                        data-html="true"
                        title="Latest Access Date"
                        data-content="${PopoverEndDate()}"
                        aria-label="Information about Latest Access Date"
                      >
                        <i class="far fa-question-circle" aria-hidden="true"></i>
                      </button>
                    </th>
                    <th>Students</th>
                  </tr>
                </thead>
                <tbody>
                  ${courseInstances.map((row) => {
                    return html`
                      <tr>
                        <td class="align-left">
                          <a
                            href="${resLocals.plainUrlPrefix}/course_instance/${row.id}/instructor/instance_admin"
                            >${row.long_name}</a
                          >
                        </td>
                        <td class="align-left">${row.short_name}</td>
                        <td class="align-left">${row.formatted_start_date}</td>
                        <td class="align-left">${row.formatted_end_date}</td>
                        <td class="align-middle">${row.enrollment_count}</td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function PopoverStartDate() {
  return html`
    <p>
      This date is the earliest <code>startDate</code> that appears in any
      <code>accessRule</code> for the course instance. Course instances are listed in order from
      newest to oldest according to this date.
    </p>
    <p>
      It is recommended that you define at least one <code>accessRule</code> that makes the course
      instance accessible to students only during the semester or other time period in which that
      particular course instance is offered. You can do so by editing the
      <code>infoCourseInstance.json</code> file for the course instance. For more information, see
      the
      <a href="https://prairielearn.readthedocs.io/en/latest/accessControl/"
        >documentation on access control</a
      >.
    </p>
  `.toString();
}

function PopoverEndDate() {
  return html`
    <p>
      This date is the latest <code>endDate</code> that appears in any <code>accessRule</code> for
      the course instance. If two course instances have the same "Earliest Access Date," then they
      are listed from newest to oldest according to this "Latest Access Date."
    </p>
    <p>
      It is recommended that you define at least one <code>accessRule</code> that makes the course
      instance accessible to students only during the semester or other time period in which that
      particular course instance is offered. You can do so by editing the
      <code>infoCourseInstance.json</code> file for the course instance. For more information, see
      the
      <a href="https://prairielearn.readthedocs.io/en/latest/accessControl/"
        >documentation on access control</a
      >.
    </p>
  `.toString();
}
