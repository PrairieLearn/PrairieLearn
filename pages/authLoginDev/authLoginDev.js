const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const config = require('../../lib/config');
const authnLib = require('../../lib/authn');

var router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!config.devMode) {
      throw new Error('devMode login is not enabled');
    }

    var authnUid = config.authUid;
    var authnName = config.authName;
    var authnUin = config.authUin;

    let authnParams = { authnUid, authnName, authnUin };

    await authnLib.load_user_profile(req, res, authnParams, 'dev', {
      redirect: true,
      pl_authn_cookie: true,
    });
  })
);

module.exports = router;
