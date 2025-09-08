import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { updateInstitutionAuthnProviders } from '../../../models/institutionAuthnProvider.js';
import {
  getInstitution,
  getInstitutionAuthenticationProviders,
  getInstitutionSamlProvider,
  getSupportedAuthenticationProviders,
} from '../../lib/institution.js';

import { AdministratorInstitutionSso } from './administratorInstitutionSso.html.js';

const router = Router({ mergeParams: true });

const enabledProvidersSchema = z.array(z.string());

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const supportedAuthenticationProviders = await getSupportedAuthenticationProviders();
    const supportedAuthenticationProviderIds = new Set(
      supportedAuthenticationProviders.map((p) => p.id),
    );

    const rawEnabledAuthnProviderIds = ensureArray(req.body.enabled_authn_provider_ids ?? []);
    const enabledProviders = enabledProvidersSchema
      .parse(rawEnabledAuthnProviderIds)
      .filter((id) => supportedAuthenticationProviderIds.has(id));
    if (enabledProviders.length === 0) {
      throw new Error('At least one authentication provider must be enabled');
    }

    let defaultProvider = req.body.default_authn_provider_id;
    if (defaultProvider === '') defaultProvider = null;

    // Use the shared model function instead of inline SQL
    await updateInstitutionAuthnProviders(
      req.params.institution_id,
      enabledProviders,
      defaultProvider,
      res.locals.authn_user.user_id.toString(),
    );

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
      AdministratorInstitutionSso({
        supportedAuthenticationProviders,
        institution,
        institutionSamlProvider,
        institutionAuthenticationProviders,
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
