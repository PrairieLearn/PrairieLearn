// @ts-check
import express = require('express');
import asyncHandler = require('express-async-handler');
import passport = require('passport');
import { config } from '../../lib/config';

import * as authnLib from '../../lib/authn';

const router = express.Router();

function authenticate(req, res): Promise<any> {
  return new Promise((resolve, reject) => {
    passport.authenticate(
      'oidconnect',
      {
        failureRedirect: '/pl',
        session: false
      },
      (err, user) => {
        if (err) {
          reject(err);
        } else if (!user) {
          reject(new Error("Login failed"));
        } else {
          resolve(user);
        }
      }
    )(req, res);
  })
};

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    const user = await authenticate(req, res);

    const authnParams = {
      uid: user[config.oidUidKey ?? ""],
      name: user[config.oidNameKey ?? ""],
      uin: user[config.oidUinKey ?? ""],
      provider: 'OID',
    };

    await authnLib.loadUser(req, res, authnParams, {
      redirect: true,
      pl_authn_cookie: true,
    });
  }),
);

export default router;
