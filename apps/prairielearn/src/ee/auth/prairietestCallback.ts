import * as crypto from 'node:crypto';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import * as jose from 'jose';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import * as authnLib from '../../lib/authn.js';
import { config } from '../../lib/config.js';

const router = Router({ mergeParams: true });

const PrairieTestJwtPayloadSchema = z.object({
  user_id: z.union([z.string(), z.number()]),
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
    const { user_id } = PrairieTestJwtPayloadSchema.parse(payload);

    await authnLib.loadUser(req, res, { user_id, provider: 'PrairieTest' }, { redirect: true });
  }),
);

export default router;
