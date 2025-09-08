import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { getSupportedAuthenticationProviders } from '../../lib/authn-providers.js';
import { getCanonicalTimezones } from '../../lib/timezones.js';
import { updateInstitutionAuthnProviders } from '../../models/institutionAuthnProvider.js';

import {
  AdministratorInstitutions,
  InstitutionRowSchema,
} from './administratorInstitutions.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Helper function to ensure form values are arrays
 */
function ensureArray(value: any): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value) {
    return [value];
  }
  return [];
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institutions = await sqldb.queryRows(sql.select_institutions, InstitutionRowSchema);
    const availableTimezones = await getCanonicalTimezones();
    const allSupportedProviders = await getSupportedAuthenticationProviders();

    // Only show Google and Microsoft for institution creation. Other providers
    // can be enabled later via SSO settings.
    const supportedAuthenticationProviders = allSupportedProviders.filter(
      (provider) => provider.name === 'Google' || provider.name === 'Azure',
    );

    res.send(
      AdministratorInstitutions({
        institutions,
        availableTimezones,
        supportedAuthenticationProviders,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'add_institution') {
      // Validate required fields
      if (!req.body.short_name?.trim()) {
        throw new error.HttpStatusError(400, 'Short name is required');
      }
      if (!req.body.long_name?.trim()) {
        throw new error.HttpStatusError(400, 'Long name is required');
      }
      if (!req.body.display_timezone) {
        throw new error.HttpStatusError(400, 'Timezone is required');
      }

      // First, create the institution and get its ID
      const result = await sqldb.queryRow(
        sql.insert_institution,
        {
          short_name: req.body.short_name.trim(),
          long_name: req.body.long_name.trim(),
          display_timezone: req.body.display_timezone,
          uid_regexp: req.body.uid_regexp?.trim() || null,
        },
        z.object({ id: z.string() }),
      );

      const institutionId = result.id;

      // Handle authentication provider setup
      const allSupportedProviders = await getSupportedAuthenticationProviders();
      const supportedProviderIds = new Set(allSupportedProviders.map((p) => p.id));

      const rawEnabledAuthnProviderIds = ensureArray(req.body.enabled_authn_provider_ids ?? []);
      const enabledProviders = rawEnabledAuthnProviderIds.filter((id) =>
        supportedProviderIds.has(id),
      );

      // Set up the authentication providers for the new institution (if any selected)
      await updateInstitutionAuthnProviders({
        institution_id: institutionId,
        enabled_authn_provider_ids: enabledProviders,
        authn_user_id: res.locals.authn_user.user_id.toString(),
        allow_no_providers: true,
      });
    } else {
      throw new error.HttpStatusError(400, 'Unknown action');
    }

    res.redirect(req.originalUrl);
  }),
);

export default router;
