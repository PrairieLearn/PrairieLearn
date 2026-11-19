import { runInTransactionAsync } from '@prairielearn/postgres';

import type { OauthClient, OauthGrant } from '../../../lib/db-types.js';
import { insertOauthGrant, revokeOauthGrant } from '../../models/oauth-grant.js';
import {
  type OauthTokenWithGrant,
  insertOauthToken,
  markOauthTokenUsed,
  selectOptionalOauthTokenWithGrant,
} from '../../models/oauth-token.js';

import {
  ACCESS_TOKEN_LIFETIME_MS,
  AUTHORIZATION_CODE_LIFETIME_MS,
  GRANT_LIFETIME_MS,
  type OauthScope,
  REFRESH_TOKEN_IDLE_LIFETIME_MS,
  getMcpResource,
} from './config.js';
import { generateOauthToken, hashOauthToken, verifiesCodeChallenge } from './tokens.js';

/** A failure the OAuth specs give a code for (RFC 6749 section 5.2). */
export class OauthFlowError extends Error {
  constructor(
    readonly code: string,
    description: string,
  ) {
    super(description);
  }
}

function isActive(grant: OauthGrant, now = new Date()) {
  return grant.revoked_at == null && grant.expires_at > now;
}

/**
 * Records the user's approval and returns the authorization code the client exchanges for tokens.
 */
export async function createAuthorizationCode({
  user_id,
  client,
  scopes,
  course_ids,
  redirect_uri,
  code_challenge,
}: {
  user_id: string;
  client: OauthClient;
  scopes: OauthScope[];
  course_ids: string[];
  redirect_uri: string;
  code_challenge: string;
}) {
  const now = Date.now();
  const code = generateOauthToken('code');
  await runInTransactionAsync(async () => {
    const grant = await insertOauthGrant({
      user_id,
      oauth_client_id: client.id,
      scopes,
      resource: getMcpResource(),
      expires_at: new Date(now + GRANT_LIFETIME_MS),
      course_ids,
    });
    await insertOauthToken({
      oauth_grant_id: grant.id,
      type: 'code',
      token_hash: code.token_hash,
      expires_at: new Date(now + AUTHORIZATION_CODE_LIFETIME_MS),
      redirect_uri,
      code_challenge,
    });
  });
  return code.token;
}

async function issueTokens(grant: OauthGrant) {
  const now = Date.now();
  const grantEnd = grant.expires_at.getTime();
  const access = generateOauthToken('access');
  const refresh = generateOauthToken('refresh');
  const accessExpiresAt = Math.min(now + ACCESS_TOKEN_LIFETIME_MS, grantEnd);
  await runInTransactionAsync(async () => {
    await insertOauthToken({
      oauth_grant_id: grant.id,
      type: 'access',
      token_hash: access.token_hash,
      expires_at: new Date(accessExpiresAt),
    });
    await insertOauthToken({
      oauth_grant_id: grant.id,
      type: 'refresh',
      token_hash: refresh.token_hash,
      expires_at: new Date(Math.min(now + REFRESH_TOKEN_IDLE_LIFETIME_MS, grantEnd)),
    });
  });
  return {
    access_token: access.token,
    token_type: 'Bearer',
    expires_in: Math.floor((accessExpiresAt - now) / 1000),
    refresh_token: refresh.token,
    scope: grant.scopes.join(' '),
  };
}

/**
 * Looks up a code or refresh token presented at the token endpoint and uses it up. These work
 * once: a second use means the token was copied, so the whole grant is revoked.
 */
async function redeemSingleUseToken({
  token,
  type,
  client_id,
}: {
  token: string;
  type: 'code' | 'refresh';
  client_id: string;
}): Promise<OauthTokenWithGrant> {
  const row = await selectOptionalOauthTokenWithGrant(hashOauthToken(token));
  if (!row || row.oauth_token.type !== type || row.oauth_client.client_id !== client_id) {
    throw new OauthFlowError('invalid_grant', 'The code or refresh token is not valid.');
  }
  if (!(await markOauthTokenUsed(row.oauth_token))) {
    await revokeOauthGrant(row.oauth_grant);
    throw new OauthFlowError('invalid_grant', 'The code or refresh token was already used.');
  }
  if (row.oauth_token.expires_at <= new Date() || !isActive(row.oauth_grant)) {
    throw new OauthFlowError('invalid_grant', 'The code or refresh token has expired.');
  }
  return row;
}

export async function exchangeAuthorizationCode({
  code,
  client_id,
  redirect_uri,
  code_verifier,
  resource,
}: {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_verifier: string;
  resource?: string;
}) {
  const { oauth_token: token, oauth_grant: grant } = await redeemSingleUseToken({
    token: code,
    type: 'code',
    client_id,
  });
  if (token.redirect_uri !== redirect_uri) {
    throw new OauthFlowError('invalid_grant', 'redirect_uri does not match the request.');
  }
  if (!token.code_challenge || !verifiesCodeChallenge(code_verifier, token.code_challenge)) {
    throw new OauthFlowError('invalid_grant', 'code_verifier does not match the request.');
  }
  if (resource !== undefined && resource !== grant.resource) {
    throw new OauthFlowError('invalid_target', 'resource does not match the request.');
  }
  return await issueTokens(grant);
}

export async function exchangeRefreshToken({
  refresh_token,
  client_id,
}: {
  refresh_token: string;
  client_id: string;
}) {
  const { oauth_grant: grant } = await redeemSingleUseToken({
    token: refresh_token,
    type: 'refresh',
    client_id,
  });
  return await issueTokens(grant);
}

/** The access token's grant and client, or null if the token cannot be used. */
export async function selectActiveAccessToken(token: string): Promise<OauthTokenWithGrant | null> {
  const row = await selectOptionalOauthTokenWithGrant(hashOauthToken(token));
  if (row?.oauth_token.type !== 'access') return null;
  if (row.oauth_token.expires_at <= new Date() || !isActive(row.oauth_grant)) return null;
  return row;
}

/** RFC 7009: revoking any of a grant's tokens ends the whole connection. */
export async function revokeToken(token: string) {
  const row = await selectOptionalOauthTokenWithGrant(hashOauthToken(token));
  if (row) await revokeOauthGrant(row.oauth_grant);
}
