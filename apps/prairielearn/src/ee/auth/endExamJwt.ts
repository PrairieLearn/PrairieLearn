import * as crypto from 'node:crypto';

import * as jose from 'jose';

import { config } from '../../lib/config.js';

/**
 * Short-lived JWT used to authenticate the LockDown Browser "End exam"
 * control rendered in PrairieLearn back to PrairieTest's
 * `/pt/auth/prairielearn/end-exam` callback. Signed with the same
 * `prairieTestSharedAuthSecret` PT uses for the reverse direction.
 *
 * Five minutes is plenty for a click-and-submit; tokens are minted fresh
 * per page render, so the only risk window is a student leaving a page
 * idle and then clicking End exam more than 5 minutes later — in which
 * case the page reload re-mints the token.
 */
const END_EXAM_JWT_LIFETIME = '5m';

export async function generateEndExamJwt({
  user_id,
  reservation_id,
}: {
  user_id: string;
  reservation_id: string;
}): Promise<string> {
  const key = crypto.createSecretKey(config.prairieTestSharedAuthSecret, 'utf-8');
  return await new jose.SignJWT({ user_id, reservation_id })
    .setProtectedHeader({ alg: 'HS512' })
    .setAudience('prairietest')
    .setIssuedAt()
    .setExpirationTime(END_EXAM_JWT_LIFETIME)
    .sign(key);
}
