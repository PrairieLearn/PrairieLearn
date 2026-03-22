import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { type AuditEvent, AuditEventSchema, type EnumAuditEventAction } from '../lib/db-types.js';

import { type SupportedTableActionCombination, requiredTableFields } from './audit-event.types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAuditEventsByEnrollmentId({
  enrollment_id,
  table_names,
}: {
  enrollment_id: string;
  table_names: (keyof typeof requiredTableFields)[];
}): Promise<AuditEvent[]> {
  return await queryRows(
    sql.select_audit_events_by_enrollment_id_table_names,
    { enrollment_id, table_names },
    AuditEventSchema,
  );
}

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
  table_names: (keyof typeof requiredTableFields)[];
}): Promise<AuditEvent[]> {
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
      AuditEventSchema,
    );
  }

  return await queryRows(
    sql.select_audit_events_by_agent_authn_user_id_table_names_course_instance_id,
    { agent_authn_user_id, course_instance_id, table_names },
    AuditEventSchema,
  );
}

type InsertAuditEventParams = SupportedTableActionCombination & {
  action: EnumAuditEventAction;
  rowId: string;
  /** Most events should have an associated authenticated user */
  agentAuthnUserId: string | null;
  /** Most events should have an associated authorized user */
  agentUserId: string | null;
  /** Most events have no context */
  context?: Record<string, any> | null;
  /** Creation events have no old row */
  oldRow?: Record<string, any> | null;
  /** Deletion events have no new row */
  newRow?: Record<string, any> | null;

  // The remaining fields depend on the action and table

  subjectUserId?: string | null;
  assessmentId?: string | null;
  assessmentInstanceId?: string | null;
  assessmentQuestionId?: string | null;
  courseId?: string | null;
  courseInstanceId?: string | null;
  enrollmentId?: string | null;
  groupId?: string | null;
  institutionId?: string | null;
};

/**
 * Inserts a new audit event. This should be done after the action has been performed.
 *
 * @param params Parameters for the audit event
 * @param params.action - The action that was performed
 * @param params.actionDetail - e.g. the column name that was updated
 * @param params.agentAuthnUserId - ID of the authenticated user performing the action
 * @param params.agentUserId - ID of the authorized user performing the action
 * @param params.context - Additional context, typically empty
 * @param params.courseId - Inferred from `course_instance_id`, `group_id`, `assessment_id`, `assessment_instance_id`, `assessment_question_id`
 * @param params.courseInstanceId - Inferred from `group_id`, `assessment_id`, `assessment_instance_id`, `assessment_question_id`
 * @param params.groupId - ID of the affected group
 * @param params.enrollmentId - ID of the affected enrollment
 * @param params.institutionId - Inferred from `subject_user_id`, `course_id`, `course_instance_id`, `group_id`, `assessment_id`, `assessment_instance_id`, `assessment_question_id`
 * @param params.newRow - The new row data
 * @param params.oldRow - The old row data
 * @param params.rowId - primary key ID of the affected row
 * @param params.subjectUserId - ID of the affected user
 * @param params.tableName - The name of the table that was affected
 * @param params.assessment_id - Inferred from `assessment_instance_id`, `assessment_question_id`
 * @param params.assessmentInstanceId - ID of the affected assessment instance
 * @param params.assessmentQuestionId - ID of the affected assessment question
 */
export async function insertAuditEvent(params: InsertAuditEventParams): Promise<AuditEvent> {
  const {
    action,
    actionDetail: action_detail,
    agentAuthnUserId: agent_authn_user_id,
    agentUserId: agent_user_id,
    assessmentId: assessment_id,
    assessmentInstanceId: assessment_instance_id,
    assessmentQuestionId: assessment_question_id,
    context = {},
    courseId: course_id,
    courseInstanceId: course_instance_id,
    enrollmentId: enrollment_id,
    groupId: group_id,
    institutionId: institution_id,
    newRow: new_row = null,
    oldRow: old_row = null,
    rowId: row_id,
    subjectUserId: subject_user_id,
    tableName: table_name,
  } = params;

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
  if (!(table_name in requiredTableFields)) {
    throw new Error(`${table_name} must mark its required fields in requiredTableFields`);
  }

  // As a fallback, try to infer IDs from the new row.
  const {
    assessment_id: inferred_assessment_id,
    assessment_instance_id: inferred_assessment_instance_id,
    assessment_question_id: inferred_assessment_question_id,
    course_id: inferred_course_id,
    course_instance_id: inferred_course_instance_id,
    enrollment_id: inferred_enrollment_id,
    team_id: inferred_team_id,
    institution_id: inferred_institution_id,
    user_id: inferred_subject_user_id,
  } = new_row ?? {};

  const resolvedParams = {
    action,
    action_detail,
    agent_authn_user_id,
    agent_user_id,
    assessment_id:
      assessment_id !== undefined
        ? assessment_id
        : ((table_name === 'assessments' ? row_id : null) ?? inferred_assessment_id),
    assessment_instance_id:
      assessment_instance_id !== undefined
        ? assessment_instance_id
        : ((table_name === 'assessment_instances' ? row_id : null) ??
          inferred_assessment_instance_id),
    assessment_question_id:
      assessment_question_id !== undefined
        ? assessment_question_id
        : ((table_name === 'assessment_questions' ? row_id : null) ??
          inferred_assessment_question_id),
    context,
    course_id:
      course_id !== undefined
        ? course_id
        : ((table_name === 'courses' ? row_id : null) ?? inferred_course_id),
    course_instance_id:
      course_instance_id !== undefined
        ? course_instance_id
        : ((table_name === 'course_instances' ? row_id : null) ?? inferred_course_instance_id),
    enrollment_id:
      enrollment_id !== undefined
        ? enrollment_id
        : ((table_name === 'enrollments' ? row_id : null) ?? inferred_enrollment_id),
    team_id:
      group_id !== undefined
        ? group_id
        : ((table_name === 'teams' ? row_id : null) ?? inferred_team_id),
    institution_id:
      institution_id !== undefined
        ? institution_id
        : ((table_name === 'institutions' ? row_id : null) ?? inferred_institution_id),
    new_row,
    old_row,
    row_id,
    subject_user_id:
      subject_user_id !== undefined
        ? subject_user_id
        : ((table_name === 'users' ? row_id : null) ?? inferred_subject_user_id),
    table_name,
  };

  const missingFields = requiredTableFields[table_name].filter(
    (field) => resolvedParams[field] !== null && !resolvedParams[field],
  );
  if (missingFields.length > 0) {
    throw new Error(
      `${table_name} requires the following fields: ${requiredTableFields[table_name].join(', ')}. It is missing the following fields: ${missingFields.join(', ')}`,
    );
  }

  return await queryRow(sql.insert_audit_event, resolvedParams, AuditEventSchema);
}
