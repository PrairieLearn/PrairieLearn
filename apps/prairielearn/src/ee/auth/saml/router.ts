import util from 'node:util';

import { type Request, type Response, Router } from 'express';
import asyncHandler from 'express-async-handler';
import passport from 'passport';

import { HttpStatusError } from '@prairielearn/error';

import * as authnLib from '../../../lib/authn.js';
import type { SamlProvider } from '../../../lib/db-types.js';
import { getInstitutionSamlProvider } from '../../lib/institution.js';

import { SamlTest } from './router.html.js';

import { strategy } from './index.js';

/**
 * Resolves SAML user attributes from the raw SAML response attributes based
 * on the institution's configured attribute mappings.
 */
export function resolveSamlAttributes(
  provider: Pick<
    SamlProvider,
    | 'uid_attribute'
    | 'uin_attribute'
    | 'name_attribute'
    | 'given_name_attribute'
    | 'family_name_attribute'
    | 'email_attribute'
  >,
  attributes: Record<string, string | undefined>,
) {
  const uid = provider.uid_attribute ? attributes[provider.uid_attribute]?.trim() || null : null;
  const uin = provider.uin_attribute ? attributes[provider.uin_attribute]?.trim() || null : null;
  const email = provider.email_attribute
    ? attributes[provider.email_attribute]?.trim() || null
    : null;

  const nameDirect = provider.name_attribute
    ? attributes[provider.name_attribute]?.trim() || null
    : null;
  const givenName = provider.given_name_attribute
    ? attributes[provider.given_name_attribute]?.trim() || null
    : null;
  const familyName = provider.family_name_attribute
    ? attributes[provider.family_name_attribute]?.trim() || null
    : null;

  const hasSplitNameMapping = !!provider.given_name_attribute && !!provider.family_name_attribute;
  const name =
    hasSplitNameMapping && givenName && familyName
      ? `${givenName} ${familyName}`.trim()
      : nameDirect;
  const hasNameMapping = !!provider.name_attribute || hasSplitNameMapping;

  return { uid, uin, name, givenName, familyName, email, hasNameMapping };
}

const router = Router({ mergeParams: true });

router.get('/login', (req, res, next) => {
  passport.authenticate('saml', {
    failureRedirect: '/pl',
    session: false,
    // @ts-expect-error Missing `additionalParams` on the type.
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

function authenticate(req: Request, res: Response): Promise<any> {
  return new Promise((resolve, reject) => {
    passport.authenticate(
      'saml',
      {
        failureRedirect: '/pl',
        session: false,
      },
      (err: any, user: Express.User | false | null) => {
        if (err) {
          reject(err);
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

    if (!user) {
      // We shouldn't hit this case very often in practice, but if we do, we have
      // no control over it, so we'll report the error as a 200 to avoid it
      // contributing to error metrics.
      throw new HttpStatusError(200, 'Login failed. Please try again.');
    }

    // Fetch this institution's attribute mappings.
    const institutionId = req.params.institution_id;
    const institutionSamlProvider = await getInstitutionSamlProvider(institutionId);
    if (!institutionSamlProvider) {
      throw new HttpStatusError(404, 'Institution does not support SAML authentication');
    }

    const resolved = resolveSamlAttributes(institutionSamlProvider, user.attributes);

    if (req.body.RelayState === 'test') {
      res.send(
        SamlTest({
          uid: resolved.uid,
          uin: resolved.uin,
          name: resolved.name,
          givenName: resolved.givenName,
          familyName: resolved.familyName,
          email: resolved.email,
          uidAttribute: institutionSamlProvider.uid_attribute,
          uinAttribute: institutionSamlProvider.uin_attribute,
          nameAttribute: institutionSamlProvider.name_attribute,
          givenNameAttribute: institutionSamlProvider.given_name_attribute,
          familyNameAttribute: institutionSamlProvider.family_name_attribute,
          emailAttribute: institutionSamlProvider.email_attribute,
          attributes: user.attributes,
          resLocals: res.locals,
        }),
      );
      return;
    }

    // Only perform validation if we aren't rendering the above test page.
    //
    // We cannot safely require emails for users. For some categories of users,
    // such as FERPA-suppressed students, an IdP may not pass an email address.
    // So even if an email attribute is configured and we get it for the vast
    // majority of users, there may be some for which it is not present.
    if (
      !institutionSamlProvider.uid_attribute ||
      !institutionSamlProvider.uin_attribute ||
      !resolved.hasNameMapping
    ) {
      throw new Error('Missing one or more SAML attribute mappings');
    }
    const nameAttributeDescription = institutionSamlProvider.name_attribute
      ? institutionSamlProvider.name_attribute
      : `${institutionSamlProvider.given_name_attribute} + ${institutionSamlProvider.family_name_attribute}`;
    const missingAttributes = [
      ...(!resolved.uid ? [`uid (${institutionSamlProvider.uid_attribute})`] : []),
      ...(!resolved.uin ? [`uin (${institutionSamlProvider.uin_attribute})`] : []),
      ...(!resolved.name ? [`name (${nameAttributeDescription})`] : []),
    ];
    if (missingAttributes.length > 0) {
      throw new Error(
        `Missing values for the following SAML attributes: ${missingAttributes.join(', ')}`,
      );
    }

    const authnParams = {
      uid: resolved.uid,
      name: resolved.name,
      uin: resolved.uin,
      email: resolved.email,
      provider: 'SAML',
      institution_id: institutionId,
    };

    await authnLib.loadUser(req, res, authnParams, {
      redirect: true,
    });
  }),
);

router.get(
  '/metadata',
  asyncHandler(async (req, res) => {
    const samlProvider = await getInstitutionSamlProvider(req.params.institution_id);
    if (!samlProvider) {
      throw new HttpStatusError(404, 'Institution does not support SAML authentication');
    }

    const metadata = await util.promisify(strategy.generateServiceProviderMetadata.bind(strategy))(
      req,
      samlProvider.public_key,
      samlProvider.public_key,
    );
    res.type('application/xml');
    res.send(metadata);
  }),
);

export default router;
