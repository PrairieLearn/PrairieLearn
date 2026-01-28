import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import {
  checkSignedToken,
  checkSignedTokenPrefix,
  generateSignedToken,
  getCheckedSignedTokenData,
} from '@prairielearn/signed-token';

import { config } from '../lib/config.js';

export default asyncHandler(async (req, res, next) => {
  const baseUrl = req.originalUrl.split('?')[0];

  // Standard CSRF token (existing behavior)
  const tokenData = {
    url: baseUrl,
    authn_user_id: res.locals.authn_user?.id,
  };

  res.locals.__csrf_token = generateSignedToken(tokenData, config.secretKey);

  if (req.method === 'POST') {
    // NOTE: If you are trying to debug a "CSRF Fail" in a form with file
    // upload, you may have forgotten to special-case the file upload path.
    // Search for "upload.single('file')" in server.js, for example.

    const csrfToken = req.headers['x-csrf-token'] ?? req.body?.__csrf_token;

    if (typeof csrfToken !== 'string') {
      throw new HttpStatusError(403, 'CSRF fail');
    }

    // Decode the token to determine its type
    const decodedTokenData = getCheckedSignedTokenData(csrfToken, config.secretKey);

    if (decodedTokenData?.type === 'prefix') {
      // Validate using prefix-based matching (token URL must be prefix of request URL)
      if (
        !checkSignedTokenPrefix(
          csrfToken,
          { url: baseUrl, authn_user_id: res.locals.authn_user?.id },
          config.secretKey,
        )
      ) {
        throw new HttpStatusError(403, 'CSRF fail');
      }
    } else {
      // Standard CSRF validation (exact URL match)
      if (!checkSignedToken(csrfToken, tokenData, config.secretKey)) {
        throw new HttpStatusError(403, 'CSRF fail');
      }
    }
  }
  next();
});

/**
 * Generates a CSRF token for the given URL and authentication user ID.
 * This is useful for interacting with routes which only have a POST handler,
 * e.g. `instructorCopyPublicCourseInstance.ts`.
 */
export function generateCsrfToken({ url, authnUserId }: { url: string; authnUserId: string }) {
  return generateSignedToken(
    {
      // We don't want to include the query params in the CSRF token checks.
      url: url.split('?')[0],
      authn_user_id: authnUserId,
    },
    config.secretKey,
  );
}
