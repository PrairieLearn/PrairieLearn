import clsx from 'clsx';
import { Fragment } from 'react';

import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/react';

import { getAdministratorCourseRequestsUrl } from '../lib/client/url.js';
import { type CourseRequestRow } from '../lib/course-request.js';
import { type Institution } from '../lib/db-types.js';

import { JobStatus } from './JobStatus.js';

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
  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center">
        <h2>{headerPrefix} course requests</h2>
        {!showAll && (
          <a
            className="btn btn-sm btn-light ms-auto"
            href={getAdministratorCourseRequestsUrl({ urlPrefix })}
          >
            <i className="fa fa-search" aria-hidden="true" />
            <span className="d-none d-sm-inline">View All</span>
          </a>
        )}
      </div>
      <div>
        <table className="table table-sm" aria-label="Course requests">
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
              {showAll && <th>Updated By</th>}
              <th>Actions</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <td className="align-middle">{row.created_at.toISOString()}</td>
                  <td className="align-middle">
                    {row.short_name}: {row.title}
                  </td>
                  <td className="align-middle">{row.institution}</td>
                  <td className="align-middle">
                    {row.first_name} {row.last_name} ({row.work_email})
                  </td>
                  <td className="align-middle">
                    {row.user_name} ({row.user_uid})
                  </td>
                  <td className="align-middle">{row.github_user}</td>
                  <td className="align-middle">{row.referral_source}</td>
                  <td className="align-middle">
                    <CourseRequestStatusIcon status={row.approved_status} />
                  </td>
                  {showAll && (
                    <td className="align-middle">
                      {row.approved_status !== 'pending' &&
                        (row.approved_by_name ?? 'Automatically Approved')}
                    </td>
                  )}
                  <td className="align-middle">
                    {row.approved_status !== 'approved' && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger text-nowrap me-2"
                          data-bs-toggle="popover"
                          data-bs-container="body"
                          data-bs-html="true"
                          data-bs-placement="auto"
                          data-bs-title="Deny course request"
                          data-bs-content={renderHtml(
                            <CourseRequestDenyForm request={row} csrfToken={csrfToken} />,
                          ).toString()}
                        >
                          <i className="fa fa-times" aria-hidden="true" /> Deny
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-success text-nowrap"
                          data-bs-toggle="popover"
                          data-bs-container="body"
                          data-bs-html="true"
                          data-bs-placement="auto"
                          data-bs-title="Approve course request"
                          data-bs-content={renderHtml(
                            <CourseRequestApproveForm
                              request={row}
                              institutions={institutions}
                              coursesRoot={coursesRoot}
                              csrfToken={csrfToken}
                            />,
                          ).toString()}
                        >
                          <i className="fa fa-check" aria-hidden="true" /> Approve
                        </button>
                      </>
                    )}
                  </td>
                  <td className="align-middle">
                    <div className="dropdown">
                      <button
                        className="btn btn-secondary btn-xs dropdown-toggle"
                        type="button"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        Show details
                      </button>
                      <ul className="dropdown-menu">
                        <li>
                          <button
                            className={clsx('dropdown-item', 'show-hide-btn', {
                              collapsed: !row.note,
                            })}
                            data-bs-toggle="collapse"
                            data-bs-target={`#course-requests-note-${row.id}`}
                            aria-expanded={row.note ? 'true' : 'false'}
                            aria-controls={`course-requests-note-${row.id}`}
                          >
                            <span className="show-when-collapsed">Edit Note</span>
                            <span className="show-when-expanded">Close Note</span>
                          </button>
                        </li>
                        {row.jobs.length > 0 && (
                          <li>
                            <button
                              className="dropdown-item show-hide-btn collapsed"
                              data-bs-toggle="collapse"
                              data-bs-target={`#course-requests-job-list-${row.id}`}
                              aria-expanded="false"
                              aria-controls={`course-requests-job-list-${row.id}`}
                            >
                              Show jobs
                            </button>
                          </li>
                        )}
                      </ul>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={showAll ? 11 : 10} className="p-0">
                    <div
                      id={`course-requests-note-${row.id}`}
                      className={clsx('collapse', { show: row.note })}
                    >
                      <CourseRequestEditNoteForm request={row} csrfToken={csrfToken} />
                    </div>
                  </td>
                </tr>
                {row.jobs.length > 0 && (
                  <tr>
                    <td colSpan={showAll ? 11 : 10} className="p-0">
                      <div id={`course-requests-job-list-${row.id}`} className="collapse">
                        <table
                          className="table table-sm table-active mb-0"
                          aria-label="Course request jobs"
                        >
                          <thead>
                            <tr>
                              <th>Number</th>
                              <th>Start Date</th>
                              <th>End Date</th>
                              <th>User</th>
                              <th>Status</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {[...row.jobs].reverse().map((job) => {
                              return (
                                <tr key={job.id}>
                                  <td>{job.number}</td>
                                  <td>{job.start_date.toISOString()}</td>
                                  <td>{job.finish_date?.toISOString()}</td>
                                  <td>{job.authn_user_name}</td>
                                  <td>
                                    <JobStatus status={job.status} />
                                  </td>
                                  <td>
                                    <a
                                      href={`${urlPrefix}/administrator/jobSequence/${job.id}`}
                                      className="btn btn-xs btn-info float-end"
                                    >
                                      Details
                                    </a>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-footer">
        <small>
          Accepting a course request will automatically create a new GitHub repository and add the
          course to the database.
        </small>
      </div>
    </div>
  );
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
  return (
    <form name={`create-course-from-request-form-${request.id}`} method="POST">
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="__action" value="create_course_from_request" />
      <input type="hidden" name="request_id" value={request.id} />

      <div className="mb-3">
        <label className="form-label" htmlFor="courseRequestAddInstitution">
          Institution:
        </label>
        {/* React doesn't let us emit raw event handlers, so
            instead we render the select inside a dangerouslySetInnerHTML block. */}
        <div
          // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html: html`
              <select
                id="courseRequestAddInstitution"
                name="institution_id"
                class="form-select"
                onchange="this.closest('form').querySelector('[name=display_timezone]').value = this.querySelector('option:checked').dataset.timezone;"
              >
                ${institutions.map(
                  (i) => html`
                    <option value="${i.id}" data-timezone="${i.display_timezone}">
                      ${i.short_name}
                    </option>
                  `,
                )}
              </select>
            `.toString(),
          }}
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseRequestAddInputShortName">
          Short name:
        </label>
        <input
          type="text"
          className="form-control"
          id="courseRequestAddInputShortName"
          name="short_name"
          placeholder="XC 101"
          defaultValue={request.short_name}
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseRequestAddInputTitle">
          Title:
        </label>
        <input
          type="text"
          className="form-control"
          id="courseRequestAddInputTitle"
          name="title"
          placeholder="Template course title"
          defaultValue={request.title}
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseRequestAddInputTimezone">
          Timezone:
        </label>
        <input
          type="text"
          className="form-control"
          id="courseRequestAddInputTimezone"
          name="display_timezone"
          defaultValue={institutions[0]?.display_timezone}
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseRequestAddInputPath">
          Path:
        </label>
        <input
          type="text"
          className="form-control"
          id="courseRequestAddInputPath"
          name="path"
          defaultValue={coursesRoot + '/' + repo_name}
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="courseRequestAddInputRepositoryName">
          Repository Name:
        </label>
        <input
          type="text"
          className="form-control"
          id="courseRequestAddInputRepository"
          name="repository_short_name"
          defaultValue={repo_name}
        />
      </div>
      <div className="mb-3">
        <label htmlFor="courseRequestAddInputGithubUser">GitHub Username:</label>
        <input
          type="text"
          className="form-control"
          id="courseRequestAddInputGithubUser"
          name="github_user"
          defaultValue={request.github_user ?? ''}
        />
      </div>

      <div className="text-end">
        <button type="button" className="btn btn-secondary" data-bs-dismiss="popover">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Create course
        </button>
      </div>
    </form>
  );
}

function CourseRequestDenyForm({
  request,
  csrfToken,
}: {
  request: CourseRequestRow;
  csrfToken: string;
}) {
  return (
    <form method="POST">
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="__action" value="deny_course_request" />
      <input type="hidden" name="approve_deny_action" value="deny" />
      <input type="hidden" name="request_id" value={request.id} />
      <button type="button" className="btn btn-secondary" data-bs-dismiss="popover">
        Cancel
      </button>
      <button type="submit" className="btn btn-danger">
        Deny
      </button>
    </form>
  );
}

function CourseRequestStatusIcon({ status }: { status: CourseRequestRow['approved_status'] }) {
  switch (status) {
    case 'pending':
      return (
        <span className="badge text-bg-secondary">
          <i className="fa fa-clock" /> Pending
        </span>
      );
    case 'creating':
      return (
        <span className="badge text-bg-info">
          <i className="fa fa-sync" /> Job in progress
        </span>
      );
    case 'failed':
      return (
        <span className="badge text-bg-danger">
          <i className="fa fa-times" /> Job failed
        </span>
      );
    case 'approved':
      return (
        <span className="badge text-bg-success">
          <i className="fa fa-check" /> Approved
        </span>
      );
    case 'denied':
      return (
        <span className="badge text-bg-danger">
          <i className="fa fa-times" /> Denied
        </span>
      );
  }
}

function CourseRequestEditNoteForm({
  request,
  csrfToken,
}: {
  request: CourseRequestRow;
  csrfToken: string;
}) {
  return (
    <form method="POST">
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="__action" value="update_course_request_note" />
      <input type="hidden" name="request_id" value={request.id} />
      <div className="d-flex gap-2 align-items-center py-2 px-2">
        <label className="visually-hidden" htmlFor={`course-request-note-${request.id}`}>
          Note for course request {request.short_name}
        </label>
        <textarea
          className="form-control flex-grow-1"
          id={`course-request-note-${request.id}`}
          name="note"
          rows={1}
          maxLength={10000}
          placeholder="Add a note about this course request..."
          defaultValue={request.note ?? ''}
        />
        <button
          type="button"
          className="btn btn-secondary"
          data-bs-toggle="collapse"
          data-bs-target={`#course-requests-note-${request.id}`}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary text-nowrap">
          <i className="fa fa-save" aria-hidden="true" /> Save note
        </button>
      </div>
    </form>
  );
}
