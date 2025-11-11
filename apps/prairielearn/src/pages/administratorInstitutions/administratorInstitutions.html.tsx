import { z } from 'zod';

import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { getPageContext } from '../../lib/client/page-context.js';
import { AdminInstitutionSchema, type StaffAuthnProvider } from '../../lib/client/safe-db-types.js';
import { AuthnProviderSchema } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';
import { type Timezone } from '../../lib/timezone.shared.js';

import { AdministratorInstitutionsTable } from './components/AdministratorInstitutionsTable.js';

export const InstitutionRowSchema = z.object({
  institution: AdminInstitutionSchema,
  authn_providers: z.array(AuthnProviderSchema.shape.name),
});
type InstitutionRow = z.infer<typeof InstitutionRowSchema>;

export function AdministratorInstitutions({
  institutions,
  availableTimezones,
  supportedAuthenticationProviders,
  resLocals,
}: {
  institutions: InstitutionRow[];
  availableTimezones: Timezone[];
  supportedAuthenticationProviders: StaffAuthnProvider[];
  resLocals: Record<string, any>;
}) {
  const pageContext = getPageContext(resLocals, { withAuthzData: false });

  return PageLayout({
    resLocals,
    pageTitle: 'Institutions',
    navContext: {
      type: 'plain',
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
  });
}
