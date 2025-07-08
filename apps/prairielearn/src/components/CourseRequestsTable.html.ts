import { escapeHtml, html } from '@prairielearn/html';

import { type CourseRequestRow } from '../lib/course-request.js';
import { type Institution } from '../lib/db-types.js';

import { JobStatus } from './JobStatus.html.js';

export function CourseRequestsTable({
  rows,
  institutions,
  coursesRoot,
  showAll,
  csrfToken,
  urlPrefix,
}: {
  rows: CourseRequestRow[];
  institutions: Institution[];
  coursesRoot: string;
  showAll: boolean;
  csrfToken: string;
  urlPrefix: string;
}) {
  const headerPrefix = showAll ? 'All' : 'Pending';
  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center">
        <h2>${headerPrefix} course requests</h2>
        ${showAll
          ? ''
          : html`
              <a
                class="btn btn-sm btn-light ms-auto"
                href="${urlPrefix}/administrator/courseRequests"
              >
                <i class="fa fa-search" aria-hidden="true"></i>
                <span class="d-none d-sm-inline">View All</span>
              </a>
            `}
      </div>
      <div class="table-responsive">
        <table class="table table-sm" aria-label="Course requests">
          <thead>
            <tr>
              <th>Created At</th>
              <th>Short Name / Title</th>
              <th>Institution</th>
              <th>Requested By</th>
              <th>PrairieLearn User</th>
              <th>GitHub Username</th>
              <th>Referral Source</th>
              <th>Status</th>
              ${showAll ? html`<th>Updated By</th>` : ''}
              <th>Actions</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              return html`
                <tr>
                  <td class="align-middle">${row.created_at.toISOString()}</td>
                  <td class="align-middle">${row.short_name}: ${row.title}</td>
                  <td class="align-middle">${row.institution}</td>
                  <td class="align-middle">
                    ${row.first_name} ${row.last_name} (${row.work_email})
                  </td>
                  <td class="align-middle">${row.user_name} (${row.user_uid})</td>
                  <td class="align-middle">${row.github_user}</td>
                  <td class="align-middle">${row.referral_source}</td>
                  <td class="align-middle">
                    ${CourseRequestStatusIcon({ status: row.approved_status })}
                  </td>
                  ${showAll
                    ? html`
                        <td class="align-middle">
                          ${row.approved_status !== 'pending'
                            ? (row.approved_by_name ?? 'Automatically Approved')
                            : ''}
                        </td>
                      `
                    : ''}
                  <td class="align-middle">
                    ${row.approved_status !== 'approved'
                      ? html`
                          <button
                            type="button"
                            class="btn btn-sm btn-danger text-nowrap me-2"
                            data-bs-toggle="popover"
                            data-bs-container="body"
                            data-bs-html="true"
                            data-bs-placement="auto"
                            data-bs-title="Deny course request"
                            data-bs-content="${escapeHtml(
                              CourseRequestDenyForm({
                                request: row,
                                csrfToken,
                              }),
                            )}"
                          >
                            <i class="fa fa-times" aria-hidden="true"></i> Deny
                          </button>
                          <button
                            type="button"
                            class="btn btn-sm btn-success text-nowrap"
                            data-bs-toggle="popover"
                            data-bs-container="body"
                            data-bs-html="true"
                            data-bs-placement="auto"
                            data-bs-title="Approve course request"
                            data-bs-content="${escapeHtml(
                              CourseRequestApproveForm({
                                request: row,
                                institutions,
                                coursesRoot,
                                csrfToken,
                              }),
                            )}"
                          >
                            <i class="fa fa-check" aria-hidden="true"></i> Approve
                          </button>
                        `
                      : ''}
                  </td>
                  <td class="align-middle">
                    ${row.jobs.length > 0
                      ? html`
                          <button
                            class="btn btn-secondary btn-xs text-nowrap show-hide-btn collapsed"
                            data-bs-toggle="collapse"
                            data-bs-target="#course-requests-job-list-${row.id}"
                            aria-expanded="false"
                            aria-controls="course-requests-job-list-${row.id}"
                          >
                            <i class="fa fa-angle-up fa-fw expand-icon"></i>
                            Show Jobs
                          </button>
                        `
                      : ''}
                  </td>
                </tr>
                ${row.jobs.length > 0
                  ? html`
                      <tr>
                        <td colspan="${showAll ? 11 : 10}" class="p-0">
                          <div id="course-requests-job-list-${row.id}" class="collapse">
                            <table
                              class="table table-sm table-active mb-0"
                              aria-label="Course request jobs"
                            >
                              <thead>
                                <th>Number</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>User</th>
                                <th>Status</th>
                                <th></th>
                              </thead>
                              ${row.jobs
                                .slice()
                                .reverse()
                                .map((job) => {
                                  return html`
                                    <tr>
                                      <td>${job.number}</td>
                                      <td>${job.start_date.toISOString()}</td>
                                      <td>${job.finish_date?.toISOString()}</td>
                                      <td>${job.authn_user_name}</td>
                                      <td>${JobStatus({ status: job.status })}</td>
                                      <td>
                                        <a
                                          href="${urlPrefix}/administrator/jobSequence/${job.id}"
                                          class="btn btn-xs btn-info float-end"
                                        >
                                          Details
                                        </a>
                                      </td>
                                    </tr>
                                  `;
                                })}
                            </table>
                          </div>
                        </td>
                      </tr>
                    `
                  : ''}
              `;
            })}
          </tbody>
        </table>
      </div>
      <div class="card-footer">
        <small>
          Accepting a course request will automatically create a new GitHub repository and add the
          course to the database.
        </small>
      </div>
    </div>
  `;
}

function CourseRequestApproveForm({
  request,
  institutions,
  coursesRoot,
  csrfToken,
}: {
  request: CourseRequestRow;
  institutions: Institution[];
  coursesRoot: string;
  csrfToken: string;
}) {
  const repo_name = 'pl-' + request.short_name.replaceAll(' ', '').toLowerCase();
  return html`
    <form name="create-course-from-request-form-${request.id}" method="POST">
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="__action" value="create_course_from_request" />
      <input type="hidden" name="request_id" value="${request.id}" />

      <div class="mb-3">
        <label class="form-label">Institution:</label>
        <select
          name="institution_id"
          class="form-select"
          onchange="this.closest('form').querySelector('[name=display_timezone]').value = this.querySelector('option:checked').dataset.timezone;"
        >
          ${institutions.map((i) => {
            return html`
              <option value="${i.id}" data-timezone="${i.display_timezone}">${i.short_name}</option>
            `;
          })}
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label" for="courseRequestAddInputShortName">Short name:</label>
        <input
          type="text"
          class="form-control"
          id="courseRequestAddInputShortName"
          name="short_name"
          placeholder="XC 101"
          value="${request.short_name}"
        />
      </div>
      <div class="mb-3">
        <label class="form-label" for="courseRequestAddInputTitle">Title:</label>
        <input
          type="text"
          class="form-control"
          id="courseRequestAddInputTitle"
          name="title"
          placeholder="Template course title"
          value="${request.title}"
        />
      </div>
      <div class="mb-3">
        <label class="form-label" for="courseRequestAddInputTimezone">Timezone:</label>
        <input
          type="text"
          class="form-control"
          id="courseRequestAddInputTimezone"
          name="display_timezone"
          value="${institutions[0]?.display_timezone}"
        />
      </div>
      <div class="mb-3">
        <label class="form-label" for="courseRequestAddInputPath">Path:</label>
        <input
          type="text"
          class="form-control"
          id="courseRequestAddInputPath"
          name="path"
          value="${coursesRoot + '/' + repo_name}"
        />
      </div>
      <div class="mb-3">
        <label class="form-label" for="courseRequestAddInputRepositoryName">Repository Name:</label>
        <input
          type="text"
          class="form-control"
          id="courseRequestAddInputRepository"
          name="repository_short_name"
          value="${repo_name}"
        />
      </div>
      <div class="mb-3">
        <label for="courseRequestAddInputGithubUser">GitHub Username:</label>
        <input
          type="text"
          class="form-control"
          id="courseRequestAddInputGithubUser"
          name="github_user"
          value="${request.github_user}"
        />
      </div>

      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Create course</button>
      </div>
    </form>
  `;
}

function CourseRequestDenyForm({
  request,
  csrfToken,
}: {
  request: CourseRequestRow;
  csrfToken: string;
}) {
  return html`
    <form method="POST">
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="__action" value="approve_deny_course_request" />
      <input type="hidden" name="approve_deny_action" value="deny" />
      <input type="hidden" name="request_id" value="${request.id}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
      <button type="submit" class="btn btn-danger">Deny</button>
    </form>
  `;
}

function CourseRequestStatusIcon({ status }: { status: CourseRequestRow['approved_status'] }) {
  switch (status) {
    case 'pending':
      return html`<span class="badge text-bg-secondary"><i class="fa fa-clock"></i> Pending</span>`;
    case 'creating':
      return html`<span class="badge text-bg-info"
        ><i class="fa fa-sync"></i> Job in progress</span
      >`;
    case 'failed':
      return html`<span class="badge text-bg-danger"><i class="fa fa-times"></i> Job failed</span>`;
    case 'approved':
      return html`<span class="badge text-bg-success"><i class="fa fa-check"></i> Approved</span>`;
    case 'denied':
      return html`<span class="badge text-bg-danger"><i class="fa fa-times"></i> Denied</span>`;
  }
}
