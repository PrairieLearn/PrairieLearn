import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { type AuthnProvider, AuthnProviderSchema } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';
import { getCanonicalTimezones } from '../../lib/timezones.js';
import { insertInstitutionAuthnProviders } from '../../models/institutionAuthnProvider.js';

import {
  AdministratorInstitutions,
  InstitutionRowSchema,
} from './administratorInstitutions.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Get supported authentication providers based on configuration.
 * Similar to the enterprise version but simplified for this context.
 */
async function getSupportedAuthenticationProviders(): Promise<AuthnProvider[]> {
  const authProviders = await sqldb.queryRows(
    sql.select_authentication_providers,
    AuthnProviderSchema,
  );
  return authProviders.filter((row) => {
    if (row.name === 'Shibboleth') {
      return config.hasShib;
    }
    if (row.name === 'Google') {
      return config.hasOauth;
    }
    if (row.name === 'Azure') {
      return config.hasAzure;
    }

    // Default to true for all other providers.
    return true;
  });
}

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
    const supportedAuthenticationProviders = await getSupportedAuthenticationProviders();
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
      const supportedAuthenticationProviders = await getSupportedAuthenticationProviders();
      const supportedProviderIds = new Set(supportedAuthenticationProviders.map((p) => p.id));

      const rawEnabledAuthnProviderIds = ensureArray(req.body.enabled_authn_provider_ids ?? []);
      const enabledProviders = rawEnabledAuthnProviderIds.filter((id) =>
        supportedProviderIds.has(id),
      );

      // Set up the authentication providers for the new institution (if any selected)
      await insertInstitutionAuthnProviders(
        institutionId,
        enabledProviders,
        res.locals.authn_user.user_id.toString(),
      );
    } else {
      throw new error.HttpStatusError(400, 'Unknown action');
    }

    res.redirect(req.originalUrl);
  }),
);

export default router;
