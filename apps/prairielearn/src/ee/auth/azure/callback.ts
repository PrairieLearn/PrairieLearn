import passport = require('passport');
import { Router } from 'express';
import asyncHandler = require('express-async-handler');

import * as authnLib from '../../../lib/authn';

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
        } else if (!user) {
          reject(new Error('Login failed'));
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

    const authnParams = {
      uid: user.upn,
      name: user.displayName,
      uin: null,
      provider: 'Azure',
    };

    await authnLib.loadUser(req, res, authnParams, {
      redirect: true,
      pl_authn_cookie: true,
    });
  }),
);

export default router;
