import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { ArrayFromCheckboxSchema } from '@prairielearn/zod';

import { PageLayout } from '../../../components/PageLayout.js';
import { getSupportedAuthenticationProviders } from '../../../lib/authn-providers.js';
import { updateInstitutionAuthnProviders } from '../../../models/institution-authn-provider.js';
import {
  getInstitution,
  getInstitutionAuthenticationProviders,
  getInstitutionSamlProvider,
} from '../../lib/institution.js';

import { AdministratorInstitutionSso } from './administratorInstitutionSso.html.js';

const router = Router({ mergeParams: true });

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const supportedAuthenticationProviders = await getSupportedAuthenticationProviders();
    const supportedAuthenticationProviderIds = new Set(
      supportedAuthenticationProviders.map((p) => p.id),
    );

    const body = z
      .object({
        default_authn_provider_id: z.string().transform((s) => (s === '' ? null : s)),
        enabled_authn_provider_ids: ArrayFromCheckboxSchema,
      })
      .parse(req.body);

    const enabledProviders = body.enabled_authn_provider_ids.filter((id) =>
      supportedAuthenticationProviderIds.has(id),
    );

    await updateInstitutionAuthnProviders({
      institution_id: req.params.institution_id,
      enabled_authn_provider_ids: enabledProviders,
      default_authn_provider_id: body.default_authn_provider_id,
      authn_user_id: res.locals.authn_user.user_id.toString(),
    });

    res.redirect(req.originalUrl);
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const supportedAuthenticationProviders = await getSupportedAuthenticationProviders();

    const institution = await getInstitution(req.params.institution_id);
    const institutionSamlProvider = await getInstitutionSamlProvider(req.params.institution_id);
    const institutionAuthenticationProviders = await getInstitutionAuthenticationProviders(
      req.params.institution_id,
    );

    res.send(
      PageLayout({
        resLocals: { ...res.locals, institution },
        pageTitle: 'SSO - Institution Admin',
        navContext: {
          type: 'administrator_institution',
          page: 'administrator_institution',
          subPage: 'sso',
        },
        content: AdministratorInstitutionSso({
          supportedAuthenticationProviders,
          institution,
          institutionSamlProvider,
          institutionAuthenticationProviders,
          resLocals: res.locals,
        }),
      }),
    );
  }),
);

export default router;
