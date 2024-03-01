import { escapeHtml, html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export function AdministratorCourseRequests({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", { ...resLocals })}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'courses',
        })}
        <main id="content" class="container-fluid">
          ${CourseRequestsTable({ showAll: true, resLocals })}
        </main>
      </body>
    </html>
  `.toString();
}

function CourseRequestsTable({
  showAll,
  resLocals,
}: {
  showAll: boolean;
  resLocals: Record<string, any>;
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
                href="${resLocals.urlPrefix}/administrator/courseRequests"
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
              <th>Short Name</th>
              <th>Title</th>
              <th>Requested By</th>
              <th>Institution</th>
              <th>Official Email</th>
              <th>User ID</th>
              <th>GitHub Username</th>
              <th>Status</th>
              ${showAll ? html`<th>Updated By</th>` : ''}
              <th>Actions</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${resLocals.course_requests.map((req) => {
              return html`
                <tr>
                  <td class="align-middle">${req.short_name}</td>
                  <td class="align-middle">${req.title}</td>
                  <td class="align-middle">${req.first_name} ${req.last_name}</td>
                  <td class="align-middle">${req.institution}</td>
                  <td class="align-middle">${req.work_email}</td>
                  <td class="align-middle">${req.user_uid}</td>
                  <td class="align-middle">${req.github_user}</td>
                  <td class="align-middle">${CourseRequestStatusIcon({ status: req.status })}</td>
                  ${showAll
                    ? html`
                        <td class="align-middle">
                          ${req.approved_by_name ?? 'Automatically Approved'}
                        </td>
                      `
                    : ''}
                  <td class="align-middle">
                    ${req.status !== 'approved'
                      ? html`
                          <form name="approve-request-form-${req.id}" method="POST">
                            <input
                              type="hidden"
                              name="__csrf_token"
                              value="${resLocals.__csrf_token}"
                            />
                            <input
                              type="hidden"
                              name="__action"
                              value="approve_deny_course_request"
                            />
                            <input type="hidden" name="request_id" value="${req.id}" />

                            <button
                              type="submit"
                              class="btn btn-sm btn-danger float-right"
                              name="approve_deny_action"
                              value="deny"
                              tabindex="0"
                            >
                              <i class="fa fa-times" aria-hidden="true"></i> Deny
                            </button>
                            <button
                              type="button"
                              class="btn btn-sm btn-success float-right mr-2"
                              id="approve-request-button-${req.id}"
                              name="approve_deny_action"
                              value="approve"
                              tabindex="0"
                              data-toggle="popover"
                              data-container="body"
                              data-boundary="window"
                              data-html="true"
                              data-placement="auto"
                              title="Approve course request"
                              data-content="${escapeHtml(
                                renderEjs(
                                  __filename,
                                  "<%- include('courseRequestApproveForm') %>",
                                  {
                                    request: req,
                                    id: 'approve-request-button-' + req.id,
                                    __csrf_token: resLocals.__csrf_token,
                                    institutions: resLocals.institutions,
                                    coursesRoot: resLocals.coursesRoot,
                                  },
                                ),
                              )}"
                              data-trigger="manual"
                              onclick="$(this).popover('show')"
                            >
                              <i class="fa fa-check" aria-hidden="true"></i> Approve
                            </button>
                          </form>
                        `
                      : ''}
                  </td>
                  <td class="align-middle">
                    ${req.jobs.length > 0
                      ? html`
                          <a
                            href="${resLocals.urlPrefix}/administrator/jobSequence/${req.jobs[0]
                              .id}"
                            class="show-hide-btn expand-icon-container btn btn-secondary btn-sm collapsed btn-xs float-right"
                            data-toggle="collapse"
                            data-target="#course-requests-job-list-${req.id}"
                            aria-expanded="false"
                            aria-controls="course-requests-job-list-${req.id}"
                          >
                            <i class="fa fa-angle-up fa-fw expand-icon"></i>
                            Show Jobs
                          </a>
                        `
                      : ''}
                  </td>
                </tr>
                ${req.jobs.length > 0
                  ? html`
                      <tr>
                        <td colspan="${showAll ? 11 : 10}" class="p-0">
                          <div id="course-requests-job-list-${req.id}" class="collapse">
                            <table class="table table-sm table-active mb-0">
                              <thead>
                                <th>Number</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>User</th>
                                <th>Status</th>
                                <th></th>
                              </thead>
                              ${req.jobs
                                .slice()
                                .reverse()
                                .map((job) => {
                                  return html`
                                    <tr>
                                      <td>${job.number}</td>
                                      <td>${job.start_date}</td>
                                      <td>${job.finish_date}</td>
                                      <td>${job.authn_user_name}</td>
                                      <td>
                                        ${renderEjs(
                                          __filename,
                                          "<%- include('../partials/jobStatus') %>",
                                          { status: job.status },
                                        )}
                                        %>
                                      </td>
                                      <td>
                                        <a
                                          href="${resLocals.urlPrefix}/administrator/jobSequence/${job.id}"
                                          class="btn btn-xs btn-info float-right"
                                          >Details</a
                                        >
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

function CourseRequestStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return html`<span class="badge badge-secondary"> <i class="fa fa-clock"></i> Pending </span>`;
    case 'creating':
      return html`<span class="badge badge-info">
        <i class="fa fa-sync"></i> Job in progress
      </span>`;
    case 'failed':
      return html`<span class="badge badge-danger"> <i class="fa fa-times"></i> Job failed </span>`;
    case 'approved':
      return html`<span class="badge badge-success"> <i class="fa fa-check"></i> Approved </span>`;
    case 'denied':
      return html`<span class="badge badge-danger"><i class="fa fa-times"></i> Denied </span>`;
  }
}
