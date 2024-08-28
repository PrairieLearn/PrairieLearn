import { Router } from 'express';

import { generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../../lib/config.js';
import { shouldSecureCookie, setCookie, clearCookie } from '../../lib/cookie.js';

import { AuthPassword } from './authPassword.html.js';

const router = Router();

router.get('/', function (req, res) {
  res.send(
    AuthPassword({
      resLocals: res.locals,
      passwordInvalid: 'pl2_assessmentpw' in req.cookies,
    }),
  );
});

router.post('/', function (req, res) {
  const redirectUrl = req.cookies.pl2_pw_original_url ?? '/';
  const maxAge = 1000 * 60 * 60 * 12; // 12 hours

  const pwCookie = generateSignedToken({ password: req.body.password, maxAge }, config.secretKey);
  setCookie(res, ['pl_assessmentpw', 'pl2_assessmentpw'], pwCookie, {
    maxAge,
    httpOnly: true,
    secure: shouldSecureCookie(req),
  });
  clearCookie(res, ['pl_pw_origUrl', 'pl2_pw_original_url']);
  return res.redirect(redirectUrl);
});

export default router;
