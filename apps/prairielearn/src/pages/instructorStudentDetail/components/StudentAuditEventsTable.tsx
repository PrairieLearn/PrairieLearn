import { FriendlyDate } from '../../../components/FriendlyDate.js';
import { type StaffAuditEvent } from '../../../lib/client/safe-db-types.js';

interface StudentAuditEventsTableProps {
  events: StaffAuditEvent[];
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
          <th>Action</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id}>
            <td class="align-middle">
              <FriendlyDate date={e.date} />
            </td>
            <td class="align-middle text-capitalize">{e.action}</td>
            <td class="align-middle text-truncate" style="max-width: 480px">
              {e.action_detail ?? '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
