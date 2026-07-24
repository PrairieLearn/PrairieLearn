import { HttpStatusError } from '@prairielearn/error';
import { execute, loadSqlEquiv, runInTransactionAsync } from '@prairielearn/postgres';

import { hasSamlAsSoleInstitutionalAuthenticationProvider } from '../lib/authn-provider-classification.js';
import {
  lockInstitutionForIdentityConfiguration,
  selectAuthenticationProviderNames,
  selectInstitutionIdentityConfigurationStatus,
} from '../lib/institution-identity.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Updates the authentication providers for an institution.
 * This will delete any existing providers that are not in the new list
 * and insert any new providers that are not already associated.
 */
export async function updateInstitutionAuthnProviders({
  institution_id,
  enabled_authn_provider_ids,
  default_authn_provider_id = null,
  authn_user_id,
}: {
  institution_id: string;
  enabled_authn_provider_ids: string[];
  default_authn_provider_id: string | null;
  authn_user_id: string;
}): Promise<void> {
  // Validate that default provider is in the enabled list (if set)
  if (
    default_authn_provider_id !== null &&
    !enabled_authn_provider_ids.includes(default_authn_provider_id)
  ) {
    throw new HttpStatusError(
      400,
      'Default authentication provider must be one of the enabled providers',
    );
  }

  await runInTransactionAsync(async () => {
    await lockInstitutionForIdentityConfiguration(institution_id);

    const identityStatus = await selectInstitutionIdentityConfigurationStatus(institution_id);

    if (identityStatus.has_configured_lti13_uin) {
      const enabledProviderNames = await selectAuthenticationProviderNames(
        enabled_authn_provider_ids,
      );
      if (
        !identityStatus.saml_uin_attribute ||
        !hasSamlAsSoleInstitutionalAuthenticationProvider(enabledProviderNames)
      ) {
        throw new HttpStatusError(
          400,
          'Institutions with an LTI 1.3 UIN attribute must keep SAML as their sole enabled institutional authentication provider with a configured UIN attribute',
        );
      }
    }

    await execute(sql.update_institution_sso_config, {
      institution_id,
      enabled_authn_provider_ids,
      default_authn_provider_id,
      authn_user_id,
    });
  });
}
