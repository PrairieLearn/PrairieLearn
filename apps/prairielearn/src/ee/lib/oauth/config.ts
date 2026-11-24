import { config } from '../../../lib/config.js';

/** Where the authorization server is mounted. Its issuer is this path on PrairieLearn's origin. */
export const OAUTH_PATH = '/pl/oauth';
export const MCP_PATH = '/pl/mcp';

/**
 * What a connected agent can be allowed to do, as shown to the user who approves it. These are
 * the scopes of the MCP server's access tokens.
 */
export const OAUTH_SCOPES = {
  'skills:read': "Read PrairieLearn's instructions for writing course content",
} as const;

export type OauthScope = keyof typeof OAUTH_SCOPES;

export const OAUTH_SCOPE_NAMES = Object.keys(OAUTH_SCOPES) as OauthScope[];

function getOrigin() {
  const host = config.serverCanonicalHost ?? `http://localhost:${config.serverPort}`;
  return host.replace(/\/+$/, '');
}

export function getOauthIssuer() {
  return `${getOrigin()}${OAUTH_PATH}`;
}

/** The MCP server's URL. Tokens are issued for this resource (RFC 8707) and accepted nowhere else. */
export function getMcpResource() {
  return `${getOrigin()}${MCP_PATH}`;
}
