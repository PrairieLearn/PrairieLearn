// @ts-check
import express = require('express');
import asyncHandler = require('express-async-handler');
import passport = require('passport');

import * as authnLib from '../../lib/authn';

const router = express.Router();

function authenticate(req, res): Promise<any> {
  return new Promise((resolve, reject) => {
    passport.authenticate(
      'oidconnect',
      {
        failureRedirect: '/pl',
        session: false
      },
      (err, user) => {
        if (err) {
          reject(err);
        } else if (!user) {
          reject(new Error("Login failed"));
        } else {
          resolve(user);
        }
      }
    )(req, res);
  })
};

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    const user = await authenticate(req, res);

    const authnParams = {
      uid: user.upn,
      name: user.displayName,
      uin: null,
      provider: 'OID',
    };

    await authnLib.loadUser(req, res, authnParams, {
      redirect: true,
      pl_authn_cookie: true,
    });
  }),
);


// router.get(
//   '/',
//   asyncHandler(async (req, res, _next) => {
//     if (
//       !config.hasOauth ||
//       !config.googleClientId ||
//       !config.googleClientSecret ||
//       !config.googleRedirectUrl
//     ) {
//       throw new Error('Google login is not enabled');
//     }

//     const code = req.query.code;
//     if (code == null) {
//       throw new Error('No "code" query parameter for authCallbackOAuth2');
//     } else if (typeof code !== 'string') {
//       throw new Error(`Invalid 'code' query parameter for authCallbackOAuth2: ${code}`);
//     }
//     // FIXME: should check req.query.state to avoid CSRF
//     let oauth2Client, identity;
//     oauth2Client = new OAuth2Client(
//       config.googleClientId,
//       config.googleClientSecret,
//       config.googleRedirectUrl,
//     );

//     logger.verbose('Got Google auth with code: ' + code);
//     const { tokens } = await oauth2Client.getToken(code).catch((err) => {
//       if (err?.response) {
//         // This is probably a detailed error from the Google API client. We'll
//         // pick off the useful bits and attach them to the Sentry scope so that
//         // they'll be included with the error event.
//         Sentry.configureScope((scope) => {
//           scope.setContext('OAuth', {
//             code: err.code,
//             data: err.response.data,
//           });
//         });
//       }
//       throw err;
//     });

//     const idToken = tokens.id_token;
//     if (!idToken) {
//       throw new Error('Missing id_token in Google auth response');
//     }

//     // tokens.id_token is a JWT (JSON Web Token)
//     // http://openid.net/specs/draft-jones-json-web-token-07.html
//     // A JWT has the form HEADER.PAYLOAD.SIGNATURE
//     // We get the PAYLOAD, un-base64, parse to JSON:
//     const parts = idToken.split('.');
//     identity = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
//     logger.verbose('Got Google auth identity: ' + JSON.stringify(identity));
//     assert(identity.email);

//     let authnParams = {
//       uid: identity.email,
//       name: identity.name || identity.email,
//       uin: identity.sub,
//       provider: 'Google',
//     };
//     await authnLib.loadUser(req, res, authnParams, {
//       pl_authn_cookie: true,
//       redirect: true,
//     });
//   }),
// );

export default router;
