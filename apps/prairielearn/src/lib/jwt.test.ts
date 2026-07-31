import * as crypto from 'node:crypto';

import * as jose from 'jose';
import { assert, describe, expect, it } from 'vitest';

import { jwtVerifyWithKeyRing } from './jwt.js';

const ACTIVE_KEY = 'active-key';
const OLD_KEY = 'old-key';

async function signJwt(key: string, expirationTime = '1m') {
  return await new jose.SignJWT({ user_id: '1' })
    .setProtectedHeader({ alg: 'HS512' })
    .setIssuedAt()
    .setExpirationTime(expirationTime)
    .sign(crypto.createSecretKey(key, 'utf-8'));
}

describe('jwtVerifyWithKeyRing', () => {
  it('verifies a JWT with a fallback key', async () => {
    const jwt = await signJwt(OLD_KEY);

    const result = await jwtVerifyWithKeyRing(jwt, [ACTIVE_KEY, OLD_KEY]);

    assert.equal(result.payload.user_id, '1');
  });

  it('fails when no key matches', async () => {
    const jwt = await signJwt(OLD_KEY);

    await expect(jwtVerifyWithKeyRing(jwt, [ACTIVE_KEY, 'another-key'])).rejects.toThrow(
      jose.errors.JWSSignatureVerificationFailed,
    );
  });

  it('preserves claim errors from the matching fallback key', async () => {
    const jwt = await signJwt(OLD_KEY, '0s');

    await expect(jwtVerifyWithKeyRing(jwt, [ACTIVE_KEY, OLD_KEY])).rejects.toThrow(
      jose.errors.JWTExpired,
    );
  });
});
