import { HttpStatusError } from '@prairielearn/error';
import { execute, loadSqlEquiv } from '@prairielearn/postgres';

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

  await execute(sql.update_institution_sso_config, {
    institution_id,
    enabled_authn_provider_ids,
    default_authn_provider_id,
    authn_user_id,
  });
}
