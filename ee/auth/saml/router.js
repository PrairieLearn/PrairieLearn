// @ts-check
const ERR = require('async-stacktrace');
const asyncHandler = require('express-async-handler');
const { Router } = require('express');
const passport = require('passport');
const util = require('util');

const authnLib = require('../../../lib/authn');

const { strategy } = require('./index');
const { SamlTest } = require('./router.html');
const { getInstitutionSamlProvider } = require('../../institution/utils');

const router = Router({ mergeParams: true });

router.get('/login', (req, res, next) => {
  // @ts-expect-error Missing `additionalParams` on the type.
  passport.authenticate('saml', {
    failureRedirect: '/pl',
    session: false,
    additionalParams: req.query.RelayState
      ? {
          // This is used be the SAML configuration page to test SAML. It includes
          // `?RelayState=test` in the login request. When the callback page recieves
          // that value, it displays the received attributes instead of creating a
          // new session for the user.
          RelayState: req.query.RelayState,
        }
      : undefined,
  })(req, res, next);
});

router.post(
  '/callback',
  asyncHandler(async (req, res) => {
    // This will write the resolved user to `req.user`.
    await util.promisify(
      passport.authenticate('saml', {
        failureRedirect: '/pl',
        session: false,
      })
    )(req, res);

    // Fetch this institution's attribute mappings.
    const institutionId = req.params.institution_id;
    const institutionSamlProvider = await getInstitutionSamlProvider(institutionId);
    const uidAttribute = institutionSamlProvider.uid_attribute;
    const uinAttribute = institutionSamlProvider.uin_attribute;
    const nameAttribute = institutionSamlProvider.name_attribute;

    // Read the appropriate attributes.
    // @ts-expect-error `attributes` is not defined on the type.
    const authnUid = req.user.attributes[uidAttribute];
    // @ts-expect-error `attributes` is not defined on the type.
    const authnUin = req.user.attributes[uinAttribute];
    // @ts-expect-error `attributes` is not defined on the type.
    const authnName = req.user.attributes[nameAttribute];

    if (req.body.RelayState === 'test') {
      res.send(
        SamlTest({
          uid: authnUid,
          uin: authnUin,
          name: authnName,
          uidAttribute,
          uinAttribute,
          nameAttribute,
          // @ts-expect-error `attributes` is not defined on the type.
          attributes: req.user.attributes,
          resLocals: res.locals,
        })
      );
      return;
    }

    // Only perform validation if we aren't rendering the above test page.
    if (!uidAttribute || !uinAttribute || !nameAttribute) {
      throw new Error('Missing one or more SAML attribute mappings');
    }
    if (!authnUid || !authnUin || !authnName) {
      throw new Error('Missing one or more SAML attributes');
    }

    let authnParams = {
      uid: authnUid,
      name: authnName,
      uin: authnUin,
      provider: 'SAML',
    };

    await authnLib.loadUser(req, res, authnParams, {
      pl_authn_cookie: true,
      redirect: true,
    });
  })
);

router.get(
  '/metadata',
  asyncHandler(async (req, res, next) => {
    const samlProvider = await getInstitutionSamlProvider(req.params.institution_id);
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
