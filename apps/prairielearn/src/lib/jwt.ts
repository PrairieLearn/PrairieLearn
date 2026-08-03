import * as crypto from 'node:crypto';

import * as jose from 'jose';

import type { KeyRing } from './key-ring.js';

/**
 * Verifies an HMAC JWT against an ordered key ring.
 *
 * Keys are attempted in order until one succeeds. If none succeed, a claim or
 * format error such as expiration is preferred over signature failures.
 */
export async function jwtVerifyWithKeyRing(
  jwt: string | Uint8Array,
  keyRing: KeyRing,
  options?: jose.JWTVerifyOptions,
) {
  let lastError: unknown;
  let claimOrFormatError: unknown;
  for (const key of keyRing) {
    try {
      return await jose.jwtVerify(jwt, crypto.createSecretKey(key, 'utf-8'), options);
    } catch (error) {
      lastError = error;
      // A token signed by a fallback key can fail signature checks for earlier keys, then
      // expose a more useful claim error once its signing key is reached.
      if (!(error instanceof jose.errors.JWSSignatureVerificationFailed)) {
        claimOrFormatError ??= error;
      }
    }
  }
  throw claimOrFormatError ?? lastError;
}
