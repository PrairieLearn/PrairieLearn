import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

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

const CurrentRowDataSchema = z.record(z.string(), z.any());
type CurrentRowData = z.infer<typeof CurrentRowDataSchema>;
/**
 * Fetches the current row for a given table and row ID
 */
async function getCurrentRowData(
  table_name: string,
  row_id: string,
): Promise<CurrentRowData | null> {
  const query = run(() => {
    if (table_name === 'users') {
      return 'SELECT * FROM users WHERE user_id = $row_id';
    }
    return `SELECT * FROM ${table_name} WHERE id = $row_id`;
  });
  return await queryOptionalRow(query, { row_id }, CurrentRowDataSchema);
}

interface InsertAuditEventParams {
  action: EnumAuditEventAction;
  table_name: string;
  row_id: string;
  /** Most events should have an associated authorized user */
  agent_authn_user_id: string | null;
  /** Most events should have an associated authenticated user */
  agent_user_id: string | null;
  /** only 'update' actions require an action_detail */
  action_detail?: string;
  /** Most events have no context */
  context?: Record<string, any>;
  /** Creation events have no old row */
  old_row?: Record<string, any>;
  /** Deletion events have no new row */
  new_row?: Record<string, any>;
  // The remaining fields depend on the action and table

  subject_user_id?: string;
  assessment_id?: string;
  assessment_instance_id?: string;
  assessment_question_id?: string;
  course_id?: string;
  course_instance_id?: string;
  group_id?: string;
  institution_id?: string;
}

// To prevent mistakes where fields are omitted, we track which fields are required for each table.
const requiredTableFields: Record<string, string[]> = {
  course_instances: ['course_instance_id'],
  pl_courses: ['course_id'],
  users: ['subject_user_id'],
  groups: ['group_id'],
  assessment_instances: ['assessment_instance_id'],
  assessment_questions: ['assessment_question_id'],
  assessments: ['assessment_id'],
  institutions: ['institution_id'],
};
/**
 * Inserts a new audit event. This should be done after the action has been performed.
 *
 * @param params Parameters for the audit event
 * @param params.action - The action that was performed
 * @param params.action_detail - e.g. the column name that was updated
 * @param params.agent_authn_user_id - ID of the authorized user performing the action
 * @param params.agent_user_id - ID of the authorized user performing the action
 * @param params.context - Additional context, typically empty
 * @param params.course_id - Inferred from `course_instance_id`, `group_id`, `assessment_id`, `assessment_instance_id`, `assessment_question_id`
 * @param params.course_instance_id - Inferred from `group_id`, `assessment_id`, `assessment_instance_id`, `assessment_question_id`
 * @param params.group_id - ID of the affected group
 * @param params.institution_id - Inferred from `subject_user_id`, `course_id`, `course_instance_id`, `group_id`, `assessment_id`, `assessment_instance_id`, `assessment_question_id`
 * @param params.new_row - The new row data
 * @param params.old_row - The old row data
 * @param params.row_id - primary key ID of the affected row
 * @param params.subject_user_id - ID of the affected user
 * @param params.table_name - The name of the table that was affected
 * @param params.assessment_id - Inferred from `assessment_instance_id`, `assessment_question_id`
 * @param params.assessment_instance_id - ID of the affected assessment instance
 * @param params.assessment_question_id - ID of the affected assessment question
 */
export async function insertAuditEvent(params: InsertAuditEventParams): Promise<StaffAuditEvent> {
  const {
    action,
    action_detail = null,
    agent_authn_user_id,
    agent_user_id,
    assessment_id = null,
    assessment_instance_id = null,
    assessment_question_id = null,
    context = {},
    course_id = null,
    course_instance_id = null,
    group_id = null,
    institution_id = null,
    new_row: given_new_row = null,
    old_row = null,
    row_id,
    subject_user_id = null,
    table_name,
  } = params;
  const new_row = given_new_row ?? (await getCurrentRowData(table_name, row_id));

  // Depending on the action, certain fields are required.
  if ((action === 'update' || action === 'delete') && !old_row) {
    throw new Error('old_row is required for update and delete actions');
  } else if (action === 'insert' && old_row) {
    throw new Error('old_row is not allowed for insert actions');
  }

  if (action === 'insert' && !new_row) {
    throw new Error('new_row is required for insert actions');
  } else if (action === 'delete' && new_row) {
    throw new Error('new_row is not allowed for delete actions');
  }

  if (action === 'update' && !action_detail) {
    throw new Error('action_detail is required for update actions');
  }

  // Depending on the table, certain fields are required.
  if (!requiredTableFields[table_name].every((field) => Boolean(params[field]))) {
    throw new Error(
      `${table_name} requires the following fields: ${requiredTableFields[table_name].join(', ')}`,
    );
  }

  return await queryRow(
    sql.insert_audit_event,
    {
      action,
      action_detail,
      agent_authn_user_id,
      agent_user_id,
      assessment_id,
      assessment_instance_id,
      assessment_question_id,
      context,
      course_id,
      course_instance_id,
      group_id,
      institution_id,
      new_row,
      old_row,
      row_id,
      subject_user_id,
      table_name,
    },
    StaffAuditEventSchema,
  );
}
