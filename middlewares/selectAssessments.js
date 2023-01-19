const ERR = require('async-stacktrace');

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function (req, res, next) {
  var params = {
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
    req_date: res.locals.req_date,
    assessment_set_id: res.locals.assessment_set.id,
  };
  sqldb.query(sql.select_assessments, params, (err, result) => {
    if (ERR(err, next)) return;
    res.locals.assessments = result.rows;
    next();
  });
};
