import { checkSignedToken } from '@prairielearn/signed-token';

import { config } from './config.js';

export function checkVariantToken(token: string, variantId: string): boolean {
  return checkSignedToken(token, { variantId }, config.secretKey, {
    maxAge: 24 * 60 * 60 * 1000,
  });
}
