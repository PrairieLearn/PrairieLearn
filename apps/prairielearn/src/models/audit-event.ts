import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { type StaffAuditEvent, StaffAuditEventSchema } from '../lib/client/safe-db-types.js';
import { type EnumAuditEventAction } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Selects audit events by subject user ID, table names, and course instance ID.
 * Exactly one of `subject_user_id` or `agent_authn_user_id` must be provided.
 *
 * @param params
 * @param params.table_names - The names of the tables to select audit events from.
 * @param params.course_instance_id - The ID of the course instance.
 * @param params.agent_authn_user_id - The ID of the agent user.
 * @param params.subject_user_id - The ID of the subject user.
 */
export async function selectAuditEvents({
  course_instance_id,
  subject_user_id,
  table_names,
  agent_authn_user_id,
}: {
  agent_authn_user_id?: string;
  course_instance_id: string;
  subject_user_id?: string;
  table_names: string[];
}): Promise<StaffAuditEvent[]> {
  if (!subject_user_id && !agent_authn_user_id) {
    throw new Error('subject_user_id or agent_authn_user_id must be provided');
  }
  if (subject_user_id && agent_authn_user_id) {
    throw new Error('subject_user_id and agent_authn_user_id cannot both be provided');
  }

  if (subject_user_id) {
    return await queryRows(
      sql.select_audit_events_by_subject_user_id_table_names_course_instance_id,
      { course_instance_id, subject_user_id, table_names },
      StaffAuditEventSchema,
    );
  }

  return await queryRows(
    sql.select_audit_events_by_agent_authn_user_id_table_names_course_instance_id,
    { agent_authn_user_id, course_instance_id, table_names },
    StaffAuditEventSchema,
  );
}

/**
 * Inserts a new audit event. The required parameters are:
 * - action
 * - table_name
 * - row_id
 * - agent_authn_user_id (nullable)
 * - subject_user_id (nullable)
 *
 * @param params
 * @param params.action
 * @param params.action_detail - Detail about the action
 * @param params.agent_authn_user_id - ID of the authenticated user performing the action
 * @param params.agent_user_id - ID of the user performing the action
 * @param params.context - Additional context about the action
 * @param params.course_id
 * @param params.course_instance_id
 * @param params.group_id
 * @param params.institution_id
 * @param params.new_row
 * @param params.old_row
 * @param params.row_id - ID of the affected row
 * @param params.subject_user_id - ID of the affected user (often the user who performed the action)
 * @param params.table_name
 * @param params.assessment_id
 * @param params.assessment_instance_id
 * @param params.assessment_question_id
 */
export async function insertAuditEvent({
  action,
  action_detail,
  agent_authn_user_id,
  agent_user_id,
  assessment_id,
  assessment_instance_id,
  assessment_question_id,
  context = {},
  course_id,
  course_instance_id,
  group_id,
  institution_id,
  new_row,
  old_row,
  row_id,
  subject_user_id,
  table_name,
}: {
  action: EnumAuditEventAction;
  action_detail?: string | null;
  table_name: string;
  row_id: string;
  course_instance_id?: string | null;
  subject_user_id: string | null;
  context?: Record<string, any>;
  old_row?: Record<string, any> | null;
  new_row?: Record<string, any> | null;
  agent_authn_user_id: string | null;
  agent_user_id?: string | null;
  institution_id?: string | null;
  course_id?: string | null;
  assessment_id?: string;
  assessment_instance_id?: string | null;
  assessment_question_id?: string | null;
  group_id?: string | null;
}): Promise<StaffAuditEvent> {
  return await queryRow(
    sql.insert_audit_event,
    {
      action,
      action_detail: action_detail ?? null,
      agent_authn_user_id,
      agent_user_id: agent_user_id ?? null,
      assessment_id: assessment_id ?? null,
      assessment_instance_id: assessment_instance_id ?? null,
      assessment_question_id: assessment_question_id ?? null,
      context,
      course_id: course_id ?? null,
      course_instance_id: course_instance_id ?? null,
      group_id: group_id ?? null,
      institution_id: institution_id ?? null,
      new_row: new_row ?? null,
      old_row: old_row ?? null,
      row_id,
      subject_user_id,
      table_name,
    },
    StaffAuditEventSchema,
  );
}
