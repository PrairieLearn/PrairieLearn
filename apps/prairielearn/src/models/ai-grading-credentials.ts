import {
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  CourseInstanceAiGradingCredentialSchema,
  CourseInstanceSchema,
  type EnumAiGradingProvider,
} from '../lib/db-types.js';

import { insertAuditEvent } from './audit-event.js';

const sql = loadSqlEquiv(import.meta.url);

/** Returns a copy of the credential row with the encrypted key redacted. */
function redactCredentialRow(row: Record<string, any>): Record<string, any> {
  return { ...row, encrypted_secret_key: '[REDACTED]' };
}

export async function selectCredentials(course_instance_id: string) {
  return await queryRows(
    sql.select_credentials,
    { course_instance_id },
    CourseInstanceAiGradingCredentialSchema,
  );
}

export async function upsertCredential({
  course_instance_id,
  provider,
  encrypted_secret_key,
  created_by,
}: {
  course_instance_id: string;
  provider: EnumAiGradingProvider;
  encrypted_secret_key: string;
  created_by: string;
}) {
  return await runInTransactionAsync(async () => {
    const row = await queryRow(
      sql.upsert_credential,
      { course_instance_id, provider, encrypted_secret_key, created_by },
      CourseInstanceAiGradingCredentialSchema,
    );
    await insertAuditEvent({
      tableName: 'course_instance_ai_grading_credentials',
      action: 'insert',
      rowId: row.id,
      newRow: redactCredentialRow(row),
      courseInstanceId: course_instance_id,
      agentAuthnUserId: created_by,
      agentUserId: created_by,
    });
    return row;
  });
}

export async function deleteCredential({
  credential_id,
  course_instance_id,
  authn_user_id,
}: {
  credential_id: string;
  course_instance_id: string;
  authn_user_id: string;
}) {
  await runInTransactionAsync(async () => {
    const deleted = await queryOptionalRow(
      sql.delete_credential,
      { credential_id, course_instance_id },
      CourseInstanceAiGradingCredentialSchema,
    );
    if (deleted) {
      await insertAuditEvent({
        tableName: 'course_instance_ai_grading_credentials',
        action: 'delete',
        rowId: deleted.id,
        oldRow: redactCredentialRow(deleted),
        courseInstanceId: course_instance_id,
        agentAuthnUserId: authn_user_id,
        agentUserId: authn_user_id,
      });
    }
  });
}

export async function updateUseCustomApiKeys({
  course_instance_id,
  ai_grading_use_custom_api_keys,
}: {
  course_instance_id: string;
  ai_grading_use_custom_api_keys: boolean;
}) {
  return await queryRow(
    sql.update_use_custom_api_keys,
    { course_instance_id, ai_grading_use_custom_api_keys },
    CourseInstanceSchema,
  );
}
