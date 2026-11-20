import { type AuthInfo, OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';
import { IdSchema } from '@prairielearn/zod';

import { selectActiveAccessToken } from '../lib/oauth/flow.js';
import { updateOauthGrantLastUsed } from '../models/oauth-grant.js';

/** Who an MCP request acts for and what the user allowed, taken from its access token. */
const McpAuthSchema = z.object({
  user_id: IdSchema,
  oauth_grant_id: IdSchema,
  scopes: z.array(z.string()),
  /** The caller's address, for the exam-mode check. */
  ip: z.string().nullable(),
});
export type McpAuth = z.infer<typeof McpAuthSchema>;

/** Checks an access token for the SDK's bearer middleware, which sends the 401 challenge. */
export async function verifyAccessToken(token: string): Promise<AuthInfo> {
  const row = await selectActiveAccessToken(token);
  if (!row) throw new OAuthError(OAuthErrorCode.InvalidToken, 'The access token is not valid.');

  // Note that the grant was used, but don't make the request wait for it.
  updateOauthGrantLastUsed(row.oauth_grant).catch((err) => {
    Sentry.captureException(err);
    logger.error('Error updating OAuth grant last_used_at', err);
  });

  return {
    token,
    clientId: row.oauth_client.client_id,
    scopes: row.oauth_grant.scopes,
    expiresAt: Math.floor(row.oauth_token.expires_at.getTime() / 1000),
    // The middleware refuses a token whose resource is not this server.
    resource: new URL(row.oauth_grant.resource),
    extra: { user_id: row.oauth_grant.user_id, oauth_grant_id: row.oauth_grant.id },
  };
}

export function mcpAuthFromAuthInfo(authInfo: AuthInfo | undefined): McpAuth {
  return McpAuthSchema.parse({ ...authInfo?.extra, scopes: authInfo?.scopes });
}
