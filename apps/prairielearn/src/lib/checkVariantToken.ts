import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';
import { checkSignedToken } from '@prairielearn/signed-token';

import { config } from './config.js';

export function checkVariantToken(token: string, variantId: string): boolean {
  const data = { variantId };
  const valid = checkSignedToken(token, data, config.secretKey, { maxAge: 24 * 60 * 60 * 1000 });
  if (!valid) {
    logger.error(`Token for variant ${variantId} failed validation.`);
    Sentry.captureException(new Error(`Token for variant ${variantId} failed validation.`));
  }
  return valid;
}
