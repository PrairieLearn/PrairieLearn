import { useRef, useState } from 'preact/compat';
import { Button, Modal, OverlayTrigger, Popover } from 'react-bootstrap';

import { SyncProblemButton } from '../../../components/SyncProblemButton.js';
import type { InstructorCourseAdminInstanceRow } from '../instructorCourseAdminInstances.shared.js';

interface InstructorCourseAdminInstancesPageProps {
  courseInstances: InstructorCourseAdminInstanceRow[];
  courseShortName: string;
  courseExample: boolean;
  canEditCourse: boolean;
  needToSync: boolean;
  csrfToken: string;
  urlPrefix: string;
  timezone: string;
  initialStartDateFormatted: string;
  initialEndDateFormatted: string;
}

interface CreateInstanceButtonProps {
  variant: 'primary' | 'light';
  size?: 'sm';
  onClick: () => void;
}

function CreateInstanceButton({ variant, size, onClick }: CreateInstanceButtonProps) {
  return (
    <Button variant={variant} size={size} type="button" onClick={onClick}>
      <i class="fa fa-plus" aria-hidden="true" />
      <span class="d-none d-sm-inline">Add course instance</span>
    </Button>
  );
}

interface CreateCourseInstanceModalProps {
  show: boolean;
  onHide: () => void;
  courseShortName: string;
  csrfToken: string;
  timezone: string;
  initialStartDateFormatted: string;
  initialEndDateFormatted: string;
}

