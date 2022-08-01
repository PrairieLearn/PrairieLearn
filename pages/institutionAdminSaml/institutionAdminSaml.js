const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const sqldb = require('../../prairielib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const { InstitutionAdminSaml } = require('./institutionAdminSaml.html');

const sql = sqlLoader.loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

router.post(
  '/',
  asyncHandler(async (req, res) => {
    console.log(req.body);
    if (req.body.saml_enabled) {
      console.log('inserting provider');
      await sqldb.queryAsync(sql.insert_institution_saml_provider, {
        institution_id: req.params.institution_id,
        sso_login_url: req.body.sso_login_url ?? 'TESTING',
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
    const institutionRes = await sqldb.queryOneRowAsync(sql.select_institution, {
      id: req.params.institution_id,
    });
    const institution = institutionRes.rows[0];

    const samlProviderRes = await sqldb.queryZeroOrOneRowAsync(
      sql.select_institution_saml_provider,
      {
        institution_id: req.params.institution_id,
      }
    );
    const samlProvider = samlProviderRes.rows[0];
    console.log(samlProvider);

    res.locals.institution = institution;
    res.send(InstitutionAdminSaml({ institution, samlProvider, resLocals: res.locals }));
  })
);

module.exports = router;
