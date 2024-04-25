// @ts-check
import { Router } from 'express';
const asyncHandler = require('express-async-handler');
import * as error from '@prairielearn/error';

import * as authnLib from '../../lib/authn';
import { config } from '../../lib/config';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    if (!config.hasShib) {
      throw new error.HttpStatusError(404, 'Shibboleth login is not enabled');
    }

    const uid = req.get('x-trust-auth-uid') ?? null;
    const name = req.get('x-trust-auth-name') ?? null;
    const uin = req.get('x-trust-auth-uin') ?? null;

    if (!uid) throw new Error('No authUid');

    // catch bad Shibboleth data
    const authError =
      'Your account is not registered for this service. Please contact your course instructor or IT support.';
    if (uid === '(null)') throw new Error(authError);

    let authnParams = {
      uid,
      name,
      uin,
      provider: 'Shibboleth',
    };
    await authnLib.loadUser(req, res, authnParams, {
      pl_authn_cookie: true,
      redirect: true,
    });
  }),
);

export default router;
