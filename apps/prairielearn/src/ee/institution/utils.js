// @ts-check
const sqldb = require('@prairielearn/postgres');
const { config } = require('../../lib/config');

const sql = sqldb.loadSqlEquiv(__filename);

async function getInstitution(institutionId) {
  const institutionRes = await sqldb.queryOneRowAsync(sql.select_institution, {
    id: institutionId,
  });
  return institutionRes.rows[0];
}

async function getInstitutionSamlProvider(institutionId) {
  const samlProviderRes = await sqldb.queryZeroOrOneRowAsync(sql.select_institution_saml_provider, {
    institution_id: institutionId,
  });
  return samlProviderRes.rows[0] ?? null;
}

async function getInstitutionAuthenticationProviders(institutionId) {
  const authProvidersRes = await sqldb.queryAsync(sql.select_institution_authn_providers, {
    institution_id: institutionId,
  });
  return authProvidersRes.rows;
}

async function getSupportedAuthenticationProviders() {
  const authProvidersRes = await sqldb.queryAsync(sql.select_authentication_providers, {});
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

module.exports.getInstitution = getInstitution;
module.exports.getInstitutionSamlProvider = getInstitutionSamlProvider;
module.exports.getInstitutionAuthenticationProviders = getInstitutionAuthenticationProviders;
module.exports.getSupportedAuthenticationProviders = getSupportedAuthenticationProviders;
