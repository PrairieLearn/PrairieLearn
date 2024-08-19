import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import passport from 'passport';

import { HttpStatusError } from '@prairielearn/error';

import * as authnLib from '../../../lib/authn.js';

const router = Router();

function authenticate(req, res): Promise<any> {
  return new Promise((resolve, reject) => {
    passport.authenticate(
      'azuread-openidconnect',
      {
        failureRedirect: '/pl',
        session: false,
      },
      (err, user) => {
        if (err) {
          reject(err);
        } else {
          resolve(user);
        }
      },
    )(req, res);
  });
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const user = await authenticate(req, res);

    if (!user) {
      // We shouldn't hit this case very often in practice, but if we do, we have
      // no control over it, so we'll report the error as a 200 to avoid it
      // contributing to error metrics.
      throw new HttpStatusError(200, 'Login failed. Please try again.');
    }

    const authnParams = {
      uid: user.upn,
      name: user.displayName,
      uin: null,
      email: user._json.email || null,
      provider: 'Azure',
    };

    await authnLib.loadUser(req, res, authnParams, {
      redirect: true,
    });
  }),
);

export default router;
