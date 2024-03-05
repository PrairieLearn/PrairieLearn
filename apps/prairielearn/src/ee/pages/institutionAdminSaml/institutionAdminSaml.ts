import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import * as pem from 'pem';
import { z } from 'zod';
import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryAsync, runInTransactionAsync } from '@prairielearn/postgres';

import { InstitutionAdminSaml } from './institutionAdminSaml.html';
import {
  getInstitution,
  getInstitutionSamlProvider,
  getInstitutionAuthenticationProviders,
} from '../../lib/institution';

const sql = loadSqlEquiv(__filename);
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
          // Normalize empty strings to `null`.
          uin_attribute: req.body.uin_attribute || null,
          uid_attribute: req.body.uid_attribute || null,
          name_attribute: req.body.name_attribute || null,
          // The upsert query is configured to ignore these values if they're null.
          public_key: publicKey,
          private_key: privateKey,
          // For audit logs
          authn_user_id: res.locals.authn_user.user_id,
        });
      });
    } else if (req.body.__action === 'delete') {
      await queryAsync(sql.delete_institution_saml_provider, {
        institution_id: req.params.institution_id,
        // For audit logs
        authn_user_id: res.locals.authn_user.user_id,
      });
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }

    res.redirect(req.originalUrl);
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const samlProvider = await getInstitutionSamlProvider(req.params.institution_id);
    const institutionAuthenticationProviders = await getInstitutionAuthenticationProviders(
      req.params.institution_id,
    );

    res.send(
      InstitutionAdminSaml({
        institution,
        samlProvider,
        institutionAuthenticationProviders,
        host: z.string().parse(req.headers.host),
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
