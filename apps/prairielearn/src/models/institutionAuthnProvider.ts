import { execute, loadSqlEquiv } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Updates the authentication providers for an institution.
 * This will delete any existing providers that are not in the new list
 * and insert any new providers that are not already associated.
 */
export async function updateInstitutionAuthnProviders(
  institution_id: string,
  enabled_authn_provider_ids: string[],
  default_authn_provider_id: string | null,
  authn_user_id: string,
): Promise<void> {
  if (enabled_authn_provider_ids.length === 0) {
    throw new Error('At least one authentication provider must be enabled');
  }

  // Validate that default provider is in the enabled list (if set)
  if (
    default_authn_provider_id !== null &&
    !enabled_authn_provider_ids.includes(default_authn_provider_id)
  ) {
    throw new Error('Default authentication provider must be one of the enabled providers');
  }

  await execute(sql.update_institution_sso_config, {
    institution_id,
    enabled_authn_provider_ids,
    default_authn_provider_id,
    authn_user_id,
  });
}

/**
 * Inserts authentication providers for a newly created institution.
 * This is used during institution creation to set up default providers.
 */
export async function insertInstitutionAuthnProviders(
  institution_id: string,
  enabled_authn_provider_ids: string[],
  authn_user_id: string,
): Promise<void> {
  // Allow creating institutions with no auth providers initially
  if (enabled_authn_provider_ids.length === 0) {
    return;
  }

  await execute(sql.insert_institution_authn_providers, {
    institution_id,
    enabled_authn_provider_ids,
    authn_user_id,
  });
}

/**
 * Deletes all authentication providers for an institution.
 */
export async function deleteInstitutionAuthnProviders(
  institution_id: string,
  authn_user_id: string,
): Promise<void> {
  await execute(sql.delete_institution_authn_providers, {
    institution_id,
    authn_user_id,
  });
}
