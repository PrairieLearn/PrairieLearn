var ERR = require('async-stacktrace');
import express from 'express';

import * as sqldb from '@prairielearn/postgres';

var router = express.Router();
var sql = sqldb.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  var params = {
    course_id: res.locals.course.id,
  };
  sqldb.query(sql.select_assessment_sets, params, function (err, result) {
    if (ERR(err, next)) return;
    res.locals.assessment_sets = result.rows;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

module.exports = router;
