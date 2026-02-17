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

function renderLabelEventText(event: StaffAuditEvent): string {
  const { action_detail, context } = event;
  const labelName = (context as Record<string, unknown> | null)?.label_name ?? 'Unknown label';

  if (!action_detail) {
    return 'Label event';
  }

  const detailMap: Record<SupportedActionsForTable<'student_label_enrollments'>, string> = {
    enrollment_added: `Added to label "${labelName}"`,
    enrollment_removed: `Removed from label "${labelName}"`,
  };

  const detail = detailMap[action_detail as SupportedActionsForTable<'student_label_enrollments'>];
  if (!detail) {
    throw new Error(`Unknown action detail: ${action_detail}`);
  }
  return detail;
}

export function StudentEnrollmentAuditEventsTable({ events }: StudentAuditEventsTableProps) {
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
      <table className="table table-sm table-hover" aria-label="Student enrollment audit events">
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

export function StudentLabelAuditEventsTable({ events }: StudentAuditEventsTableProps) {
  if (events.length === 0) {
    return (
      <>
        <div className="card-body">
          <div className="text-muted">No label events found.</div>
        </div>
        <div className="card-footer text-muted small">
          Missing events? Label events were not logged before February 2026.
        </div>
      </>
    );
  }

  return (
    <>
      <table className="table table-sm table-hover" aria-label="Student label audit events">
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
              <td className="align-middle">{renderLabelEventText(e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="card-footer text-muted small">
        Missing events? Label events were not logged before February 2026.
      </div>
    </>
  );
}
