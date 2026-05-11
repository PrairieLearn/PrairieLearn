import * as crypto from 'node:crypto';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import * as jose from 'jose';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import * as authnLib from '../../lib/authn.js';
import { getStudentAssessmentUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';

const router = Router({ mergeParams: true });

const PrairieTestJwtPayloadSchema = z.object({
  user_id: z.string(),
  course_instance_id: z.string().optional(),
  assessment_id: z.string().optional(),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const jwt = req.body.jwt;
    if (typeof jwt !== 'string' || jwt.length === 0) {
      throw new HttpStatusError(400, 'Missing JWT');
    }

    const key = crypto.createSecretKey(config.prairieTestAuthSecret, 'utf-8');
    const { payload } = await jose.jwtVerify(jwt, key, { audience: 'prairielearn' });
    const { user_id, course_instance_id, assessment_id } =
      PrairieTestJwtPayloadSchema.parse(payload);

    if ((course_instance_id === undefined) !== (assessment_id === undefined)) {
      throw new HttpStatusError(
        400,
        'course_instance_id and assessment_id must both be present or both absent',
      );
    }

    const redirectUrl =
      course_instance_id !== undefined && assessment_id !== undefined
        ? getStudentAssessmentUrl(course_instance_id, assessment_id)
        : undefined;

    await authnLib.loadUser(
      req,
      res,
      { user_id, provider: 'PrairieTest' },
      { redirect: true, redirectUrl },
    );
  }),
);

export default router;
