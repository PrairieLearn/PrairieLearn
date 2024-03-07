var ERR = require('async-stacktrace');
var _ = require('lodash');

var sqldb = require('@prairielearn/postgres');
const error = require('@prairielearn/error');

var sql = sqldb.loadSqlEquiv(__filename);

module.exports = function (req, res, next) {
  if (res.locals.course_instance) {
    const params = {
      question_id: req.params.question_id,
      course_instance_id: res.locals.course_instance.id,
    };
    sqldb.queryZeroOrOneRow(
      sql.select_and_auth_with_course_instance,
      params,
      function (err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount === 0) return next(error.make(403, 'Access denied'));
        _.assign(res.locals, result.rows[0]);
        next();
      },
    );
  } else {
    const params = {
      question_id: req.params.question_id,
      course_id: res.locals.course.id,
    };
    sqldb.queryZeroOrOneRow(sql.select_and_auth, params, function (err, result) {
      if (ERR(err, next)) return;
      if (result.rowCount === 0) return next(error.make(403, 'Access denied'));
      _.assign(res.locals, result.rows[0]);
      next();
    });
  }
};
