import * as crypto from 'node:crypto';

import Provider, { type Configuration, errors } from 'oidc-provider';

import { html } from '@prairielearn/html';
import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { config } from '../../../lib/config.js';
import { selectOptionalUserById } from '../../../models/user.js';

import { OauthRecordAdapter } from './adapter.js';
import { OAUTH_SCOPE_NAMES, getMcpResource, getOauthIssuer } from './config.js';

// Where the library sends the browser when a user must approve a connection: the page in
// `ee/pages/agentApproval`, which `server.ts` mounts here.
const APPROVAL_PATH = '/pl/agent_approval';

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/**
 * The key the library signs with. Nothing PrairieLearn issues is signed, since access tokens are
 * opaque and no ID tokens are offered, but the library requires a key and would otherwise publish
 * its well-known development one. Deriving it from the secret key gives every server the same one.
 */
function signingKey() {
  const seed = crypto.hkdfSync('sha256', config.secretKey[0], '', 'oauth-signing-key', 32);
  // An Ed25519 private key in PKCS #8 is this fixed header followed by the 32-byte seed.
  const header = Buffer.from('302e020100300506032b657004220420', 'hex');
  return crypto
    .createPrivateKey({
      key: Buffer.concat([header, Buffer.from(seed)]),
      format: 'der',
      type: 'pkcs8',
    })
    .export({ format: 'jwk' });
}

function configuration(): Configuration {
  return {
    adapter: OauthRecordAdapter,
    // Agents register themselves; there are no clients known in advance.
    clients: [],
    clientDefaults: {
      // An agent may return to any port on the user's own computer, which the library allows
      // only for native applications, and may not return to any other address without HTTPS.
      application_type: 'native',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      // No ID tokens are issued, but a client's default must match the signing key's type.
      id_token_signed_response_alg: 'EdDSA',
    },
    clientAuthMethods: ['none', 'client_secret_basic', 'client_secret_post'],
    responseTypes: ['code'],
    // The MCP server's scopes. They are listed here as well as under `resourceIndicators` because
    // an agent may name them when it registers, which the library allows only for scopes it knows
    // as its own.
    scopes: OAUTH_SCOPE_NAMES,
    pkce: { required: () => true },
    // Browser-based agents are not supported yet.
    clientBasedCORS: () => false,
    cookies: { keys: config.secretKey },
    jwks: { keys: [signingKey()] },
    routes: {
      authorization: '/authorize',
      registration: '/register',
      revocation: '/revoke',
      token: '/token',
    },
    ttl: {
      AuthorizationCode: 60,
      AccessToken: HOUR,
      // A refresh token is replaced each time it is used, so this is how long a connection lasts
      // unused. `Grant` is how long it lasts at all: after that, the user approves again.
      RefreshToken: 30 * DAY,
      Grant: 90 * DAY,
      // The library's own session only has to last from the approval page to the redirect back.
      Interaction: 10 * 60,
      Session: 10 * 60,
    },
    // The library's defaults give refresh tokens only for the `offline_access` scope and end
    // tokens with its own session. Connections here outlive that session by design.
    issueRefreshToken: (ctx, client) => client.grantTypeAllowed('refresh_token'),
    expiresWithSession: () => false,
    rotateRefreshToken: true,
    async findAccount(ctx, id) {
      const user = await selectOptionalUserById(id);
      if (!user) return undefined;
      return { accountId: user.id, claims: () => ({ sub: user.id }) };
    },
    interactions: {
      url: (ctx, interaction) => `${APPROVAL_PATH}/${interaction.uid}`,
    },
    // Shown when a request can't be sent back to the agent, such as an unregistered redirect URI.
    renderError(ctx, out) {
      ctx.type = 'html';
      ctx.body = html`
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>PrairieLearn</title>
          </head>
          <body>
            <h1>This connection request can't be completed</h1>
            <p>${out.error_description ?? out.error}</p>
          </body>
        </html>
      `.toString();
    },
    features: {
      devInteractions: { enabled: false },
      dPoP: { enabled: false },
      pushedAuthorizationRequests: { enabled: false },
      userinfo: { enabled: false },
      registration: { enabled: true, issueRegistrationAccessToken: false },
      revocation: { enabled: true },
      resourceIndicators: {
        enabled: true,
        // The MCP server is the only thing a token can be for, so a request need not name it.
        defaultResource: () => getMcpResource(),
        // oxlint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- The library's option name.
        useGrantedResource: () => true,
        getResourceServerInfo(ctx, resource) {
          if (resource !== getMcpResource()) throw new errors.InvalidTarget();
          return { scope: OAUTH_SCOPE_NAMES.join(' '), accessTokenFormat: 'opaque' };
        },
      },
    },
  };
}

let provider: Provider | undefined;

/**
 * PrairieLearn's OAuth authorization server, which issues the tokens the MCP server accepts. The
 * oidc-provider library implements the protocol; PrairieLearn supplies the users, the storage, and
 * the approval page.
 */
export function getOauthProvider() {
  if (!provider) {
    provider = new Provider(getOauthIssuer(), configuration());
    // The request's protocol and host come from the proxy in front of PrairieLearn.
    provider.proxy = Boolean(config.trustProxy);
    provider.on('server_error', (ctx, err) => {
      Sentry.captureException(err);
      logger.error('OAuth server error', err);
    });
  }
  return provider;
}

/**
 * What an access token allows, if it can be used: it and its grant exist and have not expired.
 * Disconnecting deletes both, so this is also what makes a disconnect take effect at once.
 */
export async function findActiveAccessToken(value: string) {
  const { AccessToken, Grant } = getOauthProvider();
  const token = await AccessToken.find(value);
  if (!token?.isValid || typeof token.aud !== 'string' || !token.clientId || !token.exp) {
    return null;
  }
  const grant = await Grant.find(token.grantId);
  if (!grant || grant.isExpired) return null;
  return {
    user_id: token.accountId,
    client_id: token.clientId,
    oauth_grant_id: token.grantId,
    scopes: [...token.scopes],
    // The resource the token was issued for (RFC 8707).
    resource: token.aud,
    /** In seconds since the epoch. */
    expires_at: token.exp,
  };
}
