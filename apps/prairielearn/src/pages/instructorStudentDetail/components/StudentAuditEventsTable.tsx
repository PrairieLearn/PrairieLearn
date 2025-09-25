import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { type StaffAuditEvent } from '../../../lib/client/safe-db-types.js';
import { type SupportedActionsForTable } from '../../../models/audit-event.js';

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
    invitation_accepted: 'Accepted invitation',
    invitation_rejected: 'Rejected invitation',
    blocked: 'Blocked from course',
    unblocked: 'Unblocked from course, now enrolled',
    invitation_deleted: 'Invitation cancelled', // You can never actually see this state.
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
      <div class="card-body">
        <div class="text-muted">No enrollment events found.</div>
      </div>
    );
  }

  return (
    <table class="table table-sm table-hover" aria-label="Student Audit Events">
      <thead>
        <tr>
          <th>Date</th>
          <th>Event</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id}>
            <td class="align-middle">
              <FriendlyDate date={e.date} />
            </td>
            <td class="align-middle">{renderEnrollmentEventText(e)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
