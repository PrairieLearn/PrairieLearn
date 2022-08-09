// @ts-check
const { Router } = require('express');
const asyncHandler = require('express-async-handler');
const pem = require('pem');

const sqldb = require('../../../prairielib/sql-db');
const sqlLoader = require('../../../prairielib/lib/sql-loader');
const { InstitutionAdminSaml } = require('./saml.html');
const { getInstitution, getSamleProviderForInstitution } = require('./utils');

const sql = sqlLoader.loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

/**
 * @param {import('pem').CertificateCreationOptions} options
 * @returns {Promise<import('pem').CertificateCreationResult>}
 */
function createCertificate(options) {
  return new Promise((resolve, reject) => {
    pem.createCertificate(options, (err, keys) => {
      if (err) return reject(err);
      resolve(keys);
    });
  });
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    console.log(req.body);
    if (req.body.saml_enabled) {
      await sqldb.runInTransactionAsync(async () => {
        // Check if there's an existing SAML provider configured. We'll use
        // that to determine if we need to create a new keypair. That is, we'll
        // only create a new keypair if there's no existing provider.
        const samlProviderRes = await sqldb.queryZeroOrOneRowAsync(
          sql.select_institution_saml_provider,
          {
            institution_id: req.params.institution_id,
          }
        );

        let publicKey, privateKey;
        console.log(samlProviderRes);
        if (samlProviderRes.rowCount === 0) {
          console.log('Creating new keypair');
          // No existing provider; create a new keypair with OpenSSL.
          const keys = await createCertificate({
            selfSigned: true,
            // Make certificate valid for 30 years.
            // TODO: persist expiry time in database so that in the future,
            // we can automatically warn users about expiring certificates.
            days: 265 * 30,
            // We use the host header as a shortcut to avoid the need to know
            // a given installation's domain name.
            commonName: req.headers.host,
          });
          console.log(keys);
          publicKey = keys.certificate;
          privateKey = keys.serviceKey;
        }

        await sqldb.queryAsync(sql.insert_institution_saml_provider, {
          institution_id: req.params.institution_id,
          sso_login_url: req.body.sso_login_url,
          issuer: req.body.issuer,
          certificate: req.body.certificate,
          // The upsert query is configured to ignore these values if they're null.
          public_key: publicKey,
          private_key: privateKey,
        });
      });
    } else {
      console.log('deleting provider');
      await sqldb.queryAsync(sql.delete_institution_saml_provider, {
        institution_id: req.params.institution_id,
      });
    }
    res.redirect(req.originalUrl);
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const samlProvider = await getSamleProviderForInstitution(req.params.institution_id);

    res.send(
      InstitutionAdminSaml({
        institution,
        samlProvider,
        host: req.headers.host,
        resLocals: res.locals,
      })
    );
  })
);

module.exports = router;
