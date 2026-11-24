import { z } from 'zod';

import { execute, loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';

import { type OauthRecord, OauthRecordSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function upsertOauthRecord(
  record: Pick<
    OauthRecord,
    'model' | 'id' | 'payload' | 'grant_id' | 'uid' | 'user_id' | 'expires_at'
  >,
) {
  await execute(sql.upsert_oauth_record, { ...record, payload: JSON.stringify(record.payload) });
}

/** A record that has not expired. */
export async function selectOptionalOauthRecord({
  model,
  id,
}: {
  model: string;
  id: string;
}): Promise<OauthRecord | null> {
  return await queryOptionalRow(sql.select_oauth_record, { model, id }, OauthRecordSchema);
}

export async function selectOptionalOauthRecordByUid({
  model,
  uid,
}: {
  model: string;
  uid: string;
}): Promise<OauthRecord | null> {
  return await queryOptionalRow(sql.select_oauth_record_by_uid, { model, uid }, OauthRecordSchema);
}

/** Marks a record used. Returns false if it was already used, or is gone. */
export async function consumeOauthRecord({ model, id }: { model: string; id: string }) {
  return (await execute(sql.consume_oauth_record, { model, id })) === 1;
}

export async function deleteOauthRecord({ model, id }: { model: string; id: string }) {
  await execute(sql.delete_oauth_record, { model, id });
}

/** Deletes the codes and tokens issued for a grant. The grant itself is a separate record. */
export async function deleteOauthRecordsByGrantId(grant_id: string) {
  await execute(sql.delete_oauth_records_by_grant_id, { grant_id });
}

const OauthGrantWithClientSchema = z.object({
  oauth_grant: OauthRecordSchema,
  oauth_client: OauthRecordSchema,
});

/** The user's grants that have not expired, newest first, each with the client it was given to. */
export async function selectOauthGrantsForUser(user_id: string) {
  return await queryRows(sql.select_oauth_grants_for_user, { user_id }, OauthGrantWithClientSchema);
}

/**
 * Deletes one of the user's grants and everything issued for it, which ends that connection at
 * once. Returns false if the user has no such grant.
 */
export async function deleteOauthGrantForUser({ id, user_id }: { id: string; user_id: string }) {
  return (await execute(sql.delete_oauth_grant_for_user, { id, user_id })) === 1;
}
