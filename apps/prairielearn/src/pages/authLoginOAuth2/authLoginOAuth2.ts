import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { OAuth2Client } from 'google-auth-library';

import { HttpStatusError } from '@prairielearn/error';

import { config } from '../../lib/config.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (
      !config.hasOauth ||
      !config.googleClientId ||
      !config.googleClientSecret ||
      !config.googleRedirectUrl
    ) {
      throw new HttpStatusError(404, 'Google login is not enabled');
    }

    const oauth2Client = new OAuth2Client(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUrl,
    );
    const url = oauth2Client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'profile', 'email'],
      prompt: 'select_account',
      // FIXME: should add some state here to avoid CSRF
    });
    res.redirect(url);
  }),
);

export default router;
