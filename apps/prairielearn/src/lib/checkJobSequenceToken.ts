import { checkSignedToken } from '@prairielearn/signed-token';

import { config } from './config.js';

/**
 * Ensures that the provided token is valid. Prevents cross-site scripting attacks.
 */
export function checkJobSequenceToken(token: string, jobSequenceId: string): boolean {
  return checkSignedToken(token, { jobSequenceId }, config.secretKey, {
    maxAge: 24 * 60 * 60 * 1000,
  });
}
