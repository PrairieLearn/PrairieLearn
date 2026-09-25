import {
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { CourseInstanceAiGradingCustomEndpointSchema } from '../lib/db-types.js';

import { insertAuditEvent } from './audit-event.js';

const sql = loadSqlEquiv(import.meta.url);

function redactEndpointRow(row: Record<string, any>): Record<string, any> {
  return { ...row, encrypted_secret_key: '[REDACTED]' };
}

export async function selectCustomEndpoints(course_instance_id: string) {
  return await queryRows(
    sql.select_custom_endpoints,
    { course_instance_id },
    CourseInstanceAiGradingCustomEndpointSchema,
  );
}

export async function selectCustomEndpoint({
  endpoint_id,
  course_instance_id,
}: {
  endpoint_id: string;
  course_instance_id: string;
}) {
  return await queryOptionalRow(
    sql.select_custom_endpoint,
    { endpoint_id, course_instance_id },
    CourseInstanceAiGradingCustomEndpointSchema,
  );
}

export async function insertCustomEndpoint({
  course_instance_id,
  name,
  base_url,
  encrypted_secret_key,
  created_by,
}: {
  course_instance_id: string;
  name: string;
  base_url: string;
  encrypted_secret_key: string;
  created_by: string;
}) {
  return await runInTransactionAsync(async () => {
    const row = await queryRow(
      sql.insert_custom_endpoint,
      { course_instance_id, name, base_url, encrypted_secret_key, created_by },
      CourseInstanceAiGradingCustomEndpointSchema,
    );
    await insertAuditEvent({
      tableName: 'course_instance_ai_grading_custom_endpoints',
      action: 'insert',
      rowId: row.id,
      newRow: redactEndpointRow(row),
      courseInstanceId: course_instance_id,
      agentAuthnUserId: created_by,
      agentUserId: created_by,
    });
    return row;
  });
}

export async function deleteCustomEndpoint({
  endpoint_id,
  course_instance_id,
  authn_user_id,
}: {
  endpoint_id: string;
  course_instance_id: string;
  authn_user_id: string;
}) {
  await runInTransactionAsync(async () => {
    const deleted = await queryOptionalRow(
      sql.delete_custom_endpoint,
      { endpoint_id, course_instance_id },
      CourseInstanceAiGradingCustomEndpointSchema,
    );
    if (deleted) {
      await insertAuditEvent({
        tableName: 'course_instance_ai_grading_custom_endpoints',
        action: 'delete',
        rowId: deleted.id,
        oldRow: redactEndpointRow(deleted),
        courseInstanceId: course_instance_id,
        agentAuthnUserId: authn_user_id,
        agentUserId: authn_user_id,
      });
    }
  });
}
