//@ts-check
var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/postgres');

var sql = sqldb.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  var params = {
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    user_id: res.locals.user.user_id,
    req_date: res.locals.req_date,
    assessments_group_by: res.locals.course_instance.assessments_group_by,
  };
  sqldb.query(sql.select_assessments, params, function (err, result) {
    if (ERR(err, next)) return;
    res.locals.rows = result.rows;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

module.exports = router;
