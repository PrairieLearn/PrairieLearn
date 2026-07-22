import * as crypto from 'node:crypto';

import * as jose from 'jose';

import { config } from '../../lib/config.js';

/**
 * Short-lived JWTs used to authenticate PrairieLearn's server-to-server
 * callbacks to PrairieTest (`/pt/lockdown-browser/end-exam` and
 * `/pt/cheating-report`). Signed with the same `prairieTestSharedAuthSecret`
 * PT uses for the reverse direction.
 *
 * Tokens are minted on submit, immediately before PL calls PT, so the
 * short lifetime primarily bounds the replay window if one is exposed.
 */
const PRAIRIE_TEST_JWT_LIFETIME = '5m';

interface PrairieTestJwtPayload extends jose.JWTPayload {
  user_id: string;
  reservation_id: string;
  /** The report text, for the cheating-report callback only. */
  report?: string;
}

export async function signPrairieTestJwt(payload: PrairieTestJwtPayload): Promise<string> {
  const key = crypto.createSecretKey(config.prairieTestSharedAuthSecret, 'utf-8');
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS512' })
    .setAudience('prairietest')
    .setIssuedAt()
    .setExpirationTime(PRAIRIE_TEST_JWT_LIFETIME)
    .sign(key);
}
