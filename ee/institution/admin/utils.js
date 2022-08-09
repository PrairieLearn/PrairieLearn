// @ts-check
const sqldb = require('../../../prairielib/sql-db');
const sqlLoader = require('../../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

async function getInstitution(institutionId) {
  const institutionRes = await sqldb.queryOneRowAsync(sql.select_institution, {
    id: institutionId,
  });
  return institutionRes.rows[0];
}

async function getSamleProviderForInstitution(institutionId) {
  const samlProviderRes = await sqldb.queryZeroOrOneRowAsync(sql.select_institution_saml_provider, {
    institution_id: institutionId,
  });
  return samlProviderRes.rows[0] ?? null;
}

module.exports.getInstitution = getInstitution;
module.exports.getSamleProviderForInstitution = getSamleProviderForInstitution;
