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

export async function getInstitution(institutionId: string): Promise<Institution> {
  const institutionRes = await queryRow(
    sql.select_institution,
    { id: institutionId },
    InstitutionSchema
  );
  return institutionRes;
}

export async function getInstitutionSamlProvider(
  institutionId: string
): Promise<SamlProvider | null> {
  return await queryOptionalRow(
    sql.select_institution_saml_provider,
    { institution_id: institutionId },
    SamlProviderSchema
  );
}

export async function getInstitutionAuthenticationProviders(
  institutionId: string
): Promise<AuthnProvider[]> {
  return await queryRows(
    sql.select_institution_authn_providers,
    { institution_id: institutionId },
    AuthnProviderSchema
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
