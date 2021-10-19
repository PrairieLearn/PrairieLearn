var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var config = require('../../lib/config');
var sqldb = require('../../prairielib/lib/sql-db');
var sqlLoader = require('../../prairielib/lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  res.locals.isAuthenticated = !!res.locals.authn_user;
  if (res.locals.isAuthenticated) {
    const params = {
      user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      req_date: res.locals.req_date,
    };
    sqldb.queryOneRow(sql.select_home, params, function (err, result) {
      if (ERR(err, next)) return;

      res.locals.instructor_courses = result.rows[0].instructor_courses;
      if (res.locals.instructor_courses.length > 0 || config.devMode) {
        // If the list of instructor courses is non-empty, then prepend
        // with the list of example courses (otherwise, discard the list
        // of example courses).
        res.locals.instructor_courses = res.locals.instructor_courses.concat(
          result.rows[0].example_courses,
        );
      }
      res.locals.student_courses = result.rows[0].student_courses;

      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
  } else {
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }
});

module.exports = router;
