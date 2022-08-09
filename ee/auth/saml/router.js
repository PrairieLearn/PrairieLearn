const ERR = require('async-stacktrace');
const asyncHandler = require('express-async-handler');
const { Router } = require('express');
const passport = require('passport');
const util = require('util');

const sqldb = require('../../../prairielib/lib/sql-db');
const config = require('../../../lib/config');
const csrf = require('../../../lib/csrf');

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

router.post(
  '/callback',
  asyncHandler(async (req, res) => {
    // This will write the resolved user to `req.user`.
    await util.promisify(
      passport.authenticate('saml', { response: res, failureRedirect: '/pl', session: false })
    )(req, res);

    if (req.body.RelayState === 'test') {
      // TODO: render an HTML page that explains what is being shown (the
      // attributes from the SAML response).
      res.contentType('application/json');
      res.send(JSON.stringify(req.user, null, 2));
      return;
    }

    const institutionId = req.params.institution_id;

    // Fetch this institution's attribute mappings.
    // TODO: pull from database.
    const uidAttribute = 'urn:oid:0.9.2342.19200300.100.1.1';
    const uinAttribute = 'urn:oid:0.9.2342.19200300.100.1.3';
    const nameAttribute = 'urn:oid:2.16.840.1.113730.3.1.241';

    // Fetch
    const authUid = req.user.attributes[uidAttribute];
    const authUin = req.user.attributes[uinAttribute];
    const authName = req.user.attributes[nameAttribute];

    const params = [authUid, authName, authUin, 'SAML'];
    const userRes = await sqldb.callAsync('users_select_or_insert', params);
    const tokenData = {
      user_id: userRes.rows[0].user_id,
      authn_provider_name: 'Shibboleth',
    };
    const pl_authn = csrf.generateToken(tokenData, config.secretKey);
    res.cookie('pl_authn', pl_authn, {
      maxAge: config.authnCookieMaxAgeMilliseconds,
      httpOnly: true,
      secure: true,
    });

    let redirUrl = res.locals.homeUrl;
    if ('preAuthUrl' in req.cookies) {
      redirUrl = req.cookies.preAuthUrl;
      res.clearCookie('preAuthUrl');
    }
    res.redirect(redirUrl);
  })
);

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
