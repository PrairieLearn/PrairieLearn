import { Temporal } from '@js-temporal/polyfill';
import { useState } from 'preact/compat';
import { Button, OverlayTrigger, Popover } from 'react-bootstrap';

import { formatDate, formatDateYMDHM } from '@prairielearn/formatter';

import { SyncProblemButton } from '../../components/SyncProblemButton.js';
import type { StaffCourse } from '../../lib/client/safe-db-types.js';

import { CreateCourseInstanceModal } from './components/CreateCourseInstanceModal.js';
import { EmptyState } from './components/EmptyState.js';
import type { InstructorCourseAdminInstanceRow } from './instructorCourseAdminInstances.shared.js';

function PopoverStartDate({ courseInstanceId }: { courseInstanceId: string }) {
  return (
    <Popover id={`popover-start-date-${courseInstanceId}`}>
      <Popover.Header as="h3">Earliest Access Date</Popover.Header>
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

function PopoverEndDate({ courseInstanceId }: { courseInstanceId: string }) {
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
  const initialStartDate = Temporal.Now.zonedDateTimeISO(course.display_timezone).with({
    hour: 0,
    minute: 1,
    second: 0,
  });
  const initialStartDateFormatted = formatDateYMDHM(
    new Date(initialStartDate.epochMilliseconds),
    course.display_timezone,
  );

  const initialEndDate = initialStartDate.add({ months: 4 }).with({
    hour: 23,
    minute: 59,
    second: 0,
  });
  const initialEndDateFormatted = formatDateYMDHM(
    new Date(initialEndDate.epochMilliseconds),
    course.display_timezone,
  );
  return (
    <>
      <CreateCourseInstanceModal
        show={showCreateModal}
        courseShortName={course.short_name!}
        csrfToken={csrfToken}
        timezone={course.display_timezone}
        initialStartDateFormatted={initialStartDateFormatted}
        initialEndDateFormatted={initialEndDateFormatted}
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
                  <th id="earliest-access-date">Earliest Access Date</th>
                  <th id="latest-access-date">Latest Access Date</th>
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
                            trigger="click"
                            overlay={<PopoverStartDate courseInstanceId={row.id} />}
                          >
                            <Button
                              variant="light"
                              class="btn-xs"
                              aria-label="Information about Earliest Access Date"
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
                            trigger="click"
                            overlay={<PopoverEndDate courseInstanceId={row.id} />}
                          >
                            <Button
                              variant="light"
                              class="btn-xs"
                              aria-label="Information about Latest Access Date"
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
