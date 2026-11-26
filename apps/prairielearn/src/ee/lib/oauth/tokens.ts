import * as crypto from 'node:crypto';

import type { OauthToken } from '../../../lib/db-types.js';

const PREFIXES = {
  code: 'pl_mcp_code_',
  access: 'pl_mcp_at_',
  refresh: 'pl_mcp_rt_',
} satisfies Record<OauthToken['type'], string>;

export function hashOauthToken(token: string) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/** A new random token and the hash to store. The token itself is never stored. */
export function generateOauthToken(type: OauthToken['type']) {
  const token = PREFIXES[type] + crypto.randomBytes(32).toString('base64url');
  return { token, token_hash: hashOauthToken(token) };
}

/** PKCE (RFC 7636): the verifier must hash to the challenge sent with the authorization request. */
export function verifiesCodeChallenge(code_verifier: string, code_challenge: string) {
  const expected = Buffer.from(code_challenge);
  const actual = Buffer.from(
    crypto.createHash('sha256').update(code_verifier, 'ascii').digest('base64url'),
  );
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
