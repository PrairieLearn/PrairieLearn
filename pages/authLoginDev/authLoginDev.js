const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const config = require('../../lib/config');
const authnLib = require('../../lib/authn');

var router = Router();

router.get('/', asyncHandler(async (req, res, next) => {
  if (!config.devMode) {
    return next(new Error('devMode logins are not enabled'));
  }

  var authUid = config.authUid;
  var authName = config.authName;
  var authUin = config.authUin;

  let authnParams = { authUid, authName, authUin };

  await authnLib.load_user_profile(req, res, authnParams, 'dev', true);

  var redirUrl = res.locals.homeUrl;
  if ('preAuthUrl' in req.cookies) {
    redirUrl = req.cookies.preAuthUrl;
    res.clearCookie('preAuthUrl');
  }
  res.redirect(redirUrl);
}));

module.exports = router;
