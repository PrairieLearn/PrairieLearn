//@ts-check
var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

const { config } = require('../../lib/config');
var sqldb = require('@prairielearn/postgres');

var sql = sqldb.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  res.locals.navPage = 'home';
  res.locals.isAuthenticated = !!res.locals.authn_user;
  if (res.locals.isAuthenticated) {
    const params = {
      user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      req_date: res.locals.req_date,
      // This is a somewhat ugly escape hatch specifically for load testing. In
      // general, we don't want to clutter the home page with example course
      // enrollments, but for load testing we want to enroll a large number of
      // users in the example course and then have them find the example course
      // on the home page. So, you'd make a request like this:
      // `/pl?include_example_course_enrollments=true`
      include_example_course_enrollments: req.query.include_example_course_enrollments === 'true',
    };
    sqldb.queryOneRow(sql.select_home, params, function (err, result) {
      if (ERR(err, next)) return;

      res.locals.instructor_courses = result.rows[0].instructor_courses;
      res.locals.student_courses = result.rows[0].student_courses;

      // Example courses are only shown to users who are either instructors of
      // at least one other course, or who are admins. They're also shown
      // unconditionally in dev mode.
      if (
        res.locals.instructor_courses.length > 0 ||
        res.locals.is_administrator ||
        config.devMode
      ) {
        res.locals.instructor_courses = res.locals.instructor_courses.concat(
          result.rows[0].example_courses,
        );
      }

      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
  } else {
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }
});

module.exports = router;
