import { type AuthInfo, OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { features } from '../../lib/features/index.js';
import { selectOptionalUserById } from '../../models/user.js';
import { findActiveAccessToken } from '../lib/oauth/provider.js';

/** Who an MCP request acts for, and through which connection, taken from its access token. */
const McpAuthSchema = z.object({
  user_id: IdSchema,
  oauth_grant_id: z.string(),
});
export type McpAuth = z.infer<typeof McpAuthSchema>;

/** Checks an access token for the SDK's bearer middleware, which sends the 401 challenge. */
export async function verifyAccessToken(token: string): Promise<AuthInfo> {
  const invalid = new OAuthError(OAuthErrorCode.InvalidToken, 'The access token is not valid.');
  const active = await findActiveAccessToken(token);
  if (!active) throw invalid;
  const user = await selectOptionalUserById(active.user_id);
  if (!user) throw invalid;
  // Turning the feature off ends existing connections, not only new ones.
  const enabled = await features.enabled('mcp-server', {
    institution_id: user.institution_id,
    user_id: user.id,
  });
  if (!enabled) throw invalid;

  return {
    token,
    clientId: active.client_id,
    scopes: active.scopes,
    expiresAt: active.expires_at,
    // The middleware refuses a token whose resource is not this server.
    resource: new URL(active.resource),
    extra: { user_id: active.user_id, oauth_grant_id: active.oauth_grant_id },
  };
}

export function mcpAuthFromAuthInfo(authInfo: AuthInfo | undefined): McpAuth {
  return McpAuthSchema.parse(authInfo?.extra);
}
