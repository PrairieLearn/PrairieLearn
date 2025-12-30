import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/preact/server';
import { ArrayFromCheckboxSchema, IdSchema } from '@prairielearn/zod';

import { PageLayout } from '../../components/PageLayout.js';
import { getSupportedAuthenticationProviders } from '../../lib/authn-providers.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import {
  AdminInstitutionSchema,
  StaffAuthnProviderSchema,
} from '../../lib/client/safe-db-types.js';
import { AuthnProviderSchema } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';
import { getCanonicalTimezones } from '../../lib/timezones.js';
import { updateInstitutionAuthnProviders } from '../../models/institution-authn-provider.js';

import { AdministratorInstitutionsTable } from './components/AdministratorInstitutionsTable.js';

const InstitutionRowSchema = z.object({
  institution: AdminInstitutionSchema,
  authn_providers: z.array(AuthnProviderSchema.shape.name),
});

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institutions = await sqldb.queryRows(sql.select_institutions, InstitutionRowSchema);
    const availableTimezones = await getCanonicalTimezones();
    const allSupportedProviders = await getSupportedAuthenticationProviders();

    // Only show Google and Microsoft for institution creation. Other providers
    // can be enabled later via SSO settings.
    const supportedAuthenticationProviders = allSupportedProviders
      .filter((provider) => provider.name === 'Google' || provider.name === 'Azure')
      .map((provider) => StaffAuthnProviderSchema.parse(provider));

    const pageContext = extractPageContext(res.locals, {
      pageType: 'plain',
      accessType: 'instructor',
      withAuthzData: false,
    });

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Institutions',
        navContext: {
          type: 'administrator',
          page: 'admin',
          subPage: 'institutions',
        },
        options: {
          fullWidth: true,
        },
        content: (
          <Hydrate>
            <AdministratorInstitutionsTable
              institutions={institutions}
              availableTimezones={availableTimezones}
              supportedAuthenticationProviders={supportedAuthenticationProviders}
              csrfToken={pageContext.__csrf_token}
              isEnterprise={isEnterprise()}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'add_institution') {
      const body = z
        .object({
          short_name: z.string().trim().min(1),
          long_name: z.string().trim().min(1),
          display_timezone: z.string().trim().min(1),
          uid_regexp: z.string().trim(),
          enabled_authn_provider_ids: ArrayFromCheckboxSchema,
        })
        .parse(req.body);

      // First, create the institution and get its ID
      const institutionId = await sqldb.queryRow(
        sql.insert_institution,
        {
          short_name: body.short_name.trim(),
          long_name: body.long_name.trim(),
          display_timezone: body.display_timezone.trim(),
          uid_regexp: body.uid_regexp || null,
        },
        IdSchema,
      );

      // Handle authentication provider setup
      const allSupportedProviders = await getSupportedAuthenticationProviders();
      const supportedProviderIds = new Set(allSupportedProviders.map((p) => p.id));

      const enabledProviders = body.enabled_authn_provider_ids.filter((id) =>
        supportedProviderIds.has(id),
      );

      // Set up the authentication providers for the new institution (if any selected)
      await updateInstitutionAuthnProviders({
        institution_id: institutionId,
        enabled_authn_provider_ids: enabledProviders,
        default_authn_provider_id: null,
        authn_user_id: res.locals.authn_user.id.toString(),
      });

      flash('success', `Institution "${body.short_name}" created successfully.`);

      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, 'Unknown action');
    }
  }),
);

export default router;
