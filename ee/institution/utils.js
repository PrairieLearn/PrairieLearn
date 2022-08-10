// @ts-check
const sqldb = require('../../prairielib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

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

async function getAllAuthenticationProviders() {
  const authProvidersRes = await sqldb.queryAsync(sql.select_authentication_providers, {});
  return authProvidersRes.rows;
}

module.exports.getInstitution = getInstitution;
module.exports.getInstitutionSamlProvider = getInstitutionSamlProvider;
module.exports.getInstitutionAuthenticationProviders = getInstitutionAuthenticationProviders;
module.exports.getAllAuthenticationProviders = getAllAuthenticationProviders;
