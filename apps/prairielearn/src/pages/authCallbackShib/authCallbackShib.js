// @ts-check
const express = require('express');
const asyncHandler = require('express-async-handler');
const error = require('@prairielearn/error');

const authnLib = require('../../lib/authn');
const { config } = require('../../lib/config');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    if (!config.hasShib) {
      throw error.make(404, 'Shibboleth login is not enabled');
    }

    var uid = req.get('x-trust-auth-uid') ?? null;
    var name = req.get('x-trust-auth-name') ?? null;
    var uin = req.get('x-trust-auth-uin') ?? null;

    if (!uid) throw new Error('No authUid');

    // catch bad Shibboleth data
    const authError =
      'Your account is not registered for this service. Please contact your course instructor or IT support.';
    if (uid === '(null)') throw new Error(authError);

    let authnParams = {
      uid,
      name,
      uin,
      provider: 'Shibboleth',
    };
    await authnLib.loadUser(req, res, authnParams, {
      pl_authn_cookie: true,
      redirect: true,
    });
  }),
);

module.exports = router;
