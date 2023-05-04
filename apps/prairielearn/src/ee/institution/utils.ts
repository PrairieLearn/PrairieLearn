import {
  loadSqlEquiv,
  queryAsync,
  queryOneRowAsync,
  queryZeroOrOneRowAsync,
} from '@prairielearn/postgres';

import { config } from '../../lib/config';

const sql = loadSqlEquiv(__filename);

export async function getInstitution(institutionId) {
  const institutionRes = await queryOneRowAsync(sql.select_institution, {
    id: institutionId,
  });
  return institutionRes.rows[0];
}

export async function getInstitutionSamlProvider(institutionId) {
  const samlProviderRes = await queryZeroOrOneRowAsync(sql.select_institution_saml_provider, {
    institution_id: institutionId,
  });
  return samlProviderRes.rows[0] ?? null;
}

export async function getInstitutionAuthenticationProviders(institutionId) {
  const authProvidersRes = await queryAsync(sql.select_institution_authn_providers, {
    institution_id: institutionId,
  });
  return authProvidersRes.rows;
}

export async function getSupportedAuthenticationProviders() {
  const authProvidersRes = await queryAsync(sql.select_authentication_providers, {});
  return authProvidersRes.rows.filter((row) => {
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
