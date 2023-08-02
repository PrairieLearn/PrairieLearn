import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { AuditLog, AuditLogSchema } from '../lib/db-types';

const sql = loadSqlEquiv(__filename);

type BaseNewAuditLog = Omit<AuditLog, 'id' | 'date'>;
type RequiredNewAuditLog = Required<Pick<BaseNewAuditLog, 'action' | 'table_name'>>;
type NewAuditLog = RequiredNewAuditLog & Partial<Omit<BaseNewAuditLog, keyof RequiredNewAuditLog>>;

export async function insertAuditLog(auditLog: NewAuditLog): Promise<AuditLog> {
  return await queryRow(
    sql.insert_audit_log,
    {
      action: auditLog.action,
      authn_user_id: auditLog.authn_user_id ?? null,
      column_name: auditLog.column_name ?? null,
      course_id: auditLog.course_id ?? null,
      course_instance_id: auditLog.course_instance_id ?? null,
      group_id: auditLog.group_id ?? null,
      institution_id: auditLog.institution_id ?? null,
      new_state: auditLog.new_state ?? null,
      old_state: auditLog.old_state ?? null,
      parameters: auditLog.parameters ?? null,
      row_id: auditLog.row_id ?? null,
      table_name: auditLog.table_name,
      user_id: auditLog.user_id ?? null,
    },
    AuditLogSchema,
  );
}
