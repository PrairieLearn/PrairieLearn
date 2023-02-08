const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const authnLib = require('../../lib/authn');
const config = require('../../lib/config');

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!config.hasShib) return next(new Error('Shibboleth login is not enabled'));
    var authnUid = null;
    var authnName = null;
    var authnUin = null;
    if (req.headers['x-trust-auth-uid']) authnUid = req.headers['x-trust-auth-uid'];
    if (req.headers['x-trust-auth-name']) authnName = req.headers['x-trust-auth-name'];
    if (req.headers['x-trust-auth-uin']) authnUin = req.headers['x-trust-auth-uin'];
    if (!authnUid) return next(new Error('No authUid'));

    // catch bad Shibboleth data
    const authError =
      'Your account is not registered for this service. Please contact your course instructor or IT support.';
    if (authnUid === '(null)') return next(new Error(authError));

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
