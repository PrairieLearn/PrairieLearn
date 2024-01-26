import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { config } from '../../lib/config';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    res.clearCookie('pl_authn');
    res.clearCookie('pl_assessmentpw');

    if (config.devMode) {
      // In dev mode, a user will typically by automatically authenticated by our
      // authentication middleware to reduce the friction of getting started.
      // However, folks who want to specifically test authentication behavior can
      // click "Log out". In this case, we want to disable the automatic login
      // until the next time the user authenticates.
      res.cookie('pl_disable_auto_authn', '1');
    }

    await req.session.destroy();
    // Hold-over from the old express-session implementation
    res.clearCookie('connect.sid');
    res.clearCookie('prairielearn_session');

    const redirect = req.query.redirect;
    if (redirect && typeof redirect === 'string') {
      res.redirect(decodeURIComponent(redirect));
    } else {
      res.redirect('/');
    }
  }),
);

export default router;
