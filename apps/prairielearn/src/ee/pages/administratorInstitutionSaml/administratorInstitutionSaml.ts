import { SAML } from '@node-saml/passport-saml';
import { Router } from 'express';
// We import from this instead of `pem` directly because the latter includes
// code that messes up the display of source maps in dev mode:
// https://github.com/Dexus/pem/issues/389#issuecomment-2043258753
// @ts-expect-error No types for pem/lib/pem.js
import * as pem from 'pem/lib/pem.js';
import formatXml from 'xml-formatter';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { execute, loadSqlEquiv, runInTransactionAsync } from '@prairielearn/postgres';
import { IdSchema, parseRequest, parseRequestParams } from '@prairielearn/zod';

import {
  lockInstitutionForIdentityConfiguration,
  normalizeUinAttribute,
  selectInstitutionIdentityConfigurationStatus,
} from '../../../lib/institution-identity.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { getSamlOptions } from '../../auth/saml/index.js';
import {
  getInstitution,
  getInstitutionAuthenticationProviders,
  getInstitutionSamlProvider,
} from '../../lib/institution.js';
import { selectLti13InstancesWithRosterSyncAllowed } from '../../models/lti13Instance.js';

import {
  AdministratorInstitutionSaml,
  DecodedAssertion,
} from './administratorInstitutionSaml.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

const ParamsSchema = z.object({ institution_id: IdSchema });

const PostRequestSchemas = {
  params: ParamsSchema,
  body: z.discriminatedUnion('__action', [
    z.object({
      __action: z.literal('save'),
      sso_login_url: z.string(),
      issuer: z.string().optional(),
      certificate: z.string(),
      validate_audience: z.literal('1').optional(),
      want_assertions_signed: z.literal('1').optional(),
      want_authn_response_signed: z.literal('1').optional(),
      uid_attribute: z.string(),
      uin_attribute: z.string().optional(),
      name_attribute: z.string(),
      given_name_attribute: z.string(),
      family_name_attribute: z.string(),
      allow_missing_name: z.literal('1').optional(),
      email_attribute: z.string(),
    }),
    z.object({ __action: z.literal('delete') }),
    z.object({
      __action: z.literal('decode_assertion'),
      strict_mode: z.literal('1').optional(),
      encoded_assertion: z.string(),
    }),
  ]),
};

function createCertificate(
  options: pem.CertificateCreationOptions,
): Promise<pem.CertificateCreationResult> {
  return new Promise((resolve, reject) => {
    pem.createCertificate(options, (err: Error | null, keys: pem.CertificateCreationResult) => {
      if (err) return reject(err);
      resolve(keys);
    });
  });
}

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const { institution_id } = parseRequestParams(req, ParamsSchema);
    const institution = await getInstitution(institution_id);
    const samlProvider = await getInstitutionSamlProvider(institution_id);
    const institutionAuthenticationProviders =
      await getInstitutionAuthenticationProviders(institution_id);
    const lti13InstancesWithRosterSyncAllowed =
      await selectLti13InstancesWithRosterSyncAllowed(institution_id);

    res.send(
      AdministratorInstitutionSaml({
        institution,
        samlProvider,
        institutionAuthenticationProviders,
        lti13InstancesWithRosterSyncAllowed,
        host: z.string().parse(req.headers.host),
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const { params, body } = parseRequest(req, PostRequestSchemas);

    switch (body.__action) {
      case 'save': {
        await runInTransactionAsync(async () => {
          await lockInstitutionForIdentityConfiguration(params.institution_id);

          // Check if there's an existing SAML provider configured. We'll use
          // that to determine if we need to create a new keypair. That is, we'll
          // only create a new keypair if there's no existing provider.
          const samlProvider = await getInstitutionSamlProvider(params.institution_id);
          const identityConfigurationStatus = await selectInstitutionIdentityConfigurationStatus(
            params.institution_id,
          );
          // Disabled inputs are omitted from form submissions, so preserve locked values.
          const issuer = z.string().parse(body.issuer ?? samlProvider?.issuer);
          const uinAttribute = normalizeUinAttribute(
            body.uin_attribute ?? samlProvider?.uin_attribute,
          );

          if (
            identityConfigurationStatus.has_lti13_instance_with_roster_sync_allowed &&
            (uinAttribute !== normalizeUinAttribute(samlProvider?.uin_attribute) ||
              issuer !== samlProvider?.issuer)
          ) {
            throw new HttpStatusError(
              400,
              'Disallow roster syncing for all affected LTI 1.3 instances before changing the SAML issuer or UIN attribute',
            );
          }

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

          await execute(sql.insert_institution_saml_provider, {
            institution_id: params.institution_id,
            sso_login_url: body.sso_login_url,
            issuer,
            certificate: body.certificate,
            validate_audience: body.validate_audience === '1',
            want_assertions_signed: body.want_assertions_signed === '1',
            want_authn_response_signed: body.want_authn_response_signed === '1',
            // Normalize empty strings to `null`.
            uin_attribute: uinAttribute,
            uid_attribute: body.uid_attribute || null,
            name_attribute: body.name_attribute || null,
            given_name_attribute: body.given_name_attribute || null,
            family_name_attribute: body.family_name_attribute || null,
            allow_missing_name: body.allow_missing_name === '1',
            email_attribute: body.email_attribute || null,
            // The upsert query is configured to ignore these values if they're null.
            public_key: publicKey,
            private_key: privateKey,
            // For audit logs
            authn_user_id: res.locals.authn_user.id,
          });
        });
        res.redirect(req.originalUrl);
        return;
      }
      case 'delete': {
        await runInTransactionAsync(async () => {
          await lockInstitutionForIdentityConfiguration(params.institution_id);
          const identityConfigurationStatus = await selectInstitutionIdentityConfigurationStatus(
            params.institution_id,
          );
          if (identityConfigurationStatus.has_lti13_instance_with_roster_sync_allowed) {
            throw new HttpStatusError(
              400,
              'Disallow roster syncing for all affected LTI 1.3 instances before deleting the SAML configuration',
            );
          }

          await execute(sql.delete_institution_saml_provider, {
            institution_id: params.institution_id,
            // For audit logs
            authn_user_id: res.locals.authn_user.id,
          });
        });
        res.redirect(req.originalUrl);
        return;
      }
      case 'decode_assertion': {
        const samlConfig = await getSamlOptions({
          institution_id: params.institution_id,
          host: req.headers.host,
          strictMode: body.strict_mode === '1',
        });
        const saml = new SAML({
          ...samlConfig,
          // Disable clock skew checking; we might be testing with a very old SAML response.
          acceptedClockSkewMs: -1,
        });

        let xml: string;
        try {
          // @ts-expect-error https://github.com/chrisbottin/xml-formatter/issues/72
          xml = formatXml(Buffer.from(body.encoded_assertion, 'base64').toString('utf8'));
        } catch (err: any) {
          res.send(DecodedAssertion({ xml: err.message, profile: '' }));
          return;
        }

        const profile = await saml
          .validatePostResponseAsync({
            SAMLResponse: body.encoded_assertion,
          })
          .catch((err) => {
            return {
              error: err.message,
            };
          });

        res.send(DecodedAssertion({ xml, profile: JSON.stringify(profile, null, 2) }));
        return;
      }
    }
  }),
);

export default router;
