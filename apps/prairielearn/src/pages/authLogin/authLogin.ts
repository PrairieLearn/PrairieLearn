import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { z } from 'zod';
import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryValidatedRows } from '@prairielearn/postgres';

import { isEnterprise } from '../../lib/license';
import { AuthLogin, type InstitutionAuthnProvider } from './authLogin.html';
import { config } from '../../lib/config';
import * as authLib from '../../lib/authn';

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

const DevLoginParamsSchema = z.object({
  uid: z.string().nonempty(),
  name: z.string().nonempty(),
  uin: z.string().nullable().optional().default(null),
});

router.post(
  '/',
  asyncHandler(async (req, res, _next) => {
    if (!config.devMode) {
      throw error.make(404, 'Not Found');
    }

    if (req.body.__action === 'dev_login') {
      const body = DevLoginParamsSchema.parse(req.body);

      const authnParams = {
        uid: body.uid,
        name: body.name,
        uin: body.uin,
        provider: 'dev',
      };

      await authLib.loadUser(req, res, authnParams, {
        redirect: true,
        pl_authn_cookie: true,
      });
    } else {
      throw error.make(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
