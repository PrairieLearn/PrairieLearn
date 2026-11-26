import { z } from 'zod';

import { selectOauthGrantsForUser } from '../../models/oauth-record.js';

import { OAUTH_SCOPES, type OauthScope, getMcpResource } from './config.js';

// The parts of the library's grant and client payloads that are shown to the user.
const GrantPayloadSchema = z.object({
  iat: z.number(),
  resources: z.record(z.string(), z.string()).default({}),
});
const ClientPayloadSchema = z.object({ client_name: z.string().optional() });

/** The agents a user has connected, newest first, as their settings page lists them. */
export async function selectAgentConnections(user_id: string) {
  const grants = await selectOauthGrantsForUser(user_id);
  return grants.map(({ oauth_grant, oauth_client }) => {
    const grant = GrantPayloadSchema.parse(oauth_grant.payload);
    const scopes = (grant.resources[getMcpResource()] ?? '').split(' ');
    return {
      id: oauth_grant.id,
      name: ClientPayloadSchema.parse(oauth_client.payload).client_name ?? 'An unnamed app',
      permissions: scopes
        .filter((scope): scope is OauthScope => Object.hasOwn(OAUTH_SCOPES, scope))
        .map((scope) => OAUTH_SCOPES[scope]),
      created_at: new Date(grant.iat * 1000),
      // The adapter sets an expiry on every grant.
      expires_at: oauth_grant.expires_at!,
    };
  });
}
