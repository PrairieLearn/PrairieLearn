import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';
import { checkSignedToken } from '@prairielearn/signed-token';

import { config } from './config.js';

export function checkJobSequenceToken(token: string, jobSequenceId: string): boolean {
  const data = { jobSequenceId };
  const valid = checkSignedToken(token, data, config.secretKey, { maxAge: 24 * 60 * 60 * 1000 });
  if (!valid) {
    logger.error(`Token for job sequence ${jobSequenceId} failed validation.`);
    Sentry.captureException(new Error(`Token for job sequence ${jobSequenceId} failed validation.`));
  }
  return valid;
};