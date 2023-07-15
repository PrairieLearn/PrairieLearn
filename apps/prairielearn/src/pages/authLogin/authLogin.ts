import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { z } from 'zod';
import { loadSqlEquiv, queryValidatedRows } from '@prairielearn/postgres';

import { isEnterprise } from '../../lib/license';
import { AuthLogin, type InstitutionAuthnProvider } from './authLogin.html';

const sql = loadSqlEquiv(__filename);
const router = Router();

const InstitutionAuthnProviderSchema = z.object({
  id: z.string(),
  long_name: z.string(),
  short_name: z.string(),
  default_authn_provider_name: z.string(),
});
const ServiceSchema = z.string().nullable();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    let institutionAuthnProviders: InstitutionAuthnProvider[] | null = null;

    if (isEnterprise()) {
      const institutionAuthnProvidersRes = await queryValidatedRows(
        sql.select_institution_authn_providers,
        {},
        InstitutionAuthnProviderSchema,
      );
      institutionAuthnProviders = institutionAuthnProvidersRes
        .map((provider) => {
          // Special case: omit the default institution.
          if (provider.id === '1') return null;

          let url: string | null = null;
          switch (provider.default_authn_provider_name) {
            case 'SAML':
              url = `/pl/auth/institution/${provider.id}/saml/login`;
              break;
            case 'Google':
              url = '/pl/oauth2login';
              break;
            case 'Azure':
              url = '/pl/azure_login';
              break;
            case 'Shibboleth':
              url = '/pl/shibcallback';
              break;
            default:
              return null;
          }

          return {
            name: `${provider.long_name} (${provider.short_name})`,
            url,
          };
        })
        .filter((provider): provider is InstitutionAuthnProvider => provider !== null);
    }

    res.send(
      AuthLogin({
        institutionAuthnProviders,
        service: ServiceSchema.parse(req.query.service ?? null),
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
