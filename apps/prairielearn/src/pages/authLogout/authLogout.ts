import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import util = require('util');
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

    await util.promisify(req.session.destroy);
    // I don't like hardcoding this cookie name, but I didn't see how to get
    // the name from express-session. Hacky until we replace with our own.
    res.clearCookie('connect.sid');

    const redirect = req.query.redirect;
    if (redirect && typeof redirect === 'string') {
      res.redirect(decodeURIComponent(redirect));
    } else {
      res.redirect('/');
    }
  }),
);

export default router;
