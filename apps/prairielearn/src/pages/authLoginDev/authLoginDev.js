// @ts-check
const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const { config } = require('../../lib/config');
const authnLib = require('../../lib/authn');

var router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    if (!config.devMode || !config.authUid) {
      throw new Error('devMode login is not enabled');
    }

    var uid = config.authUid;
    var name = config.authName;
    var uin = config.authUin;

    let authnParams = {
      uid,
      name,
      uin,
      provider: 'dev',
    };

    await authnLib.loadUser(req, res, authnParams, {
      redirect: true,
      pl_authn_cookie: true,
    });
  }),
);

module.exports = router;
