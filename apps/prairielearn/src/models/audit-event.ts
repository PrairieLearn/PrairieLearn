import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { type StaffAuditEvent, StaffAuditEventSchema } from '../lib/client/safe-db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Selects audit events by subject user ID, table names, and course instance ID.
 * Exactly one of `table_name` or `table_names` must be provided.
 * @param params
 * @param params.subject_user_id - The ID of the subject user.
 * @param params.table_name - The name of the table to select audit events from.
 * @param params.table_names - The names of the tables to select audit events from.
 * @param params.course_instance_id - The ID of the course instance.
 */
export async function selectAuditEvents({
  subject_user_id,
  table_name,
  table_names,
  course_instance_id,
}: {
  subject_user_id: string;
  table_name?: string;
  table_names?: string[];
  course_instance_id: string;
}): Promise<StaffAuditEvent[]> {
  if (table_name && table_names) {
    throw new Error('table_name and table_names cannot both be provided');
  }
  if (!table_name && !table_names) {
    throw new Error('table_name or table_names must be provided');
  }

  const table_names_for_query = table_name ? [table_name] : table_names;
  return await queryRows(
    sql.select_audit_events_by_subject_user_id_table_names_course_instance_id,
    { subject_user_id, table_names: table_names_for_query, course_instance_id },
    StaffAuditEventSchema,
  );
}
