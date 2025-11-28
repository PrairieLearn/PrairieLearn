import { useState } from 'preact/compat';
import { Button, Popover } from 'react-bootstrap';

import { formatDate } from '@prairielearn/formatter';
import { OverlayTrigger } from '@prairielearn/ui';

import { SyncProblemButton } from '../../components/SyncProblemButton.js';
import type { StaffCourse } from '../../lib/client/safe-db-types.js';

import { CreateCourseInstanceModal } from './components/CreateCourseInstanceModal.js';
import { EmptyState } from './components/EmptyState.js';
import type { InstructorCourseAdminInstanceRow } from './instructorCourseAdminInstances.shared.js';

function renderPopoverStartDate(courseInstanceId: string) {
  // React Bootstrap's OverlayTrigger expects the overlay prop to be JSX (or a render function)
  // so we don't make this a component.
  return (
    <Popover id={`popover-start-date-${courseInstanceId}`}>
      <Popover.Header as="h3">Earliest access date</Popover.Header>
      <Popover.Body>
        <p>
          This date is the earliest <code>startDate</code> that appears in any{' '}
          <code>accessRule</code> for the course instance. Course instances are listed in order from
          newest to oldest according to this date.
        </p>
        <p>
          It is recommended that you define at least one <code>accessRule</code> that makes the
          course instance accessible to students only during the semester or other time period in
          which that particular course instance is offered. You can do so by editing the{' '}
          <code>infoCourseInstance.json</code> file for the course instance. For more information,
          see the{' '}
          <a href="https://prairielearn.readthedocs.io/en/latest/accessControl/">
            documentation on access control
          </a>
          .
        </p>
      </Popover.Body>
    </Popover>
  );
}

function renderPopoverEndDate(courseInstanceId: string) {
  return (
    <Popover id={`popover-end-date-${courseInstanceId}`}>
      <Popover.Header as="h3">Latest Access Date</Popover.Header>
      <Popover.Body>
        <p>
          This date is the latest <code>endDate</code> that appears in any <code>accessRule</code>{' '}
          for the course instance. If two course instances have the same &quot;Earliest Access
          Date,&quot; then they are listed from newest to oldest according to this &quot;Latest
          Access Date.&quot;
        </p>
        <p>
          It is recommended that you define at least one <code>accessRule</code> that makes the
          course instance accessible to students only during the semester or other time period in
          which that particular course instance is offered. You can do so by editing the{' '}
          <code>infoCourseInstance.json</code> file for the course instance. For more information,
          see the{' '}
          <a href="https://prairielearn.readthedocs.io/en/latest/accessControl/">
            documentation on access control
          </a>
          .
        </p>
      </Popover.Body>
    </Popover>
  );
}

export function InstructorCourseAdminInstances({
  courseInstances,
  course,
  canEditCourse,
  needToSync,
  csrfToken,
  urlPrefix,
}: {
  courseInstances: InstructorCourseAdminInstanceRow[];
  course: StaffCourse;
  canEditCourse: boolean;
  needToSync: boolean;
  csrfToken: string;
  urlPrefix: string;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const canCreateInstances = canEditCourse && !course.example_course && !needToSync;

  return (
    <>
      <CreateCourseInstanceModal
        show={showCreateModal}
        course={course}
        csrfToken={csrfToken}
        onHide={() => setShowCreateModal(false)}
      />

      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
          <h1>Course instances</h1>
          {courseInstances.length > 0 && canCreateInstances && (
            <Button
              variant="light"
              size="sm"
              type="button"
              onClick={() => setShowCreateModal(true)}
            >
              <i class="fa fa-plus" aria-hidden="true" />
              <span class="d-none d-sm-inline">Add course instance</span>
            </Button>
          )}
        </div>
        {courseInstances.length > 0 ? (
          <div class="table-responsive">
            <table class="table table-sm table-hover table-striped" aria-label="Course instances">
              <thead>
                <tr>
                  <th>Long Name</th>
                  <th>CIID</th>
                  <th>Start date</th>
                  <th>End date</th>
                  <th>Students</th>
                </tr>
              </thead>
              <tbody>
                {courseInstances.map((row) => {
                  const isLegacyStartDate = row.start_date !== null;
                  const isLegacyEndDate = row.end_date !== null;
                  const startDate = row.publishing_start_date
                    ? `${formatDate(row.publishing_start_date, row.display_timezone)}`
                    : row.start_date
                      ? `${formatDate(row.start_date, row.display_timezone)}`
                      : '—';
                  const endDate = row.publishing_end_date
                    ? `${formatDate(row.publishing_end_date, row.display_timezone)}`
                    : row.end_date
                      ? `${formatDate(row.end_date, row.display_timezone)}`
                      : '—';
                  return (
                    <tr key={row.id}>
                      <td class="align-left">
                        {row.sync_errors ? (
                          <SyncProblemButton type="error" output={row.sync_errors} />
                        ) : row.sync_warnings ? (
                          <SyncProblemButton type="warning" output={row.sync_warnings} />
                        ) : null}
                        <a href={`/pl/course_instance/${row.id}/instructor/instance_admin`}>
                          {row.long_name}
                        </a>
                      </td>
                      <td class="align-left">{row.short_name}</td>
                      <td class="align-left">
                        {startDate}
                        {isLegacyStartDate ? (
                          <OverlayTrigger
                            placement="bottom"
                            trigger="focus"
                            popover={{
                              props: {
                                id: `popover-start-date-${row.id}`,
                              },
                              body: renderPopoverStartDate(row.id),
                            }}
                          >
                            <Button
                              variant="ghost"
                              class="btn-xs"
                              aria-label="Information about start date"
                            >
                              <i class="far fa-question-circle" aria-hidden="true" />
                            </Button>
                          </OverlayTrigger>
                        ) : null}
                      </td>
                      <td class="align-left">
                        {endDate}
                        {isLegacyEndDate ? (
                          <OverlayTrigger
                            placement="bottom"
                            trigger="focus"
                            popover={{
                              props: {
                                id: `popover-end-date-${row.id}`,
                              },
                              body: renderPopoverEndDate(row.id),
                            }}
                          >
                            <Button
                              variant="ghost"
                              class="btn-xs"
                              aria-label="Information about end date"
                            >
                              <i class="far fa-question-circle" aria-hidden="true" />
                            </Button>
                          </OverlayTrigger>
                        ) : null}
                      </td>
                      <td class="align-middle">{row.enrollment_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            courseExample={course.example_course}
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

InstructorCourseAdminInstances.displayName = 'InstructorCourseAdminInstances';
