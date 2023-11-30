import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { config } from '../../lib/config';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    res.clearCookie('pl_authn');
    res.clearCookie('pl_authn', { domain: config.cookieDomain });
    res.clearCookie('pl2_authn');
    res.clearCookie('pl2_authn', { domain: config.cookieDomain });
    res.clearCookie('pl_assessmentpw');
    res.clearCookie('pl_assessmentpw', { domain: config.cookieDomain });
    res.clearCookie('pl2_assessmentpw');
    res.clearCookie('pl2_assessmentpw', { domain: config.cookieDomain });

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
    res.clearCookie('connect.sid');
    res.clearCookie('connect.sid', { domain: config.cookieDomain });
    res.clearCookie('prairielearn_session');
    res.clearCookie('prairielearn_session', { domain: config.cookieDomain });
    res.clearCookie('pl2_session');
    res.clearCookie('pl2_session', { domain: config.cookieDomain });

    const redirect = req.query.redirect;
    if (redirect && typeof redirect === 'string') {
      res.redirect(decodeURIComponent(redirect));
    } else {
      res.redirect('/');
    }
  }),
);

export default router;
