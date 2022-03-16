const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const sqlDb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    debug('GET /');
    var params = {
      assessment_id: res.locals.assessment.id,
      user_id: res.locals.authz_data.user.user_id,
    };
    const result = await sqlDb.queryAsync(sql.select_questions_manual_grading, params);
    res.locals.questions = result.rows;
    res.locals.num_open_instances = result.rows[0]?.num_open_instances || 0;
    debug('render page');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

module.exports = router;
