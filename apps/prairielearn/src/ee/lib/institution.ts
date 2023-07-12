import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';

import { config } from '../../lib/config';
import {
  AuthnProviderSchema,
  InstitutionSchema,
  SamlProviderSchema,
  type AuthnProvider,
  type Institution,
  type SamlProvider,
} from '../../lib/db-types';

const sql = loadSqlEquiv(__filename);

export async function getInstitution(institution_id: string): Promise<Institution> {
  return await queryRow(sql.select_institution, { id: institution_id }, InstitutionSchema);
}

export async function getInstitutionSamlProvider(
  institution_id: string,
): Promise<SamlProvider | null> {
  return await queryOptionalRow(
    sql.select_institution_saml_provider,
    { institution_id },
    SamlProviderSchema,
  );
}

export async function getInstitutionAuthenticationProviders(
  institution_id: string,
): Promise<AuthnProvider[]> {
  return await queryRows(
    sql.select_institution_authn_providers,
    { institution_id },
    AuthnProviderSchema,
  );
}

export async function getSupportedAuthenticationProviders(): Promise<AuthnProvider[]> {
  const authProviders = await queryRows(sql.select_authentication_providers, AuthnProviderSchema);
  return authProviders.filter((row) => {
    if (row.name === 'Shibboleth') {
      return config.hasShib;
    }
    if (row.name === 'Google') {
      return config.hasOauth;
    }
    if (row.name === 'Azure') {
      return config.hasAzure;
    }

    // Default to true for all other providers.
    return true;
  });
}
