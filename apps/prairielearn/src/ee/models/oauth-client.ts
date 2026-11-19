import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { type OauthClient, OauthClientSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function insertOauthClient({
  client_name,
  redirect_uris,
}: {
  client_name: string;
  redirect_uris: string[];
}): Promise<OauthClient> {
  return await queryRow(sql.insert_oauth_client, { client_name, redirect_uris }, OauthClientSchema);
}

/** `client_id` comes from a request, so anything that is not a UUID matches no client. */
export async function selectOptionalOauthClientByClientId(
  client_id: unknown,
): Promise<OauthClient | null> {
  const parsed = z.uuid().safeParse(client_id);
  if (!parsed.success) return null;
  return await queryOptionalRow(
    sql.select_oauth_client_by_client_id,
    { client_id: parsed.data },
    OauthClientSchema,
  );
}
