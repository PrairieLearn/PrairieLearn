import { useState } from 'react';
import { Dropdown } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

import { getAdministratorCourseRequestsUrl } from '../lib/client/url.js';
import type { CourseRequestRow } from '../lib/course-request.js';
import type { Institution } from '../lib/db-types.js';

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
      <div className="table-responsive">
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
              <CourseRequestTableRow
                key={row.id}
                row={row}
                institutions={institutions}
                coursesRoot={coursesRoot}
                showAll={showAll}
                csrfToken={csrfToken}
                urlPrefix={urlPrefix}
              />
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

CourseRequestsTable.displayName = 'CourseRequestsTable';

function CourseRequestTableRow({
  row,
  institutions,
  coursesRoot,
  showAll,
  csrfToken,
  urlPrefix,
}: {
  row: CourseRequestRow;
  institutions: Institution[];
  coursesRoot: string;
  showAll: boolean;
  csrfToken: string;
  urlPrefix: string;
}) {
  const [noteOpen, setNoteOpen] = useState(Boolean(row.note));
  const [jobsOpen, setJobsOpen] = useState(false);
  const [showDenyPopover, setShowDenyPopover] = useState(false);
  const [showApprovePopover, setShowApprovePopover] = useState(false);

  return (
    <>
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
              <OverlayTrigger
                trigger="click"
                placement="auto"
                popover={{
                  header: 'Deny course request',
                  body: (
                    <CourseRequestDenyForm
                      request={row}
                      csrfToken={csrfToken}
                      onCancel={() => setShowDenyPopover(false)}
                    />
                  ),
                }}
                show={showDenyPopover}
                rootClose
                onToggle={setShowDenyPopover}
              >
                <button className="btn btn-sm btn-danger text-nowrap me-2">
                  <i className="fa fa-times" aria-hidden="true" /> Deny
                </button>
              </OverlayTrigger>
              <OverlayTrigger
                trigger="click"
                placement="auto"
                popover={{
                  header: 'Approve course request',
                  body: (
                    <CourseRequestApproveForm
                      request={row}
                      institutions={institutions}
                      coursesRoot={coursesRoot}
                      csrfToken={csrfToken}
                      onCancel={() => setShowApprovePopover(false)}
                    />
                  ),
                }}
                show={showApprovePopover}
                rootClose
                onToggle={setShowApprovePopover}
              >
                <button className="btn btn-sm btn-success text-nowrap">
                  <i className="fa fa-check" aria-hidden="true" /> Approve
                </button>
              </OverlayTrigger>
            </>
          )}
        </td>
        <td className="align-middle">
          <Dropdown>
            <Dropdown.Toggle variant="secondary" size="sm">
              Show details
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item as="button" onClick={() => setNoteOpen(!noteOpen)}>
                {noteOpen ? 'Close Note' : 'Edit Note'}
              </Dropdown.Item>
              {row.jobs.length > 0 && (
                <Dropdown.Item as="button" onClick={() => setJobsOpen(!jobsOpen)}>
                  {jobsOpen ? 'Hide jobs' : 'Show jobs'}
                </Dropdown.Item>
              )}
            </Dropdown.Menu>
          </Dropdown>
        </td>
      </tr>
      <tr>
        <td colSpan={showAll ? 11 : 10} className="p-0">
          {noteOpen && (
            <CourseRequestEditNoteForm
              request={row}
              csrfToken={csrfToken}
              onCancel={() => setNoteOpen(false)}
            />
          )}
        </td>
      </tr>
      {row.jobs.length > 0 && (
        <tr>
          <td colSpan={showAll ? 11 : 10} className="p-0">
            {jobsOpen && (
              <table className="table table-sm table-active mb-0" aria-label="Course request jobs">
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
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function CourseRequestApproveForm({
  request,
  institutions,
  coursesRoot,
  csrfToken,
  onCancel,
}: {
  request: CourseRequestRow;
  institutions: Institution[];
  coursesRoot: string;
  csrfToken: string;
  onCancel: () => void;
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
        <select
          id="courseRequestAddInstitution"
          name="institution_id"
          className="form-select"
          onChange={({ currentTarget }) => {
            const selectedOption = currentTarget.selectedOptions[0];
            const timezoneInput = currentTarget
              .closest('form')
              ?.querySelector<HTMLInputElement>('[name=display_timezone]');
            if (timezoneInput) {
              timezoneInput.value = selectedOption.dataset.timezone ?? '';
            }
          }}
        >
          {institutions.map((i) => (
            <option key={i.id} value={i.id} data-timezone={i.display_timezone}>
              {i.short_name}
            </option>
          ))}
        </select>
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
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
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
  onCancel,
}: {
  request: CourseRequestRow;
  csrfToken: string;
  onCancel: () => void;
}) {
  return (
    <form method="POST">
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="__action" value="deny_course_request" />
      <input type="hidden" name="approve_deny_action" value="deny" />
      <input type="hidden" name="request_id" value={request.id} />
      <button type="button" className="btn btn-secondary" onClick={onCancel}>
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
  onCancel,
}: {
  request: CourseRequestRow;
  csrfToken: string;
  onCancel: () => void;
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
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary text-nowrap">
          <i className="fa fa-save" aria-hidden="true" /> Save note
        </button>
      </div>
    </form>
  );
}
