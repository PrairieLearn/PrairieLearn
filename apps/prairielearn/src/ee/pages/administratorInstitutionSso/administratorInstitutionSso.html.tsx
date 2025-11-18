import { hydrateHtml } from '@prairielearn/preact/server';

import { getPageContext } from '../../../lib/client/page-context.js';
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
  const pageContext = getPageContext(resLocals, { withAuthzData: false });

  return hydrateHtml(
    <AdministratorInstitutionSsoForm
      institution={StaffInstitutionSchema.parse(institution)}
      hasSamlProvider={!!institutionSamlProvider}
      supportedAuthenticationProviders={StaffAuthnProviderSchema.array().parse(
        supportedAuthenticationProviders,
      )}
      institutionAuthenticationProviders={StaffAuthnProviderSchema.array().parse(
        institutionAuthenticationProviders,
      )}
      urlPrefix={pageContext.urlPrefix}
      csrfToken={pageContext.__csrf_token}
    />,
  );
}
