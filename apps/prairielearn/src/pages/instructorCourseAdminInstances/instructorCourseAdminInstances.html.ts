import { Temporal } from '@js-temporal/polyfill';

import { formatDateYMDHM } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { SyncProblemButton } from '../../components/SyncProblemButton.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { type CourseInstanceAuthz } from '../../models/course-instances.js';

export type CourseInstanceAuthzRow = CourseInstanceAuthz & { enrollment_count?: number };

export function InstructorCourseAdminInstances({
  resLocals,
  courseInstances,
}: {
  resLocals: Record<string, any>;
  courseInstances: CourseInstanceAuthzRow[];
}) {
  const startDate = Temporal.Now.zonedDateTimeISO(resLocals.course.timeZone).with({
    hour: 0,
    minute: 1,
    second: 0,
  });
  const initialStartDateFormatted = formatDateYMDHM(
    new Date(startDate.epochMilliseconds),
    resLocals.course.time_zone,
  );

  const endDate = startDate.add({ months: 4 }).with({
    hour: 23,
    minute: 59,
    second: 0,
  });

  const initialEndDateFormatted = formatDateYMDHM(
    new Date(endDate.epochMilliseconds),
    resLocals.course.time_zone,
  );

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Course Instances' })}
        ${compiledScriptTag('instructorCourseAdminInstancesClient.ts')}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${CourseSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          ${CreateCourseInstanceModal({
            csrfToken: resLocals.__csrf_token,
            initialStartDateFormatted,
            initialEndDateFormatted,
          })}
          <div class="card mb-4">
            <div
              class="card-header bg-primary text-white d-flex align-items-center justify-content-between"
            >
              <h1>Course instances</h1>
              ${resLocals.authz_data.has_course_permission_edit &&
              !resLocals.course.example_course &&
              !resLocals.needToSync &&
              courseInstances.length > 0
                ? html`
                    <button
                      name="__action"
                      value="add_course_instance"
                      class="btn btn-sm btn-light"
                      data-toggle="modal"
                      data-target="#createCourseInstanceModal"
                    >
                      <i class="fa fa-plus" aria-hidden="true"></i>
                      <span class="d-none d-sm-inline">Add course instance</span>
                    </button>
                  `
                : ''}
            </div>
            ${courseInstances.length > 0
              ? html`
                  <div class="table-responsive">
                    <table
                      class="table table-sm table-hover table-striped"
                      aria-label="Course instances"
                    >
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
                `
              : html`
                  <div class="my-4 card-body text-center" style="text-wrap: balance;">
                    <p class="font-weight-bold">No course instances found.</p>
                    <p class="mb-0">
                      A course instance contains the assessments and other configuration for a
                      single offering of a course.
                    </p>
                    <p>
                      Learn more in the
                      <a
                        href="https://prairielearn.readthedocs.io/en/latest/courseInstance/"
                        target="_blank"
                        >course instance documentation</a
                      >.
                    </p>
                    ${run(() => {
                      if (resLocals.course.example_course) {
                        return html`<p>You can't add course instances to the example course.</p>`;
                      }
                      if (!resLocals.authz_data.has_course_permission_edit) {
                        return html`<p>Course Editors can create new course instances.</p>`;
                      }
                      if (resLocals.needToSync) {
                        return html`
                          <p>
                            You must
                            <a href="${resLocals.urlPrefix}/course_admin/syncs">sync this course</a>
                            before creating a new course instance.
                          </p>
                        `;
                      }
                      return html`
                        <button
                          name="__action"
                          value="add_course_instance"
                          class="btn btn-sm btn-primary"
                          data-toggle="modal"
                          data-target="#createCourseInstanceModal"
                        >
                          <i class="fa fa-plus" aria-hidden="true"></i>
                          <span class="d-none d-sm-inline">Add course instance</span>
                        </button>
                      `;
                    })}
                  </div>
                `}
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

function CreateCourseInstanceModal({
  csrfToken,
  initialStartDateFormatted,
  initialEndDateFormatted,
}: {
  csrfToken: string;
  initialStartDateFormatted?: string;
  initialEndDateFormatted?: string;
}) {
  return Modal({
    id: 'createCourseInstanceModal',
    title: 'Create course instance',
    formMethod: 'POST',
    body: html`
      <div class="form-group">
        <label for="short_name">CIID (Course Instance Identifier)</label>
        <input
          type="text"
          class="form-control"
          id="short_name"
          name="short_name"
          required
          pattern="[\\-A-Za-z0-9_\\/]+"
          title="Please enter a valid format: only letters, numbers, hyphens, underscores, backslashes, and forward slashes."
        />
        <small class="form-text text-muted">
          The recommended format is <code>Fa19</code> or <code>Fall2019</code>. Use only letters,
          numbers, dashes, and underscores, with no spaces.
        </small>
      </div>
      <div class="form-group">
        <label for="long_name">Long Name</label>
        <input type="text" class="form-control" id="long_name" name="long_name" required />
        <small class="form-text text-muted">
          This is the full name of the course instance, such as "Fall 2019" or "Spring 2020".
        </small>
      </div>
      <div class="form-group">
        <label for="start_access_date">Start Access Date</label>
        <input
          class="form-control date-picker"
          type="datetime-local"
          id="start_access_date"
          name="start_access_date"
          value="${initialStartDateFormatted}"
          max="${initialEndDateFormatted}"
          step="1"
        />
        <small class="form-text text-muted">
          The date when students can access the course instance.
        </small>
      </div>
      <div class="form-group">
        <label for="end_access_date">End Access Date</label>
        <input
          class="form-control date-picker"
          type="datetime-local"
          id="end_access_date"
          name="end_access_date"
          value="${initialEndDateFormatted}"
          min="${initialStartDateFormatted}"
          step="1"
        />
        <small class="form-text text-muted">
          The date when students can no longer access the course instance.
        </small>
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="add_course_instance" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Create</button>
    `,
  });
}
