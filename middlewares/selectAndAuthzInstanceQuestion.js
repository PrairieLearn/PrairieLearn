var ERR = require('async-stacktrace');
var _ = require('lodash');

var sqldb = require('../prairielib/lib/sql-db');
var sqlLoader = require('../prairielib/lib/sql-loader');
var error = require('../prairielib/lib/error');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function (req, res, next) {
  var params = {
    instance_question_id: req.params.instance_question_id,
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
