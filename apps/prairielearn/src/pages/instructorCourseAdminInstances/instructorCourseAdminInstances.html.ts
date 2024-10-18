import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { SyncProblemButton } from '../../components/SyncProblemButton.html.js';
import { type CourseInstanceAuthz } from '../../models/course-instances.js';

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
        ${HeadContents({ resLocals, pageTitle: 'Course Instances' })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${CourseSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <h1>Course instances</h1>
              ${resLocals.authz_data.has_course_permission_edit &&
              !resLocals.course.example_course &&
              !resLocals.needToSync
                ? html`
                    <form class="ml-auto" name="add-course-instance-form" method="POST">
                      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                      <button
                        name="__action"
                        value="add_course_instance"
                        class="btn btn-sm btn-light"
                      >
                        <i class="fa fa-plus" aria-hidden="true"></i>
                        <span class="d-none d-sm-inline">Add course instance</span>
                      </button>
                    </form>
                  `
                : ''}
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped" aria-label="Course instances">
                <thead>
                  <tr>
                    <th>Long Name</th>
                    <th>CIID</th>
                    <th id="earliest-access-date">
                      Earliest Access Date
                      <button
                        class="btn btn-xs btn-light"
                        data-toggle="popover"
                        data-container="body"
                        data-placement="bottom"
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
                        data-toggle="popover"
                        data-container="body"
                        data-placement="bottom"
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
                          ${row.sync_errors
                            ? SyncProblemButton({
                                type: 'error',
                                output: row.sync_errors,
                              })
                            : row.sync_warnings
                              ? SyncProblemButton({
                                  type: 'warning',
                                  output: row.sync_warnings,
                                })
                              : ''}
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
