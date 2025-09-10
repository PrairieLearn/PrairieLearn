import { loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';

import {
  type AuthnProvider,
  AuthnProviderSchema,
  type Institution,
  InstitutionSchema,
  type SamlProvider,
  SamlProviderSchema,
} from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

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
