import { Temporal } from '@js-temporal/polyfill';

import { formatDateYMDHM } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';
import { run } from '@prairielearn/run';

import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { SyncProblemButtonHtml } from '../../components/SyncProblemButton.js';
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
  const initialStartDate = Temporal.Now.zonedDateTimeISO(resLocals.course.timeZone).with({
    hour: 0,
    minute: 1,
    second: 0,
  });
  const initialStartDateFormatted = formatDateYMDHM(
    new Date(initialStartDate.epochMilliseconds),
    resLocals.course.time_zone,
  );

  const initialEndDate = initialStartDate.add({ months: 4 }).with({
    hour: 23,
    minute: 59,
    second: 0,
  });
  const initialEndDateFormatted = formatDateYMDHM(
    new Date(initialEndDate.epochMilliseconds),
    resLocals.course.time_zone,
  );

  return PageLayout({
    resLocals,
    pageTitle: 'Course Instances',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'instances',
    },
    options: {
      fullWidth: true,
    },
    headContent: compiledScriptTag('instructorCourseAdminInstancesClient.ts'),
    content: html`
      ${renderHtml(
        <CourseSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      ${CreateCourseInstanceModal({
        courseShortName: resLocals.course.short_name,
        csrfToken: resLocals.__csrf_token,
        initialStartDateFormatted,
        initialEndDateFormatted,
        timezone: resLocals.course.display_timezone,
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
                  type="button"
                  class="btn btn-sm btn-light"
                  data-bs-toggle="modal"
                  data-bs-target="#createCourseInstanceModal"
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
                          type="button"
                          class="btn btn-xs btn-light"
                          aria-label="Information about Earliest Access Date"
                          data-bs-toggle="popover"
                          data-bs-container="body"
                          data-bs-placement="bottom"
                          data-bs-html="true"
                          data-bs-title="Earliest Access Date"
                          data-bs-content="${PopoverStartDate()}"
                        >
                          <i class="far fa-question-circle" aria-hidden="true"></i>
                        </button>
                      </th>
                      <th id="latest-access-date">
                        Latest Access Date
                        <button
                          type="button"
                          class="btn btn-xs btn-light"
                          aria-label="Information about Latest Access Date"
                          data-bs-toggle="popover"
                          data-bs-container="body"
                          data-bs-placement="bottom"
                          data-bs-html="true"
                          data-bs-title="Latest Access Date"
                          data-bs-content="${PopoverEndDate()}"
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
                              ? SyncProblemButtonHtml({
                                  type: 'error',
                                  output: row.sync_errors,
                                })
                              : row.sync_warnings
                                ? SyncProblemButtonHtml({
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
                <p class="fw-bold">No course instances found.</p>
                <p class="mb-0">
                  A course instance contains the assessments and other configuration for a single
                  offering of a course.
                </p>
                <p>
                  Learn more in the
                  <a
                    href="https://prairielearn.readthedocs.io/en/latest/courseInstance/"
                    target="_blank"
                    rel="noreferrer"
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
                      type="button"
                      class="btn btn-sm btn-primary"
                      data-bs-toggle="modal"
                      data-bs-target="#createCourseInstanceModal"
                    >
                      <i class="fa fa-plus" aria-hidden="true"></i>
                      <span class="d-none d-sm-inline">Add course instance</span>
                    </button>
                  `;
                })}
              </div>
            `}
      </div>
    `,
  });
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
  courseShortName,
  csrfToken,
  initialStartDateFormatted,
  initialEndDateFormatted,
  timezone,
}: {
  courseShortName: string;
  csrfToken: string;
  initialStartDateFormatted: string;
  initialEndDateFormatted: string;
  timezone: string;
}) {
  return Modal({
    id: 'createCourseInstanceModal',
    title: 'Create course instance',
    formMethod: 'POST',
    body: html`
      <div class="mb-3">
        <label class="form-label" for="long_name">Long name</label>
        <input
          type="text"
          class="form-control"
          id="long_name"
          name="long_name"
          required
          aria-describedby="long_name_help"
        />
        <small id="long_name_help" class="form-text text-muted">
          The full course instance name, such as "Fall 2025". Users see it joined to the course
          name, e.g. "${courseShortName} Fall 2025".
        </small>
      </div>
      <div class="mb-3">
        <label class="form-label" for="short_name">Short name</label>
        <input
          type="text"
          class="form-control"
          id="short_name"
          name="short_name"
          required
          pattern="[\\-A-Za-z0-9_\\/]+"
          aria-describedby="short_name_help"
        />
        <small id="short_name_help" class="form-text text-muted">
          A short name, such as "Fa25" or "W25b". This is used in menus and headers where a short
          description is required. Use only letters, numbers, dashes, and underscores, with no
          spaces.
        </small>
      </div>
      <div class="form-check mb-3">
        <input
          type="checkbox"
          class="form-check-input"
          id="access_dates_enabled"
          name="access_dates_enabled"
          aria-describedby="access_dates_enabled_help"
        />
        <label class="form-check-label" for="access_dates_enabled">
          Make course instance available to students
          <br />
          <small id="access_dates_enabled_help" class="form-text text-muted mt-0">
            This can be enabled later.
          </small>
        </label>
      </div>
      <div id="accessDates" hidden>
        <div class="mb-3">
          <label class="form-label" for="start_access_date">Access start date</label>
          <div class="input-group date-picker">
            <input
              class="form-control date-picker"
              type="datetime-local"
              id="start_access_date"
              name="start_access_date"
              value="${initialStartDateFormatted}"
              aria-describedby="start_access_date_help"
            />
            <span class="input-group-text date-picker">${timezone}</span>
          </div>
          <small id="start_access_date_help" class="form-text text-muted">
            The date when students can access the course instance. Can be edited later.
          </small>
        </div>
        <div class="mb-3">
          <label class="form-label" for="end_access_date">Access end date</label>
          <div class="input-group date-picker">
            <input
              class="form-control date-picker"
              type="datetime-local"
              id="end_access_date"
              name="end_access_date"
              value="${initialEndDateFormatted}"
              aria-describedby="end_access_date_help"
            />
            <span class="input-group-text date-picker">${timezone}</span>
          </div>
          <small id="end_access_date_help" class="form-text text-muted">
            The date when students can no longer access the course instance. Can be edited later.
          </small>
        </div>
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="add_course_instance" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" id="add_course_instance_button" class="btn btn-primary">Create</button>
    `,
  });
}
