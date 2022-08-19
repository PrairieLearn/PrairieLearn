const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const sqldb = require('../../prairielib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const { AuthNotAllowed } = require('./authNotAllowed.html');

const sql = sqlLoader.loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institutionAuthnProviders = await sqldb.queryAsync(
      sql.select_institution_authn_providers,
      {
        institution_id: req.params.institution_id,
      }
    );
    res.send(
      AuthNotAllowed({
        institutionAuthnProviders: institutionAuthnProviders.rows,
        resLocals: res.locals,
      })
    );
  })
);

module.exports = router;
