const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const sqlDb = require('../../../prairielib/lib/sql-db');
const sqlLoader = require('../../../prairielib/lib/sql-loader');
const error = require('../../../prairielib/lib/error');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      return next(error.make(403, 'Access denied (must be a student data viewer)'));
    }
    var params = {
      assessment_id: res.locals.assessment.id,
      user_id: res.locals.authz_data.user.user_id,
    };
    const result = await sqlDb.queryAsync(sql.select_questions_manual_grading, params);
    res.locals.questions = result.rows;
    res.locals.num_open_instances = result.rows[0]?.num_open_instances || 0;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  })
);

module.exports = router;
