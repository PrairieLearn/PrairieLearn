// @ts-check
const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const { isEnterprise } = require('../../lib/license');

const sql = sqlLoader.loadSqlEquiv(__filename);
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    if (isEnterprise()) {
      const samlProvidersRes = await sqldb.queryAsync(sql.select_institution_saml_providers, {});
      res.locals.samlProviders = samlProvidersRes.rows;
    }

    // We could set res.locals.config.hasOauth = false (or
    // hasAzure) to not display those options inside the CBTF, but
    // this will also need to depend on which institution we have
    // detected (e.g., UIUC doesn't want Azure during exams, but
    // ZJUI does want it).
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

module.exports = router;
