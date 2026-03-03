import { execute, loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import {
  CourseInstanceAiGradingCredentialSchema,
  CourseInstanceSchema,
  type EnumAiGradingProvider,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

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
  return await queryRow(
    sql.upsert_credential,
    { course_instance_id, provider, encrypted_secret_key, created_by },
    CourseInstanceAiGradingCredentialSchema,
  );
}

export async function deleteCredential({
  credential_id,
  course_instance_id,
}: {
  credential_id: string;
  course_instance_id: string;
}) {
  await execute(sql.delete_credential, { credential_id, course_instance_id });
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
