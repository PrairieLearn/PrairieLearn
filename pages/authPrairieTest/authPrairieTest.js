// @ts-check
const asyncHandler = require('express-async-handler');
const { Router } = require('express');
const jose = require('jose');
const crypto = require('crypto');

const { AuthPrairieTest } = require('./authPrairieTest.html');

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    console.log(res.locals);
    const key = crypto.createSecretKey('SECRET_GOES_HERE', 'utf-8');

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
        // Source URL: http:/nathan-prairielearn.ngrok.io/pl/prairietest/auth
        prairieTestCallback: 'https://nathan-prairietest.ngrok.io/pt/auth/prairielearn/callback',
      })
    );
  })
);

module.exports = router;
