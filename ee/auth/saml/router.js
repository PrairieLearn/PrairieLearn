const ERR = require('async-stacktrace');
const asyncHandler = require('express-async-handler');
const { Router } = require('express');
const passport = require('passport');

const { strategy, getSamlProviderForInstitution } = require('./index');

const router = Router({ mergeParams: true });

router.get('/login', function (req, res, next) {
  passport.authenticate('saml', {
    response: res,
    failureRedirect: '/pl',
    session: false,
    additionalParams: {
      // This is used be the SAML configuration page to test SAML. It includes
      // `?RelayState=test` in the login request. When the callback page recieves
      // that value, it displays the received attributes instead of crating a
      // new session for the user.
      RelayState: req.query.RelayState,
    },
  })(req, res, next);
});

router.post('/callback', (req, res, next) => {
  passport.authenticate('saml', { response: res, failureRedirect: '/pl', session: false })(
    req,
    res,
    (err) => {
      if (ERR(err, next)) return;

      if (req.body.RelayState === 'test') {
        // TODO: render an HTML page that explains what is being shown (the
        // attributes from the SAML response).
        res.contentType('application/json');
        res.send(JSON.stringify(req.user.attributes, null, 2));
        res.json(req.user.attributes);
        return;
      }

      // TODO: create user and set cookie.

      let redirUrl = res.locals.homeUrl;
      if ('preAuthUrl' in req.cookies) {
        redirUrl = req.cookies.preAuthUrl;
        res.clearCookie('preAuthUrl');
      }
      res.redirect(redirUrl);
    }
  );
});

router.get(
  '/metadata',

  asyncHandler(async (req, res, next) => {
    const samlProvider = await getSamlProviderForInstitution(req.params.institution_id);
    strategy.generateServiceProviderMetadata(
      req,
      samlProvider.public_key,
      samlProvider.public_key,
      (err, metadata) => {
        if (ERR(err, next)) return;
        res.type('application/xml');
        res.send(metadata);
      }
    );
  })
);

module.exports = router;
