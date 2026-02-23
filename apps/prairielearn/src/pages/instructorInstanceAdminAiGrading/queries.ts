import { formatDateYMD } from '@prairielearn/formatter';
import { execute, loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import {
  CourseInstanceAiGradingCredentialSchema,
  CourseInstanceSchema,
  type EnumAiGradingProvider,
} from '../../lib/db-types.js';
import { decryptFromStorage } from '../../lib/storage-crypt.js';

export interface AiGradingApiKeyCredential {
  id: string;
  provider: EnumAiGradingProvider;
  apiKeyMasked: string;
  dateAdded: string;
}

const sql = loadSqlEquiv(import.meta.url);

/** Masks an API key for display, showing only the first 3 and last 4 characters. */
export function maskApiKey(key: string): string {
  if (key.length <= 7) return '.'.repeat(7);
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

/** Decrypts and formats a stored credential row for client-side display. */
export function formatCredential(
  cred: {
    id: string;
    provider: string;
    encrypted_secret_key: string;
    created_at: Date;
  },
  displayTimezone: string,
): AiGradingApiKeyCredential {
  const decrypted = decryptFromStorage(cred.encrypted_secret_key);
  return {
    id: cred.id,
    provider: cred.provider as EnumAiGradingProvider,
    apiKeyMasked: maskApiKey(decrypted),
    dateAdded: formatDateYMD(cred.created_at, displayTimezone),
  };
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
}: {
  course_instance_id: string;
  provider: EnumAiGradingProvider;
  encrypted_secret_key: string;
}) {
  return await queryRow(
    sql.upsert_credential,
    { course_instance_id, provider, encrypted_secret_key },
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
