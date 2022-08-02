// @ts-check
const ERR = require('async-stacktrace');
const { MultiSamlStrategy } = require('passport-saml');

const sqldb = require('../../prairielib/lib/sql-db');

const strategy = new MultiSamlStrategy(
  {
    passReqToCallback: true,
    getSamlOptions(req, done) {
      sqldb.queryZeroOrOneRow(
        'SELECT * FROM saml_providers WHERE institution_id = $id;',
        { id: req.params.institution_id },
        (err, result) => {
          if (ERR(err, done)) return;
          if (result.rowCount === 0) {
            return done(new Error('No SAML provider found for given institution'));
          }
          const samlProvider = result.rows[0];
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
            cert: samlProvider.certificate,
          });
        }
      );
    },
  },
  function (req, profile, done) {
    console.log('request', req);
    console.log('profile', profile);
    done(null);
  }
);

module.exports.strategy = strategy;
