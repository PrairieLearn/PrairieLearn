import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { type StaffAuditEvent } from '../../../lib/client/safe-db-types.js';
import { type SupportedActionsForTable } from '../../../models/audit-event.types.js';

interface StudentAuditEventsTableProps {
  events: StaffAuditEvent[];
}

function renderEnrollmentEventText(event: StaffAuditEvent): string {
  const { action_detail } = event;

  if (!action_detail) {
    return 'Enrollment event';
  }

  const detailMap: Record<SupportedActionsForTable<'enrollments'>, string> = {
    implicit_joined: 'Enrolled in course',
    explicit_joined: 'Enrolled in course',
    invited: 'Invited to course',
    invited_by_manual_sync: 'Invited to course (manual student list sync)',
    invitation_accepted: 'Accepted invitation',
    invitation_rejected: 'Rejected invitation',
    blocked: 'Blocked from course',
    unblocked: 'Reenrolled in course (unblocked)',
    unblocked_by_manual_sync: 'Unblocked (manual student list sync)',
    left: 'Student left course',
    removed: 'Removed from course by instructor',
    removed_by_manual_sync: 'Removed from course (manual student list sync)',
    reenrolled_by_manual_sync: 'Reenrolled (manual student list sync)',
    reenrolled_by_instructor: 'Reenrolled in course by instructor',

    // You can never actually see these states since canceling an invitation
    // hard-deletes the enrollment.
    invitation_deleted: 'Invitation cancelled',
    invitation_deleted_by_manual_sync: 'Invitation cancelled (manual student list sync)',
  };

  const detail = detailMap[action_detail as SupportedActionsForTable<'enrollments'>];
  if (!detail) {
    throw new Error(`Unknown action detail: ${action_detail}`);
  }
  return detail;
}

export function StudentAuditEventsTable({ events }: StudentAuditEventsTableProps) {
  if (events.length === 0) {
    return (
      <>
        <div className="card-body">
          <div className="text-muted">No enrollment events found.</div>
        </div>
        <div className="card-footer text-muted small">
          Missing events? Enrollment events were not logged before October 2025.
        </div>
      </>
    );
  }

  return (
    <>
      <table className="table table-sm table-hover" aria-label="Student Audit Events">
        <thead>
          <tr>
            <th>Date</th>
            <th>Event</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td className="align-middle">
                <FriendlyDate date={e.date} />
              </td>
              <td className="align-middle">{renderEnrollmentEventText(e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="card-footer text-muted small">
        Missing events? Enrollment events were not logged before October 2025.
      </div>
    </>
  );
}
