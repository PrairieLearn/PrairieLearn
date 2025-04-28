import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import * as authLib from '../../lib/authn.js';
import { config } from '../../lib/config.js';
import { AuthProviderFactory } from '../../lib/auth/providers/AuthProviderFactory.js';
import { LoginPage } from '../../lib/auth/LoginPage.js';

import {
  AuthLogin,
  AuthLoginUnsupportedProvider,
  type InstitutionAuthnProvider,
} from './authLogin.html.js';

const sql = loadSqlEquiv(import.meta.url);
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
  asyncHandler(async (req, res) => {
    const service = ServiceSchema.parse(req.query.service ?? null);
    const institutionId = InstitutionIdSchema.parse(req.query.institution_id ?? null);

    console.log('=== Authentication Configuration ===');
    console.log('Environment:', {
      devMode: config.devMode,
      isProduction: !config.devMode
    });
    console.log('Provider Flags:', {
      hasOauth: config.hasOauth,
      hasShib: config.hasShib,
      hideShibLogin: config.hideShibLogin,
      hasAzure: config.hasAzure
    });
    console.log('Provider Settings:', {
      googleClientId: config.googleClientId ? 'Set' : 'Not Set',
      googleClientSecret: config.googleClientSecret ? 'Set' : 'Not Set',
      shibLinkLogo: config.shibLinkLogo ? 'Set' : 'Not Set',
      shibLinkText: config.shibLinkText ? 'Set' : 'Not Set'
    });

    const loginPage = new LoginPage(service, res.locals);

    if (institutionId) {
      console.log('Institution ID provided:', institutionId);
      const supportedProviders = await queryRows(
        sql.select_supported_providers_for_institution,
        { institution_id: institutionId },
        InstitutionSupportedProvidersSchema
      );

      console.log('Institution Providers:', supportedProviders);

      supportedProviders.forEach(provider => {
        const authProvider = AuthProviderFactory.createProvider(
          provider.name,
          institutionId,
          provider.is_default
        );
        loginPage.addProvider(authProvider);
      });
    } else {
      console.log('No Institution ID - Using Global Providers');
      // Add global providers
      if (config.hasOauth) {
        console.log('Adding Google provider');
        loginPage.addProvider(AuthProviderFactory.createProvider('Google'));
      }
      if (config.hasShib && !config.hideShibLogin) {
        console.log('Adding Shibboleth provider');
        loginPage.addProvider(AuthProviderFactory.createProvider('Shibboleth'));
      }
      if (config.hasAzure) {
        console.log('Adding Azure provider');
        loginPage.addProvider(AuthProviderFactory.createProvider('Azure'));
      }
    }

    console.log('Total providers added:', loginPage.getProviderCount());
    console.log('Provider Details:', loginPage.getProviderDetails());
    console.log('===================================');

    res.send(loginPage.render());
  })
);

const DevLoginParamsSchema = z.object({
  uid: z.string().min(1),
  name: z.string().min(1),
  uin: z.string().nullable().optional().default(null),
  email: z.string().nullable().optional().default(null),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!config.devMode) {
      throw new error.HttpStatusError(404, 'Not Found');
    }

    if (req.body.__action === 'dev_login') {
      const body = DevLoginParamsSchema.parse(req.body);

      const authnParams = {
        uid: body.uid,
        name: body.name,
        uin: body.uin || null,
        email: body.email || null,
        provider: 'dev',
      };

      await authLib.loadUser(req, res, authnParams, {
        redirect: true,
      });
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  })
);

export default router;
