import { config } from '../../../lib/config.js';

/** What a connected agent can be allowed to do, as shown to the user who approves it. */
export const OAUTH_SCOPES = {
  'course_data:read': 'Read course data, including student work',
  'course:sync': 'Sync a course from its repository',
} as const;

export type OauthScope = keyof typeof OAUTH_SCOPES;

export const OAUTH_SCOPE_NAMES = Object.keys(OAUTH_SCOPES) as OauthScope[];

export function isOauthScope(scope: string): scope is OauthScope {
  return Object.hasOwn(OAUTH_SCOPES, scope);
}

export const AUTHORIZATION_CODE_LIFETIME_MS = 60 * 1000;
export const ACCESS_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
// A refresh token that goes unused this long expires, so an abandoned connection ends by itself.
export const REFRESH_TOKEN_IDLE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
// However often it is used, a grant ends after this long, so the user signs in through their
// institution again at least once a term.
export const GRANT_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;

export const MCP_PATH = '/pl/mcp';

/** PrairieLearn's own origin, which is the OAuth issuer. */
export function getOauthIssuer() {
  const host = config.serverCanonicalHost ?? `http://localhost:${config.serverPort}`;
  return host.replace(/\/+$/, '');
}

/** The MCP server's URL. Tokens are issued for this resource (RFC 8707) and accepted nowhere else. */
export function getMcpResource() {
  return `${getOauthIssuer()}${MCP_PATH}`;
}

/** RFC 8414 metadata that tells clients where and how to get a token. */
export function getOauthMetadata() {
  const issuer = getOauthIssuer();
  return {
    issuer,
    authorization_endpoint: `${issuer}/pl/oauth/authorize`,
    token_endpoint: `${issuer}/pl/oauth/token`,
    registration_endpoint: `${issuer}/pl/oauth/register`,
    revocation_endpoint: `${issuer}/pl/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: OAUTH_SCOPE_NAMES,
    authorization_response_iss_parameter_supported: true,
  };
}
