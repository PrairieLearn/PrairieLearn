const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const sqldb = require('../../prairielib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const { InstitutionAdminSaml } = require('./institutionAdminSaml.html');

const sql = sqlLoader.loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    console.log(req.params);
    const institutionRes = await sqldb.queryOneRowAsync(sql.select_institution, {
      id: req.params.institution_id,
    });
    const institution = institutionRes.rows[0];
    res.locals.institution = institution;
    res.send(InstitutionAdminSaml({ resLocals: res.locals }));
  })
);

module.exports = router;
