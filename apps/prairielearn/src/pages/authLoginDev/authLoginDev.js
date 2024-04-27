// @ts-check
import { Router } from 'express';
const asyncHandler = require('express-async-handler');

import { config } from '../../lib/config';
import * as authnLib from '../../lib/authn';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    if (!config.devMode || !config.authUid) {
      throw new Error('devMode login is not enabled');
    }

    var uid = config.authUid;
    var name = config.authName;
    var uin = config.authUin;

    let authnParams = {
      uid,
      name,
      uin,
      provider: 'dev',
    };

    await authnLib.loadUser(req, res, authnParams, {
      redirect: true,
      pl_authn_cookie: true,
    });
  }),
);

export default router;
