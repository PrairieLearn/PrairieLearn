import * as crypto from 'node:crypto';

import * as jose from 'jose';

import { config } from '../../lib/config.js';

// Limit replay if a token is exposed.
const PRAIRIE_TEST_JWT_LIFETIME = '5m';

type PrairieTestJwtPayload = jose.JWTPayload & {
  user_id: string;
  reservation_id: string;
} & (
    | {
        purpose: 'end_exam';
        report?: never;
        submission_id?: never;
      }
    | {
        purpose: 'cheating_report';
        report: string;
        submission_id: string;
      }
  );

export async function signPrairieTestJwt(payload: PrairieTestJwtPayload): Promise<string> {
  const key = crypto.createSecretKey(config.prairieTestSharedAuthSecret, 'utf-8');
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS512' })
    .setAudience('prairietest')
    .setIssuedAt()
    .setExpirationTime(PRAIRIE_TEST_JWT_LIFETIME)
    .sign(key);
}
