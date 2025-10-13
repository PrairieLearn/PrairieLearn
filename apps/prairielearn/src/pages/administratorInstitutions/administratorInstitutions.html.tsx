import { z } from 'zod';

import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { type AuthnProvider, InstitutionSchema } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';
import { type Timezone } from '../../lib/timezone.shared.js';

import { AdministratorInstitutionsTable } from './components/AdministratorInstitutionsTable.js';

export const InstitutionRowSchema = z.object({
  institution: InstitutionSchema,
  authn_providers: z.array(z.string()),
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
  supportedAuthenticationProviders: AuthnProvider[];
  resLocals: Record<string, any>;
}) {
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
          csrfToken={resLocals.__csrf_token}
          isEnterprise={isEnterprise()}
        />
      </Hydrate>
    ),
  });
}
