const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const authnLib = require('../../lib/authn');
const config = require('../../lib/config');

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!config.hasShib) throw new Error('Shibboleth login is not enabled');

    var authnUid = req.headers['x-trust-auth-uid'] ?? null;
    var authnName = req.headers['x-trust-auth-name'] ?? null;
    var authnUin = req.headers['x-trust-auth-uin'] ?? null;

    if (!authnUid) return next(new Error('No authUid'));

    // catch bad Shibboleth data
    const authError =
      'Your account is not registered for this service. Please contact your course instructor or IT support.';
    if (authnUid === '(null)') throw new Error(authError);

    let authnParams = {
      authnUid,
      authnName,
      authnUin,
    };
    await authnLib.load_user_profile(req, res, authnParams, 'Shibboleth', {
      pl_authn_cookie: true,
      redirect: true,
    });
  })
);

module.exports = router;
