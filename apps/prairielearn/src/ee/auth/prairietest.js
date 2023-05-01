// @ts-check
const asyncHandler = require('express-async-handler');
const { Router } = require('express');
const jose = require('jose');
const crypto = require('crypto');

const { config } = require('../../lib/config');
const { AuthPrairieTest } = require('./prairietest.html');

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const key = crypto.createSecretKey(config.prairieTestAuthSecret, 'utf-8');

    // Generate a signed JWT containing just the user ID. PrairieTest shares a
    // database with PrairieLearn, so it can use the same user ID to look up any
    // relevant information about PrairieTest.
    const jwt = await new jose.SignJWT({ user_id: res.locals.authn_user.user_id })
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuedAt()
      .setExpirationTime('1m')
      .sign(key);

    // This renders a self-submitting form that will submit the JWT to PrairieTest.
    // Doing this via a form instead of a redirect+query params avoids the possibility
    // of leaking JWTs in request logs.
    res.send(
      AuthPrairieTest({
        jwt,
        prairieTestCallback: `${config.ptHost}/pt/auth/prairielearn/callback`,
        resLocals: res.locals,
      })
    );
  })
);

module.exports = router;
