var ERR = require('async-stacktrace');
var _ = require('lodash');

var sqldb = require('@prairielearn/postgres');
const error = require('@prairielearn/error');

var sql = sqldb.loadSqlEquiv(__filename);

module.exports = function (req, res, next) {
  var params = {
    instance_question_id: req.params.instance_question_id,
    assessment_id: req.params.assessment_id,
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
  };
  sqldb.query(sql.select_and_auth, params, function (err, result) {
    if (ERR(err, next)) return;
    if (result.rowCount === 0) return next(error.make(403, 'Access denied'));
    _.assign(res.locals, result.rows[0]);
    next();
  });
};
