import { logger } from '@prairielearn/logger';
import { checkSignedToken } from '@prairielearn/signed-token';

import { config } from './config.js';

/**
 * Ensures that the provided token is valid. Prevents cross-site scripting attacks.
 */
export function checkJobSequenceToken(token: string, jobSequenceId: string): boolean {
  const data = { jobSequenceId };
  const valid = checkSignedToken(token, data, config.secretKey, { maxAge: 24 * 60 * 60 * 1000 });
  if (!valid) {
    // Tokens routinely expire in tabs that stay open for more than a day and
    // then reconnect, so this isn't reported to Sentry.
    logger.warn(`Token for job sequence ${jobSequenceId} failed validation.`);
  }
  return valid;
}
