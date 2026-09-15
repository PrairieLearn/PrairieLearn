import * as crypto from 'node:crypto';

import * as jose from 'jose';

import { config } from '../../lib/config.js';
import { getActiveKey } from '../../lib/key-ring.js';

// Limit replay if a token is exposed.
const PRAIRIE_TEST_JWT_LIFETIME = '5m';

type PrairieTestJwtPayload = jose.JWTPayload &
  (
    | {
        purpose: 'end_exam';
        user_id: string;
        reservation_id: string;
      }
    | {
        purpose: 'cheating_report';
        user_id: string;
        reservation_id: string;
        report: string;
      }
  );

export async function signPrairieTestJwt(payload: PrairieTestJwtPayload): Promise<string> {
  const key = crypto.createSecretKey(getActiveKey(config.prairieTestSharedAuthSecret), 'utf-8');
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS512' })
    .setAudience('prairietest')
    .setIssuedAt()
    .setExpirationTime(PRAIRIE_TEST_JWT_LIFETIME)
    .sign(key);
}
