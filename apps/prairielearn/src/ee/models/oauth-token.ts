import { z } from 'zod';

import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import {
  OauthClientSchema,
  OauthGrantSchema,
  type OauthToken,
  OauthTokenSchema,
} from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const OauthTokenWithGrantSchema = z.object({
  oauth_token: OauthTokenSchema,
  oauth_grant: OauthGrantSchema,
  oauth_client: OauthClientSchema,
});
export type OauthTokenWithGrant = z.infer<typeof OauthTokenWithGrantSchema>;

export async function insertOauthToken({
  oauth_grant_id,
  type,
  token_hash,
  expires_at,
  redirect_uri = null,
  code_challenge = null,
}: {
  oauth_grant_id: string;
  type: OauthToken['type'];
  token_hash: string;
  expires_at: Date;
  redirect_uri?: string | null;
  code_challenge?: string | null;
}) {
  await execute(sql.insert_oauth_token, {
    oauth_grant_id,
    type,
    token_hash,
    expires_at,
    redirect_uri,
    code_challenge,
  });
}

export async function selectOptionalOauthTokenWithGrant(
  token_hash: string,
): Promise<OauthTokenWithGrant | null> {
  return await queryOptionalRow(
    sql.select_oauth_token_with_grant,
    { token_hash },
    OauthTokenWithGrantSchema,
  );
}

/**
 * Marks a single-use token as used. Returns false if it had already been used, so two requests
 * racing with the same token cannot both succeed.
 */
export async function markOauthTokenUsed(token: OauthToken): Promise<boolean> {
  const updated = await execute(sql.mark_oauth_token_used, { id: token.id });
  return updated === 1;
}
