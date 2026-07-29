import * as crypto from 'node:crypto';

import * as jose from 'jose';

import { type KeyRing, getKeyRing } from './key-ring.js';

/**
 * Verifies an HMAC JWT against every key in an ordered key ring.
 *
 * All keys are attempted even if one succeeds, so verification time does not
 * reveal the position of the matching key. If a matching key exposes a claim
 * error such as expiration, that error is preferred over signature failures.
 */
export async function jwtVerifyWithKeyRing(
  jwt: string | Uint8Array,
  keyRing: KeyRing,
  options?: jose.JWTVerifyOptions,
) {
  const results = await Promise.allSettled(
    getKeyRing(keyRing).map((key) =>
      jose.jwtVerify(jwt, crypto.createSecretKey(key, 'utf-8'), options),
    ),
  );
  const successfulResult = results.find((result) => result.status === 'fulfilled');
  if (successfulResult) {
    return successfulResult.value;
  }

  const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
  const claimOrFormatError = errors.find(
    (err) => !(err instanceof jose.errors.JWSSignatureVerificationFailed),
  );
  throw claimOrFormatError ?? errors[0];
}
