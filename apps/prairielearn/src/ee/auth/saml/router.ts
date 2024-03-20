import ERR = require('async-stacktrace');
import asyncHandler = require('express-async-handler');
import { Router } from 'express';
import passport = require('passport');
import * as error from '@prairielearn/error';

import * as authnLib from '../../../lib/authn';

import { strategy } from './index';
import { SamlTest } from './router.html';
import { getInstitutionSamlProvider } from '../../lib/institution';

const router = Router({ mergeParams: true });

router.get('/login', (req, res, next) => {
  // @ts-expect-error Missing `additionalParams` on the type.
  passport.authenticate('saml', {
    failureRedirect: '/pl',
    session: false,
    additionalParams: req.query.RelayState
      ? {
          // This is used be the SAML configuration page to test SAML. It includes
          // `?RelayState=test` in the login request. When the callback page receives
          // that value, it displays the received attributes instead of creating a
          // new session for the user.
          RelayState: req.query.RelayState,
        }
      : undefined,
  })(req, res, next);
});

function authenticate(req, res): Promise<any> {
  return new Promise((resolve, reject) => {
    passport.authenticate(
      'saml',
      {
        failureRedirect: '/pl',
        session: false,
      },
      (err, user) => {
        if (err) {
          reject(err);
        } else if (!user) {
          reject(new Error('Login failed'));
        } else {
          resolve(user);
        }
      },
    )(req, res);
  });
}

router.post(
  '/callback',
  asyncHandler(async (req, res) => {
    const user = await authenticate(req, res);

    // Fetch this institution's attribute mappings.
    const institutionId = req.params.institution_id;
    const institutionSamlProvider = await getInstitutionSamlProvider(institutionId);
    if (!institutionSamlProvider) {
      throw error.make(404, 'Institution does not support SAML authentication');
    }

    const uidAttribute = institutionSamlProvider.uid_attribute;
    const uinAttribute = institutionSamlProvider.uin_attribute;
    const nameAttribute = institutionSamlProvider.name_attribute;

    // Read the appropriate attributes.
    const authnUid = uidAttribute ? user.attributes[uidAttribute] : null;
    const authnUin = uinAttribute ? user.attributes[uinAttribute] : null;
    const authnName = nameAttribute ? user.attributes[nameAttribute] : null;

    if (req.body.RelayState === 'test') {
      res.send(
        SamlTest({
          uid: authnUid,
          uin: authnUin,
          name: authnName,
          uidAttribute,
          uinAttribute,
          nameAttribute,
          attributes: user.attributes,
          resLocals: res.locals,
        }),
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

    const authnParams = {
      uid: authnUid,
      name: authnName,
      uin: authnUin,
      provider: 'SAML',
      institution_id: institutionId,
    };

    await authnLib.loadUser(req, res, authnParams, {
      pl_authn_cookie: true,
      redirect: true,
    });
  }),
);

router.get(
  '/metadata',
  asyncHandler(async (req, res, next) => {
    const samlProvider = await getInstitutionSamlProvider(req.params.institution_id);
    if (!samlProvider) {
      throw error.make(404, 'Institution does not support SAML authentication');
    }

    strategy.generateServiceProviderMetadata(
      req,
      samlProvider.public_key,
      samlProvider.public_key,
      (err, metadata) => {
        if (ERR(err, next)) return;
        res.type('application/xml');
        res.send(metadata);
      },
    );
  }),
);

export default router;
