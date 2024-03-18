import { html, escapeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { CourseRequestRow } from '../lib/course-request';
import { Institution } from '../lib/db-types';

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
        ${headerPrefix} course requests
        ${showAll
          ? ''
          : html`
              <a
                class="btn btn-sm btn-light ml-auto"
                href="${urlPrefix}/administrator/courseRequests"
              >
                <i class="fa fa-search" aria-hidden="true"></i>
                <span class="d-none d-sm-inline">View All</span>
              </a>
            `}
      </div>
      <div class="table-responsive">
        <table class="table table-sm">
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
                            ? row.approved_by_name ?? 'Automatically Approved'
                            : ''}
                        </td>
                      `
                    : ''}
                  <td class="align-middle">
                    ${row.approved_status !== 'approved'
                      ? html`
                          <form
                            name="approve-request-form-${row.id}"
                            method="POST"
                            class="d-flex align-items-start"
                          >
                            <input type="hidden" name="__csrf_token" value="${csrfToken}" />
                            <input
                              type="hidden"
                              name="__action"
                              value="approve_deny_course_request"
                            />
                            <input type="hidden" name="request_id" value="${row.id}" />

                            <button
                              type="submit"
                              class="btn btn-sm btn-danger text-nowrap mr-2"
                              name="approve_deny_action"
                              value="deny"
                            >
                              <i class="fa fa-times" aria-hidden="true"></i> Deny
                            </button>
                            <button
                              type="button"
                              class="btn btn-sm btn-success text-nowrap"
                              id="approve-request-button-${row.id}"
                              name="approve_deny_action"
                              value="approve"
                              data-toggle="popover"
                              data-container="body"
                              data-boundary="window"
                              data-html="true"
                              data-placement="auto"
                              title="Approve course request"
                              data-content="${escapeHtml(
                                CourseRequestApproveForm({
                                  id: `approve-request-button-${row.id}`,
                                  request: row,
                                  institutions,
                                  coursesRoot,
                                  csrfToken,
                                }),
                              )}"
                            >
                              <i class="fa fa-check" aria-hidden="true"></i> Approve
                            </button>
                          </form>
                        `
                      : ''}
                  </td>
                  <td class="align-middle">
                    ${row.jobs.length > 0
                      ? html`
                          <a
                            href="${urlPrefix}/administrator/jobSequence/${row.jobs[0].id}"
                            class="show-hide-btn expand-icon-container btn btn-secondary btn-sm collapsed btn-xs text-nowrap"
                            data-toggle="collapse"
                            data-target="#course-requests-job-list-${row.id}"
                            aria-expanded="false"
                            aria-controls="course-requests-job-list-${row.id}"
                          >
                            <i class="fa fa-angle-up fa-fw expand-icon"></i>
                            Show Jobs
                          </a>
                        `
                      : ''}
                  </td>
                </tr>
                ${row.jobs.length > 0
                  ? html`
                      <tr>
                        <td colspan="${showAll ? 10 : 9}" class="p-0">
                          <div id="course-requests-job-list-${row.id}" class="collapse">
                            <table class="table table-sm table-active mb-0">
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
                                      <td>
                                        ${renderEjs(
                                          __filename,
                                          "<%- include('../pages/partials/jobStatus') %>",
                                          { status: job.status },
                                        )}
                                      </td>
                                      <td>
                                        <a
                                          href="${urlPrefix}/administrator/jobSequence/${job.id}"
                                          class="btn btn-xs btn-info float-right"
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
  id,
  request,
  institutions,
  coursesRoot,
  csrfToken,
}: {
  id: string;
  request: CourseRequestRow;
  institutions: Institution[];
  coursesRoot: string;
  csrfToken: string;
}) {
  const repo_name = 'pl-' + request.short_name.replace(' ', '').toLowerCase();
  return html`
    <form name="create-course-from-request-form-${request.id}" method="POST">
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="__action" value="create_course_from_request" />
      <input type="hidden" name="request_id" value="${request.id}" />

      <div class="form-group">
        <label>Institution:</label>
        <select
          name="institution_id"
          class="form-control"
          onchange="this.closest('form').querySelector('[name=display_timezone]').value = this.querySelector('option:checked').dataset.timezone;"
        >
          ${institutions.map((i) => {
            return html`
              <option value="${i.id}" data-timezone="${i.display_timezone}">${i.short_name}</option>
            `;
          })}
        </select>
      </div>
      <div class="form-group">
        <label for="courseRequestAddInputShortName">Short name:</label>
        <input
          type="text"
          class="form-control"
          id="courseRequestAddInputShortName"
          name="short_name"
          placeholder="XC 101"
          value="${request.short_name}"
        />
      </div>
      <div class="form-group">
        <label for="courseRequestAddInputTitle">Title:</label>
        <input
          type="text"
          class="form-control"
          id="courseRequestAddInputTitle"
          name="title"
          placeholder="Template course title"
          value="${request.title}"
        />
      </div>
      <div class="form-group">
        <label for="courseRequestAddInputTimezone">Timezone:</label>
        <input
          type="text"
          class="form-control"
          id="courseRequestAddInputTimezone"
          name="display_timezone"
          value="${institutions[0]?.display_timezone}"
        />
      </div>
      <div class="form-group">
        <label for="courseRequestAddInputPath">Path:</label>
        <input
          type="text"
          class="form-control"
          id="courseRequestAddInputPath"
          name="path"
          value="${coursesRoot + '/' + repo_name}"
        />
      </div>
      <div class="form-group">
        <label for="courseRequestAddInputRepositoryName">Repository Name:</label>
        <input
          type="text"
          class="form-control"
          id="courseRequestAddInputRepository"
          name="repository_short_name"
          value="${repo_name}"
        />
      </div>
      <div class="form-group">
        <label for="courseRequestAddInputGithubUser">GitHub Username:</label>
        <input
          type="text"
          class="form-control"
          id="courseRequestAddInputGithubUser"
          name="github_user"
          value="${request.github_user}"
        />
      </div>

      <div class="text-right">
        <button type="button" class="btn btn-secondary" onclick="$('#${id}').popover('hide')">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary">Create course</button>
      </div>
    </form>
  `;
}

function CourseRequestStatusIcon({ status }: { status: CourseRequestRow['approved_status'] }) {
  switch (status) {
    case 'pending':
      return html`<span class="badge badge-secondary"><i class="fa fa-clock"></i> Pending</span>`;
    case 'creating':
      return html`<span class="badge badge-info"><i class="fa fa-sync"></i> Job in progress</span>`;
    case 'failed':
      return html`<span class="badge badge-danger"><i class="fa fa-times"></i> Job failed</span>`;
    case 'approved':
      return html`<span class="badge badge-success"><i class="fa fa-check"></i> Approved</span>`;
    case 'denied':
      return html`<span class="badge badge-danger"><i class="fa fa-times"></i> Denied</span>`;
  }
}
