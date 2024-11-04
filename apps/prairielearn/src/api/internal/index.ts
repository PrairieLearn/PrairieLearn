import * as crypto from 'node:crypto';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import * as jose from 'jose';

import { HttpStatusError } from '@prairielearn/error';
import * as Sentry from '@prairielearn/sentry';

import { config } from '../../lib/config.js';

const router = Router();

// Pretty-print all JSON responses.
router.use((await import('../lib/prettyPrintJson.js')).default);

// All routes will be authenticated with a JWT.
router.use(
  asyncHandler(async (req, res, next) => {
    if (!config.internalApiSecretKey) {
      throw new Error('Internal API secret key is not configured');
    }

    const jwt = req.headers['authorization']?.split(' ')[1];

    // Ensure that the JWT is present.
    if (!jwt) {
      throw new HttpStatusError(403, 'Requires authentication');
    }

    // Verify the JWT.
    await jose
      .jwtVerify(jwt, crypto.createSecretKey(config.internalApiSecretKey, 'utf-8'), {
        issuer: 'PrairieLearn',
      })
      .catch((err) => {
        throw new HttpStatusError(403, `Invalid JWT: ${err.message}`);
      });

    next();
  }),
);

router.use(
  '/course/:course_id/edit/question',
  (await import('./endpoints/course/edit/question.js')).default,
);

// The Sentry error handler must come before our own.
router.use(Sentry.expressErrorHandler());

// Handle errors independently from the normal PL error handling.
router.use((await import('../lib/error.js')).default);

export default router;
