import { hydrateHtml } from '@prairielearn/preact/server';

import { PageLayout } from '../../../components/PageLayout.js';
import {
  StaffAuthnProviderSchema,
  StaffInstitutionSchema,
} from '../../../lib/client/safe-db-types.js';
import { type AuthnProvider, type Institution, type SamlProvider } from '../../../lib/db-types.js';

import { AdministratorInstitutionSsoForm } from './components/AdministratorInstitutionSsoForm.js';

export function AdministratorInstitutionSso({
  institution,
  supportedAuthenticationProviders,
  institutionSamlProvider,
  institutionAuthenticationProviders,
  resLocals,
}: {
  institution: Institution;
  supportedAuthenticationProviders: AuthnProvider[];
  institutionSamlProvider: SamlProvider | null;
  institutionAuthenticationProviders: AuthnProvider[];
  resLocals: Record<string, any>;
}) {
  return PageLayout({
    resLocals: { ...resLocals, institution },
    pageTitle: 'SSO - Institution Admin',
    navContext: {
      type: 'administrator_institution',
      page: 'administrator_institution',
      subPage: 'sso',
    },
    content: hydrateHtml(
      <AdministratorInstitutionSsoForm
        institution={StaffInstitutionSchema.parse(institution)}
        hasSamlProvider={!!institutionSamlProvider}
        supportedAuthenticationProviders={StaffAuthnProviderSchema.array().parse(
          supportedAuthenticationProviders,
        )}
        institutionAuthenticationProviders={StaffAuthnProviderSchema.array().parse(
          institutionAuthenticationProviders,
        )}
        urlPrefix={resLocals.urlPrefix}
        csrfToken={resLocals.__csrf_token}
      />,
    ),
  });
}
