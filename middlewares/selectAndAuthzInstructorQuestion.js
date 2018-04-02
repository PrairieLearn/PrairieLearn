var ERR = require('async-stacktrace');
var _ = require('lodash');

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        question_id: req.params.question_id,
        course_instance_id: res.locals.course_instance.id,
    };
    sqldb.queryOneRow(sql.select_and_auth, params, function(err, result) {
        if (ERR(err, next)) return;
        _.assign(res.locals, result.rows[0]);
        next();
    });
};
