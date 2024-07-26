import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as authnLib from '../../lib/authn.js';
import { config } from '../../lib/config.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    if (!config.devMode || !config.authUid) {
      throw new Error('devMode login is not enabled');
    }

    const uid = config.authUid;
    const name = config.authName;
    const uin = config.authUin;

    await authnLib.loadUser(req, res, { uid, name, uin, provider: 'dev' }, { redirect: true });
  }),
);

export default router;
