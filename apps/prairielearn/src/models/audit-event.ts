import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { type StaffAuditEvent, StaffAuditEventSchema } from '../lib/client/safe-db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAuditEvents({
  subject_user_id,
  table_name,
  course_instance_id,
}: {
  subject_user_id: string;
  table_name?: string;
  course_instance_id: string;
}): Promise<StaffAuditEvent[]> {
  if (!table_name) {
    return await queryRows(
      sql.select_audit_events_by_subject_user_id_course_instance_id,
      { subject_user_id, course_instance_id },
      StaffAuditEventSchema,
    );
  }

  return await queryRows(
    sql.select_audit_events_by_subject_user_id_table_name_course_instance_id,
    { subject_user_id, table_name, course_instance_id },
    StaffAuditEventSchema,
  );
}
