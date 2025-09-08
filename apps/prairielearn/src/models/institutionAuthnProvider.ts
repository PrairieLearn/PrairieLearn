import { execute, loadSqlEquiv } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

interface UpdateInstitutionAuthnProvidersOptions {
  institution_id: string;
  enabled_authn_provider_ids: string[];
  default_authn_provider_id?: string | null;
  authn_user_id: string;
  /** If true, allows setting no auth providers (for institution creation) */
  allow_no_providers?: boolean;
}

/**
 * Updates the authentication providers for an institution.
 * This will delete any existing providers that are not in the new list
 * and insert any new providers that are not already associated.
 */
export async function updateInstitutionAuthnProviders(
  options: UpdateInstitutionAuthnProvidersOptions,
): Promise<void> {
  const {
    institution_id,
    enabled_authn_provider_ids,
    default_authn_provider_id = null,
    authn_user_id,
    allow_no_providers = false,
  } = options;

  if (!allow_no_providers && enabled_authn_provider_ids.length === 0) {
    throw new Error('At least one authentication provider must be enabled');
  }

  // Validate that default provider is in the enabled list (if set)
  if (
    default_authn_provider_id !== null &&
    !enabled_authn_provider_ids.includes(default_authn_provider_id)
  ) {
    throw new Error('Default authentication provider must be one of the enabled providers');
  }

  // If no providers selected and we allow it, just clear all providers
  if (enabled_authn_provider_ids.length === 0 && allow_no_providers) {
    await execute(sql.delete_institution_authn_providers, {
      institution_id,
      authn_user_id,
    });
    return;
  }

  await execute(sql.update_institution_sso_config, {
    institution_id,
    enabled_authn_provider_ids,
    default_authn_provider_id,
    authn_user_id,
  });
}
