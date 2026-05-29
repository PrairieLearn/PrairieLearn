import * as crypto from 'node:crypto';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import * as jose from 'jose';
import { z } from 'zod';

import { AugmentedError, HttpStatusError } from '@prairielearn/error';

import * as authnLib from '../../lib/authn.js';
import { getStudentAssessmentUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';

const router = Router({ mergeParams: true });

const PrairieTestJwtPayloadSchema = z.object({
  user_id: z.string(),
  course_instance_id: z.string().optional(),
  assessment_id: z.string().optional(),
  lockdown_browser: z.boolean().optional(),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const jwt = req.body.jwt;
    if (typeof jwt !== 'string' || jwt.length === 0) {
      throw new HttpStatusError(400, 'Missing JWT');
    }

    const key = crypto.createSecretKey(config.prairieTestSharedAuthSecret, 'utf-8');
    let payload: jose.JWTPayload;
    try {
      // TODO: require `audience: 'prairielearn'` once all PrairieTest deployments
      // are issuing JWTs with the `aud` claim set.
      const verifyResult = await jose.jwtVerify(jwt, key);
      payload = verifyResult.payload;
    } catch (err) {
      if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
        throw new AugmentedError(
          'PrairieTest JWT signature verification failed; the shared secret likely differs between PrairieTest and PrairieLearn.',
          { status: 401, cause: err },
        );
      }
      if (err instanceof jose.errors.JWTExpired) {
        throw new AugmentedError('PrairieTest JWT is expired.', { status: 401, cause: err });
      }
      if (err instanceof jose.errors.JWTClaimValidationFailed) {
        throw new AugmentedError(`PrairieTest JWT claim validation failed: ${err.message}`, {
          status: 401,
          cause: err,
        });
      }
      throw new AugmentedError('PrairieTest JWT verification failed.', {
        status: 401,
        cause: err,
      });
    }
    const { user_id, course_instance_id, assessment_id, lockdown_browser } =
      PrairieTestJwtPayloadSchema.parse(payload);

    if ((course_instance_id === undefined) !== (assessment_id === undefined)) {
      throw new HttpStatusError(
        400,
        'course_instance_id and assessment_id must both be present or both absent',
      );
    }

    // LockDown Browser's security level and child-window navigation stem
    // are set by PrairieTest on the first page of the LDB session, and are persisted, so the
    // assessment redirect needs no LDB query parameters here.
    const redirectUrl =
      course_instance_id !== undefined && assessment_id !== undefined
        ? getStudentAssessmentUrl(course_instance_id, assessment_id)
        : undefined;

    // Record whether the student authenticated through the LockDown Browser
    // flow so PrairieLearn pages can conditionally hide navigation elements.
    req.session.lockdown_browser = lockdown_browser ?? false;

    await authnLib.loadUser(
      req,
      res,
      { user_id, provider: 'PrairieTest' },
      { redirect: true, redirectUrl },
    );
  }),
);

export default router;
