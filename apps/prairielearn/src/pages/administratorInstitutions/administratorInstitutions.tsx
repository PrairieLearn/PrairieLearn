import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { getSupportedAuthenticationProviders } from '../../lib/authn-providers.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import {
  AdminInstitutionSchema,
  StaffAuthnProviderSchema,
} from '../../lib/client/safe-db-types.js';
import { getAdministratorTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { AuthnProviderSchema } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';
import { getCanonicalTimezones } from '../../lib/timezones.js';

import { AdministratorInstitutionsTable } from './components/AdministratorInstitutionsTable.js';

const InstitutionRowSchema = z.object({
  institution: AdminInstitutionSchema,
  authn_providers: z.array(AuthnProviderSchema.shape.name),
});

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { authn_user } = extractPageContext(res.locals, {
      pageType: 'plain',
      accessType: 'instructor',
      withAuthzData: false,
    });
    const institutions = await sqldb.queryRows(sql.select_institutions, InstitutionRowSchema);
    const availableTimezones = await getCanonicalTimezones();
    const allSupportedProviders = await getSupportedAuthenticationProviders();

    // Only show Google and Microsoft for institution creation. Other providers
    // can be enabled later via SSO settings.
    const supportedAuthenticationProviders = allSupportedProviders
      .filter((provider) => provider.name === 'Google' || provider.name === 'Azure')
      .map((provider) => StaffAuthnProviderSchema.parse(provider));

    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: getAdministratorTrpcUrl(),
        authn_user_id: authn_user.id,
      },
      config.secretKey,
    );

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
              trpcCsrfToken={trpcCsrfToken}
              isEnterprise={isEnterprise()}
              aiSecretsConfigured={!!config.administratorOpenAiApiKey}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
