import { SAML } from '@node-saml/passport-saml';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
// We import from this instead of `pem` directly because the latter includes
// code that messes up the display of source maps in dev mode:
// https://github.com/Dexus/pem/issues/389#issuecomment-2043258753
import * as pem from 'pem/lib/pem.js';
import formatXml from 'xml-formatter';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryAsync, runInTransactionAsync } from '@prairielearn/postgres';

import { getSamlOptions } from '../../auth/saml/index.js';
import {
  getInstitution,
  getInstitutionSamlProvider,
  getInstitutionAuthenticationProviders,
} from '../../lib/institution.js';

import {
  AdministratorInstitutionSaml,
  DecodedAssertion,
} from './administratorInstitutionSaml.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

function createCertificate(
  options: pem.CertificateCreationOptions,
): Promise<pem.CertificateCreationResult> {
  return new Promise((resolve, reject) => {
    pem.createCertificate(options, (err, keys) => {
      if (err) return reject(err);
      resolve(keys);
    });
  });
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const samlProvider = await getInstitutionSamlProvider(req.params.institution_id);
    const institutionAuthenticationProviders = await getInstitutionAuthenticationProviders(
      req.params.institution_id,
    );

    res.send(
      AdministratorInstitutionSaml({
        institution,
        samlProvider,
        institutionAuthenticationProviders,
        host: z.string().parse(req.headers.host),
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'save') {
      await runInTransactionAsync(async () => {
        // Check if there's an existing SAML provider configured. We'll use
        // that to determine if we need to create a new keypair. That is, we'll
        // only create a new keypair if there's no existing provider.
        const samlProvider = await getInstitutionSamlProvider(req.params.institution_id);

        let publicKey, privateKey;
        if (!samlProvider) {
          // No existing provider; create a new keypair with OpenSSL.
          const keys = await createCertificate({
            selfSigned: true,
            // Make certificate valid for 30 years.
            // TODO: persist expiry time in database so that in the future,
            // we can automatically warn users about expiring certificates.
            days: 265 * 30,
            // We use the host header as a shortcut to avoid the need to know
            // a given installation's domain name.
            commonName: req.headers.host,
          });
          publicKey = keys.certificate;
          privateKey = keys.serviceKey;
        }

        await queryAsync(sql.insert_institution_saml_provider, {
          institution_id: req.params.institution_id,
          sso_login_url: req.body.sso_login_url,
          issuer: req.body.issuer,
          certificate: req.body.certificate,
          validate_audience: req.body.validate_audience === '1',
          want_assertions_signed: req.body.want_assertions_signed === '1',
          want_authn_response_signed: req.body.want_authn_response_signed === '1',
          // Normalize empty strings to `null`.
          uin_attribute: req.body.uin_attribute || null,
          uid_attribute: req.body.uid_attribute || null,
          name_attribute: req.body.name_attribute || null,
          email_attribute: req.body.email_attribute || null,
          // The upsert query is configured to ignore these values if they're null.
          public_key: publicKey,
          private_key: privateKey,
          // For audit logs
          authn_user_id: res.locals.authn_user.user_id,
        });
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete') {
      await queryAsync(sql.delete_institution_saml_provider, {
        institution_id: req.params.institution_id,
        // For audit logs
        authn_user_id: res.locals.authn_user.user_id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'decode_assertion') {
      const samlConfig = await getSamlOptions({
        institution_id: req.params.institution_id,
        host: req.headers.host,
        strictMode: req.body.strict_mode === '1',
      });
      const saml = new SAML({
        ...samlConfig,
        // Disable clock skew checking; we might be testing with a very old SAML response.
        acceptedClockSkewMs: -1,
      });

      let xml: string;
      try {
        // @ts-expect-error https://github.com/chrisbottin/xml-formatter/issues/72
        xml = formatXml(Buffer.from(req.body.encoded_assertion, 'base64').toString('utf8'));
      } catch (err) {
        res.send(DecodedAssertion({ xml: err.message, profile: '' }));
        return;
      }

      const profile = await saml
        .validatePostResponseAsync({
          SAMLResponse: req.body.encoded_assertion,
        })
        .catch((err) => {
          return {
            error: err.message,
          };
        });

      res.send(DecodedAssertion({ xml, profile: JSON.stringify(profile, null, 2) }));
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
