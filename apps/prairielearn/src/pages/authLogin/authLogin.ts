import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { z } from 'zod';
import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import {
  AuthLogin,
  AuthLoginUnsupportedProvider,
  type InstitutionAuthnProvider,
} from './authLogin.html';
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
const InstitutionSupportedProvidersSchema = z.object({
  name: z.string(),
  is_default: z.boolean(),
});
const ServiceSchema = z.string().nullable();
const InstitutionIdSchema = z.string().nullable();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    const service = ServiceSchema.parse(req.query.service ?? null);

    if (req.query.unsupported_provider === 'true') {
      // This requires an institution ID to work. If for some reason there
      // isn't one in the query params, redirect back to the normal login
      // page without any query params.
      const institutionId = InstitutionIdSchema.parse(req.query.institution_id ?? null);
      if (!institutionId) {
        res.redirect(req.baseUrl);
        return;
      }

      // Look up the supported providers for this institution.
      const supportedProviders = await queryRows(
        sql.select_supported_providers_for_institution,
        {
          institution_id: institutionId,
        },
        InstitutionSupportedProvidersSchema,
      );

      res.send(
        AuthLoginUnsupportedProvider({
          institutionId,
          supportedProviders,
          service,
          resLocals: res.locals,
        }),
      );
      return;
    }

    const institutionAuthnProvidersRes = await queryRows(
      sql.select_institution_authn_providers,
      InstitutionAuthnProviderSchema,
    );
    const institutionAuthnProviders = institutionAuthnProvidersRes
      .map((provider) => {
        // Special case: omit the default institution in production.
        if (provider.id === '1' && config.devMode === false) return null;

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
          name:
            provider.long_name !== provider.short_name
              ? `${provider.long_name} (${provider.short_name})`
              : provider.long_name,
          url,
        };
      })
      .filter((provider): provider is InstitutionAuthnProvider => provider !== null);

    res.send(AuthLogin({ service, institutionAuthnProviders, resLocals: res.locals }));
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
