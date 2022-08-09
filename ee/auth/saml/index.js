// @ts-check
const { MultiSamlStrategy } = require('passport-saml');

const sqldb = require('../../../prairielib/lib/sql-db');
const sqlLoader = require('../../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

async function getSamlProviderForInstitution(institutionId) {
  const res = await sqldb.queryZeroOrOneRowAsync(sql.select_institution_saml_provider, {
    institution_id: institutionId,
  });
  return res.rows[0] ?? null;
}

const strategy = new MultiSamlStrategy(
  {
    passReqToCallback: true,
    getSamlOptions(req, done) {
      getSamlProviderForInstitution(req.params.institution_id).then(
        (samlProvider) => {
          if (!samlProvider) {
            return done(new Error('No SAML provider found for given institution'));
          }
          const host = req.headers.host;
          // This is also known as our Entity ID.
          const issuer = `https://${host}/saml/institution/${req.params.institution_id}`;
          done(null, {
            host,
            protocol: 'https://',
            path: `/pl/auth/institution/${req.params.institution_id}/saml/callback`,
            entryPoint: samlProvider.sso_login_url,
            issuer,
            idpIssuer: samlProvider.issuer,
            // TODO: do these two need to be configurable?
            signatureAlgorithm: 'sha256',
            digestAlgorithm: 'sha256',
            // Identity Provider's public key.
            cert: samlProvider.certificate,
            // Service Provider's private key.
            privateKey: samlProvider.private_key,
            decryptionPvk: samlProvider.private_key,
          });
        },
        (err) => done(err)
      );
    },
  },
  function (req, profile, done) {
    done(null, profile);
  }
);

module.exports.strategy = strategy;
module.exports.getSamlProviderForInstitution = getSamlProviderForInstitution;
