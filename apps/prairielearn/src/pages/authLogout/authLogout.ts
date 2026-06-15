import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { config } from '../../lib/config.js';
import { clearCookie, setCookie } from '../../lib/cookie.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    clearCookie(res, ['prairielearn_session', 'pl2_session']);
    clearCookie(res, ['pl_authn', 'pl2_authn']);
    clearCookie(res, ['pl_assessmentpw', 'pl2_assessmentpw']);

    if (config.devMode) {
      // In dev mode, a user will typically by automatically authenticated by our
      // authentication middleware to reduce the friction of getting started.
      // However, folks who want to specifically test authentication behavior can
      // click "Log out". In this case, we want to disable the automatic login
      // until the next time the user authenticates.
      setCookie(res, ['pl_disable_auto_authn', 'pl2_disable_auto_authn'], '1');
    }

    await req.session.destroy();

    const redirect = req.query.redirect;
    if (redirect && typeof redirect === 'string') {
      res.redirect(decodeURIComponent(redirect));
    } else {
      res.redirect('/');
    }
  }),
);

export default router;
