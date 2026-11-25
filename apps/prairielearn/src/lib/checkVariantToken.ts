import { logger } from '@prairielearn/logger';
import { checkSignedToken } from '@prairielearn/signed-token';

import { config } from './config.js';

export function checkVariantToken(token: string, variantId: string): boolean {
  const data = { variantId };
  const valid = checkSignedToken(token, data, config.secretKey, { maxAge: 24 * 60 * 60 * 1000 });
  if (!valid) {
    // Tokens routinely expire in tabs that stay open for more than a day and
    // then reconnect, so this isn't reported to Sentry.
    logger.warn(`Token for variant ${variantId} failed validation.`);
  }
  return valid;
}
