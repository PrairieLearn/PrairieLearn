//@ts-check
var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/postgres');

var sql = sqldb.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  var params = {
    course_instance_id: res.locals.course_instance.id,
    user_id: res.locals.user.user_id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
  };
  sqldb.query(sql.select_assessment_instances, params, function (err, result) {
    if (ERR(err, next)) return;
    res.locals.rows = result.rows;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
});

module.exports = router;