function CreateCourseInstanceModal({
  show,
  onHide,
  courseShortName,
  csrfToken,
  timezone,
  initialStartDateFormatted,
  initialEndDateFormatted,
}: CreateCourseInstanceModalProps) {
  const [accessDatesEnabled, setAccessDatesEnabled] = useState(false);

  const startAccessDateRef = useRef<HTMLInputElement | null>(null);
  const endAccessDateRef = useRef<HTMLInputElement | null>(null);

  const handleValidateDates = () => {
    const startInput = startAccessDateRef.current;
    const endInput = endAccessDateRef.current;

    if (!startInput || !endInput) return;

    if (!accessDatesEnabled) {
      endInput.setCustomValidity('');
      return;
    }

    const startAccessDate = new Date(startInput.value);
    const endAccessDate = new Date(endInput.value);

    if (startAccessDate >= endAccessDate) {
      endInput.setCustomValidity('End access date must be after start access date');
    } else {
      endInput.setCustomValidity('');
    }
  };

  return (
    <Modal show={show} backdrop="static" centered onHide={onHide}>
      <form method="POST">
        <Modal.Header closeButton>
          <Modal.Title>Create course instance</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div class="mb-3">
            <label class="form-label" for="long_name">
              Long name
            </label>
            <input
              type="text"
              class="form-control"
              id="long_name"
              name="long_name"
              aria-describedby="long_name_help"
              required
            />
            <small id="long_name_help" class="form-text text-muted">
              The full course instance name, such as &quot;Fall 2025&quot;. Users see it joined to
              the course name, e.g. &quot;
              {courseShortName} Fall 2025&quot;.
            </small>
          </div>
          <div class="mb-3">
            <label class="form-label" for="short_name">
              Short name
            </label>
            <input
              type="text"
              class="form-control"
              id="short_name"
              name="short_name"
              pattern="[\-A-Za-z0-9_\/]+"
              aria-describedby="short_name_help"
              required
            />
            <small id="short_name_help" class="form-text text-muted">
              A short name, such as &quot;Fa25&quot; or &quot;W25b&quot;. This is used in menus and
              headers where a short description is required. Use only letters, numbers, dashes, and
              underscores, with no spaces.
            </small>
          </div>
          <div class="form-check mb-3">
            <input
              type="checkbox"
              class="form-check-input"
              id="access_dates_enabled"
              name="access_dates_enabled"
              aria-describedby="access_dates_enabled_help"
              checked={accessDatesEnabled}
              onChange={(event) => {
                const target = event.currentTarget;
                setAccessDatesEnabled(target.checked);
              }}
            />
            <label class="form-check-label" for="access_dates_enabled">
              Make course instance available to students
              <br />
              <small id="access_dates_enabled_help" class="form-text text-muted mt-0">
                This can be enabled later.
              </small>
            </label>
          </div>
          <div id="accessDates" hidden={!accessDatesEnabled}>
            <div class="mb-3">
              <label class="form-label" for="start_access_date">
                Access start date
              </label>
              <div class="input-group date-picker">
                <input
                  ref={startAccessDateRef}
                  class="form-control date-picker"
                  type="datetime-local"
                  id="start_access_date"
                  name="start_access_date"
                  value={initialStartDateFormatted}
                  aria-describedby="start_access_date_help"
                />
                <span class="input-group-text date-picker">{timezone}</span>
              </div>
              <small id="start_access_date_help" class="form-text text-muted">
                The date when students can access the course instance. Can be edited later.
              </small>
            </div>
            <div class="mb-3">
              <label class="form-label" for="end_access_date">
                Access end date
              </label>
              <div class="input-group date-picker">
                <input
                  ref={endAccessDateRef}
                  class="form-control date-picker"
                  type="datetime-local"
                  id="end_access_date"
                  name="end_access_date"
                  value={initialEndDateFormatted}
                  aria-describedby="end_access_date_help"
                />
                <span class="input-group-text date-picker">{timezone}</span>
              </div>
              <small id="end_access_date_help" class="form-text text-muted">
                The date when students can no longer access the course instance. Can be edited
                later.
              </small>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <input type="hidden" name="__action" value="add_course_instance" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <Button variant="secondary" type="button" onClick={onHide}>
            Cancel
          </Button>
          <Button
            variant="primary"
            id="add_course_instance_button"
            type="submit"
            onClick={handleValidateDates}
          >
            Create
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

interface EmptyStateProps {
  courseExample: boolean;
  canEditCourse: boolean;
  needToSync: boolean;
  urlPrefix: string;
  onCreateClick: () => void;
}

function EmptyState({
  courseExample,
  canEditCourse,
  needToSync,
  urlPrefix,
  onCreateClick,
}: EmptyStateProps) {
  return (
    <div class="my-4 card-body text-center" style="text-wrap: balance;">
      <p class="fw-bold">No course instances found.</p>
      <p class="mb-0">
        A course instance contains the assessments and other configuration for a single offering of
        a course.
      </p>
      <p>
        Learn more in the{' '}
        <a
          href="https://prairielearn.readthedocs.io/en/latest/courseInstance/"
          target="_blank"
          rel="noreferrer"
        >
          course instance documentation
        </a>
        .
      </p>
      {courseExample ? (
        <p>You can't add course instances to the example course.</p>
      ) : !canEditCourse ? (
        <p>Course Editors can create new course instances.</p>
      ) : needToSync ? (
        <p>
          You must <a href={`${urlPrefix}/course_admin/syncs`}>sync this course</a> before creating
          a new course instance.
        </p>
      ) : (
        <CreateInstanceButton variant="primary" size="sm" onClick={onCreateClick} />
      )}
    </div>
  );
}

export function InstructorCourseAdminInstancesPage({
  courseInstances,
  courseShortName,
  courseExample,
  canEditCourse,
  needToSync,
  csrfToken,
  urlPrefix,
  timezone,
  initialStartDateFormatted,
  initialEndDateFormatted,
}: InstructorCourseAdminInstancesPageProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const canCreateInstances = canEditCourse && !courseExample && !needToSync;

  return (
    <>
      <CreateCourseInstanceModal
        show={showCreateModal}
        courseShortName={courseShortName}
        csrfToken={csrfToken}
        timezone={timezone}
        initialStartDateFormatted={initialStartDateFormatted}
        initialEndDateFormatted={initialEndDateFormatted}
        onHide={() => setShowCreateModal(false)}
      />

      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
          <h1>Course instances</h1>
          {courseInstances.length > 0 && canCreateInstances && (
            <CreateInstanceButton
              variant="light"
              size="sm"
              onClick={() => setShowCreateModal(true)}
            />
          )}
        </div>
        {courseInstances.length > 0 ? (
          <div class="table-responsive">
            <table class="table table-sm table-hover table-striped" aria-label="Course instances">
              <thead>
                <tr>
                  <th>Long Name</th>
                  <th>CIID</th>
                  <th id="earliest-access-date">
                    Earliest Access Date
                    <OverlayTrigger
                      placement="bottom"
                      overlay={
                        <Popover>
                          <Popover.Header as="h3">Earliest Access Date</Popover.Header>
                          <Popover.Body>
                            <p>
                              This date is the earliest <code>startDate</code> that appears in any{' '}
                              <code>accessRule</code> for the course instance. Course instances are
                              listed in order from newest to oldest according to this date.
                            </p>
                            <p>
                              It is recommended that you define at least one <code>accessRule</code>{' '}
                              that makes the course instance accessible to students only during the
                              semester or other time period in which that particular course instance
                              is offered. You can do so by editing the{' '}
                              <code>infoCourseInstance.json</code> file for the course instance. For
                              more information, see the{' '}
                              <a href="https://prairielearn.readthedocs.io/en/latest/accessControl/">
                                documentation on access control
                              </a>
                              .
                            </p>
                          </Popover.Body>
                        </Popover>
                      }
                    >
                      <button
                        type="button"
                        class="btn btn-xs btn-light"
                        aria-label="Information about Earliest Access Date"
                      >
                        <i class="far fa-question-circle" aria-hidden="true" />
                      </button>
                    </OverlayTrigger>
                  </th>
                  <th id="latest-access-date">
                    Latest Access Date
                    <OverlayTrigger
                      placement="bottom"
                      overlay={
                        <Popover>
                          <Popover.Header as="h3">Latest Access Date</Popover.Header>
                          <Popover.Body>
                            <p>
                              This date is the latest <code>endDate</code> that appears in any{' '}
                              <code>accessRule</code> for the course instance. If two course
                              instances have the same &quot;Earliest Access Date,&quot; then they
                              are listed from newest to oldest according to this &quot;Latest Access
                              Date.&quot;
                            </p>
                            <p>
                              It is recommended that you define at least one <code>accessRule</code>{' '}
                              that makes the course instance accessible to students only during the
                              semester or other time period in which that particular course instance
                              is offered. You can do so by editing the{' '}
                              <code>infoCourseInstance.json</code> file for the course instance. For
                              more information, see the{' '}
                              <a href="https://prairielearn.readthedocs.io/en/latest/accessControl/">
                                documentation on access control
                              </a>
                              .
                            </p>
                          </Popover.Body>
                        </Popover>
                      }
                    >
                      <button
                        type="button"
                        class="btn btn-xs btn-light"
                        aria-label="Information about Latest Access Date"
                      >
                        <i class="far fa-question-circle" aria-hidden="true" />
                      </button>
                    </OverlayTrigger>
                  </th>
                  <th>Students</th>
                </tr>
              </thead>
              <tbody>
                {courseInstances.map((row) => (
                  <tr key={row.courseInstance.id}>
                    <td class="align-left">
                      {row.courseInstance.sync_errors ? (
                        <SyncProblemButton type="error" output={row.courseInstance.sync_errors} />
                      ) : row.courseInstance.sync_warnings ? (
                        <SyncProblemButton
                          type="warning"
                          output={row.courseInstance.sync_warnings}
                        />
                      ) : null}
                      <a
                        href={`/pl/course_instance/${row.courseInstance.id}/instructor/instance_admin`}
                      >
                        {row.courseInstance.long_name}
                      </a>
                    </td>
                    <td class="align-left">{row.courseInstance.short_name}</td>
                    <td class="align-left">{row.formatted_start_date}</td>
                    <td class="align-left">{row.formatted_end_date}</td>
                    <td class="align-middle">{row.enrollment_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            courseExample={courseExample}
            canEditCourse={canEditCourse}
            needToSync={needToSync}
            urlPrefix={urlPrefix}
            onCreateClick={() => setShowCreateModal(true)}
          />
        )}
      </div>
    </>
  );
}
