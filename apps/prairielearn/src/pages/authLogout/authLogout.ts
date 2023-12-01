import { Router } from 'express';
import asyncHandler = require('express-async-handler');

import { config } from '../../lib/config';
import { clearCookie } from '../../lib/cookie';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    clearCookie(res, 'pl_authn');
    clearCookie(res, 'pl2_authn');
    clearCookie(res, 'pl_assessmentpw');
    clearCookie(res, 'pl2_assessmentpw');

    if (config.devMode) {
      // In dev mode, a user will typically by automatically authenticated by our
      // authentication middleware to reduce the friction of getting started.
      // However, folks who want to specifically test authentication behavior can
      // click "Log out". In this case, we want to disable the automatic login
      // until the next time the user authenticates.
      res.cookie('pl2_disable_auto_authn', '1', {
        domain: config.cookieDomain,
      });
    }

    await req.session.destroy();
    // Hold-over from the old express-session implementation
    clearCookie(res, 'connect.sid');
    clearCookie(res, 'prairielearn_session');
    clearCookie(res, 'pl2_session');

    const redirect = req.query.redirect;
    if (redirect && typeof redirect === 'string') {
      res.redirect(decodeURIComponent(redirect));
    } else {
      res.redirect('/');
    }
  }),
);

export default router;
