import {
  execute,
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
  provider: Exclude<EnumAiGradingProvider, 'openai-compatible'>;
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
    const existing = await selectOptionalCredential({ credential_id, course_instance_id });
    if (existing?.provider === 'openai-compatible') {
      await execute(sql.lock_course_instance, { course_instance_id });
    }
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

export function selectOptionalCredential({
  credential_id,
  course_instance_id,
}: {
  credential_id: string;
  course_instance_id: string;
}) {
  return queryOptionalRow(
    sql.select_optional_credential,
    { credential_id, course_instance_id },
    CourseInstanceAiGradingCredentialSchema,
  );
}

export class AiGradingCredentialConflictError extends Error {
  constructor() {
    super('The custom provider configuration changed. Refresh the page and try again.');
    this.name = 'AiGradingCredentialConflictError';
  }
}

export async function replaceCustomCredential({
  course_instance_id,
  expected_credential_id,
  base_url,
  encrypted_secret_key,
  created_by,
}: {
  course_instance_id: string;
  expected_credential_id: string | null;
  base_url: string;
  encrypted_secret_key: string;
  created_by: string;
}) {
  return runInTransactionAsync(async () => {
    // Lock the parent so simultaneous first-time saves also serialize when no credential exists.
    await execute(sql.lock_course_instance, { course_instance_id });
    const existing = await queryOptionalRow(
      sql.select_optional_custom_credential,
      { course_instance_id },
      CourseInstanceAiGradingCredentialSchema,
    );
    if ((existing?.id ?? null) !== expected_credential_id) {
      throw new AiGradingCredentialConflictError();
    }
    if (existing) {
      await deleteCredential({
        credential_id: existing.id,
        course_instance_id,
        authn_user_id: created_by,
      });
    }
    const row = await queryRow(
      sql.insert_custom_credential,
      { course_instance_id, base_url, encrypted_secret_key, created_by },
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
